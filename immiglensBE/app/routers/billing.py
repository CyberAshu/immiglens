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

from app.core.audit import audit
from app.core.audit_events import AuditAction, AuditEntity
from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.permissions import deactivate_user_positions
from app.models.audit_log import AuditLog
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
    promo_code: str | None = None  # optional promo code entered by the user


class UrlResponse(BaseModel):
    url: str


class PublishableKeyResponse(BaseModel):
    key: str


# ── Helper: resolve promotion by code ───────────────────────────────────────

async def _promotion_by_code(code: str, db: AsyncSession) -> Promotion | None:
    """Return eligible promotion for the given code, or None."""
    promo = (
        await db.execute(
            select(Promotion).where(Promotion.code == code.strip().upper())
        )
    ).scalars().first()
    if promo and _is_eligible(promo):
        return promo
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

    If promo_code is provided, validates it and applies the discount.
    Redemption is recorded only after Stripe confirms payment via webhook.
    """
    tier = await db.get(SubscriptionTier, body.tier_id)
    if not tier or not tier.is_active:
        raise HTTPException(status_code=404, detail="Tier not found.")
    if not tier.stripe_price_id:
        raise HTTPException(
            status_code=400,
            detail="This tier is not yet synced with Stripe. Please contact support.",
        )

    # Resolve promo code if provided
    promo: Promotion | None = None
    coupon_id: str | None = None
    if body.promo_code:
        promo = await _promotion_by_code(body.promo_code, db)
        if not promo:
            raise HTTPException(status_code=400, detail="Promo code is invalid or has expired.")
        coupon_id = promo.stripe_coupon_id

    # Trial eligibility is a backend decision: only for first-time subscribers.
    # settings.TRIAL_DAYS is the single source of truth — never sent by the client.
    trial_days = settings.TRIAL_DAYS if not current_user.stripe_customer_id else 0

    # Embed promotion_id in metadata so the webhook can record the redemption
    # when Stripe confirms payment — not before.
    extra_metadata: dict = {}
    if promo:
        extra_metadata["promotion_id"] = str(promo.id)

    try:
        url = await stripe_service.create_checkout_session(
            current_user, tier, db,
            trial_days=trial_days,
            coupon_id=coupon_id,
            onboarding=body.onboarding,
            is_annual=body.is_annual,
            extra_metadata=extra_metadata,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

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

    # Security: verify this session belongs to the authenticated user.
    # A session's customer must match the user's known customer_id (when set),
    # OR the metadata must reference this user's ID.  Without this check any
    # authenticated user could apply another user's completed session to their
    # own account, escalating privileges and stealing stripe_customer_id.
    customer_id = getattr(session, "customer", None)
    metadata_obj = getattr(session, "metadata", None)
    session_user_id = getattr(metadata_obj, "user_id", None) if metadata_obj else None

    if current_user.stripe_customer_id:
        # Case 1: User already has a customer — verify the session belongs to them.
        if customer_id != current_user.stripe_customer_id:
            raise HTTPException(status_code=403, detail="Session does not belong to your account.")
    else:
        # Case 2: First-time user, no customer_id yet — verify via session metadata.
        if session_user_id:
            if int(session_user_id) != current_user.id:
                raise HTTPException(status_code=403, detail="Session does not belong to your account.")
        else:
            # Neither customer_id nor metadata user_id can confirm ownership.
            # Refuse rather than blindly storing an unverified customer_id — an
            # attacker could steal another Stripe customer's identity this way.
            raise HTTPException(
                status_code=403,
                detail="Session ownership cannot be verified. Please contact support.",
            )

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


class ChangePlanRequest(BaseModel):
    tier_id: int
    is_annual: bool = False


@router.post("/change-plan", response_model=SyncCheckoutResponse)
async def change_plan(
    body: ChangePlanRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upgrade or downgrade an existing subscriber's plan without a new checkout.

    Updates the Stripe subscription in place so no duplicate subscription is
    created.  Proration is invoiced immediately by Stripe.
    """
    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=400, detail="No billing account found. Please subscribe first."
        )

    tier = await db.get(SubscriptionTier, body.tier_id)
    if not tier or not tier.is_active:
        raise HTTPException(status_code=404, detail="Tier not found.")
    if not tier.stripe_price_id:
        raise HTTPException(
            status_code=400,
            detail="This tier is not yet synced with Stripe. Please contact support.",
        )

    try:
        updated_sub = stripe_service.update_subscription_price(
            current_user, tier, body.is_annual
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    # Detect downgrade: new plan has a stricter active-position cap than the current one
    old_tier = await db.get(SubscriptionTier, current_user.tier_id) if current_user.tier_id else None
    old_max = old_tier.max_active_positions if old_tier else -1
    new_max = tier.max_active_positions
    is_downgrade = new_max != -1 and (old_max == -1 or new_max < old_max)

    # Update DB immediately — webhook will arrive shortly but we're already synced
    current_user.tier_id = tier.id
    end_ts = _get_period_end(updated_sub)
    if end_ts:
        current_user.tier_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)

    if is_downgrade:
        # Deactivate excess positions only (employers and URLs are left untouched)
        await deactivate_user_positions(db, current_user)
    else:
        await db.flush()
    await audit(
        db,
        action=AuditAction.SUBSCRIPTION_PLAN_CHANGED,
        entity_type=AuditEntity.USER,
        actor_id=current_user.id,
        entity_id=str(current_user.id),
        entity_label=current_user.email,
        old_data={"tier_id": old_tier.id if old_tier else None, "tier_name": old_tier.display_name if old_tier else None},
        new_data={"tier_id": tier.id, "tier_name": tier.display_name, "is_annual": body.is_annual},
        description=f"Plan changed to {tier.display_name} ({'annual' if body.is_annual else 'monthly'}, {'downgrade' if is_downgrade else 'upgrade'})",
        request=request,
    )
    await db.commit()
    log.info("change-plan: user %s switched to tier %s (downgrade=%s)", current_user.id, tier.id, is_downgrade)

    return SyncCheckoutResponse(
        tier_id=current_user.tier_id,
        tier_expires_at=current_user.tier_expires_at,
        synced=True,
    )


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
    event_id: str = event.get("id", "") or ""

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
        await _handle_invoice_payment_failed(data, db, event_id=event_id)

    # ── invoice.paid ────────────────────────────────────────────────────────────
    elif event_type == "invoice.paid":
        await _handle_invoice_paid(data, db, event_id=event_id)

    return {"received": True}


# ── Webhook helpers ───────────────────────────────────────────────────────────

async def _find_user_by_customer(customer_id: str, db: AsyncSession) -> User | None:
    return (
        await db.execute(select(User).where(User.stripe_customer_id == customer_id))
    ).scalar_one_or_none()


async def _find_user_by_customer_for_update(customer_id: str, db: AsyncSession) -> User | None:
    """Same as _find_user_by_customer but acquires a row-level write lock.

    Use this in webhook handlers that modify tier_id / tier_expires_at so that
    concurrent admin assignments (which also write these fields) are serialized
    at the DB level, preventing TOCTOU overwrites of tier_admin_override.
    """
    return (
        await db.execute(
            select(User)
            .where(User.stripe_customer_id == customer_id)
            .with_for_update()
        )
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


def _get_card_details(data: object) -> tuple[str, str]:
    """Extract card brand and last4 from a Stripe invoice or payment_intent object.

    Stripe embeds card details via charge > payment_method_details > card.
    Falls back to empty strings if not present (templates render them as blank).
    """
    try:
        # invoice.paid / invoice.payment_failed: charge is a charge ID string
        # The charge object is not embedded — we skip a second API call here
        # and instead check payment_method_details on the payment_intent if present.
        charge_obj = getattr(data, "charge", None)
        if charge_obj and not isinstance(charge_obj, str):
            pmd = getattr(charge_obj, "payment_method_details", None)
            card = getattr(pmd, "card", None) if pmd else None
            if card:
                return (
                    (getattr(card, "brand", "") or "").capitalize(),
                    getattr(card, "last4", "") or "",
                )
    except Exception:
        pass
    return "", ""


def _get_invoice_tax(data: object) -> tuple[str, str, str, str]:
    """Extract subtotal, tax amount and tax type from a Stripe invoice object.

    Returns (subtotal_str, tax_str, tax_type_label) all formatted as CAD strings.
    Falls back to the full amount with zero tax if tax data is absent.
    """
    try:
        total_cents: int = getattr(data, "amount_paid", 0) or 0
        tax_cents: int = getattr(data, "tax", 0) or 0
        subtotal_cents = total_cents - tax_cents

        subtotal = f"${subtotal_cents / 100:.2f} CAD"
        tax_amount = f"${tax_cents / 100:.2f} CAD"
        total = f"${total_cents / 100:.2f} CAD"

        # Determine tax label from tax rate lines
        tax_type = "GST/HST"
        try:
            total_tax_amounts = getattr(data, "total_tax_amounts", None) or []
            if total_tax_amounts:
                rate_obj = getattr(total_tax_amounts[0], "tax_rate", None)
                if rate_obj:
                    display = getattr(rate_obj, "display_name", "") or ""
                    jur = getattr(rate_obj, "jurisdiction", "") or ""
                    tax_type = f"{display} ({jur})" if jur else display or "GST/HST"
        except Exception:
            pass

        return subtotal, tax_amount, total, tax_type
    except Exception:
        amount_total = f"${(getattr(data, 'amount_paid', 0) or 0) / 100:.2f} CAD"
        return amount_total, "$0.00 CAD", amount_total, "GST/HST"


def _get_failure_reason(data: object) -> str:
    """Extract a human-readable failure reason from a Stripe invoice object."""
    try:
        # invoice.last_finalization_error or payment_intent last_payment_error
        err = getattr(data, "last_finalization_error", None)
        if not err:
            pi = getattr(data, "payment_intent", None)
            err = getattr(pi, "last_payment_error", None) if pi and not isinstance(pi, str) else None
        if err:
            msg = getattr(err, "message", None) or getattr(err, "decline_code", None)
            if msg:
                return str(msg)
    except Exception:
        pass
    return "Charge declined"


async def _handle_checkout_completed(data: dict, db: AsyncSession) -> None:
    customer_id: str = getattr(data, "customer", "") or ""
    metadata_obj = getattr(data, "metadata", None)
    user_id = getattr(metadata_obj, "user_id", None) if metadata_obj else None
    tier_id = getattr(metadata_obj, "tier_id", None) if metadata_obj else None
    promotion_id_str = getattr(metadata_obj, "promotion_id", None) if metadata_obj else None

    user: User | None = None
    if user_id:
        # Lock the user row by ID so concurrent admin assignments are serialized
        user = (
            await db.execute(
                select(User).where(User.id == int(user_id)).with_for_update()
            )
        ).scalar_one_or_none()
    if user is None and customer_id:
        user = await _find_user_by_customer_for_update(customer_id, db)

    if user is None:
        log.error("checkout.session.completed: could not resolve user (customer=%s)", customer_id)
        return

    # Store customer_id if not already set
    if not user.stripe_customer_id and customer_id:
        user.stripe_customer_id = customer_id

    # Clear any admin override: the user has now completed a real Stripe checkout
    # so webhook events for this subscription should be trusted going forward.
    if getattr(user, "tier_admin_override", False):
        user.tier_admin_override = False
        log.info("checkout.session.completed: cleared tier_admin_override for user %s", user.id)

    if tier_id:
        tier = await db.get(SubscriptionTier, int(tier_id))
        if tier and tier.is_active:
            user.tier_id = tier.id
        elif tier:
            log.warning("checkout.session.completed: tier %s is inactive, not assigning to user %s", tier_id, user.id)

    # Record promotion redemption now that payment is confirmed.
    # Guard against duplicate inserts when Stripe replays the event (at-least-once delivery).
    if promotion_id_str:
        try:
            promo = await db.get(Promotion, int(promotion_id_str))
            if promo:
                existing = (
                    await db.execute(
                        select(PromotionRedemption).where(
                            PromotionRedemption.promotion_id == promo.id,
                            PromotionRedemption.user_id == user.id,
                        )
                    )
                ).scalar_one_or_none()
                if not existing:
                    db.add(PromotionRedemption(promotion_id=promo.id, user_id=user.id))
                    promo.redemptions_count += 1
                    log.info("checkout.session.completed: redemption recorded for promo %s user %s", promo.id, user.id)
                else:
                    log.info("checkout.session.completed: duplicate webhook — redemption already exists for promo %s user %s", promo.id, user.id)
        except Exception:
            log.exception("Failed to record promotion redemption for promo_id=%s", promotion_id_str)

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

    await audit(
        db,
        action=AuditAction.SUBSCRIPTION_ACTIVATED,
        entity_type=AuditEntity.USER,
        actor_id=user.id,
        actor_type="system",
        entity_id=str(user.id),
        entity_label=user.email,
        new_data={"tier_id": tier_id, "subscription_id": subscription_id},
        description=f"Subscription activated via checkout (tier_id={tier_id})",
        source="webhook",
    )
    await db.commit()  # single commit: tier assignment + promo redemption + audit are atomic
    log.info("checkout.session.completed: user %s assigned tier %s", user.id, tier_id)

    # 6.1 Subscription confirmed email
    try:
        tier_obj = await db.get(SubscriptionTier, user.tier_id) if user.tier_id else None
        plan_name = tier_obj.display_name if tier_obj else "ImmigLens"
        start_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
        next_date = (
            user.tier_expires_at.strftime("%B %d, %Y")
            if user.tier_expires_at else "N/A"
        )
        # Determine billing cycle from subscription metadata
        is_annual = False
        if subscription_id:
            try:
                meta_obj = getattr(data, "metadata", None)
                is_annual = getattr(meta_obj, "is_annual", "false").lower() == "true" if meta_obj else False
            except Exception:
                pass
        billing_cycle = "Annual" if is_annual else "Monthly"
        billing_period = "year" if is_annual else "month"
        # Amount from tier price
        tier_price = tier_obj.price_per_month if tier_obj else None
        if tier_price and is_annual:
            amount_str = f"${tier_price * 12 * 0.8:.2f} CAD"  # annual = 20% off monthly × 12
        elif tier_price:
            amount_str = f"${tier_price:.2f} CAD"
        else:
            amount_str = "N/A"
        card_brand, card_last4 = _get_card_details(data)
        await send_subscription_confirmed_email(
            user.email,
            user.full_name or "there",
            plan_name,
            subscription_id=subscription_id or "N/A",
            start_date=start_date,
            billing_cycle=billing_cycle,
            amount=amount_str,
            billing_period=billing_period,
            next_billing_date=next_date,
            card_brand=card_brand,
            card_last4=card_last4,
            billing_email=user.email,
            position_limit=str(tier_obj.max_active_positions) if tier_obj else "N/A",
            seat_count="1",
            support_tier="Standard",
            retention_period="30 days",
            dashboard_url=f"{settings.FRONTEND_URL}/dashboard",
        )
    except Exception:
        log.exception("Failed to send subscription_confirmed email to user %s", user.id)


async def _handle_subscription_updated(data: dict, db: AsyncSession) -> None:
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer_for_update(customer_id, db)
    if user is None:
        return

    # If an admin has manually overridden this user's tier, do not let Stripe
    # webhooks silently overwrite it.  The override is cleared when the user
    # completes a new checkout (checkout.session.completed handler below).
    if getattr(user, "tier_admin_override", False):
        log.info(
            "subscription.updated: skipping tier update for user %s (tier_admin_override=True)",
            user.id,
        )
        return

    # Capture old tier before any mutation so downgrade detection is accurate
    old_tier_id = user.tier_id

    end_ts = _get_period_end(data)
    if end_ts:
        user.tier_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)

    # Primary: reflect plan change when metadata carries tier_id (our checkout flow)
    metadata_obj = getattr(data, "metadata", None)
    tier_id = getattr(metadata_obj, "tier_id", None) if metadata_obj else None
    if tier_id:
        tier = await db.get(SubscriptionTier, int(tier_id))
        if tier and tier.is_active:
            user.tier_id = tier.id
        elif tier:
            log.warning("subscription.updated: tier %s is inactive, skipping assignment for user %s", tier_id, user.id)
    else:
        # Fallback: map the subscription's current price to a tier.
        # This handles portal-initiated upgrades/downgrades which don't carry
        # our custom tier_id metadata.
        items_obj = getattr(data, "items", None)
        items = getattr(items_obj, "data", []) if items_obj else []
        if items:
            price_obj = getattr(items[0], "price", None)
            price_id = getattr(price_obj, "id", None) if price_obj else None
            if price_id:
                tier_row = (
                    await db.execute(
                        select(SubscriptionTier).where(
                            SubscriptionTier.stripe_price_id == price_id,
                            SubscriptionTier.is_active.is_(True),
                        )
                    )
                ).scalar_one_or_none()
                if tier_row:
                    user.tier_id = tier_row.id

    # Enforce downgrade: deactivate excess positions when the new tier is more
    # restrictive than the old one.  This mirrors what change_plan does inline,
    # but is also needed here for portal-initiated downgrades which bypass our API.
    if user.tier_id != old_tier_id:
        old_tier_obj = await db.get(SubscriptionTier, old_tier_id) if old_tier_id else None
        new_tier_obj = await db.get(SubscriptionTier, user.tier_id) if user.tier_id else None
        old_max = old_tier_obj.max_active_positions if old_tier_obj else -1

        if new_tier_obj is not None:
            new_max = new_tier_obj.max_active_positions
        else:
            # user.tier_id is None → resolve the actual free tier limit rather
            # than using a hardcoded fallback that could be wrong for this tenant.
            free_res = await db.execute(
                select(SubscriptionTier).where(SubscriptionTier.name == "free").limit(1)
            )
            free_tier = free_res.scalar_one_or_none()
            new_max = free_tier.max_active_positions if free_tier else 0

        is_downgrade = new_max != -1 and (old_max == -1 or new_max < old_max)
        if is_downgrade:
            deactivated = await deactivate_user_positions(db, user)
            log.info(
                "subscription.updated: downgrade detected for user %s (old_tier=%s new_tier=%s) — "
                "deactivated %d position(s)",
                user.id, old_tier_id, user.tier_id, deactivated,
            )

    await audit(
        db,
        action=AuditAction.SUBSCRIPTION_UPDATED,
        entity_type=AuditEntity.USER,
        actor_id=user.id,
        actor_type="system",
        entity_id=str(user.id),
        entity_label=user.email,
        new_data={"tier_id": user.tier_id, "tier_expires_at": str(user.tier_expires_at)},
        description="Subscription updated via Stripe webhook",
        source="webhook",
    )
    await db.commit()  # single commit: tier/expiry update + audit are atomic


async def _handle_subscription_deleted(data: dict, db: AsyncSession) -> None:
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer_for_update(customer_id, db)
    if user is None:
        return

    # Respect admin override — don't cancel the tier during webhook processing
    # if an admin manually assigned it (e.g. complimentary access).
    if getattr(user, "tier_admin_override", False):
        log.info(
            "subscription.deleted: skipping tier reset for user %s (tier_admin_override=True)",
            user.id,
        )
        return

    user.tier_id = None
    user.tier_expires_at = None
    # Deactivate all active positions — subscriber is now on the free tier.
    # deactivate_user_positions flushes internally; caller (this function) owns commit.
    deactivated = await deactivate_user_positions(db, user)
    log.info("subscription.deleted: deactivated %d position(s) for user %s", deactivated, user.id)
    await audit(
        db,
        action=AuditAction.SUBSCRIPTION_CANCELLED,
        entity_type=AuditEntity.USER,
        actor_id=user.id,
        actor_type="system",
        entity_id=str(user.id),
        entity_label=user.email,
        description=f"Subscription cancelled via Stripe webhook ({deactivated} position(s) deactivated)",
        source="webhook",
    )
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


async def _handle_invoice_payment_failed(data: dict, db: AsyncSession, *, event_id: str = "") -> None:
    """5.2 Payment Failed / 6.5 Renewal Failed — distinguish by billing_reason."""
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        log.warning("invoice.payment_failed: no user found for customer %s", customer_id)
        return

    # Idempotency guard: if we already processed this exact Stripe event, skip the
    # email send.  Stripe retries up to 20 times — without this, every retry
    # sends the user another failure notification.
    already_processed = False
    if event_id:
        existing = (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.actor_id == user.id,
                    AuditLog.action == AuditAction.PAYMENT_FAILED,
                    AuditLog.metadata_["stripe_event_id"].astext == event_id,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if existing:
            log.info("invoice.payment_failed: already processed event %s for user %s", event_id, user.id)
            already_processed = True

    amount_cents: int = getattr(data, "amount_due", 0) or 0
    amount = f"${amount_cents / 100:.2f} CAD"
    billing_reason: str = getattr(data, "billing_reason", "") or ""
    attempt_count: int = getattr(data, "attempt_count", 1) or 1
    retries_remaining = max(0, 3 - attempt_count)
    failure_reason = _get_failure_reason(data)
    card_brand, card_last4 = _get_card_details(data)

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

    if not already_processed:
        try:
            if billing_reason == "subscription_cycle":
                # Renewal-specific email (6.5)
                tier = await db.get(SubscriptionTier, user.tier_id) if user.tier_id else None
                plan_name = tier.display_name if tier else "ImmigLens"
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
                    card_brand=card_brand,
                    card_last4=card_last4,
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
                    card_brand=card_brand,
                    card_last4=card_last4,
                )
            log.info("invoice.payment_failed email sent to user %s (reason=%s)", user.id, billing_reason)
        except Exception:
            log.exception("Failed to send payment_failed email to user %s", user.id)

        await audit(
            db,
            action=AuditAction.PAYMENT_FAILED,
            entity_type=AuditEntity.USER,
            actor_id=user.id,
            actor_type="system",
            entity_id=str(user.id),
            entity_label=user.email,
            metadata={"amount": amount, "billing_reason": billing_reason, "attempt_count": attempt_count, "failure_reason": failure_reason, "stripe_event_id": event_id},
            description=f"Payment failed: {failure_reason} (attempt {attempt_count})",
            source="webhook",
            status="failed",
        )

    await db.commit()


async def _handle_invoice_paid(data: dict, db: AsyncSession, *, event_id: str = "") -> None:
    """5.1 Payment Successful — fired on invoice.paid for any successful charge."""
    customer_id: str = getattr(data, "customer", "") or ""
    user = await _find_user_by_customer(customer_id, db)
    if user is None:
        return

    # Idempotency guard: Stripe retries webhooks up to 20x. Only send the receipt
    # email once per Stripe event ID.  Tier refresh is always applied (idempotent).
    already_processed = False
    if event_id:
        existing = (
            await db.execute(
                select(AuditLog).where(
                    AuditLog.actor_id == user.id,
                    AuditLog.action == AuditAction.PAYMENT_SUCCEEDED,
                    AuditLog.metadata_["stripe_event_id"].astext == event_id,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if existing:
            log.info("invoice.paid: duplicate event %s for user %s — skipping email", event_id, user.id)
            already_processed = True

    # Refresh tier_expires_at from the subscription attached to this invoice.
    # This is the definitive billing event — relying solely on subscription.updated
    # to carry the new period_end means a delayed webhook would cause _get_tier to
    # falsely expire the user immediately after a successful renewal.
    # Skip if admin manually assigned the tier (tier_admin_override guard).
    if not getattr(user, "tier_admin_override", False):
        sub_id: str | None = getattr(data, "subscription", None)
        if sub_id:
            try:
                client = stripe.StripeClient(settings.STRIPE_SECRET_KEY)
                sub = client.subscriptions.retrieve(sub_id)
                end_ts = _get_period_end(sub)
                if end_ts:
                    user.tier_expires_at = datetime.fromtimestamp(end_ts, tz=timezone.utc)
                    log.info(
                        "invoice.paid: refreshed tier_expires_at for user %s → %s",
                        user.id, user.tier_expires_at,
                    )
                # Restore tier_id if _get_tier's expiry enforcement already cleared it
                # during the webhook delivery window (brief period after period rollover
                # before this event arrives).  Map subscription price → tier via metadata.
                if user.tier_id is None:
                    sub_meta = getattr(sub, "metadata", None)
                    sub_tier_id = getattr(sub_meta, "tier_id", None) if sub_meta else None
                    if sub_tier_id:
                        tier_row = await db.get(SubscriptionTier, int(sub_tier_id))
                        if tier_row and tier_row.is_active:
                            user.tier_id = tier_row.id
                            log.info(
                                "invoice.paid: restored tier_id=%s for user %s after expiry clear",
                                tier_row.id, user.id,
                            )
                    if user.tier_id is None:
                        # Fallback: resolve tier by price_id on the subscription item
                        try:
                            items = sub.items.data if hasattr(sub, "items") else []
                            if items:
                                price_id_on_sub = getattr(getattr(items[0], "price", None), "id", None)
                                if price_id_on_sub:
                                    tier_row = (
                                        await db.execute(
                                            select(SubscriptionTier).where(
                                                SubscriptionTier.stripe_price_id == price_id_on_sub,
                                                SubscriptionTier.is_active.is_(True),
                                            )
                                        )
                                    ).scalar_one_or_none()
                                    if tier_row:
                                        user.tier_id = tier_row.id
                                        log.info(
                                            "invoice.paid: restored tier_id=%s via price_id for user %s",
                                            tier_row.id, user.id,
                                        )
                        except Exception:
                            log.warning("invoice.paid: price-based tier restoration failed for user %s", user.id)
            except Exception:
                log.warning(
                    "invoice.paid: could not refresh tier_expires_at for user %s (sub=%s)",
                    user.id, sub_id,
                )

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

    if not already_processed:
        try:
            tier_obj = await db.get(SubscriptionTier, user.tier_id) if user.tier_id else None
            card_brand, card_last4 = _get_card_details(data)
            subtotal, tax_amount, total_amount, tax_type = _get_invoice_tax(data)
            await send_payment_successful_email(
                user.email,
                user.full_name or "there",
                payment_date=datetime.now(timezone.utc).strftime("%B %d, %Y"),
                subtotal=subtotal,
                tax_amount=tax_amount,
                tax_type=tax_type,
                total_amount=total_amount,
                card_brand=card_brand,
                card_last4=card_last4,
                plan_name=tier_obj.display_name if tier_obj else "ImmigLens",
                billing_start=billing_start,
                billing_end=billing_end,
                transaction_id=getattr(data, "charge", invoice_number) or invoice_number,
                invoice_number=invoice_number,
                next_billing_date=next_billing_date,
                next_amount=total_amount,
                invoice_url=getattr(data, "hosted_invoice_url", f"{settings.FRONTEND_URL}/billing") or f"{settings.FRONTEND_URL}/billing",
                position_limit=str(tier_obj.max_active_positions) if tier_obj else "N/A",
                capture_limit="Unlimited",
                storage_limit="N/A",
                seat_limit="1",
                support_tier="Standard",
            )
            log.info("invoice.paid email sent to user %s", user.id)
        except Exception:
            log.exception("Failed to send payment_successful email to user %s", user.id)

        await audit(
            db,
            action=AuditAction.PAYMENT_SUCCEEDED,
            entity_type=AuditEntity.USER,
            actor_id=user.id,
            actor_type="system",
            entity_id=str(user.id),
            entity_label=user.email,
            metadata={"amount": amount, "invoice_number": invoice_number, "stripe_event_id": event_id},
            description=f"Payment succeeded: {amount} (invoice {invoice_number})",
            source="webhook",
        )

    # Always commit — tier refresh (period-end update) must persist even on replay.
    await db.commit()
