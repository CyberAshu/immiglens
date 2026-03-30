"""Billing routes: Stripe checkout, customer portal, and webhook handler."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.models.promotion import Promotion, PromotionRedemption
from app.models.subscription import SubscriptionTier
from app.models.user import User
from app.routers.promotions import _is_eligible
from app.services import stripe_service

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


# ── Request / response schemas ────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    tier_id: int
    trial_days: int = 0


class UrlResponse(BaseModel):
    url: str


class PublishableKeyResponse(BaseModel):
    key: str


# ── Helper: pick the best eligible promotion ─────────────────────────────────

async def _best_promotion(db: AsyncSession) -> Promotion | None:
    """Return the highest-value eligible promotion, or None."""
    promos = (
        await db.execute(
            select(Promotion)
            .where(Promotion.is_active.is_(True), Promotion.stripe_coupon_id.isnot(None))
            .order_by(Promotion.discount_value.desc())
        )
    ).scalars().all()
    for p in promos:
        if _is_eligible(p):
            return p
    return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/publishable-key", response_model=PublishableKeyResponse)
async def get_publishable_key():
    """Return the Stripe publishable key to the frontend."""
    if not settings.STRIPE_PUBLISHABLE_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured.")
    return {"key": settings.STRIPE_PUBLISHABLE_KEY}


@router.post("/checkout", response_model=UrlResponse)
async def create_checkout(
    body: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe Checkout session and return the hosted URL.

    Automatically applies the best eligible active promotion coupon.
    """
    tier = await db.get(SubscriptionTier, body.tier_id)
    if not tier or not tier.is_active:
        raise HTTPException(status_code=404, detail="Tier not found.")
    if not tier.stripe_price_id:
        raise HTTPException(
            status_code=400,
            detail="This tier is not yet synced with Stripe. Please contact support.",
        )

    promo = await _best_promotion(db)
    coupon_id = promo.stripe_coupon_id if promo else None

    try:
        url = await stripe_service.create_checkout_session(
            current_user, tier, db,
            trial_days=body.trial_days,
            coupon_id=coupon_id,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Record the redemption so the count stays accurate
    if promo:
        db.add(PromotionRedemption(promotion_id=promo.id, user_id=current_user.id))
        promo.redemptions_count += 1
        await db.commit()

    return {"url": url}


@router.post("/portal", response_model=UrlResponse)
async def create_portal(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe Customer Portal session."""
    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=400, detail="No billing account found. Please subscribe first."
        )
    try:
        url = await stripe_service.create_portal_session(current_user, db)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"url": url}


@router.post("/webhook", status_code=200)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive and process Stripe webhook events.

    Stripe signs every event with HMAC-SHA256.  We validate the signature
    before touching the database to prevent spoofing.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.construct_webhook_event(payload, sig_header)
    except stripe.SignatureVerificationError:
        log.warning("Stripe webhook: invalid signature")
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    event_type: str = event["type"]
    data = event["data"]["object"]

    # ── checkout.session.completed ────────────────────────────────────────────
    if event_type == "checkout.session.completed":
        await _handle_checkout_completed(data, db)

    # ── customer.subscription.updated ────────────────────────────────────────
    elif event_type == "customer.subscription.updated":
        await _handle_subscription_updated(data, db)

    # ── customer.subscription.deleted ────────────────────────────────────────
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(data, db)

    # ── customer.subscription.trial_will_end (3 days before trial ends) ──────
    elif event_type == "customer.subscription.trial_will_end":
        customer_id: str = data.get("customer", "")
        log.info("Trial ending soon for customer %s — consider sending reminder email", customer_id)

    # ── invoice.payment_failed ────────────────────────────────────────────────
    elif event_type == "invoice.payment_failed":
        log.warning(
            "Stripe payment failed for customer %s", data.get("customer")
        )

    return {"received": True}


# ── Webhook helpers ───────────────────────────────────────────────────────────

async def _find_user_by_customer(customer_id: str, db: AsyncSession) -> User | None:
    return (
        await db.execute(select(User).where(User.stripe_customer_id == customer_id))
    ).scalar_one_or_none()


async def _handle_checkout_completed(data: dict, db: AsyncSession) -> None:
    customer_id: str = data.get("customer", "")
    metadata: dict = data.get("metadata", {})

    user_id = metadata.get("user_id")
    tier_id = metadata.get("tier_id")

    user: User | None = None
    if user_id:
        user = await db.get(User, int(user_id))
    if user is None and customer_id:
        user = await _find_user_by_customer(customer_id, db)

    if user is None:
        log.error("checkout.session.completed: could not resolve user (customer=%s)", customer_id)
        return

    # Store customer_id if not already set
    if not user.stripe_customer_id and customer_id:
        user.stripe_customer_id = customer_id

    if tier_id:
        tier = await db.get(SubscriptionTier, int(tier_id))
        if tier:
            user.tier_id = tier.id

    # Use subscription current_period_end as the expiry
    subscription_id: str | None = data.get("subscription")
    if subscription_id:
        try:
            client = stripe.StripeClient(settings.STRIPE_SECRET_KEY)
            sub = client.subscriptions.retrieve(subscription_id)
            end_ts: int = sub["current_period_end"]
            user.tier_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)
        except Exception:
            log.exception("Could not retrieve subscription %s", subscription_id)

    await db.commit()
    log.info("checkout.session.completed: user %s assigned tier %s", user.id, tier_id)


async def _handle_subscription_updated(data: dict, db: AsyncSession) -> None:
    customer_id: str = data.get("customer", "")
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        return

    end_ts: int | None = data.get("current_period_end")
    if end_ts:
        user.tier_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)

    # Reflect plan change if metadata carries tier_id
    metadata: dict = data.get("metadata", {})
    tier_id = metadata.get("tier_id")
    if tier_id:
        tier = await db.get(SubscriptionTier, int(tier_id))
        if tier:
            user.tier_id = tier.id

    await db.commit()


async def _handle_subscription_deleted(data: dict, db: AsyncSession) -> None:
    customer_id: str = data.get("customer", "")
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        return

    user.tier_id = None
    user.tier_expires_at = None
    await db.commit()
    log.info("subscription.deleted: reverted user %s to free tier", user.id)
