from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.capture import CaptureStatus, ResultStatus


class CaptureResultOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    job_url_id: int
    url: str
    status: ResultStatus
    screenshot_url: Optional[str]
    page_pdf_url: Optional[str]
    error: Optional[str]
    duration_ms: Optional[int]
    failure_category: Optional[str] = None
    response_status: Optional[int] = None
    page_title: Optional[str] = None


class CaptureRoundOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    job_position_id: int
    scheduled_at: datetime
    captured_at: Optional[datetime]
    status: CaptureStatus
    updated_at: datetime
    results: list[CaptureResultOut] = []
