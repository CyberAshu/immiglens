"""Notification dispatch service.

Looks up active NotificationPreference rows for a user+event, sends each via
email (SMTP) or webhook (HTTP POST), and writes a NotificationLog record
regardless of success or failure.

Usage (from scheduler or router):
    await dispatch_event(
        db, user_id=5,
        event=NotificationEvent.CAPTURE_COMPLETE,
        context={"round_id": 42, "position": "Software Engineer"},
        trigger_id=42,
        trigger_type="capture_round",
    )
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification import (
    NotificationChannel,
    NotificationEvent,
    NotificationLog,
    NotificationPreference,
    NotifStatus,
)
from app.services.email_service import send_admin_alert, send_email


# ── Email ─────────────────────────────────────────────────────────────────────

def _build_email_body(event: NotificationEvent, context: dict[str, Any]) -> str:
    """Plain-text email body for each event type."""
    if event == NotificationEvent.CAPTURE_COMPLETE:
        return (
            f"ImmigLens — Capture Complete\n\n"
            f"Position : {context.get('position', 'N/A')}\n"
            f"Round ID : {context.get('round_id', 'N/A')}\n"
            f"Completed: {context.get('completed_at', 'N/A')}\n"
        )
    if event == NotificationEvent.CAPTURE_FAILED:
        return (
            f"ImmigLens — Capture Failed\n\n"
            f"Position : {context.get('position', 'N/A')}\n"
            f"Round ID : {context.get('round_id', 'N/A')}\n"
            f"Error    : {context.get('error', 'Unknown')}\n"
        )
    if event == NotificationEvent.POSTING_CHANGED:
        return (
            f"ImmigLens — Job Posting Changed\n\n"
            f"Posting  : {context.get('posting_url', 'N/A')}\n"
            f"Summary  : {context.get('change_summary', 'N/A')}\n"
        )
    if event == NotificationEvent.ROUND_STARTED:
        return (
            f"ImmigLens — Capture Round Started\n\n"
            f"Position    : {context.get('position', 'N/A')}\n"
            f"Round ID    : {context.get('round_id', 'N/A')}\n"
            f"Scheduled at: {context.get('scheduled_at', 'N/A')}\n"
        )
    return f"ImmigLens event: {event.value}\n\n{json.dumps(context, indent=2)}"


logger = logging.getLogger(__name__)


async def _deliver_email(to: str, event: NotificationEvent, context: dict[str, Any]) -> None:
    subject = f"ImmigLens — {event.value.replace('_', ' ').title()}"
    body = _build_email_body(event, context)
    await send_email(to, subject, body)


# ── Webhook ───────────────────────────────────────────────────────────────────

async def _deliver_webhook(url: str, event: NotificationEvent, context: dict[str, Any]) -> None:
    payload = {
        "event": event.value,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **context,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()


# ── Public API ────────────────────────────────────────────────────────────────

async def dispatch_event(
    db: AsyncSession,
    user_id: int,
    event: NotificationEvent,
    context: dict[str, Any],
    trigger_id: Optional[int] = None,
    trigger_type: Optional[str] = None,
) -> None:
    """Find all active preferences for user+event and attempt delivery for each."""
    prefs_result = await db.execute(
        select(NotificationPreference).where(
            NotificationPreference.user_id == user_id,
            NotificationPreference.event_type == event,
            NotificationPreference.is_active.is_(True),
        )
    )
    prefs = prefs_result.scalars().all()

    for pref in prefs:
        log = NotificationLog(
            preference_id=pref.id,
            event_type=event,
            trigger_id=trigger_id,
            trigger_type=trigger_type,
            context_json=json.dumps(context),
            status=NotifStatus.PENDING,
        )
        db.add(log)
        await db.flush()

        try:
            if pref.channel == NotificationChannel.EMAIL:
                await _deliver_email(pref.destination, event, context)
            else:
                await _deliver_webhook(pref.destination, event, context)

            log.status = NotifStatus.SENT
            log.sent_at = datetime.now(timezone.utc)
        except Exception as exc:
            log.status = NotifStatus.FAILED
            log.error_message = str(exc)[:500]

    if prefs:
        await db.commit()
