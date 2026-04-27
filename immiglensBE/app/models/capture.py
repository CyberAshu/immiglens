from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.job_position import JobPosition
    from app.models.job_url import JobUrl
    from app.models.change_detection import PostingSnapshot


class CaptureStatus(str, PyEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ResultStatus(str, PyEnum):
    """Status of a single capture result (individual URL screenshot)."""
    PENDING    = "pending"
    PROCESSING = "processing"
    DONE       = "done"
    FAILED     = "failed"


class CaptureRound(Base):
    __tablename__ = "capture_rounds"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_position_id: Mapped[int] = mapped_column(ForeignKey("job_positions.id"), index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    captured_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[CaptureStatus] = mapped_column(
        Enum(CaptureStatus),
        default=CaptureStatus.PENDING,
        index=True,
    )
    auto_retry_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    job_position: Mapped["JobPosition"] = relationship(back_populates="capture_rounds")
    results: Mapped[list["CaptureResult"]] = relationship(
        back_populates="capture_round", cascade="all, delete-orphan"
    )


class CaptureResult(Base):
    __tablename__ = "capture_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    capture_round_id: Mapped[int] = mapped_column(ForeignKey("capture_rounds.id"), index=True)
    job_url_id: Mapped[int] = mapped_column(ForeignKey("job_urls.id"), index=True)
    url: Mapped[str] = mapped_column(String(2048))
    # native_enum=False keeps this as VARCHAR in the DB — safe for existing data,
    # values_callable forces SQLAlchemy to use .value (lowercase) not member names.
    status: Mapped[ResultStatus] = mapped_column(
        Enum(ResultStatus, native_enum=False, length=20, values_callable=lambda obj: [e.value for e in obj]),
        default=ResultStatus.PENDING,
        index=True,
    )
    screenshot_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    screenshot_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    page_pdf_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    failure_category: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, index=True)
    response_status: Mapped[Optional[int]] = mapped_column(SmallInteger(), nullable=True)
    page_title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    proxy_used: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    proxy_session: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    profile_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    modal_detected: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    modal_remaining: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    modal_actions_clicked: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    modal_actions_hidden: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    capture_round: Mapped["CaptureRound"] = relationship(back_populates="results")
    job_url: Mapped["JobUrl"] = relationship(back_populates="capture_results")
    snapshot: Mapped[Optional["PostingSnapshot"]] = relationship(
        back_populates="capture_result", uselist=False
    )
