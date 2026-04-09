import logging

from fastapi import APIRouter
from pydantic import BaseModel, EmailStr, field_validator

from app.core.config import settings
from app.services.email_service import send_contact_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["contact"])


class ContactRequest(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    subject: str
    message: str

    @field_validator("first_name", "last_name", "subject", "message")
    @classmethod
    def not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field must not be empty.")
        return v

    @field_validator("message")
    @classmethod
    def message_length(cls, v: str) -> str:
        if len(v) > 5000:
            raise ValueError("Message must be 5 000 characters or fewer.")
        return v


@router.post("/contact", status_code=204)
async def submit_contact(body: ContactRequest) -> None:
    """Public endpoint — no authentication required."""
    await send_contact_email(
        first_name=body.first_name,
        last_name=body.last_name,
        sender_email=body.email,
        subject=body.subject,
        message=body.message,
        recipient=settings.ADMIN_ALERT_EMAIL,
    )
