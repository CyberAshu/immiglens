"""Tier-based limit checks.

Call these *before* performing a write that would consume a limited resource:

    from app.core.permissions import check_employer_limit
    await check_employer_limit(db, current_user)

Raises HTTP 402 if the user is over their plan limit (-1 = unlimited).
"""
from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.capture import CaptureRound, CaptureStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.subscription import SubscriptionTier
from app.models.user import User

_PAYMENT_REQUIRED = status.HTTP_402_PAYMENT_REQUIRED


async def _get_tier(db: AsyncSession, user: User) -> SubscriptionTier:
    if user.tier_id:
        row = await db.get(SubscriptionTier, user.tier_id)
        if row:
            return row
    # Fall back to the "free" tier
    res = await db.execute(
        select(SubscriptionTier).where(SubscriptionTier.name == "free").limit(1)
    )
    tier = res.scalar_one_or_none()
    if tier is None:
        # No tiers seeded yet — allow everything
        return SubscriptionTier(
            max_employers=-1,
            max_positions_per_employer=-1,
            max_postings_per_position=-1,
            max_captures_per_month=-1,
        )
    return tier


async def check_employer_limit(db: AsyncSession, user: User) -> None:
    tier = await _get_tier(db, user)
    if tier.max_employers == -1:
        return
    count = (
        await db.execute(
            select(func.count()).select_from(Employer).where(Employer.user_id == user.id)
        )
    ).scalar_one()
    if count >= tier.max_employers:
        raise HTTPException(
            status_code=_PAYMENT_REQUIRED,
            detail=f"Your plan allows a maximum of {tier.max_employers} employer(s). "
                   "Upgrade to add more.",
        )


async def check_position_limit(db: AsyncSession, user: User, employer_id: int) -> None:
    tier = await _get_tier(db, user)
    if tier.max_positions_per_employer == -1:
        return
    count = (
        await db.execute(
            select(func.count())
            .select_from(JobPosition)
            .where(JobPosition.employer_id == employer_id)
        )
    ).scalar_one()
    if count >= tier.max_positions_per_employer:
        raise HTTPException(
            status_code=_PAYMENT_REQUIRED,
            detail=f"Your plan allows a maximum of {tier.max_positions_per_employer} "
                   "position(s) per employer. Upgrade to add more.",
        )


async def check_monthly_capture_limit(db: AsyncSession, user: User) -> None:
    from datetime import datetime, timezone

    tier = await _get_tier(db, user)
    if tier.max_captures_per_month == -1:
        return

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Count capture rounds belonging to this user's positions this calendar month
    emp_ids_res = await db.execute(
        select(Employer.id).where(Employer.user_id == user.id)
    )
    emp_ids = [r[0] for r in emp_ids_res.all()]
    if not emp_ids:
        return

    pos_ids_res = await db.execute(
        select(JobPosition.id).where(JobPosition.employer_id.in_(emp_ids))
    )
    pos_ids = [r[0] for r in pos_ids_res.all()]
    if not pos_ids:
        return

    count = (
        await db.execute(
            select(func.count())
            .select_from(CaptureRound)
            .where(
                CaptureRound.job_position_id.in_(pos_ids),
                CaptureRound.scheduled_at >= month_start,
                CaptureRound.status == CaptureStatus.COMPLETED,
            )
        )
    ).scalar_one()

    if count >= tier.max_captures_per_month:
        raise HTTPException(
            status_code=_PAYMENT_REQUIRED,
            detail=f"Your plan allows a maximum of {tier.max_captures_per_month} "
                   "completed capture(s) per month. Upgrade to continue.",
        )


async def check_capture_frequency(db: AsyncSession, user: User, capture_frequency_days: int) -> None:
    """Ensure the requested capture frequency is allowed by the user's tier.
    Higher min_capture_frequency_days means less frequent (more restricted).
    e.g. min=28 → user must wait ≥28 days between captures.
    """
    tier = await _get_tier(db, user)
    min_freq = getattr(tier, "min_capture_frequency_days", 7)
    if capture_frequency_days < min_freq:
        raise HTTPException(
            status_code=_PAYMENT_REQUIRED,
            detail=(
                f"Your plan requires a minimum of {min_freq} day(s) between captures. "
                f"You selected {capture_frequency_days} day(s). Upgrade to capture more frequently."
            ),
        )
