"""Subscription tier router — view available plans and current usage."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import _get_tier
from app.models.capture import CaptureRound, CaptureStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.promotion import Promotion, PromotionRedemption
from app.models.subscription import SubscriptionTier
from app.models.user import User
from app.schemas.subscription import SubscriptionTierOut, UsageSummary

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.get("/tiers", response_model=list[SubscriptionTierOut])
async def list_tiers(db: AsyncSession = Depends(get_db)):
    """Return all active subscription tiers (public, no auth required)."""
    rows = (
        await db.execute(
            select(SubscriptionTier)
            .where(SubscriptionTier.is_active.is_(True))
            .order_by(SubscriptionTier.id)
        )
    ).scalars().all()
    return rows


@router.get("/usage", response_model=UsageSummary)
async def get_usage(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's tier and resource consumption for this month."""
    tier = await _get_tier(db, current_user)

    # Global active positions count across all employers
    emp_ids_res = await db.execute(
        select(Employer.id).where(Employer.user_id == current_user.id)
    )
    emp_ids = [r[0] for r in emp_ids_res.all()]

    active_positions_used = 0
    captures_this_month = 0

    if emp_ids:
        active_positions_used = (
            await db.execute(
                select(func.count())
                .select_from(JobPosition)
                .where(
                    JobPosition.employer_id.in_(emp_ids),
                    JobPosition.is_active.is_(True),
                )
            )
        ).scalar_one()

        pos_ids_res = await db.execute(
            select(JobPosition.id).where(JobPosition.employer_id.in_(emp_ids))
        )
        pos_ids = [r[0] for r in pos_ids_res.all()]

        if pos_ids:
            now = datetime.now(timezone.utc)
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            captures_this_month = (
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

    # Look up the most recently redeemed promotion for this user
    # Only relevant if they have an active billing account
    applied_promo: Promotion | None = None
    if current_user.stripe_customer_id:
        applied_promo = (
            await db.execute(
                select(Promotion)
                .join(PromotionRedemption, PromotionRedemption.promotion_id == Promotion.id)
                .where(PromotionRedemption.user_id == current_user.id)
                .order_by(PromotionRedemption.redeemed_at.desc())
                .limit(1)
            )
        ).scalars().first()

    return UsageSummary(
        tier=SubscriptionTierOut.model_validate(tier),
        active_positions_used=active_positions_used,
        captures_this_month=captures_this_month,
        has_billing_account=bool(current_user.stripe_customer_id),
        applied_promotion_name=applied_promo.name if applied_promo else None,
        applied_discount_type=applied_promo.discount_type if applied_promo else None,
        applied_discount_value=applied_promo.discount_value if applied_promo else None,
        applied_discount_duration=applied_promo.duration if applied_promo else None,
    )
