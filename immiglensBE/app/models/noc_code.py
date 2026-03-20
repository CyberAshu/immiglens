from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NocCode(Base):
    __tablename__ = "noc_codes"
    __table_args__ = (UniqueConstraint("code", name="uq_noc_codes_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    teer: Mapped[int] = mapped_column(Integer, nullable=False)
    major_group: Mapped[int] = mapped_column(Integer, nullable=False)
    version_year: Mapped[int] = mapped_column(Integer, nullable=False, default=2021)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
