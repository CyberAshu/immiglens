from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class NotificationEvent(str, PyEnum):
    CAPTURE_COMPLETE = "capture_complete"
    CAPTURE_FAILED   = "capture_failed"
    POSTING_CHANGED  = "posting_changed"
    ROUND_STARTED    = "round_started"


class NotificationChannel(str, PyEnum):
    EMAIL   = "email"
    WEBHOOK = "webhook"


class NotifStatus(str, PyEnum):
    PENDING = "pending"
    SENT    = "sent"
    FAILED  = "failed"


def _enum_vals(o):
    return [e.value for e in o]


class NotificationPreference(Base):
    """One row = one delivery rule (user × event × channel)."""

    __tablename__ = "notification_preferences"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    event_type: Mapped[NotificationEvent] = mapped_column(
        Enum(NotificationEvent, native_enum=False, length=30, values_callable=_enum_vals),
        index=True,
    )
    channel: Mapped[NotificationChannel] = mapped_column(
        Enum(NotificationChannel, native_enum=False, length=20, values_callable=_enum_vals),
    )
    destination: Mapped[str] = mapped_column(String(500))  # email OR webhook URL
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="notification_preferences")
    logs: Mapped[list["NotificationLog"]] = relationship(
        back_populates="preference", cascade="all, delete-orphan"
    )


class NotificationLog(Base):
    """Delivery attempt record for each preference trigger."""

    __tablename__ = "notification_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    preference_id: Mapped[int] = mapped_column(
        ForeignKey("notification_preferences.id"), index=True
    )
    trigger_id: Mapped[Optional[int]] = mapped_column(nullable=True)   # e.g. capture_round_id
    trigger_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[NotifStatus] = mapped_column(
        Enum(NotifStatus, native_enum=False, length=20, values_callable=_enum_vals),
        default=NotifStatus.PENDING,
        index=True,
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    preference: Mapped["NotificationPreference"] = relationship(back_populates="logs")
