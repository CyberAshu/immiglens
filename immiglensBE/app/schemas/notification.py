from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.notification import NotificationChannel, NotificationEvent, NotifStatus


class NotificationPreferenceCreate(BaseModel):
    event_type: NotificationEvent
    channel: NotificationChannel
    destination: str

    @field_validator("destination")
    @classmethod
    def destination_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("destination cannot be empty")
        return v.strip()


class NotificationPreferenceUpdate(BaseModel):
    is_active: bool


class NotificationPreferenceOut(BaseModel):
    id: int
    user_id: int
    event_type: NotificationEvent
    channel: NotificationChannel
    destination: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NotificationLogOut(BaseModel):
    id: int
    preference_id: int
    trigger_id: Optional[int]
    trigger_type: Optional[str]
    status: NotifStatus
    error_message: Optional[str]
    sent_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
