from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class NotificationEvent(str, PyEnum):
    CAPTURE_COMPLETE        = "capture_complete"
    CAPTURE_FAILED          = "capture_failed"
    POSTING_CHANGED         = "posting_changed"
    ROUND_STARTED           = "round_started"
    POSITION_LIMIT_WARNING  = "position_limit_warning"


class NotifStatus(str, PyEnum):
    PENDING = "pending"
    SENT    = "sent"
    FAILED  = "failed"


def _enum_vals(o):
    return [e.value for e in o]


class NotificationLog(Base):
    """One row per notification delivery attempt sent to a user."""

    __tablename__ = "notification_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Direct user ownership — no longer routed through a preference row
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Kept nullable for backward-compatibility with pre-migration rows
    preference_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, index=True
    )
    event_type: Mapped[Optional[NotificationEvent]] = mapped_column(
        Enum(NotificationEvent, native_enum=False, length=30, values_callable=_enum_vals),
        nullable=True,
        index=True,
    )
    trigger_id: Mapped[Optional[int]] = mapped_column(nullable=True)
    trigger_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    context_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[NotifStatus] = mapped_column(
        Enum(NotifStatus, native_enum=False, length=20, values_callable=_enum_vals),
        default=NotifStatus.PENDING,
        index=True,
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="notification_logs")
