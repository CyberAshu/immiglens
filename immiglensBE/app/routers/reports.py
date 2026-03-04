import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.capture import CaptureRound
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_posting import JobPosting
from app.models.report import ReportDocument
from app.models.user import User
from app.schemas.report import ReportDocumentOut
from app.services.pdf import build_pdf

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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_position(employer_id, position_id, current_user, db)

    docs_dir = Path(settings.DOCUMENTS_DIR) / str(position_id)
    docs_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename or "file").suffix
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    stored_path = docs_dir / stored_name

    content = await file.read()
    stored_path.write_bytes(content)

    doc = ReportDocument(
        job_position_id=position_id,
        original_filename=file.filename or stored_name,
        stored_path=str(stored_path),
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
    Path(doc.stored_path).unlink(missing_ok=True)
    await db.delete(doc)
    await db.commit()


@router.get("/generate")
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

    pdf_path = await build_pdf(
        employer=employer,
        position=position,
        capture_rounds=sorted_rounds,
        report_documents=position.report_documents,
    )

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
    )
