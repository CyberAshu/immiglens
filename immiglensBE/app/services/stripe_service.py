"""Thin wrapper around the Stripe SDK.

All Stripe I/O is isolated here so the rest of the app never imports `stripe`
directly.  If Stripe is not configured (empty key) every function raises a
RuntimeError immediately so callers receive a clear 503.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import stripe

from app.core.config import settings

if TYPE_CHECKING:
    from app.models.subscription import SubscriptionTier
    from app.models.user import User

log = logging.getLogger(__name__)


def _client() -> stripe.StripeClient:
    if not settings.STRIPE_SECRET_KEY:
        raise RuntimeError("Stripe is not configured (STRIPE_SECRET_KEY is empty).")
    return stripe.StripeClient(settings.STRIPE_SECRET_KEY)


# ── Tier / Product management ─────────────────────────────────────────────────

def create_product_and_price(tier: "SubscriptionTier") -> tuple[str, str | None]:
    """Create a Stripe Product (and an optional recurring Price) for a tier.

    Returns (product_id, price_id).  price_id is None when price_per_month is
    not set.
    """
    client = _client()
    product = client.products.create(
        params={
            "name": f"{tier.display_name} [{settings.ENVIRONMENT}]",
            "metadata": {"tier_name": tier.name, "tier_id": str(tier.id), "env": settings.ENVIRONMENT},
        }
    )
    price_id: str | None = None
    if tier.price_per_month and tier.price_per_month > 0:
        price = client.prices.create(
            params={
                "product": product.id,
                "unit_amount": int(tier.price_per_month * 100),  # cents
                "currency": "usd",
                "recurring": {"interval": "month"},
                "metadata": {"tier_id": str(tier.id), "env": settings.ENVIRONMENT},
            }
        )
        price_id = price.id
    return product.id, price_id


def update_product_name(product_id: str, display_name: str) -> None:
    """Rename the Stripe product to match the updated tier display_name."""
    client = _client()
    client.products.update(product_id, params={"name": display_name})


def create_new_price(product_id: str, tier_id: int, amount_usd: float) -> str:
    """Create a new monthly Price on an existing product.  Returns the new price_id."""
    client = _client()
    price = client.prices.create(
        params={
            "product": product_id,
            "unit_amount": int(amount_usd * 100),
            "currency": "usd",
            "recurring": {"interval": "month"},
            "metadata": {"tier_id": str(tier_id), "env": settings.ENVIRONMENT},
        }
    )
    return price.id


def archive_price(price_id: str) -> None:
    """Deactivate a Stripe price (cannot be deleted once used)."""
    client = _client()
    client.prices.update(price_id, params={"active": False})


def archive_product(product_id: str) -> None:
    """Archive a Stripe product so it no longer appears in searches."""
    client = _client()
    client.products.update(product_id, params={"active": False})


# ── Coupon management (for Promotions) ───────────────────────────────────────

def create_coupon(
    name: str,
    discount_type: str,      # "percent" | "fixed"
    discount_value: float,
    duration: str,           # "forever" | "once" | "repeating"
    duration_in_months: int | None = None,
    promotion_id: int | None = None,
) -> str:
    """Create a Stripe Coupon for a Promotion and return its coupon_id."""
    client = _client()
    params: dict = {
        "name": name,
        "duration": duration,
        "metadata": {"promotion_id": str(promotion_id) if promotion_id else ""},
    }
    if discount_type == "percent":
        params["percent_off"] = discount_value
    else:
        params["amount_off"] = int(discount_value * 100)  # cents
        params["currency"] = "usd"
    if duration == "repeating" and duration_in_months:
        params["duration_in_months"] = duration_in_months

    coupon = client.coupons.create(params=params)
    return coupon.id


def archive_coupon(coupon_id: str) -> None:
    """Delete/archive a Stripe coupon so it can no longer be applied."""
    client = _client()
    client.coupons.delete(coupon_id)


# ── Customer management ───────────────────────────────────────────────────────

async def get_or_create_customer(user: "User", db) -> str:
    """Return the user's Stripe customer_id, creating one if it doesn't exist yet.

    Persists the id back to the database.

    Guard against double-customer creation: if the DB commit failed on a previous
    call after Stripe already created the customer, a second call would blindly
    create another customer for the same user.  We search Stripe by user_id
    metadata first and reuse any existing customer before creating a new one.
    """
    if user.stripe_customer_id:
        return user.stripe_customer_id

    client = _client()

    # Search Stripe for an existing customer tagged with this user's ID.
    # This is the safety net for DB commit failures on earlier calls.
    search_result = client.customers.search(
        params={"query": f"metadata['user_id']:'{user.id}'", "limit": 1}
    )
    if search_result.data:
        customer_id = search_result.data[0].id
        user.stripe_customer_id = customer_id
        await db.commit()
        return customer_id

    customer = client.customers.create(
        params={"email": user.email, "name": user.full_name,
                "metadata": {"user_id": str(user.id)}}
    )
    user.stripe_customer_id = customer.id
    await db.commit()
    return customer.id


# ── Checkout & portal ─────────────────────────────────────────────────────────

async def create_checkout_session(
    user: "User",
    tier: "SubscriptionTier",
    db,
    trial_days: int = 0,
    coupon_id: str | None = None,
    onboarding: bool = False,
    is_annual: bool = False,
    extra_metadata: dict | None = None,
) -> str:
    """Create a Stripe Checkout Session and return the hosted URL.

    Pass trial_days > 0 to start a free trial period before the first charge.
    Pass coupon_id to apply a discount coupon.
    Pass onboarding=True to redirect back to onboarding wizard after checkout.
    Pass is_annual=True to use the tier's annual price (stripe_annual_price_id)
    if configured, otherwise falls back to the monthly price.
    Pass extra_metadata to add arbitrary key/value pairs to session metadata
    (e.g. promotion_id for redemption recording in the webhook).
    """
    # Resolve correct Stripe price — prefer annual when requested and available
    annual_price_id: str | None = getattr(tier, "stripe_annual_price_id", None)
    if is_annual and annual_price_id:
        price_id = annual_price_id
    elif is_annual and not annual_price_id:
        # Annual billing was requested but no annual price is configured on this tier.
        # Silently falling back to monthly would misbill the user — raise explicitly.
        raise ValueError(
            f"Tier '{tier.name}' does not have an annual price configured. "
            "Please contact support or select monthly billing."
        )
    elif tier.stripe_price_id:
        price_id = tier.stripe_price_id
    else:
        raise ValueError(f"Tier '{tier.name}' has no Stripe price configured.")

    customer_id = await get_or_create_customer(user, db)
    client = _client()

    # {CHECKOUT_SESSION_ID} is a Stripe template variable — Stripe substitutes
    # the real session ID before redirecting, giving the frontend session-level
    # proof of payment so it can call /api/billing/sync-checkout immediately.
    if onboarding:
        success_url = f"{settings.FRONTEND_URL}/onboarding?step=done&checkout=success&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url  = f"{settings.FRONTEND_URL}/onboarding?step=plan&checkout=cancelled"
    else:
        success_url = f"{settings.FRONTEND_URL}/plan?checkout=success&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url  = f"{settings.FRONTEND_URL}/plan?checkout=cancelled"

    subscription_data: dict = {
        "metadata": {
            "user_id": str(user.id),
            "tier_id": str(tier.id),
            "billing_period": "annual" if is_annual else "monthly",
        }
    }
    if trial_days > 0:
        subscription_data["trial_period_days"] = trial_days

    base_metadata: dict = {
            "user_id": str(user.id),
            "tier_id": str(tier.id),
            "billing_period": "annual" if is_annual else "monthly",
        }
    if extra_metadata:
        base_metadata.update(extra_metadata)

    params: dict = {
        "customer": customer_id,
        "payment_method_types": ["card"],
        "line_items": [{"price": price_id, "quantity": 1}],
        "mode": "subscription",
        "success_url": success_url,
        "cancel_url": cancel_url,
        "metadata": base_metadata,
        "subscription_data": subscription_data,
    }
    if coupon_id:
        params["discounts"] = [{"coupon": coupon_id}]

    session = client.checkout.sessions.create(params=params)
    return session.url  # type: ignore[return-value]


async def create_portal_session(user: "User", db) -> str:
    """Create a Stripe Customer Portal session and return the URL."""
    customer_id = await get_or_create_customer(user, db)
    client = _client()
    return_url = f"{settings.FRONTEND_URL}/plan"
    portal = client.billing_portal.sessions.create(
        params={"customer": customer_id, "return_url": return_url}
    )
    return portal.url  # type: ignore[return-value]


# ── Webhook validation ────────────────────────────────────────────────────────

def construct_webhook_event(payload: bytes, sig_header: str) -> stripe.Event:
    """Validate and parse a Stripe webhook payload.  Raises StripeSignatureVerification on failure."""
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise RuntimeError("Stripe webhook secret is not configured.")
    return stripe.Webhook.construct_event(
        payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
    )


# ── Subscription modification (upgrade / downgrade) ───────────────────────────

def update_subscription_price(
    user: "User",
    new_tier: "SubscriptionTier",
    is_annual: bool = False,
) -> stripe.Subscription:
    """Update an existing Stripe subscription to a new price (upgrade / downgrade).

    Finds the customer's first active or trialing subscription and replaces the
    price on the first item.  Raises ValueError if no subscription is found.
    """
    client = _client()
    customer_id = user.stripe_customer_id
    if not customer_id:
        raise ValueError("User has no Stripe customer account.")

    # Resolve target price — prefer annual when requested and available
    annual_price_id: str | None = getattr(new_tier, "stripe_annual_price_id", None)
    if is_annual and annual_price_id:
        price_id = annual_price_id
    elif is_annual and not annual_price_id:
        raise ValueError(
            f"Tier '{new_tier.name}' does not have an annual price configured. "
            "Please contact support or select monthly billing."
        )
    elif new_tier.stripe_price_id:
        price_id = new_tier.stripe_price_id
    else:
        raise ValueError(f"Tier '{new_tier.name}' has no Stripe price configured.")

    sub = None
    # Check active → trialing → past_due in priority order.
    # past_due subscriptions are still modifiable and should not force a new checkout
    # (which would create a duplicate subscription on the same customer).
    for status_filter in ("active", "trialing", "past_due"):
        result = client.subscriptions.list(
            params={"customer": customer_id, "status": status_filter, "limit": 1}
        )
        if result.data:
            sub = result.data[0]
            break
    if sub is None:
        raise ValueError(
            "No active subscription found. Please use checkout to start a new subscription."
        )
    sub_item_id = sub.items.data[0].id
    updated = client.subscriptions.update(
        sub.id,
        params={
            "items": [{"id": sub_item_id, "price": price_id}],
            "metadata": {
                "user_id": str(user.id),
                "tier_id": str(new_tier.id),
                "billing_period": "annual" if is_annual else "monthly",
            },
            "proration_behavior": "always_invoice",
        },
    )
    return updated


def cancel_all_customer_subscriptions(customer_id: str) -> int:
    """Cancel every active or trialing Stripe subscription for a customer.

    Called when an admin deletes a tier that had subscribers, so those users are
    not charged again after being moved to the free tier.

    Returns the number of subscriptions cancelled.
    """
    client = _client()
    cancelled = 0
    for status_filter in ("active", "trialing", "past_due"):
        page = client.subscriptions.list(
            params={"customer": customer_id, "status": status_filter, "limit": 100}
        )
        for sub in page.data:
            try:
                client.subscriptions.cancel(sub.id)
                cancelled += 1
            except Exception:
                log.warning(
                    "cancel_all_customer_subscriptions: failed to cancel sub %s for customer %s",
                    sub.id, customer_id,
                )
    return cancelled
