"""Tier-based limit checks.

Call these *before* performing a write that would consume a limited resource:

    from app.core.permissions import check_employer_limit
    await check_employer_limit(db, current_user)

Raises HTTP 402 if the user is over their plan limit (-1 = unlimited).
"""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy import update as sa_update
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
            max_active_positions=-1,
            max_urls_per_position=-1,
            max_captures_per_month=-1,
        )
    return tier


async def check_active_position_limit(db: AsyncSession, user: User) -> None:
    """Block creating a new (active) position when the user's global tier limit is reached."""
    tier = await _get_tier(db, user)
    if tier.max_active_positions == -1:
        return
    # Count all active positions across all employers for this user
    emp_ids_res = await db.execute(
        select(Employer.id).where(Employer.user_id == user.id)
    )
    emp_ids = [r[0] for r in emp_ids_res.all()]
    if not emp_ids:
        return
    count = (
        await db.execute(
            select(func.count()).select_from(JobPosition).where(
                JobPosition.employer_id.in_(emp_ids),
                JobPosition.is_active.is_(True),
            )
        )
    ).scalar_one()
    if count >= tier.max_active_positions:
        try:
            from app.core.config import settings as _s
            from app.services.email_service import send_plan_limit_email
            await send_plan_limit_email(
                user.email,
                user.full_name or "there",
                tier.name,
                tier.max_active_positions,
                count,
                f"{_s.FRONTEND_URL}/dashboard",
                f"{_s.FRONTEND_URL}/plans",
            )
        except Exception:
            pass  # never block the 402
        raise HTTPException(
            status_code=_PAYMENT_REQUIRED,
            detail=f"Your plan allows a maximum of {tier.max_active_positions} active position(s) total. "
                   "Upgrade or deactivate another position first.",
        )


async def check_position_reactivate_limit(db: AsyncSession, user: User, exclude_id: int) -> None:
    """Check global active position limit when manually re-activating a position (toggle ON)."""
    tier = await _get_tier(db, user)
    if tier.max_active_positions == -1:
        return
    emp_ids_res = await db.execute(
        select(Employer.id).where(Employer.user_id == user.id)
    )
    emp_ids = [r[0] for r in emp_ids_res.all()]
    if not emp_ids:
        return
    count = (
        await db.execute(
            select(func.count()).select_from(JobPosition).where(
                JobPosition.employer_id.in_(emp_ids),
                JobPosition.is_active.is_(True),
                JobPosition.id != exclude_id,
            )
        )
    ).scalar_one()
    if count >= tier.max_active_positions:
        try:
            from app.core.config import settings as _s
            from app.services.email_service import send_plan_limit_email
            await send_plan_limit_email(
                user.email,
                user.full_name or "there",
                tier.name,
                tier.max_active_positions,
                count,
                f"{_s.FRONTEND_URL}/dashboard",
                f"{_s.FRONTEND_URL}/plans",
            )
        except Exception:
            pass  # never block the 402
        raise HTTPException(
            status_code=_PAYMENT_REQUIRED,
            detail=f"Your plan allows a maximum of {tier.max_active_positions} active position(s) total. "
                   "Deactivate another position to activate this one.",
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


MAX_URLS_PER_POSITION = 7


async def check_url_limit(db: AsyncSession, user: User, position_id: int) -> None:
    """Enforce a hard cap of MAX_URLS_PER_POSITION job board URLs per position,
    and also the tier's max_urls_per_position when it is more restrictive.
    """
    from app.models.job_url import JobUrl

    tier = await _get_tier(db, user)

    count = (
        await db.execute(
            select(func.count())
            .select_from(JobUrl)
            .where(
                JobUrl.job_position_id == position_id,
                JobUrl.is_active.is_(True),
            )
        )
    ).scalar_one()

    # Effective limit: tier value (if set) capped at MAX_URLS_PER_POSITION
    if tier.max_urls_per_position == -1:
        effective_limit = MAX_URLS_PER_POSITION
    else:
        effective_limit = min(tier.max_urls_per_position, MAX_URLS_PER_POSITION)

    if count >= effective_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A maximum of {effective_limit} active job board URL(s) are allowed per position.",
        )


async def check_url_reactivate_limit(db: AsyncSession, user: User, position_id: int, exclude_id: int) -> None:
    """Check limit when manually re-activating a URL (toggle ON)."""
    from app.models.job_url import JobUrl

    tier = await _get_tier(db, user)

    count = (
        await db.execute(
            select(func.count())
            .select_from(JobUrl)
            .where(
                JobUrl.job_position_id == position_id,
                JobUrl.is_active.is_(True),
                JobUrl.id != exclude_id,
            )
        )
    ).scalar_one()

    if tier.max_urls_per_position == -1:
        effective_limit = MAX_URLS_PER_POSITION
    else:
        effective_limit = min(tier.max_urls_per_position, MAX_URLS_PER_POSITION)

    if count >= effective_limit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A maximum of {effective_limit} active job board URL(s) are allowed per position. "
                   "Deactivate another URL to activate this one.",
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


async def deactivate_user_positions(db: AsyncSession, user: User) -> int:
    """Deactivate all active employers, positions, and URLs belonging to *user*.

    Called on subscription downgrade or expiry. Cancels all pending capture
    rounds so no further screenshots are taken.

    Returns the total number of positions deactivated.
    """
    from app.models.job_url import JobUrl
    from app.services.scheduler import pause_rounds_for_user

    emp_ids_res = await db.execute(
        select(Employer.id).where(Employer.user_id == user.id)
    )
    emp_ids = [r[0] for r in emp_ids_res.all()]
    if not emp_ids:
        return 0

    # Deactivate all employers
    emp_res = await db.execute(
        select(Employer).where(
            Employer.user_id == user.id,
            Employer.is_active.is_(True),
        )
    )
    for emp in emp_res.scalars().all():
        emp.is_active = False

    # Deactivate all active positions
    pos_res = await db.execute(
        select(JobPosition).where(
            JobPosition.employer_id.in_(emp_ids),
            JobPosition.is_active.is_(True),
        )
    )
    positions = pos_res.scalars().all()
    pos_ids = [p.id for p in positions]
    for pos in positions:
        pos.is_active = False

    # Deactivate all active URLs under those positions
    if pos_ids:
        url_res = await db.execute(
            select(JobUrl).where(
                JobUrl.job_position_id.in_(pos_ids),
                JobUrl.is_active.is_(True),
            )
        )
        for url in url_res.scalars().all():
            url.is_active = False

    await db.flush()
    await pause_rounds_for_user(db, emp_ids)
    await db.commit()
    return len(positions)
