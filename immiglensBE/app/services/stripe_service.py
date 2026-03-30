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
            "name": tier.display_name,
            "metadata": {"tier_name": tier.name, "tier_id": str(tier.id)},
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
                "metadata": {"tier_id": str(tier.id)},
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
            "metadata": {"tier_id": str(tier_id)},
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


# ── Customer management ───────────────────────────────────────────────────────

async def get_or_create_customer(user: "User", db) -> str:
    """Return the user's Stripe customer_id, creating one if it doesn't exist yet.

    Persists the id back to the database.
    """
    if user.stripe_customer_id:
        return user.stripe_customer_id

    client = _client()
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
) -> str:
    """Create a Stripe Checkout Session and return the hosted URL.

    Pass trial_days > 0 to start a free trial period before the first charge.
    """
    if not tier.stripe_price_id:
        raise ValueError(f"Tier '{tier.name}' has no Stripe price configured.")

    customer_id = await get_or_create_customer(user, db)
    client = _client()

    success_url = f"{settings.FRONTEND_URL}/subscription?checkout=success"
    cancel_url  = f"{settings.FRONTEND_URL}/subscription?checkout=cancelled"

    subscription_data: dict = {
        "metadata": {"user_id": str(user.id), "tier_id": str(tier.id)}
    }
    if trial_days > 0:
        subscription_data["trial_period_days"] = trial_days

    session = client.checkout.sessions.create(
        params={
            "customer": customer_id,
            "payment_method_types": ["card"],
            "line_items": [{"price": tier.stripe_price_id, "quantity": 1}],
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            "metadata": {"user_id": str(user.id), "tier_id": str(tier.id)},
            "subscription_data": subscription_data,
        }
    )
    return session.url  # type: ignore[return-value]


async def create_portal_session(user: "User", db) -> str:
    """Create a Stripe Customer Portal session and return the URL."""
    customer_id = await get_or_create_customer(user, db)
    client = _client()
    return_url = f"{settings.FRONTEND_URL}/subscription"
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
