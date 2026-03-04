from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class SubscriptionTier(Base):
    """Defines feature limits per plan (free / pro / enterprise).
    Seeded automatically on startup; -1 means unlimited."""

    __tablename__ = "subscription_tiers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(100))
    max_employers: Mapped[int] = mapped_column(Integer, default=3)
    max_positions_per_employer: Mapped[int] = mapped_column(Integer, default=5)
    max_postings_per_position: Mapped[int] = mapped_column(Integer, default=10)
    max_captures_per_month: Mapped[int] = mapped_column(Integer, default=50)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    users: Mapped[list["User"]] = relationship(back_populates="tier")
