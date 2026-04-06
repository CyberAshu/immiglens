"""Notification dispatch service.

Notifications are automatic — no user-configured rules required.  For every
significant platform event we:

  1. Resolve the user's effective notification address
     (user.notification_email if set, otherwise user.email).
  2. Write a NotificationLog row regardless of success / failure.
  3. Optionally send a plain-text fallback email when the caller has NOT
     already sent a richer transactional HTML email (skip_email=False).

Email policy
------------
ALL user-facing emails are sent via the typed send_*() helpers in email_service.py
using Jinja2 HTML templates.  The plain-text fallback (_build_email_body) below is
retained ONLY as a last-resort safety net for future events that have no HTML
template yet.  It must NEVER fire for events that already have a typed send_* helper:

    CAPTURE_COMPLETE  → send_capture_completed_email (skip_email=True in scheduler)
    CAPTURE_FAILED    → send_capture_failed_email    (skip_email=True in scheduler)
    ROUND_STARTED     → no user-facing email at all  (skip_email=True in scheduler)
    POSTING_CHANGED   → no user-facing email         (skip_email=True in scheduler)
    POSITION_LIMIT_WARNING → send_position_limit_warning_email (skip_email=True)

If a new event is added that DOES need a fallback plain-text email, set
skip_email=False at the call site AND add a branch in _build_email_body.
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationEvent, NotificationLog, NotifStatus
from app.models.user import User
from app.services.email_service import send_email


# ── Events that have a typed HTML send_* helper ───────────────────────────────
# dispatch_event() must always be called with skip_email=True for these.
_EVENTS_WITH_HTML_EMAIL: frozenset[NotificationEvent] = frozenset({
    NotificationEvent.CAPTURE_COMPLETE,
    NotificationEvent.CAPTURE_FAILED,
    NotificationEvent.ROUND_STARTED,
    NotificationEvent.POSTING_CHANGED,
    NotificationEvent.POSITION_LIMIT_WARNING,
})

logger = logging.getLogger(__name__)


def _build_email_body(event: NotificationEvent, context: dict[str, Any]) -> str:
    """Plain-text fallback body — only for events WITHOUT a typed HTML helper."""
    return f"ImmigLens event: {event.value}\n\n{json.dumps(context, indent=2)}"


async def dispatch_event(
    db: AsyncSession,
    user_id: int,
    event: NotificationEvent,
    context: dict[str, Any],
    trigger_id: Optional[int] = None,
    trigger_type: Optional[str] = None,
    skip_email: bool = False,
) -> None:
    """Write a NotificationLog entry and optionally send a plain-text fallback email.

    skip_email: set True when the caller already sends a richer transactional
    HTML email directly (e.g. capture completed/failed).
    """
    log = NotificationLog(
        user_id=user_id,
        event_type=event,
        trigger_id=trigger_id,
        trigger_type=trigger_type,
        context_json=json.dumps(context),
        status=NotifStatus.PENDING,
    )
    db.add(log)
    await db.flush()

    try:
        if skip_email:
            # HTML email already handled by the caller — mark SENT immediately
            log.status = NotifStatus.SENT
            log.sent_at = datetime.now(timezone.utc)
        else:
            if event in _EVENTS_WITH_HTML_EMAIL:
                logger.error(
                    "BUG: dispatch_event called for %s which has a typed HTML helper. "
                    "Call with skip_email=True. Email NOT sent.",
                    event.value,
                )
                log.status = NotifStatus.FAILED
                log.error_message = "dispatch_event called without skip_email for HTML-managed event"
            else:
                # Resolve effective notification address
                user = await db.get(User, user_id)
                if user is None:
                    log.status = NotifStatus.FAILED
                    log.error_message = f"User {user_id} not found"
                else:
                    to = user.notification_email or user.email
                    subject = f"ImmigLens — {event.value.replace('_', ' ').title()}"
                    body = _build_email_body(event, context)
                    await send_email(to, subject, body)
                    log.status = NotifStatus.SENT
                    log.sent_at = datetime.now(timezone.utc)
    except Exception as exc:
        log.status = NotifStatus.FAILED
        log.error_message = str(exc)[:500]

    await db.commit()

