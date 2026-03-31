import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.capture import CaptureRound
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
    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(
    employer_id: int,
    position_id: int,
    doc_id: int,
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
    await db.delete(doc)
    await db.commit()


@router.post("/generate")
async def generate_report(
    employer_id: int,
    position_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = await _load_position(employer_id, position_id, current_user, db)
    emp_result = await db.execute(select(Employer).where(Employer.id == employer_id))
    employer = emp_result.scalar_one()

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
        from datetime import datetime, timezone
        generated_at = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")
        dashboard_url = (
            f"{settings.FRONTEND_URL}/employers/{employer_id}/positions/{position_id}"
        )
        await send_report_ready_email(
            current_user.email,
            current_user.full_name or "there",
            position.job_title,
            position.noc_code or "N/A",
            employer.company_name,
            generated_at,
            dashboard_url,
        )
    except Exception:
        logger.warning("report_ready email failed for user_id=%s", current_user.id)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="LMIA_Report.pdf"'},
    )
