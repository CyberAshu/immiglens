from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.job_position import JobPosition
    from app.models.organization import Organization


class Employer(Base):
    __tablename__ = "employers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    org_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    business_name: Mapped[str] = mapped_column(String(255))
    address: Mapped[str] = mapped_column(String(500))
    contact_person: Mapped[str] = mapped_column(String(255))
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    business_number: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    user: Mapped["User"] = relationship(back_populates="employers")
    organization: Mapped[Optional["Organization"]] = relationship(back_populates="employers")
    job_positions: Mapped[list["JobPosition"]] = relationship(
        back_populates="employer", cascade="all, delete-orphan"
    )
