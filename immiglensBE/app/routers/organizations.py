"""Team / organization router.

Endpoints:
  POST   /api/organizations                    create org (current user = owner)
  GET    /api/organizations                    list orgs the user belongs to
  GET    /api/organizations/{id}               org detail
  DELETE /api/organizations/{id}               only owner can delete

  GET    /api/organizations/{id}/members       list members
  PATCH  /api/organizations/{id}/members/{uid} change role (owner/admin only)
  DELETE /api/organizations/{id}/members/{uid} remove member

  POST   /api/organizations/{id}/invite        send invite (owner/admin)
  GET    /api/organizations/{id}/invitations   pending invitations
  POST   /api/organizations/invitations/{token}/accept   accept invite
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.organization import OrgInvitation, OrgMembership, OrgRole, Organization
from app.models.user import User
from app.schemas.organization import (
    InviteRequest,
    OrganizationCreate,
    OrganizationOut,
    OrgInvitationOut,
    OrgMembershipOut,
)

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_membership(
    db: AsyncSession, org_id: int, user_id: int
) -> OrgMembership | None:
    res = await db.execute(
        select(OrgMembership).where(
            OrgMembership.org_id == org_id,
            OrgMembership.user_id == user_id,
        )
    )
    return res.scalar_one_or_none()


async def _require_org(db: AsyncSession, org_id: int) -> Organization:
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _require_admin(db: AsyncSession, org_id: int, user_id: int) -> OrgMembership:
    m = await _get_membership(db, org_id, user_id)
    if not m or m.role not in (OrgRole.OWNER, OrgRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin or owner access required")
    return m


# ── Organization CRUD ─────────────────────────────────────────────────────────

@router.post("", response_model=OrganizationOut, status_code=201)
async def create_organization(
    body: OrganizationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = Organization(name=body.name, created_by=current_user.id)
    db.add(org)
    await db.flush()

    # Creator automatically becomes the owner
    membership = OrgMembership(
        org_id=org.id, user_id=current_user.id, role=OrgRole.OWNER
    )
    db.add(membership)
    await db.commit()
    await db.refresh(org)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="organization", resource_id=org.id,
                     new_data={"name": org.name})
    await db.commit()
    return org


@router.get("", response_model=list[OrganizationOut])
async def list_organizations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all organizations the current user is a member of."""
    membership_org_ids = (
        await db.execute(
            select(OrgMembership.org_id).where(OrgMembership.user_id == current_user.id)
        )
    ).scalars().all()

    if not membership_org_ids:
        return []

    orgs = (
        await db.execute(
            select(Organization).where(Organization.id.in_(membership_org_ids))
        )
    ).scalars().all()
    return orgs


@router.get("/{org_id}", response_model=OrganizationOut)
async def get_organization(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await _get_membership(db, org_id, current_user.id)
    if not m:
        raise HTTPException(status_code=404, detail="Organization not found")
    return await _require_org(db, org_id)


@router.delete("/{org_id}", status_code=204)
async def delete_organization(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await _get_membership(db, org_id, current_user.id)
    if not m or m.role != OrgRole.OWNER:
        raise HTTPException(status_code=403, detail="Only the owner can delete an organization")
    org = await _require_org(db, org_id)
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="organization", resource_id=org.id,
                     old_data={"name": org.name})
    await db.delete(org)
    await db.commit()


# ── Members ────────────────────────────────────────────────────────────────────

@router.get("/{org_id}/members", response_model=list[OrgMembershipOut])
async def list_members(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    m = await _get_membership(db, org_id, current_user.id)
    if not m:
        raise HTTPException(status_code=404, detail="Organization not found")
    rows = (
        await db.execute(
            select(OrgMembership, User)
            .join(User, User.id == OrgMembership.user_id)
            .where(OrgMembership.org_id == org_id)
        )
    ).all()
    result = []
    for membership, user in rows:
        out = OrgMembershipOut.model_validate(membership)
        out.user_name = user.full_name or ""
        out.user_email = user.email or ""
        result.append(out)
    return result


@router.patch("/{org_id}/members/{uid}", response_model=OrgMembershipOut)
async def change_member_role(
    org_id: int,
    uid: int,
    role: OrgRole,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(db, org_id, current_user.id)
    target = await _get_membership(db, org_id, uid)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == OrgRole.OWNER:
        raise HTTPException(status_code=400, detail="Cannot change the owner's role")
    target.role = role
    await db.commit()
    await db.refresh(target)
    return target


@router.delete("/{org_id}/members/{uid}", status_code=204)
async def remove_member(
    org_id: int,
    uid: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(db, org_id, current_user.id)
    target = await _get_membership(db, org_id, uid)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == OrgRole.OWNER:
        raise HTTPException(status_code=400, detail="Cannot remove the organization owner")
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="org_member", resource_id=target.id,
                     old_data={"user_id": uid, "org_id": org_id})
    await db.delete(target)
    await db.commit()


# ── Invitations ────────────────────────────────────────────────────────────────

@router.post("/{org_id}/invite", response_model=OrgInvitationOut, status_code=201)
async def invite_member(
    org_id: int,
    body: InviteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(db, org_id, current_user.id)
    await _require_org(db, org_id)

    # Prevent duplicate pending invitations
    existing = (
        await db.execute(
            select(OrgInvitation).where(
                OrgInvitation.org_id == org_id,
                OrgInvitation.email == body.email,
                OrgInvitation.accepted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Pending invitation already exists for this email")

    invitation = OrgInvitation(
        org_id=org_id,
        invited_by=current_user.id,
        email=body.email,
        role=body.role,
        token=secrets.token_hex(32),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.INVITATION_EXPIRE_HOURS),
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="org_invitation", resource_id=invitation.id,
                     new_data={"email": body.email, "role": body.role, "org_id": org_id})
    await db.commit()
    return invitation


@router.get("/{org_id}/invitations", response_model=list[OrgInvitationOut])
async def list_invitations(
    org_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_admin(db, org_id, current_user.id)
    rows = (
        await db.execute(
            select(OrgInvitation)
            .where(OrgInvitation.org_id == org_id)
            .order_by(OrgInvitation.created_at.desc())
        )
    ).scalars().all()
    return rows


@router.post("/invitations/{token}/accept", response_model=OrgMembershipOut)
async def accept_invitation(
    token: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = (
        await db.execute(
            select(OrgInvitation).where(OrgInvitation.token == token)
        )
    ).scalar_one_or_none()

    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if inv.accepted_at is not None:
        raise HTTPException(status_code=409, detail="Invitation already accepted")
    if inv.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")

    # Idempotent: if already a member, just return their membership
    existing_m = await _get_membership(db, inv.org_id, current_user.id)
    if existing_m:
        inv.accepted_at = datetime.now(timezone.utc)
        await db.commit()
        return existing_m

    membership = OrgMembership(
        org_id=inv.org_id, user_id=current_user.id, role=inv.role
    )
    inv.accepted_at = datetime.now(timezone.utc)
    db.add(membership)
    await db.commit()
    await db.refresh(membership)
    return membership
