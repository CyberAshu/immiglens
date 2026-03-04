from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    """Immutable log of every create / update / delete performed by a user."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    # nullable so system-initiated actions can be recorded without a user
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(50), index=True)        # CREATE / UPDATE / DELETE / VIEW
    resource_type: Mapped[str] = mapped_column(String(50), index=True) # employer / position / capture_round …
    resource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    old_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    new_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    user: Mapped[Optional["User"]] = relationship(back_populates="audit_logs")
