from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import check_employer_limit
from app.models.employer import Employer
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


@router.delete("/{employer_id}", status_code=204)
async def delete_employer(
    employer_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    employer = await _get_employer_or_404(employer_id, current_user, db)
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="employer", resource_id=employer.id,
                     old_data={"business_name": employer.business_name})
    await db.delete(employer)
    await db.commit()
