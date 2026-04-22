from enum import Enum
from typing import Optional

from pydantic import BaseModel


class URLStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class FailureCategory(str, Enum):
    TIMEOUT = "timeout"
    BOT_DETECTED = "bot_detected"
    CAPTCHA = "captcha"
    ACCESS_DENIED = "access_denied"
    EMPTY_PAGE = "empty_page"
    NETWORK_ERROR = "network_error"
    UNKNOWN = "unknown"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"


class ScreenshotResult(BaseModel):
    url: str
    status: URLStatus
    filename: Optional[str] = None
    screenshot_url: Optional[str] = None
    page_pdf_url: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None
    failure_category: Optional[FailureCategory] = None
    response_status: Optional[int] = None
    page_title: Optional[str] = None
    proxy_used: Optional[bool] = None
    proxy_session: Optional[str] = None
    profile_id: Optional[str] = None
    modal_detected: Optional[bool] = None
    modal_remaining: Optional[bool] = None
    modal_actions_clicked: Optional[int] = None
    modal_actions_hidden: Optional[int] = None


class BatchJob(BaseModel):
    job_id: str
    status: JobStatus
    total: int
    completed: int
    failed: int
    results: list[ScreenshotResult]
    created_at: float
    updated_at: float


class BatchRequest(BaseModel):
    urls: list[str]


class BatchSubmitResponse(BaseModel):
    job_id: str
    total: int
