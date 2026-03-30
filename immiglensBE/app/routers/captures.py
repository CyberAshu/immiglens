from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import log_action
from app.core.database import get_db
from app.core.dependencies import get_client_ip, get_current_user
from app.core.permissions import check_monthly_capture_limit
from app.models.capture import CaptureResult, CaptureRound, CaptureStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.user import User
from app.schemas.capture import CaptureRoundOut
from app.services.scheduler import force_run_capture_round, recapture_result

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


@router.post("/{round_id}/run", response_model=CaptureRoundOut)
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
    await force_run_capture_round(round_id)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="capture_round", resource_id=round_id,
                     employer_id=employer_id, position_id=position_id,
                     new_data={"position_id": position_id, "triggered_manually": True},
                     ip_address=get_client_ip(request))
    await db.commit()
    await db.refresh(round_)
    result2 = await db.execute(
        select(CaptureRound)
        .where(CaptureRound.id == round_id)
        .options(selectinload(CaptureRound.results))
    )
    return result2.scalar_one()


@router.post("/{round_id}/results/{result_id}/recapture", response_model=CaptureRoundOut)
async def recapture_single_result(
    employer_id: int,
    position_id: int,
    round_id: int,
    result_id: int,
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

    await recapture_result(result_id)

    result2 = await db.execute(
        select(CaptureRound)
        .where(CaptureRound.id == round_id)
        .options(selectinload(CaptureRound.results))
    )
    return result2.scalar_one()
