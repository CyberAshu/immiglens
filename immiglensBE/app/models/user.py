from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.employer import Employer
    from app.models.subscription import SubscriptionTier
    from app.models.organization import Organization, OrgMembership
    from app.models.notification import NotificationPreference
    from app.models.audit_log import AuditLog


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    tier_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("subscription_tiers.id"), nullable=True, index=True
    )
    tier_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    employers: Mapped[list["Employer"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    tier: Mapped[Optional["SubscriptionTier"]] = relationship(back_populates="users")
    created_orgs: Mapped[list["Organization"]] = relationship(
        "Organization", foreign_keys="Organization.created_by", back_populates="creator"
    )
    org_memberships: Mapped[list["OrgMembership"]] = relationship(
        "OrgMembership", foreign_keys="OrgMembership.user_id", back_populates="user"
    )
    notification_preferences: Mapped[list["NotificationPreference"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user")
