from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import check_employer_limit, check_employer_activate_limit
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_posting import JobPosting
from app.models.user import User
from app.schemas.employer import EmployerCreate, EmployerOut, EmployerUpdate
from app.services.scheduler import pause_rounds_for_user

router = APIRouter(prefix="/api/employers", tags=["employers"])


async def _get_employer_or_404(employer_id: int, user: User, db: AsyncSession) -> Employer:
    result = await db.execute(
        select(Employer).where(Employer.id == employer_id, Employer.user_id == user.id)
    )
    employer = result.scalar_one_or_none()
    if employer is None:
        raise HTTPException(status_code=404, detail="Employer not found.")
    return employer


@router.get("", response_model=list[EmployerOut])
async def list_employers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Employer).where(Employer.user_id == current_user.id).order_by(Employer.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=EmployerOut, status_code=201)
async def create_employer(
    payload: EmployerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await check_employer_limit(db, current_user)
    employer = Employer(**payload.model_dump(), user_id=current_user.id)
    db.add(employer)
    await db.commit()
    await db.refresh(employer)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="employer", resource_id=employer.id,
                     new_data={"business_name": employer.business_name})
    await db.commit()
    return employer


@router.get("/{employer_id}", response_model=EmployerOut)
async def get_employer(
    employer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _get_employer_or_404(employer_id, current_user, db)


@router.patch("/{employer_id}", response_model=EmployerOut)
async def update_employer(
    employer_id: int,
    payload: EmployerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employer = await _get_employer_or_404(employer_id, current_user, db)
    old = {"business_name": employer.business_name, "address": employer.address}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employer, field, value)
    await db.commit()
    await db.refresh(employer)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="employer", resource_id=employer.id,
                     old_data=old, new_data={"business_name": employer.business_name})
    await db.commit()
    return employer


@router.patch("/{employer_id}/toggle", response_model=EmployerOut)
async def toggle_employer(
    employer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle the is_active flag for an employer.
    Activating is subject to the user's tier employer limit.
    """
    employer = await _get_employer_or_404(employer_id, current_user, db)
    if not employer.is_active:
        # About to activate — check limit
        await check_employer_activate_limit(db, current_user, exclude_id=employer_id)
    employer.is_active = not employer.is_active
    # On deactivation cascade: mark all child positions and postings inactive too
    # and pause their APScheduler jobs so they don't fire needlessly
    if not employer.is_active:
        pos_ids = (
            await db.execute(select(JobPosition.id).where(JobPosition.employer_id == employer_id))
        ).scalars().all()
        if pos_ids:
            await db.execute(
                update(JobPosition).where(JobPosition.id.in_(pos_ids)).values(is_active=False)
            )
            await db.execute(
                update(JobPosting)
                .where(JobPosting.job_position_id.in_(pos_ids))
                .values(is_active=False)
            )
            await pause_rounds_for_user(db, [employer_id])
    await db.commit()
    await db.refresh(employer)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="employer", resource_id=employer.id,
                     new_data={"is_active": employer.is_active})
    await db.commit()
    return employer


@router.delete("/{employer_id}", status_code=204)
async def delete_employer(    employer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employer = await _get_employer_or_404(employer_id, current_user, db)
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="employer", resource_id=employer.id,
                     old_data={"business_name": employer.business_name})
    await db.delete(employer)
    await db.commit()
