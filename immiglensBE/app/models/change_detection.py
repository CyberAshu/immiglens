from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.job_url import JobUrl
    from app.models.capture import CaptureResult


class PostingSnapshot(Base):
    """One row per capture result — stores page hash for change detection.

    has_changed is:
      None  → first ever capture for this posting (no previous baseline)
      False → hash matches previous snapshot (no change)
      True  → hash differs from previous snapshot (page changed)
    """

    __tablename__ = "posting_snapshots"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_url_id: Mapped[int] = mapped_column(
        ForeignKey("job_urls.id"), index=True
    )
    capture_result_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("capture_results.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,   # one snapshot per result
    )
    page_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True  # SHA-256 hex digest of screenshot bytes
    )
    has_changed: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    change_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )

    job_url: Mapped["JobUrl"] = relationship(back_populates="snapshots")
    capture_result: Mapped[Optional["CaptureResult"]] = relationship(
        back_populates="snapshot", uselist=False
    )
