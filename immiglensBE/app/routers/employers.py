from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.audit_events import AuditAction, AuditEntity
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_url import JobUrl
from app.models.user import User
from app.schemas.employer import EmployerCreate, EmployerOut, EmployerUpdate

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
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employer = Employer(**payload.model_dump(), user_id=current_user.id)
    db.add(employer)
    await db.flush()
    await audit(
        db,
        action=AuditAction.EMPLOYER_CREATED,
        entity_type=AuditEntity.EMPLOYER,
        actor_id=current_user.id,
        entity_id=employer.id,
        entity_label=employer.business_name,
        employer_id=employer.id,
        description=f'Created employer "{employer.business_name}"',
        new_data={"business_name": employer.business_name},
        request=request,
    )
    await db.commit()
    await db.refresh(employer)
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
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employer = await _get_employer_or_404(employer_id, current_user, db)
    old = {"business_name": employer.business_name, "address": employer.address}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(employer, field, value)
    await audit(
        db,
        action=AuditAction.EMPLOYER_UPDATED,
        entity_type=AuditEntity.EMPLOYER,
        actor_id=current_user.id,
        entity_id=employer.id,
        entity_label=employer.business_name,
        employer_id=employer.id,
        description=f'Updated employer "{employer.business_name}"',
        old_data=old,
        new_data={"business_name": employer.business_name},
        request=request,
    )
    await db.commit()
    await db.refresh(employer)
    return employer


@router.patch("/{employer_id}/toggle", response_model=EmployerOut)
async def toggle_employer(
    employer_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle the is_active flag for an employer.
    Activating is subject to the user's tier employer limit.
    On deactivation, child positions and postings are marked inactive so the
    capture-round guard skips them. APScheduler pause is intentionally NOT called
    here — pause only occurs on subscription downgrade or expiry.
    """
    employer = await _get_employer_or_404(employer_id, current_user, db)
    employer.is_active = not employer.is_active
    # On deactivation cascade: mark all child positions and postings inactive.
    # Pending capture rounds remain in APScheduler but are skipped by the
    # is_active guard inside _run_capture_round — no explicit pause needed.
    if not employer.is_active:
        pos_ids = (
            await db.execute(select(JobPosition.id).where(JobPosition.employer_id == employer_id))
        ).scalars().all()
        if pos_ids:
            await db.execute(
                update(JobPosition).where(JobPosition.id.in_(pos_ids)).values(is_active=False)
            )
            await db.execute(
                update(JobUrl)
                .where(JobUrl.job_position_id.in_(pos_ids))
                .values(is_active=False)
            )
    action = AuditAction.EMPLOYER_ACTIVATED if employer.is_active else AuditAction.EMPLOYER_DEACTIVATED
    desc = (
        f'Activated employer "{employer.business_name}"'
        if employer.is_active
        else f'Deactivated employer "{employer.business_name}"'
    )
    await audit(
        db,
        action=action,
        entity_type=AuditEntity.EMPLOYER,
        actor_id=current_user.id,
        entity_id=employer.id,
        entity_label=employer.business_name,
        employer_id=employer.id,
        description=desc,
        new_data={"business_name": employer.business_name, "is_active": employer.is_active},
        request=request,
    )
    await db.commit()
    await db.refresh(employer)
    return employer


@router.delete("/{employer_id}", status_code=204)
async def delete_employer(
    employer_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employer = await _get_employer_or_404(employer_id, current_user, db)
    await audit(
        db,
        action=AuditAction.EMPLOYER_DELETED,
        entity_type=AuditEntity.EMPLOYER,
        actor_id=current_user.id,
        entity_id=employer.id,
        entity_label=employer.business_name,
        employer_id=employer.id,
        description=f'Deleted employer "{employer.business_name}"',
        old_data={"business_name": employer.business_name},
        request=request,
    )
    await db.delete(employer)
    await db.commit()

