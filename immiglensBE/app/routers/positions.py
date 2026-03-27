from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import log_action
from app.core.database import get_db
from app.core.dependencies import get_client_ip, get_current_user
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
from app.core.permissions import check_employer_limit, check_position_limit, check_capture_frequency, check_posting_limit, check_position_activate_limit, check_posting_activate_limit
from app.services.scheduler import schedule_rounds_for_position, reschedule_rounds_for_position, requeue_rounds_for_position

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
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emp_result = await db.execute(
        select(Employer).where(
            Employer.id == employer_id, Employer.user_id == current_user.id
        )
    )
    employer = emp_result.scalar_one_or_none()
    if employer is None:
        raise HTTPException(status_code=404, detail="Employer not found.")
    if not employer.is_active:
        raise HTTPException(
            status_code=403,
            detail="This employer is deactivated. Activate it to add positions.",
        )

    await check_capture_frequency(db, current_user, payload.capture_frequency_days)
    await check_position_limit(db, current_user, employer_id)

    position = JobPosition(**payload.model_dump(), employer_id=employer_id)
    db.add(position)
    await db.commit()
    await db.refresh(position)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="position", resource_id=position.id,
                     employer_id=employer_id, position_id=position.id,
                     new_data={"job_title": position.job_title, "employer_id": employer_id},
                     ip_address=get_client_ip(request))
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
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = await _get_position_or_404(employer_id, position_id, current_user, db)

    updates = payload.model_dump(exclude_unset=True)
    if "capture_frequency_days" in updates:
        await check_capture_frequency(db, current_user, updates["capture_frequency_days"])
    old_data: dict = {}
    new_data: dict = {}
    reschedule_fields = {"start_date", "end_date", "capture_frequency_days"}
    needs_reschedule = bool(updates.keys() & reschedule_fields)

    for field, new_val in updates.items():
        old_val = getattr(position, field)
        if old_val != new_val:
            old_data[field] = old_val.isoformat() if hasattr(old_val, 'isoformat') else old_val
            new_data[field] = new_val.isoformat() if hasattr(new_val, 'isoformat') else new_val
        setattr(position, field, new_val)

    await db.commit()
    await db.refresh(position)

    if needs_reschedule:
        await reschedule_rounds_for_position(db, position)

    if old_data:
        await log_action(db, user_id=current_user.id, action="UPDATE",
                         resource_type="position", resource_id=position.id,
                         employer_id=employer_id, position_id=position_id,
                         old_data=old_data, new_data=new_data,
                         ip_address=get_client_ip(request))
        await db.commit()

    return position


@router.delete("/{position_id}", status_code=204)
async def delete_position(
    employer_id: int,
    position_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = await _get_position_or_404(employer_id, position_id, current_user, db)
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="position", resource_id=position.id,
                     employer_id=employer_id, position_id=position_id,
                     old_data={"job_title": position.job_title},
                     ip_address=get_client_ip(request))
    await db.delete(position)
    await db.commit()


@router.patch("/{position_id}/toggle", response_model=JobPositionOut)
async def toggle_position(
    employer_id: int,
    position_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle is_active for a position. Activating is subject to tier position limit."""
    position = await _get_position_or_404(employer_id, position_id, current_user, db)
    was_inactive = not position.is_active
    if was_inactive:
        await check_position_activate_limit(db, current_user, employer_id, exclude_id=position_id)
    position.is_active = not position.is_active
    # On deactivation cascade: mark all child postings inactive too
    if not position.is_active:
        await db.execute(
            update(JobPosting)
            .where(JobPosting.job_position_id == position_id)
            .values(is_active=False)
        )
    await db.commit()
    await db.refresh(position)
    # On re-activation: restore capture schedule so RCIC doesn't lose their rounds
    if was_inactive and position.is_active:
        await requeue_rounds_for_position(db, position)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="position", resource_id=position.id,
                     employer_id=employer_id, position_id=position_id,
                     new_data={"job_title": position.job_title, "is_active": position.is_active},
                     ip_address=get_client_ip(request))
    await db.commit()
    result = await db.execute(
        select(JobPosition)
        .options(
            selectinload(JobPosition.job_postings),
            selectinload(JobPosition.report_documents),
        )
        .where(JobPosition.id == position.id)
    )
    return result.scalar_one()


@router.post("/{position_id}/postings", response_model=JobPostingOut, status_code=201)
async def add_posting(
    employer_id: int,
    position_id: int,
    payload: JobPostingCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = await _get_position_or_404(employer_id, position_id, current_user, db)
    if not position.is_active:
        raise HTTPException(
            status_code=403,
            detail="This position is deactivated. Activate it to add job boards.",
        )
    await check_posting_limit(db, current_user, position_id)
    posting = JobPosting(**payload.model_dump(), job_position_id=position_id)
    db.add(posting)
    await db.commit()
    await db.refresh(posting)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="posting", resource_id=posting.id,
                     employer_id=employer_id, position_id=position_id,
                     new_data={"url": posting.url, "position_id": position_id},
                     ip_address=get_client_ip(request))
    await db.commit()
    return posting


@router.patch("/{position_id}/postings/{posting_id}", response_model=JobPostingOut)
async def update_posting(
    employer_id: int,
    position_id: int,
    posting_id: int,
    payload: JobPostingUpdate,
    request: Request,
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
                     employer_id=employer_id, position_id=position_id,
                     new_data={"url": posting.url},
                     ip_address=get_client_ip(request))
    await db.commit()
    await db.refresh(posting)
    return posting


@router.delete("/{position_id}/postings/{posting_id}", status_code=204)
async def delete_posting(
    employer_id: int,
    position_id: int,
    posting_id: int,
    request: Request,
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
                     resource_type="posting", resource_id=posting.id,
                     employer_id=employer_id, position_id=position_id,
                     old_data={"url": posting.url},
                     ip_address=get_client_ip(request))
    await db.delete(posting)
    await db.commit()


@router.patch("/{position_id}/postings/{posting_id}/toggle", response_model=JobPostingOut)
async def toggle_posting(
    employer_id: int,
    position_id: int,
    posting_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle is_active for a posting. Activating is subject to tier posting limit."""
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
    if not posting.is_active:
        await check_posting_activate_limit(db, current_user, position_id, exclude_id=posting_id)
    posting.is_active = not posting.is_active
    await db.commit()
    await db.refresh(posting)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="posting", resource_id=posting.id,
                     employer_id=employer_id, position_id=position_id,
                     new_data={"url": posting.url, "is_active": posting.is_active},
                     ip_address=get_client_ip(request))
    await db.commit()
    return posting
