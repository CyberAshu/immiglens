from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_action
from app.core.permissions import deactivate_user_positions
from app.core.database import get_db
from app.core.dependencies import get_client_ip, get_current_user
from app.models.capture import CaptureResult, CaptureRound, ResultStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_url import JobUrl
from app.models.organization import Organization, OrgMembership
from app.models.subscription import SubscriptionTier
from app.models.user import User
from app.schemas.admin import (
    AdminCaptureListResponse,
    AdminCaptureRoundRecord,
    AdminGlobalStats,
    AdminOrgMember,
    AdminOrgOut,
    AdminUserRecord,
    AssignTierRequest,
    TierCreate,
    TierUpdate,
)
from app.schemas.auth import UserOut
from app.schemas.subscription import SubscriptionTierOut
from app.services import stripe_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


# ── Global stats ──────────────────────────────────────────────

@router.get("/stats", response_model=AdminGlobalStats)
async def admin_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    async def count(stmt) -> int:
        return (await db.execute(stmt)).scalar_one()

    total_users      = await count(select(func.count()).select_from(User))
    total_employers  = await count(select(func.count()).select_from(Employer))
    active_employers = await count(select(func.count()).select_from(Employer).where(Employer.is_active.is_(True)))
    total_positions  = await count(select(func.count()).select_from(JobPosition))
    active_positions = await count(select(func.count()).select_from(JobPosition).where(JobPosition.is_active.is_(True)))
    total_postings   = await count(select(func.count()).select_from(JobUrl))
    active_postings  = await count(select(func.count()).select_from(JobUrl).where(JobUrl.is_active.is_(True)))
    total_rounds     = await count(select(func.count()).select_from(CaptureRound))
    completed_rounds = await count(select(func.count()).select_from(CaptureRound).where(CaptureRound.status == "completed"))
    pending_rounds   = await count(select(func.count()).select_from(CaptureRound).where(CaptureRound.status == "pending"))
    total_screenshots  = await count(select(func.count()).select_from(CaptureResult).where(CaptureResult.status == ResultStatus.DONE))
    failed_screenshots = await count(select(func.count()).select_from(CaptureResult).where(CaptureResult.status == ResultStatus.FAILED))

    return AdminGlobalStats(
        total_users=total_users,
        total_employers=total_employers,
        active_employers=active_employers,
        total_positions=total_positions,
        active_positions=active_positions,
        total_job_urls=total_postings,
        active_postings=active_postings,
        total_capture_rounds=total_rounds,
        completed_rounds=completed_rounds,
        pending_rounds=pending_rounds,
        total_screenshots=total_screenshots,
        failed_screenshots=failed_screenshots,
    )


# ── User management ──────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserRecord])
async def admin_list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()

    # tier info per user
    tier_rows = (await db.execute(select(SubscriptionTier))).scalars().all()
    tier_map = {t.id: t for t in tier_rows}

    # employer counts per user
    emp_rows = (await db.execute(
        select(Employer.user_id, func.count().label("cnt")).group_by(Employer.user_id)
    )).all()
    emp_count = {r.user_id: r.cnt for r in emp_rows}

    emp_id_rows = (await db.execute(select(Employer.id, Employer.user_id))).all()
    emp_to_user = {r.id: r.user_id for r in emp_id_rows}

    pos_rows = (await db.execute(select(JobPosition.id, JobPosition.employer_id))).all()
    pos_count_by_user: dict[int, int] = {}
    pos_to_user: dict[int, int] = {}
    for r in pos_rows:
        uid = emp_to_user.get(r.employer_id)
        if uid:
            pos_count_by_user[uid] = pos_count_by_user.get(uid, 0) + 1
            pos_to_user[r.id] = uid

    post_rows = (await db.execute(select(JobUrl.id, JobUrl.job_position_id))).all()
    post_to_user: dict[int, int] = {
        r.id: pos_to_user[r.job_position_id]
        for r in post_rows if r.job_position_id in pos_to_user
    }

    round_rows = (await db.execute(select(CaptureRound.id, CaptureRound.job_position_id))).all()
    round_to_user: dict[int, int] = {
        r.id: pos_to_user[r.job_position_id]
        for r in round_rows if r.job_position_id in pos_to_user
    }

    shot_rows = (await db.execute(
        select(CaptureResult.capture_round_id)
        .where(CaptureResult.status == ResultStatus.DONE)
    )).scalars().all()
    screenshots_by_user: dict[int, int] = {}
    for rid in shot_rows:
        uid = round_to_user.get(rid)
        if uid:
            screenshots_by_user[uid] = screenshots_by_user.get(uid, 0) + 1

    return [
        AdminUserRecord(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_admin=u.is_admin,
            employers=emp_count.get(u.id, 0),
            positions=pos_count_by_user.get(u.id, 0),
            screenshots=screenshots_by_user.get(u.id, 0),
            created_at=u.created_at.strftime("%Y-%m-%d %H:%M UTC"),
            tier_id=u.tier_id,
            tier_name=tier_map[u.tier_id].display_name if u.tier_id and u.tier_id in tier_map else None,
            tier_expires_at=u.tier_expires_at,
        )
        for u in users
    ]


@router.patch("/users/{user_id}/toggle-admin", response_model=UserOut)
async def toggle_admin(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own admin status.")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.is_admin = not user.is_admin
    await db.commit()
    await db.refresh(user)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="user", resource_id=user.id,
                     new_data={"is_admin": user.is_admin, "email": user.email},
                     ip_address=get_client_ip(request))
    await db.commit()
    return user


@router.patch("/users/{user_id}/tier", response_model=UserOut)
async def assign_tier(
    user_id: int,
    body: AssignTierRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    new_tier: SubscriptionTier | None = None
    if body.tier_id is not None:
        new_tier = await db.get(SubscriptionTier, body.tier_id)
        if not new_tier:
            raise HTTPException(status_code=404, detail="Tier not found.")

    # Detect downgrade: resolve effective limits for old vs new tier
    old_tier_obj: SubscriptionTier | None = (
        await db.get(SubscriptionTier, user.tier_id) if user.tier_id else None
    )
    old_max = old_tier_obj.max_active_positions if old_tier_obj else -1  # -1 = unlimited
    # None (free) when new tier_id is None — load free tier for comparison
    if new_tier is None:
        from sqlalchemy import select as _sel
        res = await db.execute(
            _sel(SubscriptionTier).where(SubscriptionTier.name == "free").limit(1)
        )
        free_tier = res.scalar_one_or_none()
        new_max = free_tier.max_active_positions if free_tier else -1
    else:
        new_max = new_tier.max_active_positions

    is_downgrade = (
        new_max != -1 and (old_max == -1 or new_max < old_max)
    )

    old_tier_id = user.tier_id
    user.tier_id = body.tier_id
    user.tier_expires_at = body.tier_expires_at

    if is_downgrade:
        await deactivate_user_positions(db, user)
    else:
        await db.commit()

    await db.refresh(user)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="user", resource_id=user.id,
                     old_data={"tier_id": old_tier_id},
                     new_data={"tier_id": body.tier_id, "tier_expires_at": str(body.tier_expires_at)},
                     ip_address=get_client_ip(request))
    await db.commit()
    return user


@router.delete("/users/{user_id}", status_code=204)
async def admin_delete_user(
    user_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="user", resource_id=user.id,
                     old_data={"email": user.email},
                     ip_address=get_client_ip(request))
    await db.delete(user)
    await db.commit()


# ── Organization management ───────────────────────────────────

@router.get("/organizations", response_model=list[AdminOrgOut])
async def admin_list_orgs(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    orgs = (await db.execute(
        select(Organization).order_by(Organization.created_at.desc())
    )).scalars().all()

    users_rows = (await db.execute(select(User))).scalars().all()
    user_map = {u.id: u for u in users_rows}

    memberships_rows = (await db.execute(select(OrgMembership))).scalars().all()
    memberships_by_org: dict[int, list[OrgMembership]] = {}
    for m in memberships_rows:
        memberships_by_org.setdefault(m.org_id, []).append(m)

    result = []
    for org in orgs:
        owner = user_map.get(org.created_by)
        members_raw = memberships_by_org.get(org.id, [])
        members = [
            AdminOrgMember(
                user_id=m.user_id,
                user_name=user_map[m.user_id].full_name if m.user_id in user_map else "",
                user_email=user_map[m.user_id].email if m.user_id in user_map else "",
                role=m.role.value if hasattr(m.role, "value") else str(m.role),
                joined_at=m.joined_at,
            )
            for m in members_raw
        ]
        result.append(AdminOrgOut(
            id=org.id,
            name=org.name,
            description=getattr(org, "description", None),
            owner_id=org.created_by,
            owner_name=owner.full_name if owner else "",
            owner_email=owner.email if owner else "",
            member_count=len(members),
            created_at=org.created_at,
            members=members,
        ))
    return result


@router.delete("/organizations/{org_id}", status_code=204)
async def admin_delete_org(
    org_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    await log_action(db, user_id=current_user.id, action="DELETE",
                     resource_type="organization", resource_id=org.id,
                     old_data={"name": org.name},
                     ip_address=get_client_ip(request))
    await db.delete(org)
    await db.commit()


# ── Subscription tier management ─────────────────────────────

@router.get("/subscriptions/tiers", response_model=list[SubscriptionTierOut])
async def admin_list_tiers(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Returns ALL tiers including inactive ones (admin view)."""
    tiers = (await db.execute(select(SubscriptionTier).order_by(SubscriptionTier.id))).scalars().all()
    return tiers


@router.post("/subscriptions/tiers", response_model=SubscriptionTierOut, status_code=201)
async def admin_create_tier(
    body: TierCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    existing = (await db.execute(
        select(SubscriptionTier).where(SubscriptionTier.name == body.name)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Tier with this name already exists.")
    tier = SubscriptionTier(**body.model_dump())
    db.add(tier)
    await db.commit()
    await db.refresh(tier)
    await log_action(db, user_id=current_user.id, action="CREATE",
                     resource_type="subscription_tier", resource_id=tier.id,
                     new_data={"name": tier.name, "display_name": tier.display_name},
                     ip_address=get_client_ip(request))
    await db.commit()

    # Sync to Stripe (best-effort; don't fail the whole request if Stripe is down)
    try:
        product_id, price_id = stripe_service.create_product_and_price(tier)
        tier.stripe_product_id = product_id
        tier.stripe_price_id   = price_id
        await db.commit()
        await db.refresh(tier)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("Stripe sync failed for new tier %s: %s", tier.id, exc)

    return tier


@router.patch("/subscriptions/tiers/{tier_id}", response_model=SubscriptionTierOut)
async def admin_update_tier(
    tier_id: int,
    body: TierUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tier = await db.get(SubscriptionTier, tier_id)
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found.")
    old = {"display_name": tier.display_name, "max_active_positions": tier.max_active_positions,
           "price_per_month": tier.price_per_month}

    old_price   = tier.price_per_month
    old_name    = tier.display_name
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tier, field, value)
    await db.commit()
    await db.refresh(tier)
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="subscription_tier", resource_id=tier.id,
                     old_data=old, new_data={"display_name": tier.display_name},
                     ip_address=get_client_ip(request))
    await db.commit()

    # Stripe sync (best-effort)
    try:
        if tier.stripe_product_id:
            if tier.display_name != old_name:
                stripe_service.update_product_name(tier.stripe_product_id, tier.display_name)
            if tier.price_per_month != old_price:
                if tier.stripe_price_id:
                    stripe_service.archive_price(tier.stripe_price_id)
                if tier.price_per_month and tier.price_per_month > 0:
                    tier.stripe_price_id = stripe_service.create_new_price(
                        tier.stripe_product_id, tier.id, tier.price_per_month
                    )
                else:
                    tier.stripe_price_id = None
                await db.commit()
                await db.refresh(tier)
        else:
            # Tier was created before Stripe was configured (or has $0 price) — sync now
            product_id, price_id = stripe_service.create_product_and_price(tier)
            tier.stripe_product_id = product_id
            tier.stripe_price_id   = price_id
            await db.commit()
            await db.refresh(tier)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("Stripe sync failed for tier %s update: %s", tier.id, exc)

    return tier


@router.delete("/subscriptions/tiers/{tier_id}", status_code=204)
async def admin_delete_tier(
    tier_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    tier = await db.get(SubscriptionTier, tier_id)
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found.")
    # Soft-delete: deactivate rather than remove (users may still be on it)
    tier.is_active = False
    await log_action(db, user_id=current_user.id, action="UPDATE",
                     resource_type="subscription_tier", resource_id=tier.id,
                     old_data={"is_active": True}, new_data={"is_active": False},
                     ip_address=get_client_ip(request))
    await db.commit()

    # Archive in Stripe (best-effort)
    try:
        if tier.stripe_price_id:
            stripe_service.archive_price(tier.stripe_price_id)
        if tier.stripe_product_id:
            stripe_service.archive_product(tier.stripe_product_id)
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger(__name__).warning("Stripe archive failed for tier %s: %s", tier.id, exc)


# ── Capture round management ─────────────────────────────────

@router.get("/captures/problematic", response_model=AdminCaptureListResponse)
async def admin_list_problematic_captures(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Return failed, stuck-running, and overdue-pending capture rounds across all users."""
    from datetime import datetime, timezone
    from app.models.capture import CaptureStatus

    now = datetime.now(timezone.utc)

    # Aggregate subqueries — computed once, joined in, not looped
    total_sq = (
        select(
            CaptureResult.capture_round_id.label("round_id"),
            func.count().label("total"),
        )
        .group_by(CaptureResult.capture_round_id)
        .subquery()
    )

    failed_sq = (
        select(
            CaptureResult.capture_round_id.label("round_id"),
            func.count().label("failed"),
        )
        .where(CaptureResult.status == ResultStatus.FAILED)
        .group_by(CaptureResult.capture_round_id)
        .subquery()
    )

    error_sq = (
        select(
            CaptureResult.capture_round_id.label("round_id"),
            func.min(CaptureResult.error).label("error_sample"),
        )
        .where(
            CaptureResult.status == ResultStatus.FAILED,
            CaptureResult.error.isnot(None),
        )
        .group_by(CaptureResult.capture_round_id)
        .subquery()
    )

    stmt = (
        select(
            CaptureRound,
            JobPosition,
            Employer,
            User,
            func.coalesce(total_sq.c.total, 0).label("total_results"),
            func.coalesce(failed_sq.c.failed, 0).label("failed_results"),
            error_sq.c.error_sample,
        )
        .join(JobPosition, CaptureRound.job_position_id == JobPosition.id)
        .join(Employer, JobPosition.employer_id == Employer.id)
        .join(User, Employer.user_id == User.id)
        .outerjoin(total_sq, CaptureRound.id == total_sq.c.round_id)
        .outerjoin(failed_sq, CaptureRound.id == failed_sq.c.round_id)
        .outerjoin(error_sq, CaptureRound.id == error_sq.c.round_id)
        .where(
            (CaptureRound.status == CaptureStatus.FAILED)
            | (CaptureRound.status == CaptureStatus.RUNNING)
            | (
                (CaptureRound.status == CaptureStatus.PENDING)
                & (CaptureRound.scheduled_at <= now)  # overdue only, not future
            )
        )
        .order_by(CaptureRound.scheduled_at.desc())
        .limit(500)
    )
    rows = (await db.execute(stmt)).all()

    records = [
        AdminCaptureRoundRecord(
            round_id=round_.id,
            status=round_.status.value,
            scheduled_at=round_.scheduled_at,
            captured_at=round_.captured_at,
            position_title=position.job_title,
            employer_name=employer.business_name,
            user_email=user.email,
            user_id=user.id,
            employer_id=employer.id,
            position_id=position.id,
            failed_results=failed_results,
            total_results=total_results,
            error_sample=error_sample,
        )
        for round_, position, employer, user, total_results, failed_results, error_sample in rows
    ]

    return AdminCaptureListResponse(rounds=records, total=len(records))


@router.post("/captures/{round_id}/retry", status_code=202)
async def admin_retry_capture_round(
    round_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin: force-retry a capture round regardless of its current status."""
    from app.services.scheduler import force_run_capture_round
    import asyncio

    round_ = await db.get(CaptureRound, round_id)
    if not round_:
        raise HTTPException(status_code=404, detail="Capture round not found.")

    await log_action(
        db, user_id=current_user.id, action="UPDATE",
        resource_type="capture_round", resource_id=round_id,
        old_data={"status": round_.status.value},
        new_data={"status": "pending", "admin_retry": True},
        ip_address=get_client_ip(request),
    )

    asyncio.create_task(force_run_capture_round(round_id))
    return {"detail": "Retry queued", "round_id": round_id}


@router.post("/captures/bulk-retry", status_code=202)
async def admin_bulk_retry_captures(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin: retry ALL failed capture rounds."""
    from app.models.capture import CaptureStatus
    from app.services.scheduler import force_run_capture_round
    import asyncio

    result = await db.execute(
        select(CaptureRound).where(CaptureRound.status == CaptureStatus.FAILED)
    )
    failed_rounds = result.scalars().all()

    if not failed_rounds:
        return {"detail": "No failed rounds found", "queued": 0}

    for round_ in failed_rounds:
        await log_action(
            db, user_id=current_user.id, action="UPDATE",
            resource_type="capture_round", resource_id=round_.id,
            old_data={"status": "failed"},
            new_data={"status": "pending", "admin_bulk_retry": True},
            ip_address=get_client_ip(request),
        )
        asyncio.create_task(force_run_capture_round(round_.id))

    return {"detail": "Bulk retry queued", "queued": len(failed_rounds)}


@router.post("/captures/recover-all", status_code=202)
async def admin_recover_all_captures(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Admin: reset ALL stuck rounds (RUNNING + overdue PENDING + FAILED) and re-queue them."""
    from datetime import datetime, timezone
    from app.models.capture import CaptureStatus
    from app.services.scheduler import force_run_capture_round
    import asyncio

    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(CaptureRound).where(
            (CaptureRound.status == CaptureStatus.FAILED)
            | (CaptureRound.status == CaptureStatus.RUNNING)
            | (
                (CaptureRound.status == CaptureStatus.PENDING)
                & (CaptureRound.scheduled_at <= now)
            )
        )
    )
    rounds = result.scalars().all()

    if not rounds:
        return {"detail": "No problematic rounds found", "queued": 0}

    for round_ in rounds:
        await log_action(
            db, user_id=current_user.id, action="UPDATE",
            resource_type="capture_round", resource_id=round_.id,
            old_data={"status": round_.status.value},
            new_data={"status": "pending", "admin_recover_all": True},
            ip_address=get_client_ip(request),
        )

    for round_ in rounds:
        asyncio.create_task(force_run_capture_round(round_.id))

    return {"detail": "All stuck rounds queued for recovery", "queued": len(rounds)}
