from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.job_position import JobPosition
    from app.models.capture import CaptureResult
    from app.models.change_detection import PostingSnapshot


class JobUrl(Base):
    __tablename__ = "job_urls"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_position_id: Mapped[int] = mapped_column(ForeignKey("job_positions.id"), index=True)
    platform: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(2048))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    job_position: Mapped["JobPosition"] = relationship(back_populates="job_urls")
    capture_results: Mapped[list["CaptureResult"]] = relationship(
        back_populates="job_url", cascade="all, delete-orphan"
    )
    snapshots: Mapped[list["PostingSnapshot"]] = relationship(
        back_populates="job_url", cascade="all, delete-orphan"
    )
