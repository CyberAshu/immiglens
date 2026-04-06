from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr

from app.models.notification import NotificationEvent, NotifStatus


# ── Settings ──────────────────────────────────────────────────────────────────

class NotificationSettingsOut(BaseModel):
    """User-facing notification settings."""
    notification_email: Optional[str]

    model_config = {"from_attributes": True}


class NotificationSettingsUpdate(BaseModel):
    """Payload for updating notification email. Set to None to revert to account email."""
    notification_email: Optional[EmailStr] = None


# ── Delivery logs ─────────────────────────────────────────────────────────────

class NotificationLogOut(BaseModel):
    id: int
    event_type: Optional[NotificationEvent] = None
    trigger_id: Optional[int]
    trigger_type: Optional[str]
    context_json: Optional[str] = None
    status: NotifStatus
    error_message: Optional[str]
    is_read: bool = False
    sent_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
