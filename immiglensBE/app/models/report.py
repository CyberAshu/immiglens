from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.job_position import JobPosition


class ReportDocument(Base):
    __tablename__ = "report_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_position_id: Mapped[int] = mapped_column(ForeignKey("job_positions.id"), index=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    job_position: Mapped["JobPosition"] = relationship(back_populates="report_documents")
