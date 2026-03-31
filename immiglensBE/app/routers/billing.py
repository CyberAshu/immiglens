"""Billing routes: Stripe checkout, customer portal, and webhook handler."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

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
from app.services.email_service import (
    send_payment_failed_email,
    send_payment_successful_email,
    send_renewal_failed_email,
    send_subscription_confirmed_email,
    send_trial_ending_email,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


# ── Request / response schemas ────────────────────────────────────────────────

class CheckoutRequest(BaseModel):
    tier_id: int
    onboarding: bool = False  # when True, success/cancel URL targets /onboarding instead of /plan
    is_annual: bool = False   # when True, use annual price if available; stored in subscription metadata


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

    # Trial eligibility is a backend decision: only for first-time subscribers.
    # settings.TRIAL_DAYS is the single source of truth — never sent by the client.
    trial_days = settings.TRIAL_DAYS if not current_user.stripe_customer_id else 0

    try:
        url = await stripe_service.create_checkout_session(
            current_user, tier, db,
            trial_days=trial_days,
            coupon_id=coupon_id,
            onboarding=body.onboarding,
            is_annual=body.is_annual,
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


class SyncCheckoutRequest(BaseModel):
    session_id: str


class SyncCheckoutResponse(BaseModel):
    tier_id: Optional[int] = None
    tier_expires_at: Optional[datetime] = None
    synced: bool = False  # True when a DB update was made


@router.post("/sync-checkout", response_model=SyncCheckoutResponse)
async def sync_checkout(
    body: SyncCheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Proactively sync the user's subscription tier right after Stripe checkout.

    Stripe redirects the user back to the app immediately, but the
    checkout.session.completed webhook fires asynchronously (often several
    seconds later).  This endpoint fetches the session directly from Stripe and
    applies the tier assignment synchronously, so the dashboard always shows the
    correct plan on the first load.  Idempotent – safe to call multiple times.
    """
    if not settings.STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe is not configured.")

    try:
        client = stripe.StripeClient(settings.STRIPE_SECRET_KEY)
        session = client.checkout.sessions.retrieve(body.session_id)
    except stripe.InvalidRequestError:
        raise HTTPException(status_code=404, detail="Checkout session not found.")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Stripe error: {exc}") from exc

    # Only trust a completed, paid (or trial) session
    if session.payment_status not in ("paid", "no_payment_required"):
        return SyncCheckoutResponse(tier_id=current_user.tier_id, tier_expires_at=current_user.tier_expires_at)

    metadata_obj = getattr(session, "metadata", None)
    tier_id_str = getattr(metadata_obj, "tier_id", None) if metadata_obj else None
    if not tier_id_str:
        return SyncCheckoutResponse(tier_id=current_user.tier_id, tier_expires_at=current_user.tier_expires_at)

    new_tier_id = int(tier_id_str)

    # Resolve expiry from the subscription
    new_expires_at: datetime | None = None
    subscription_id = getattr(session, "subscription", None)
    if subscription_id:
        try:
            sub = client.subscriptions.retrieve(subscription_id)
            end_ts = _get_period_end(sub)
            if end_ts:
                new_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)
        except Exception:
            log.warning("sync-checkout: could not retrieve subscription %s", subscription_id)

    # Persist customer_id if not yet stored
    customer_id = getattr(session, "customer", None)
    if not current_user.stripe_customer_id and customer_id:
        current_user.stripe_customer_id = customer_id

    synced = False
    if new_tier_id != current_user.tier_id:
        tier = await db.get(SubscriptionTier, new_tier_id)
        if tier:
            current_user.tier_id = tier.id
            current_user.tier_expires_at = new_expires_at
            await db.commit()
            synced = True
            log.info("sync-checkout: updated user %s to tier %s", current_user.id, tier.id)
    elif new_expires_at and new_expires_at != current_user.tier_expires_at:
        current_user.tier_expires_at = new_expires_at
        await db.commit()
        synced = True

    return SyncCheckoutResponse(
        tier_id=current_user.tier_id,
        tier_expires_at=current_user.tier_expires_at,
        synced=synced,
    )


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
        await _handle_trial_will_end(data, db)

    # ── invoice.payment_failed ────────────────────────────────────────────────────
    elif event_type == "invoice.payment_failed":
        await _handle_invoice_payment_failed(data, db)

    # ── invoice.paid ────────────────────────────────────────────────────────────
    elif event_type == "invoice.paid":
        await _handle_invoice_paid(data, db)

    return {"received": True}


# ── Webhook helpers ───────────────────────────────────────────────────────────

async def _find_user_by_customer(customer_id: str, db: AsyncSession) -> User | None:
    return (
        await db.execute(select(User).where(User.stripe_customer_id == customer_id))
    ).scalar_one_or_none()

def _get_period_end(sub: dict) -> int | None:
    """Return current_period_end for a Stripe subscription.

    Stripe's Flexible Billing mode (2025+) stores current_period_end on the
    subscription *item* rather than the subscription root object.  We check both
    locations so the code works regardless of which billing mode is active.
    """
    # Prefer top-level field (classic billing mode)
    top: int | None = sub.get("current_period_end") if isinstance(sub, dict) else getattr(sub, "current_period_end", None)
    if top:
        return top
    # Fallback: item-level field (flexible billing mode)
    try:
        items = sub["items"]["data"] if isinstance(sub, dict) else sub.items.data
        if items:
            item_end = items[0]["current_period_end"] if isinstance(items[0], dict) else items[0].current_period_end
            if item_end:
                return item_end
    except (KeyError, AttributeError, TypeError, IndexError):
        pass
    return None

async def _handle_checkout_completed(data: dict, db: AsyncSession) -> None:
    customer_id: str = getattr(data, "customer", "") or ""
    metadata_obj = getattr(data, "metadata", None)
    user_id = getattr(metadata_obj, "user_id", None) if metadata_obj else None
    tier_id = getattr(metadata_obj, "tier_id", None) if metadata_obj else None

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
    subscription_id: str | None = getattr(data, "subscription", None)
    if subscription_id:
        try:
            client = stripe.StripeClient(settings.STRIPE_SECRET_KEY)
            sub = client.subscriptions.retrieve(subscription_id)
            end_ts = _get_period_end(sub)
            if end_ts:
                user.tier_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)
        except Exception:
            log.exception("Could not retrieve subscription %s", subscription_id)

    await db.commit()
    log.info("checkout.session.completed: user %s assigned tier %s", user.id, tier_id)

    # 6.1 Subscription confirmed email
    try:
        tier_obj = await db.get(SubscriptionTier, user.tier_id) if user.tier_id else None
        plan_name = tier_obj.name if tier_obj else "ImmigLens"
        start_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
        next_date = (
            user.tier_expires_at.strftime("%B %d, %Y")
            if user.tier_expires_at else "N/A"
        )
        await send_subscription_confirmed_email(
            user.email,
            user.full_name or "there",
            plan_name,
            start_date,
            next_date,
            f"{settings.FRONTEND_URL}/dashboard",
        )
    except Exception:
        log.exception("Failed to send subscription_confirmed email to user %s", user.id)


async def _handle_subscription_updated(data: dict, db: AsyncSession) -> None:
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        return

    end_ts = _get_period_end(data)
    if end_ts:
        user.tier_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)

    # Reflect plan change if metadata carries tier_id
    metadata_obj = getattr(data, "metadata", None)
    tier_id = getattr(metadata_obj, "tier_id", None) if metadata_obj else None
    if tier_id:
        tier = await db.get(SubscriptionTier, int(tier_id))
        if tier:
            user.tier_id = tier.id

    await db.commit()


async def _handle_subscription_deleted(data: dict, db: AsyncSession) -> None:
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        return

    user.tier_id = None
    user.tier_expires_at = None
    await db.commit()
    log.info("subscription.deleted: reverted user %s to free tier", user.id)


async def _handle_trial_will_end(data: dict, db: AsyncSession) -> None:
    """2.7 Trial Ending Reminder — fired 3 days before trial expiry."""
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        log.warning("trial_will_end: no user found for customer %s", customer_id)
        return

    trial_end_ts = getattr(data, "trial_end", None)
    if trial_end_ts:
        trial_end_dt = datetime.fromtimestamp(trial_end_ts, tz=timezone.utc)
        days_remaining = max(0, (trial_end_dt - datetime.now(timezone.utc)).days)
        trial_end_date = trial_end_dt.strftime("%B %d, %Y")
    else:
        days_remaining = 3
        trial_end_date = "soon"

    try:
        await send_trial_ending_email(
            user.email,
            user.full_name or "there",
            trial_end_date,
            days_remaining,
            f"{settings.FRONTEND_URL}/plans",
        )
        log.info("trial_will_end email sent to user %s", user.id)
    except Exception:
        log.exception("Failed to send trial_ending email to user %s", user.id)


async def _handle_invoice_payment_failed(data: dict, db: AsyncSession) -> None:
    """5.2 Payment Failed / 6.5 Renewal Failed — distinguish by billing_reason."""
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        log.warning("invoice.payment_failed: no user found for customer %s", customer_id)
        return

    amount_cents: int = getattr(data, "amount_due", 0) or 0
    amount = f"${amount_cents / 100:.2f} CAD"
    billing_reason: str = getattr(data, "billing_reason", "") or ""
    attempt_count: int = getattr(data, "attempt_count", 1) or 1
    retries_remaining = max(0, 3 - attempt_count)
    failure_reason = "Charge declined"

    next_attempt_ts = getattr(data, "next_payment_attempt", None)
    retry_date = (
        datetime.fromtimestamp(next_attempt_ts, tz=timezone.utc).strftime("%B %d, %Y")
        if next_attempt_ts
        else "N/A"
    )
    # Grace period: 14 days from now as a reasonable default
    grace_period_end = (
        datetime.now(timezone.utc) + timedelta(days=14)
    ).strftime("%B %d, %Y")

    billing_url = f"{settings.FRONTEND_URL}/billing"

    try:
        if billing_reason == "subscription_cycle":
            # Renewal-specific email (6.5)
            tier = await db.get(SubscriptionTier, user.tier_id) if user.tier_id else None
            plan_name = tier.name if tier else "ImmigLens"
            renewal_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
            await send_renewal_failed_email(
                user.email,
                user.full_name or "there",
                plan_name,
                renewal_date,
                amount,
                failure_reason,
                grace_period_end,
                retry_date,
                retries_remaining,
                billing_url,
            )
        else:
            # First-payment failure email (5.2)
            attempted_at = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")
            await send_payment_failed_email(
                user.email,
                user.full_name or "there",
                amount,
                attempted_at,
                failure_reason,
                grace_period_end,
                retry_date,
                retries_remaining,
                billing_url,
            )
        log.info("invoice.payment_failed email sent to user %s (reason=%s)", user.id, billing_reason)
    except Exception:
        log.exception("Failed to send payment_failed email to user %s", user.id)


async def _handle_invoice_paid(data: dict, db: AsyncSession) -> None:
    """5.1 Payment Successful — fired on invoice.paid for any successful charge."""
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        return

    amount_cents: int = getattr(data, "amount_paid", 0) or 0
    amount = f"${amount_cents / 100:.2f} CAD"
    invoice_number: str = getattr(data, "number", None) or getattr(data, "id", "N/A")

    # Billing period from line items
    lines_obj = getattr(data, "lines", None)
    lines = getattr(lines_obj, "data", []) if lines_obj else []
    period_obj = getattr(lines[0], "period", None) if lines else None
    billing_start = (
        datetime.fromtimestamp(period_obj.start, tz=timezone.utc).strftime("%B %d, %Y")
        if period_obj and getattr(period_obj, "start", None) else "N/A"
    )
    billing_end = (
        datetime.fromtimestamp(period_obj.end, tz=timezone.utc).strftime("%B %d, %Y")
        if period_obj and getattr(period_obj, "end", None) else "N/A"
    )

    next_billing_date = (
        user.tier_expires_at.strftime("%B %d, %Y") if user.tier_expires_at else "N/A"
    )

    try:
        await send_payment_successful_email(
            user.email,
            user.full_name or "there",
            amount,
            invoice_number,
            (await db.get(SubscriptionTier, user.tier_id)).name if user.tier_id else "ImmigLens",
            billing_start,
            billing_end,
            next_billing_date,
            f"{settings.FRONTEND_URL}/billing",
        )
        log.info("invoice.paid email sent to user %s", user.id)
    except Exception:
        log.exception("Failed to send payment_successful email to user %s", user.id)
