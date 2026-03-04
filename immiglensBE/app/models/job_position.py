from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.employer import Employer
    from app.models.job_posting import JobPosting
    from app.models.capture import CaptureRound
    from app.models.report import ReportDocument


class JobPosition(Base):
    __tablename__ = "job_positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    employer_id: Mapped[int] = mapped_column(ForeignKey("employers.id"), index=True)
    job_title: Mapped[str] = mapped_column(String(255))
    noc_code: Mapped[str] = mapped_column(String(10))
    num_positions: Mapped[int] = mapped_column(Integer)
    start_date: Mapped[date] = mapped_column(Date)
    capture_frequency_days: Mapped[int] = mapped_column(Integer, default=7)
    wage: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    work_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    wage_stream: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    employer: Mapped["Employer"] = relationship(back_populates="job_positions")
    job_postings: Mapped[list["JobPosting"]] = relationship(
        back_populates="job_position", cascade="all, delete-orphan"
    )
    capture_rounds: Mapped[list["CaptureRound"]] = relationship(
        back_populates="job_position", cascade="all, delete-orphan"
    )
    report_documents: Mapped[list["ReportDocument"]] = relationship(
        back_populates="job_position", cascade="all, delete-orphan"
    )
