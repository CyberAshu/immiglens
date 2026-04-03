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
        skip_email=True,   # <-- always True when a typed HTML email is sent directly
    )

Email policy
------------
ALL user-facing emails are sent via the typed send_*() helpers in email_service.py
using Jinja2 HTML templates. The plain-text fallback (_build_email_body) below is
retained ONLY as a last-resort safety net for future events that have no HTML
template yet. It must NEVER fire for events that already have a typed send_* helper:

    CAPTURE_COMPLETE  → send_capture_completed_email (skip_email=True in scheduler)
    CAPTURE_FAILED    → send_capture_failed_email    (skip_email=True in scheduler)
    ROUND_STARTED     → no user-facing email at all  (skip_email=True in scheduler)
    POSTING_CHANGED   → no user-facing email         (skip_email=True in scheduler)

If a new event is added that DOES need a fallback plain-text email, set
skip_email=False at the call site AND add a branch in _build_email_body.
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

# Events that have a typed HTML send_* helper in email_service.py.
# dispatch_event() must always be called with skip_email=True for these.
# This set is checked at runtime as a safety net.
_EVENTS_WITH_HTML_EMAIL: frozenset[NotificationEvent] = frozenset({
    NotificationEvent.CAPTURE_COMPLETE,
    NotificationEvent.CAPTURE_FAILED,
    NotificationEvent.ROUND_STARTED,
    NotificationEvent.POSTING_CHANGED,
    NotificationEvent.POSITION_LIMIT_WARNING,
})


def _build_email_body(event: NotificationEvent, context: dict[str, Any]) -> str:
    """Plain-text fallback body — only for events WITHOUT a typed HTML helper."""
    return f"ImmigLens event: {event.value}\n\n{json.dumps(context, indent=2)}"


logger = logging.getLogger(__name__)


async def _deliver_email(to: str, event: NotificationEvent, context: dict[str, Any]) -> None:
    """Send a plain-text fallback email for events that have no HTML template.

    Raises RuntimeError for events that should never reach this path.
    """
    if event in _EVENTS_WITH_HTML_EMAIL:
        # This is a programming error: the caller forgot skip_email=True.
        # Log loudly and abort rather than sending a broken plain-text email.
        logger.error(
            "BUG: _deliver_email called for %s which has a typed HTML helper. "
            "dispatch_event must be called with skip_email=True for this event. "
            "Email NOT sent to %s.",
            event.value, to,
        )
        return
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
    skip_email: bool = False,
) -> None:
    """Find all active preferences for user+event and attempt delivery for each.

    skip_email: set True when the caller already sends a richer transactional
    HTML email directly (e.g. capture completed/failed).  Webhook preferences
    still fire normally.
    """
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
                if skip_email:
                    # Transactional HTML email already sent by scheduler — skip plain-text duplicate
                    log.status = NotifStatus.SENT
                    log.sent_at = datetime.now(timezone.utc)
                    continue
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
