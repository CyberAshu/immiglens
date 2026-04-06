import logging
import re
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.audit_events import AuditAction, AuditEntity
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.capture import CaptureRound, CaptureStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.report import ReportDocument
from app.models.report_config import DEFAULT_CONFIG, ReportConfig
from app.models.user import User
from app.schemas.report import ReportDocumentOut
from app.services import storage
from app.services.email_service import send_report_ready_email
from app.services.pdf import build_pdf_bytes

router = APIRouter(
    prefix="/api/employers/{employer_id}/positions/{position_id}/reports",
    tags=["reports"],
)

logger = logging.getLogger(__name__)


async def _load_position(
    employer_id: int, position_id: int, user: User, db: AsyncSession
) -> JobPosition:
    result = await db.execute(
        select(JobPosition)
        .join(Employer)
        .where(
            JobPosition.id == position_id,
            JobPosition.employer_id == employer_id,
            Employer.user_id == user.id,
        )
        .options(
            selectinload(JobPosition.job_urls),
            selectinload(JobPosition.capture_rounds).selectinload(CaptureRound.results),
            selectinload(JobPosition.report_documents),
        )
    )
    position = result.scalar_one_or_none()
    if position is None:
        raise HTTPException(status_code=404, detail="Job position not found.")
    return position


@router.post("/documents", response_model=ReportDocumentOut, status_code=201)
async def upload_document(
    employer_id: int,
    position_id: int,
    request: Request,
    file: UploadFile = File(...),
    doc_type: str = Query("supporting", pattern="^(supporting|job_match)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_position(employer_id, position_id, current_user, db)

    original_name = file.filename or "file"
    suffix = original_name.rsplit(".", 1)[-1] if "." in original_name else ""
    stored_name = f"{uuid.uuid4().hex}.{suffix}" if suffix else uuid.uuid4().hex
    object_key = f"{position_id}/{stored_name}"

    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    public_url = await storage.upload("documents", object_key, content, content_type)

    doc = ReportDocument(
        job_position_id=position_id,
        original_filename=file.filename or stored_name,
        stored_path=public_url,
        doc_type=doc_type,
    )
    db.add(doc)
    await db.flush()
    await audit(
        db,
        action=AuditAction.DOCUMENT_UPLOADED,
        entity_type=AuditEntity.DOCUMENT,
        actor_id=current_user.id,
        entity_id=doc.id,
        entity_label=original_name,
        employer_id=employer_id,
        position_id=position_id,
        description=f'Uploaded document "{original_name}" ({doc_type}) for position #{position_id}',
        new_data={"filename": original_name, "doc_type": doc_type},
        request=request,
    )
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(
    employer_id: int,
    position_id: int,
    doc_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_position(employer_id, position_id, current_user, db)
    result = await db.execute(
        select(ReportDocument).where(
            ReportDocument.id == doc_id, ReportDocument.job_position_id == position_id
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        bucket_path = doc.stored_path.split("/public/documents/", 1)[1]
        await storage.delete("documents", [bucket_path])
    except (IndexError, Exception):
        pass
    await audit(
        db,
        action=AuditAction.DOCUMENT_DELETED,
        entity_type=AuditEntity.DOCUMENT,
        actor_id=current_user.id,
        entity_id=doc.id,
        entity_label=doc.original_filename,
        employer_id=employer_id,
        position_id=position_id,
        description=f'Deleted document "{doc.original_filename}" from position #{position_id}',
        old_data={"filename": doc.original_filename, "doc_type": doc.doc_type},
        request=request,
    )
    await db.delete(doc)
    await db.commit()


@router.post("/generate")
async def generate_report(
    employer_id: int,
    position_id: int,
    request: Request,
    acknowledge_early: bool = Body(False, embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = await _load_position(employer_id, position_id, current_user, db)
    emp_result = await db.execute(select(Employer).where(Employer.id == employer_id))
    employer = emp_result.scalar_one()

    # ── 28-day ESDC minimum active period check ───────────────────────────
    today = date.today()
    days_active = (today - position.start_date).days
    MINIMUM_DAYS = 28
    if days_active < MINIMUM_DAYS:
        days_remaining = MINIMUM_DAYS - days_active
        if not acknowledge_early:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "EARLY_REPORT",
                    "days_active": days_active,
                    "days_remaining": days_remaining,
                    "message": (
                        f"This position has only been active for {days_active} day(s). "
                        f"ESDC requires a minimum of {MINIMUM_DAYS} days. "
                        f"{days_remaining} day(s) remaining."
                    ),
                },
            )
        # Acknowledged early generation — log to audit trail
        await audit(
            db,
            action=AuditAction.REPORT_EARLY_ACKNOWLEDGED,
            entity_type=AuditEntity.POSITION,
            actor_id=current_user.id,
            entity_id=position_id,
            entity_label=position.job_title,
            employer_id=employer_id,
            position_id=position_id,
            description=f'Acknowledged early report generation for "{position.job_title}" ({days_active}/{MINIMUM_DAYS} days)',
            new_data={
                "acknowledged_at": datetime.now(timezone.utc).isoformat(),
                "days_active": days_active,
                "days_remaining": days_remaining,
            },
            request=request,
        )
        await db.commit()

    sorted_rounds = sorted(position.capture_rounds, key=lambda r: r.scheduled_at)

    cfg_row = (await db.execute(select(ReportConfig).limit(1))).scalar_one_or_none()
    report_config = cfg_row.config if cfg_row else DEFAULT_CONFIG

    pdf_bytes = await build_pdf_bytes(
        employer=employer,
        position=position,
        capture_rounds=sorted_rounds,
        report_documents=position.report_documents,
        config=report_config,
    )

    try:
        from app.core.config import settings
        generated_at = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")
        request_date = generated_at
        # Build source list and counts from sorted_rounds
        _sources: list[str] = [u.url for u in (position.job_urls or [])]
        _screenshot_count = sum(len(r.results) for r in sorted_rounds)
        _successful = sum(1 for r in sorted_rounds if r.status == CaptureStatus.COMPLETED)
        _failed = sum(1 for r in sorted_rounds if r.status == CaptureStatus.FAILED)
        _partial = 0  # CaptureStatus has no PARTIAL value
        _ad_start = min((r.captured_at for r in sorted_rounds if getattr(r, 'captured_at', None)), default=None)
        _ad_end = max((r.captured_at for r in sorted_rounds if getattr(r, 'captured_at', None)), default=None)
        await send_report_ready_email(
            current_user.email,
            current_user.full_name or "there",
            position.job_title,
            position.noc_code or "N/A",
            employer.business_name,
            generated_at,
            download_url=f"{settings.FRONTEND_URL}/employers/{employer_id}/positions/{position_id}/reports",
            ad_start=_ad_start.strftime("%B %d, %Y") if _ad_start else "N/A",
            ad_end=_ad_end.strftime("%B %d, %Y") if _ad_end else "N/A",
            screenshot_count=_screenshot_count,
            source_count=len(_sources),
            sources=_sources,
            capture_count=len(sorted_rounds),
            successful_count=_successful,
            failed_count=_failed,
            partial_count=_partial,
            report_id=position_id,
            requested_by=current_user.full_name or current_user.email,
            request_date=request_date,
        )
    except Exception:
        logger.warning("report_ready email failed for user_id=%s", current_user.id)

    await audit(
        db,
        action=AuditAction.REPORT_GENERATED,
        entity_type=AuditEntity.REPORT,
        actor_id=current_user.id,
        entity_id=position_id,
        entity_label=position.job_title,
        employer_id=employer_id,
        position_id=position_id,
        description=f'Generated LMIA report for "{position.job_title}" ({employer.business_name})',
        new_data={
            "position_title": position.job_title,
            "employer": employer.business_name,
            "capture_rounds": len(sorted_rounds),
        },
        request=request,
    )
    await db.commit()
    
    safe_title = re.sub(r'[^\w\s-]', '', position.job_title).strip()
    safe_title = re.sub(r'\s+', ' ', safe_title)
    pdf_filename = f"Recruitment Proof - {safe_title}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{pdf_filename}"'},
    )
