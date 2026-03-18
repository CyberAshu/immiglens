import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.capture import CaptureRound
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.report import ReportDocument
from app.models.user import User
from app.schemas.report import ReportDocumentOut
from app.schemas.report_config import ReportConfigUpdate
from app.services import storage
from app.services.pdf import build_pdf, render_report_html

router = APIRouter(
    prefix="/api/employers/{employer_id}/positions/{position_id}/reports",
    tags=["reports"],
)


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
            selectinload(JobPosition.job_postings),
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
    # Extract the Supabase object key from the stored public URL
    try:
        bucket_path = doc.stored_path.split("/public/documents/", 1)[1]
        await storage.delete("documents", [bucket_path])
    except (IndexError, Exception):
        pass  # best-effort delete
    await db.delete(doc)
    await db.commit()


@router.get("/generate")
async def generate_report(
    employer_id: int,
    position_id: int,
    remove_blank_pages: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _do_generate(
        employer_id, position_id, remove_blank_pages, None, current_user, db
    )


@router.post("/generate")
async def generate_report_with_config(
    employer_id: int,
    position_id: int,
    body: ReportConfigUpdate,
    remove_blank_pages: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate PDF using the client-supplied config (mirrors the live preview)."""
    return await _do_generate(
        employer_id, position_id, remove_blank_pages, body.config, current_user, db
    )


async def _do_generate(
    employer_id: int,
    position_id: int,
    remove_blank_pages: bool,
    config_override: dict | None,
    current_user: User,
    db: AsyncSession,
):
    position = await _load_position(employer_id, position_id, current_user, db)
    emp_result = await db.execute(select(Employer).where(Employer.id == employer_id))
    employer = emp_result.scalar_one()

    sorted_rounds = sorted(position.capture_rounds, key=lambda r: r.scheduled_at)

    pdf_url = await build_pdf(
        employer=employer,
        position=position,
        capture_rounds=sorted_rounds,
        report_documents=position.report_documents,
        db=db,
        remove_blank_pages=remove_blank_pages,
        config_override=config_override,
    )

    return RedirectResponse(url=pdf_url, status_code=302)


@router.post("/preview-html", response_class=HTMLResponse)
async def preview_report_html(
    employer_id: int,
    position_id: int,
    body: ReportConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Render a live HTML preview of the report using real position data and a client-supplied config."""
    from datetime import timedelta
    from app.core.config import settings as cfg

    position = await _load_position(employer_id, position_id, current_user, db)
    emp_result = await db.execute(select(Employer).where(Employer.id == employer_id))
    employer = emp_result.scalar_one()

    from datetime import datetime, timezone
    platform_stats: dict[int, dict] = {}
    for posting in position.job_postings:
        dates, count = [], 0
        for round_ in position.capture_rounds:
            for result in round_.results:
                if result.job_posting_id == posting.id and result.status == "done":
                    count += 1
                    if round_.captured_at:
                        dates.append(round_.captured_at)
        platform_stats[posting.id] = {
            "count": count,
            "first": min(dates) if dates else None,
            "last": max(dates) if dates else None,
        }

    job_match_docs = [d for d in position.report_documents if getattr(d, "doc_type", "supporting") == "job_match"]
    supporting_docs = [d for d in position.report_documents if getattr(d, "doc_type", "supporting") != "job_match"]
    sorted_rounds = sorted(position.capture_rounds, key=lambda r: r.scheduled_at)
    recruitment_end = position.start_date + timedelta(days=cfg.RECRUITMENT_PERIOD_DAYS)

    html = render_report_html(dict(
        employer=employer,
        position=position,
        capture_rounds=sorted_rounds,
        report_documents=supporting_docs,
        job_match_docs=job_match_docs,
        platform_stats=platform_stats,
        recruitment_end=recruitment_end,
        today=datetime.now(timezone.utc).date(),
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        config=body.config,
        preview_mode=True,
    ))
    return HTMLResponse(content=html)
