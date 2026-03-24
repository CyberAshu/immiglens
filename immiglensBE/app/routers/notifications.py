"""Notification preferences and delivery log router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.notification import NotificationLog, NotificationPreference, NotifStatus
from app.models.user import User
from app.schemas.notification import (
    NotificationLogOut,
    NotificationPreferenceCreate,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ── Preferences ───────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=list[NotificationPreferenceOut])
async def list_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        await db.execute(
            select(NotificationPreference)
            .where(NotificationPreference.user_id == current_user.id)
            .order_by(NotificationPreference.created_at)
        )
    ).scalars().all()
    return rows


@router.post("/preferences", response_model=NotificationPreferenceOut, status_code=201)
async def create_preference(
    body: NotificationPreferenceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = NotificationPreference(user_id=current_user.id, **body.model_dump())
    db.add(pref)
    await db.commit()
    await db.refresh(pref)
    return pref


@router.patch("/preferences/{pref_id}", response_model=NotificationPreferenceOut)
async def toggle_preference(
    pref_id: int,
    body: NotificationPreferenceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = await db.get(NotificationPreference, pref_id)
    if not pref or pref.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Preference not found")
    pref.is_active = body.is_active
    await db.commit()
    await db.refresh(pref)
    return pref


@router.delete("/preferences/{pref_id}", status_code=204)
async def delete_preference(
    pref_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = await db.get(NotificationPreference, pref_id)
    if not pref or pref.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Preference not found")
    await db.delete(pref)
    await db.commit()


# ── Delivery logs ─────────────────────────────────────────────────────────────

def _user_pref_ids_subquery(user_id: int):
    """Reusable subquery: preference IDs owned by a user."""
    return select(NotificationPreference.id).where(
        NotificationPreference.user_id == user_id
    )


@router.get("/logs", response_model=list[NotificationLogOut])
async def list_notification_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the 100 most recent delivery attempts for the current user's preferences."""
    pref_ids_res = await db.execute(_user_pref_ids_subquery(current_user.id))
    pref_ids = [r[0] for r in pref_ids_res.all()]
    if not pref_ids:
        return []

    rows = (
        await db.execute(
            select(NotificationLog)
            .where(NotificationLog.preference_id.in_(pref_ids))
            .order_by(NotificationLog.created_at.desc())
            .limit(100)
        )
    ).scalars().all()
    return rows


@router.get("/logs/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the number of unread sent notification logs for the current user."""
    pref_ids_res = await db.execute(_user_pref_ids_subquery(current_user.id))
    pref_ids = [r[0] for r in pref_ids_res.all()]
    if not pref_ids:
        return {"count": 0}

    result = await db.execute(
        select(func.count(NotificationLog.id)).where(
            NotificationLog.preference_id.in_(pref_ids),
            NotificationLog.is_read.is_(False),
            NotificationLog.status == NotifStatus.SENT,
        )
    )
    return {"count": result.scalar_one()}


@router.post("/logs/mark-all-read", status_code=204)
async def mark_all_logs_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all of the current user's notification logs as read."""
    pref_ids_res = await db.execute(_user_pref_ids_subquery(current_user.id))
    pref_ids = [r[0] for r in pref_ids_res.all()]
    if not pref_ids:
        return

    await db.execute(
        update(NotificationLog)
        .where(
            NotificationLog.preference_id.in_(pref_ids),
            NotificationLog.is_read.is_(False),
        )
        .values(is_read=True)
    )
    await db.commit()
