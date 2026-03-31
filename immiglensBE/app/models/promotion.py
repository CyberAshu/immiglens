from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Promotion(Base):
    """A promo-code based discount.

    Admin creates a promotion with a unique code (e.g. LAUNCH30).
    The code can be shared privately with users or shown publicly on the
    pricing page via show_on_pricing_page.  Users enter the code at checkout;
    the backend validates it and applies the matching Stripe coupon.
    """

    __tablename__ = "promotions"
    __table_args__ = (UniqueConstraint("code", name="uq_promotions_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))          # "Founding Member Discount"
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Promo code users enter at checkout (e.g. "LAUNCH30")
    code: Mapped[str] = mapped_column(String(50), nullable=False)

    # When True, this promo is shown as a banner on the public pricing page
    show_on_pricing_page: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Stripe
    stripe_coupon_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Discount definition
    discount_type: Mapped[str] = mapped_column(String(20))  # "percent" | "fixed"
    discount_value: Mapped[float] = mapped_column(Float)     # 20.0 → 20%, or 10.0 → $10
    duration: Mapped[str] = mapped_column(String(20), default="forever")
    # Stripe duration: "forever" | "once" | "repeating"
    duration_in_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Only used when duration="repeating"

    # Eligibility controls
    max_redemptions: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # None = unlimited
    redemptions_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    valid_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    valid_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    redemptions: Mapped[list["PromotionRedemption"]] = relationship(
        back_populates="promotion", cascade="all, delete-orphan"
    )


class PromotionRedemption(Base):
    """Records which user redeemed which promotion (one row per checkout)."""

    __tablename__ = "promotion_redemptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    promotion_id: Mapped[int] = mapped_column(
        ForeignKey("promotions.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    redeemed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    promotion: Mapped["Promotion"] = relationship(back_populates="redemptions")
