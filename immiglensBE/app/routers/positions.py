from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import log_action
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_posting import JobPosting
from app.models.user import User
from app.schemas.job import (
    JobPositionCreate,
    JobPositionOut,
    JobPositionUpdate,
    JobPostingCreate,
    JobPostingOut,
    JobPostingUpdate,
)
from app.core.permissions import check_employer_limit, check_position_limit, check_capture_frequency
from app.services.scheduler import schedule_rounds_for_position

router = APIRouter(
    prefix="/api/employers/{employer_id}/positions",
    tags=["positions"],
)


async def _get_position_or_404(
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
            selectinload(JobPosition.report_documents),
        )
    )
    position = result.scalar_one_or_none()
    if position is None:
        raise HTTPException(status_code=404, detail="Job position not found.")
    return position


@router.get("", response_model=list[JobPositionOut])
async def list_positions(
    employer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(JobPosition)
        .join(Employer)
        .where(JobPosition.employer_id == employer_id, Employer.user_id == current_user.id)
        .options(
            selectinload(JobPosition.job_postings),
            selectinload(JobPosition.report_documents),
        )
        .order_by(JobPosition.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=JobPositionOut, status_code=201)
async def create_position(
    employer_id: int,
    payload: JobPositionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_result = await db.execute(
        select(Employer).where(
            Employer.id == employer_id, Employer.user_id == current_user.id
        )
    )
    if emp_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Employer not found.")

    await check_capture_frequency(db, current_user, payload.capture_frequency_days)

    position = JobPosition(**payload.model_dump(), employer_id=employer_id)
    db.add(position)
    await db.commit()
    await db.refresh(position)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="position", resource_id=position.id,
                     new_data={"job_title": position.job_title, "employer_id": employer_id})
    await db.commit()
    await schedule_rounds_for_position(db, position)
    result = await db.execute(
        select(JobPosition)
        .options(
            selectinload(JobPosition.job_postings),
            selectinload(JobPosition.report_documents),
        )
        .where(JobPosition.id == position.id)
    )
    return result.scalar_one()


@router.get("/{position_id}", response_model=JobPositionOut)
async def get_position(
    employer_id: int,
    position_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_position_or_404(employer_id, position_id, current_user, db)


@router.patch("/{position_id}", response_model=JobPositionOut)
async def update_position(
    employer_id: int,
    position_id: int,
    payload: JobPositionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = await _get_position_or_404(employer_id, position_id, current_user, db)
    old = {"job_title": position.job_title}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(position, field, value)
    await db.commit()
    await db.refresh(position)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="position", resource_id=position.id,
                     old_data=old, new_data={"job_title": position.job_title})
    await db.commit()
    return position


@router.delete("/{position_id}", status_code=204)
async def delete_position(
    employer_id: int,
    position_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = await _get_position_or_404(employer_id, position_id, current_user, db)
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="position", resource_id=position.id,
                     old_data={"job_title": position.job_title})
    await db.delete(position)
    await db.commit()


@router.post("/{position_id}/postings", response_model=JobPostingOut, status_code=201)
async def add_posting(
    employer_id: int,
    position_id: int,
    payload: JobPostingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_position_or_404(employer_id, position_id, current_user, db)
    posting = JobPosting(**payload.model_dump(), job_position_id=position_id)
    db.add(posting)
    await db.commit()
    await db.refresh(posting)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="posting", resource_id=posting.id,
                     new_data={"url": posting.url, "position_id": position_id})
    await db.commit()
    return posting


@router.patch("/{position_id}/postings/{posting_id}", response_model=JobPostingOut)
async def update_posting(
    employer_id: int,
    position_id: int,
    posting_id: int,
    payload: JobPostingUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_position_or_404(employer_id, position_id, current_user, db)
    result = await db.execute(
        select(JobPosting).where(
            JobPosting.id == posting_id,
            JobPosting.job_position_id == position_id,
        )
    )
    posting = result.scalar_one_or_none()
    if posting is None:
        raise HTTPException(status_code=404, detail="Posting not found.")
    if payload.platform is not None:
        posting.platform = payload.platform
    if payload.url is not None:
        posting.url = payload.url
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="posting", resource_id=posting.id,
                     new_data={"url": posting.url})
    await db.commit()
    await db.refresh(posting)
    return posting


@router.delete("/{position_id}/postings/{posting_id}", status_code=204)
async def delete_posting(
    employer_id: int,
    position_id: int,
    posting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_position_or_404(employer_id, position_id, current_user, db)
    result = await db.execute(
        select(JobPosting).where(
            JobPosting.id == posting_id,
            JobPosting.job_position_id == position_id,
        )
    )
    posting = result.scalar_one_or_none()
    if posting is None:
        raise HTTPException(status_code=404, detail="Posting not found.")
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="posting", resource_id=posting.id)
    await db.delete(posting)
    await db.commit()
