"""Notification settings and delivery log router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.notification import NotificationLog, NotifStatus
from app.models.user import User
from app.schemas.notification import (
    NotificationLogOut,
    NotificationSettingsOut,
    NotificationSettingsUpdate,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


# ── Settings ──────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=NotificationSettingsOut)
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
):
    """Return the user's current notification email (None means account email is used)."""
    return NotificationSettingsOut(notification_email=current_user.notification_email)


@router.patch("/settings", response_model=NotificationSettingsOut)
async def update_notification_settings(
    body: NotificationSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update (or clear) the notification email override."""
    current_user.notification_email = body.notification_email
    await db.commit()
    await db.refresh(current_user)
    return NotificationSettingsOut(notification_email=current_user.notification_email)


# ── Delivery logs ─────────────────────────────────────────────────────────────

@router.get("/logs/recent", response_model=list[NotificationLogOut])
async def list_recent_notification_logs(
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the N most recent notification logs — lightweight endpoint for the bell dropdown."""
    limit = min(max(limit, 1), 20)  # clamp 1–20
    rows = (
        await db.execute(
            select(NotificationLog)
            .where(NotificationLog.user_id == current_user.id)
            .order_by(NotificationLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()
    return rows


@router.get("/logs", response_model=list[NotificationLogOut])
async def list_notification_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the 100 most recent notification delivery records for the current user."""
    rows = (
        await db.execute(
            select(NotificationLog)
            .where(NotificationLog.user_id == current_user.id)
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
    result = await db.execute(
        select(func.count(NotificationLog.id)).where(
            NotificationLog.user_id == current_user.id,
            NotificationLog.is_read.is_(False),
            NotificationLog.status == NotifStatus.SENT,
        )
    )
    return {"count": result.scalar_one()}


@router.patch("/logs/{log_id}/read", status_code=204)
async def mark_log_read(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a single notification log as read."""
    log = await db.get(NotificationLog, log_id)
    if not log or log.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not log.is_read:
        log.is_read = True
        await db.commit()


@router.post("/logs/mark-all-read", status_code=204)
async def mark_all_logs_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark all of the current user's sent notification logs as read."""
    await db.execute(
        update(NotificationLog)
        .where(
            NotificationLog.user_id == current_user.id,
            NotificationLog.is_read.is_(False),
            NotificationLog.status == NotifStatus.SENT,
        )
        .values(is_read=True)
    )
    await db.commit()

