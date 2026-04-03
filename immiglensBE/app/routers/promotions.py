"""Promotions router — admin CRUD + public endpoints for code validation and pricing-page banner."""
from __future__ import annotations

import logging
import random
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.audit_events import AuditAction, AuditEntity
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.promotion import Promotion
from app.models.user import User
from app.schemas.promotion import (
    ActivePromotionPublic,
    PromoCodeValidation,
    PromotionCreate,
    PromotionOut,
    PromotionUpdate,
)
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
    if not promo.stripe_coupon_id:
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


def _generate_code(name: str) -> str:
    """Generate a promo code from the promotion name + 4 random chars.

    e.g. "Founding Member Discount" → "FOUNDING-X4K2"
    """
    prefix = "".join(c for c in name.upper() if c.isalnum())[:8]
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}-{suffix}" if prefix else suffix


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/pricing-banner", response_model=ActivePromotionPublic | None)
async def pricing_banner(db: AsyncSession = Depends(get_db)):
    """Return the single promotion flagged show_on_pricing_page, if eligible.

    Used by the public pricing/plan page to show a promotional banner.
    Returns null when no eligible promotion is set to show publicly.
    """
    promo = (
        await db.execute(
            select(Promotion)
            .where(
                Promotion.is_active.is_(True),
                Promotion.show_on_pricing_page.is_(True),
            )
            .order_by(Promotion.id)
            .limit(1)
        )
    ).scalars().first()

    if promo and _is_eligible(promo):
        return ActivePromotionPublic(
            id=promo.id,
            name=promo.name,
            description=promo.description,
            code=promo.code,
            discount_type=promo.discount_type,
            discount_value=promo.discount_value,
            duration=promo.duration,
            duration_in_months=promo.duration_in_months,
            max_redemptions=promo.max_redemptions,
            redemptions_count=promo.redemptions_count,
            remaining=_remaining(promo),
            valid_until=promo.valid_until,
        )
    return None


@router.get("/validate", response_model=PromoCodeValidation)
async def validate_promo_code(
    code: str = Query(..., description="Promo code to validate"),
    db: AsyncSession = Depends(get_db),
):
    """Validate a promo code and return its discount details.

    Called from the frontend when a user enters a code before checkout.
    Returns 404 if the code does not exist or is no longer eligible.
    """
    promo = (
        await db.execute(
            select(Promotion).where(Promotion.code == code.strip().upper())
        )
    ).scalars().first()

    if not promo or not _is_eligible(promo):
        raise HTTPException(status_code=404, detail="Promo code is invalid or has expired.")

    return PromoCodeValidation(
        id=promo.id,
        name=promo.name,
        description=promo.description,
        code=promo.code,
        discount_type=promo.discount_type,
        discount_value=promo.discount_value,
        duration=promo.duration,
        duration_in_months=promo.duration_in_months,
        remaining=_remaining(promo),
        valid_until=promo.valid_until,
    )


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
    """Create a promotion with a promo code and auto-sync a Stripe coupon."""
    data = body.model_dump()

    # Auto-generate code if not provided
    if not data.get("code"):
        data["code"] = _generate_code(body.name)

    # Ensure code uniqueness
    existing = (
        await db.execute(select(Promotion).where(Promotion.code == data["code"]))
    ).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Promo code '{data['code']}' is already in use.")

    promo = Promotion(**data)
    db.add(promo)
    await db.flush()

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
    except Exception as exc:
        log.warning("Stripe coupon creation failed for promotion %s: %s", promo.id, exc)

    await audit(
        db,
        action=AuditAction.PROMO_CREATED,
        entity_type=AuditEntity.PROMOTION,
        actor_id=current_user.id,
        entity_id=promo.id,
        entity_label=promo.name,
        description=f'Created promotion "{promo.name}" (code: {promo.code})',
        new_data={"name": promo.name, "code": promo.code},
        request=request,
    )
    await db.commit()
    await db.refresh(promo)
    return _to_out(promo)


@router.patch("/{promotion_id}", response_model=PromotionOut)
async def admin_update_promotion(
    promotion_id: int,
    body: PromotionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Update promotion metadata. Discount value/type/duration cannot change (immutable in Stripe)."""
    promo = await db.get(Promotion, promotion_id)
    if not promo:
        raise HTTPException(status_code=404, detail="Promotion not found.")

    old_active = promo.is_active
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(promo, field, value)

    # Auto-create Stripe coupon if it doesn't exist yet
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

    promo_action = AuditAction.PROMO_DEACTIVATED if not promo.is_active else AuditAction.PROMO_UPDATED
    promo_desc = (
        f'Deactivated promotion "{promo.name}"'
        if not promo.is_active
        else f'Updated promotion "{promo.name}"'
    )
    await audit(
        db,
        action=promo_action,
        entity_type=AuditEntity.PROMOTION,
        actor_id=current_user.id,
        entity_id=promo.id,
        entity_label=promo.name,
        description=promo_desc,
        new_data=body.model_dump(exclude_none=True),
        request=request,
    )
    await db.commit()  # single commit: promo changes + audit are atomic
    await db.refresh(promo)
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
    promo.show_on_pricing_page = False
    if promo.stripe_coupon_id:
        try:
            stripe_service.archive_coupon(promo.stripe_coupon_id)
        except Exception as exc:
            log.warning("Stripe coupon archive failed for promotion %s: %s", promo.id, exc)
    await audit(
        db,
        action=AuditAction.PROMO_DEACTIVATED,
        entity_type=AuditEntity.PROMOTION,
        actor_id=current_user.id,
        entity_id=promo.id,
        entity_label=promo.name,
        description=f'Deactivated promotion "{promo.name}"',
        old_data={"is_active": True},
        new_data={"is_active": False},
        request=request,
    )
    await db.commit()
