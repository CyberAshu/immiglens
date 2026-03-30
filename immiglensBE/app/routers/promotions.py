"""Promotions router — admin CRUD + public active promotions endpoint."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.database import get_db
from app.core.dependencies import get_client_ip, get_current_user
from app.models.promotion import Promotion
from app.models.user import User
from app.schemas.promotion import ActivePromotionPublic, PromotionCreate, PromotionOut, PromotionUpdate
from app.services import stripe_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/promotions", tags=["promotions"])


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_eligible(promo: Promotion) -> bool:
    """Return True if the promotion can still be redeemed right now."""
    now = datetime.now(timezone.utc)
    if not promo.is_active:
        return False
    if promo.valid_from and now < promo.valid_from:
        return False
    if promo.valid_until and now > promo.valid_until:
        return False
    if promo.max_redemptions is not None and promo.redemptions_count >= promo.max_redemptions:
        return False
    return True


def _remaining(promo: Promotion) -> int | None:
    if promo.max_redemptions is None:
        return None
    return max(0, promo.max_redemptions - promo.redemptions_count)


def _to_out(promo: Promotion) -> PromotionOut:
    out = PromotionOut.model_validate(promo)
    out.remaining = _remaining(promo)
    return out


# ── Public endpoint ───────────────────────────────────────────────────────────

@router.get("/active", response_model=list[ActivePromotionPublic])
async def list_active_promotions(db: AsyncSession = Depends(get_db)):
    """Return all currently eligible promotions (public, no auth required)."""
    promos = (
        await db.execute(select(Promotion).where(Promotion.is_active.is_(True)).order_by(Promotion.id))
    ).scalars().all()
    result = []
    for p in promos:
        if _is_eligible(p):
            result.append(ActivePromotionPublic(
                id=p.id,
                name=p.name,
                description=p.description,
                discount_type=p.discount_type,
                discount_value=p.discount_value,
                duration=p.duration,
                duration_in_months=p.duration_in_months,
                max_redemptions=p.max_redemptions,
                redemptions_count=p.redemptions_count,
                remaining=_remaining(p),
                valid_until=p.valid_until,
            ))
    return result


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("", response_model=list[PromotionOut])
async def admin_list_promotions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Return all promotions (admin only)."""
    promos = (
        await db.execute(select(Promotion).order_by(Promotion.id))
    ).scalars().all()
    return [_to_out(p) for p in promos]


@router.post("", response_model=PromotionOut, status_code=201)
async def admin_create_promotion(
    body: PromotionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Create a promotion and auto-sync a Stripe coupon."""
    promo = Promotion(**body.model_dump())
    db.add(promo)
    await db.commit()
    await db.refresh(promo)

    # Auto-create Stripe coupon (best-effort)
    try:
        coupon_id = stripe_service.create_coupon(
            name=promo.name,
            discount_type=promo.discount_type,
            discount_value=promo.discount_value,
            duration=promo.duration,
            duration_in_months=promo.duration_in_months,
            promotion_id=promo.id,
        )
        promo.stripe_coupon_id = coupon_id
        await db.commit()
        await db.refresh(promo)
    except Exception as exc:
        log.warning("Stripe coupon creation failed for promotion %s: %s", promo.id, exc)

    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="promotion", resource_id=promo.id,
                     new_data={"name": promo.name}, ip_address=get_client_ip(request))
    await db.commit()
    return _to_out(promo)


@router.patch("/{promotion_id}", response_model=PromotionOut)
async def admin_update_promotion(
    promotion_id: int,
    body: PromotionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update promotion metadata. Discount value/type cannot change (immutable in Stripe)."""
    promo = await db.get(Promotion, promotion_id)
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found.")

    old_active = promo.is_active
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(promo, field, value)

    # Auto-create Stripe coupon if it doesn't exist yet (e.g. seeded rows)
    if not promo.stripe_coupon_id and promo.is_active:
        try:
            coupon_id = stripe_service.create_coupon(
                name=promo.name,
                discount_type=promo.discount_type,
                discount_value=promo.discount_value,
                duration=promo.duration,
                duration_in_months=promo.duration_in_months,
                promotion_id=promo.id,
            )
            promo.stripe_coupon_id = coupon_id
        except Exception as exc:
            log.warning("Stripe coupon creation failed for promotion %s: %s", promo.id, exc)

    # Archive Stripe coupon when deactivating
    elif old_active and not promo.is_active and promo.stripe_coupon_id:
        try:
            stripe_service.archive_coupon(promo.stripe_coupon_id)
        except Exception as exc:
            log.warning("Stripe coupon archive failed for promotion %s: %s", promo.id, exc)

    await db.commit()
    await db.refresh(promo)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="promotion", resource_id=promo.id,
                     new_data=body.model_dump(exclude_none=True), ip_address=get_client_ip(request))
    await db.commit()
    return _to_out(promo)


@router.delete("/{promotion_id}", status_code=204)
async def admin_delete_promotion(
    promotion_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Deactivate a promotion (soft-delete). Archives the Stripe coupon."""
    promo = await db.get(Promotion, promotion_id)
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found.")
    promo.is_active = False
    if promo.stripe_coupon_id:
        try:
            stripe_service.archive_coupon(promo.stripe_coupon_id)
        except Exception as exc:
            log.warning("Stripe coupon archive failed for promotion %s: %s", promo.id, exc)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="promotion", resource_id=promo.id,
                     old_data={"is_active": True}, new_data={"is_active": False},
                     ip_address=get_client_ip(request))
    await db.commit()
