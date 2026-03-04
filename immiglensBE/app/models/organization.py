from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.employer import Employer


class OrgRole(str, PyEnum):
    OWNER  = "owner"
    ADMIN  = "admin"
    VIEWER = "viewer"


def _enum_vals(o):
    return [e.value for e in o]


class Organization(Base):
    """A shared workspace whose employers/positions are visible to all members."""

    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    creator: Mapped["User"] = relationship(
        "User", foreign_keys=[created_by], back_populates="created_orgs"
    )
    memberships: Mapped[list["OrgMembership"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    invitations: Mapped[list["OrgInvitation"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    employers: Mapped[list["Employer"]] = relationship(back_populates="organization")


class OrgMembership(Base):
    """Join table: which users belong to which org and with what role."""

    __tablename__ = "org_memberships"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[OrgRole] = mapped_column(
        Enum(OrgRole, native_enum=False, length=20, values_callable=_enum_vals),
        default=OrgRole.VIEWER,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_org_membership"),
    )

    organization: Mapped["Organization"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="org_memberships"
    )


class OrgInvitation(Base):
    """Token-based invitation; accepted by visiting /organizations/invitations/{token}/accept."""

    __tablename__ = "org_invitations"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    invited_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    email: Mapped[str] = mapped_column(String(255), index=True)
    role: Mapped[OrgRole] = mapped_column(
        Enum(OrgRole, native_enum=False, length=20, values_callable=_enum_vals),
        default=OrgRole.VIEWER,
    )
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    organization: Mapped["Organization"] = relationship(back_populates="invitations")
    inviter: Mapped["User"] = relationship("User", foreign_keys=[invited_by])
