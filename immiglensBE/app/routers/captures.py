from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.audit_events import AuditAction, AuditEntity
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import check_monthly_capture_limit
from app.models.capture import CaptureResult, CaptureRound, CaptureStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.user import User
from app.schemas.capture import CaptureRoundOut
from app.services.scheduler import (
    queue_force_run_capture_round,
    queue_recapture_result,
)

router = APIRouter(prefix="/api/employers/{employer_id}/positions/{position_id}/captures", tags=["captures"])


async def _assert_owns_position(
    employer_id: int, position_id: int, user: User, db: AsyncSession
) -> None:
    result = await db.execute(
        select(JobPosition.id)
        .join(Employer)
        .where(
            JobPosition.id == position_id,
            JobPosition.employer_id == employer_id,
            Employer.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Job position not found.")


@router.get("", response_model=list[CaptureRoundOut])
async def list_capture_rounds(
    employer_id: int,
    position_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_owns_position(employer_id, position_id, current_user, db)
    result = await db.execute(
        select(CaptureRound)
        .where(CaptureRound.job_position_id == position_id)
        .options(selectinload(CaptureRound.results))
        .order_by(CaptureRound.scheduled_at)
    )
    return result.scalars().all()


@router.post("/{round_id}/run", status_code=202)
async def trigger_capture_round(
    employer_id: int,
    position_id: int,
    round_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_owns_position(employer_id, position_id, current_user, db)

    # Block captures on deactivated positions
    pos_active = (
        await db.execute(
            select(JobPosition.is_active).where(JobPosition.id == position_id)
        )
    ).scalar_one()
    if not pos_active:
        raise HTTPException(
            status_code=403,
            detail="This position is deactivated. Activate it to re-enable captures.",
        )

    result = await db.execute(
        select(CaptureRound)
        .where(
            CaptureRound.id == round_id,
            CaptureRound.job_position_id == position_id,
        )
        .options(selectinload(CaptureRound.job_position).selectinload(JobPosition.job_urls))
    )
    round_ = result.scalar_one_or_none()
    if round_ is None:
        raise HTTPException(status_code=404, detail="Capture round not found.")

    if not any(p.is_active for p in round_.job_position.job_urls):
        raise HTTPException(
            status_code=400,
            detail="No active job board URLs on this position. Add or activate at least one URL before running a capture."
        )

    await check_monthly_capture_limit(db, current_user)
    await audit(
        db,
        action=AuditAction.CAPTURE_TRIGGERED,
        entity_type=AuditEntity.CAPTURE_ROUND,
        actor_id=current_user.id,
        entity_id=round_id,
        employer_id=employer_id,
        position_id=position_id,
        description=f'Manually triggered capture round #{round_id} for position #{position_id}',
        new_data={"position_id": position_id, "triggered_manually": True},
        request=request,
    )
    await db.commit()
    queue_force_run_capture_round(round_id)
    return {"detail": "Retry queued", "round_id": round_id}


@router.post("/{round_id}/results/{result_id}/recapture", status_code=202)
async def recapture_single_result(
    employer_id: int,
    position_id: int,
    round_id: int,
    result_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_owns_position(employer_id, position_id, current_user, db)

    # Block recapture on deactivated positions
    pos_active = (
        await db.execute(
            select(JobPosition.is_active).where(JobPosition.id == position_id)
        )
    ).scalar_one()
    if not pos_active:
        raise HTTPException(
            status_code=403,
            detail="This position is deactivated. Activate it to re-enable captures.",
        )

    await check_monthly_capture_limit(db, current_user)

    res = await db.execute(
        select(CaptureResult).where(
            CaptureResult.id == result_id,
            CaptureResult.capture_round_id == round_id,
        )
    )
    if res.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Capture result not found.")

    queue_recapture_result(result_id)

    await audit(
        db,
        action=AuditAction.CAPTURE_TRIGGERED,
        entity_type=AuditEntity.CAPTURE_ROUND,
        actor_id=current_user.id,
        entity_id=round_id,
        employer_id=employer_id,
        position_id=position_id,
        description=f'User recaptured result #{result_id} in round #{round_id}',
        new_data={"result_id": result_id, "round_id": round_id, "recaptured": True},
        request=request,
    )
    await db.commit()

    return {"detail": "Recapture queued", "round_id": round_id, "result_id": result_id}
