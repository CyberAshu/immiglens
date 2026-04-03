from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class AuditLog(Base):
    """Immutable, append-only chronicle of every significant state change
    and access event in the system.

    Schema fields:
      actor_id / actor_type  — WHO performed the action
      action                 — WHAT they did (controlled vocabulary from AuditAction)
      status                 — outcome: "success" | "failed"
      entity_type / entity_id / entity_label — WHAT was affected
      employer_id / position_id              — denormalized scope for fast filtering
      description            — server-generated plain-English sentence
      old_data / new_data    — JSON diff of the changed fields
      metadata_              — extra context (error message, reason, etc.)
      ip_address / user_agent / source       — request context
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)

    # ── Actor ─────────────────────────────────────────────────────────────────
    actor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="user"
    )  # "user" | "admin" | "system"

    # ── Action ────────────────────────────────────────────────────────────────
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="success"
    )  # "success" | "failed"

    # ── Entity ────────────────────────────────────────────────────────────────
    entity_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    entity_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ── Scope (denormalized for fast admin filtering) ─────────────────────────
    employer_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, index=True
    )
    position_id: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, index=True
    )

    # ── Payload ───────────────────────────────────────────────────────────────
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    old_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    new_data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSONB, nullable=True
    )

    # ── Request context ───────────────────────────────────────────────────────
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    source: Mapped[str] = mapped_column(
        String(20), nullable=False, default="api"
    )  # "api" | "system" | "webhook"

    # ── Timestamp ─────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    actor: Mapped[Optional["User"]] = relationship(back_populates="audit_logs")

