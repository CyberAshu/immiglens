from enum import Enum
from typing import Optional

from pydantic import BaseModel


class URLStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"


class ScreenshotResult(BaseModel):
    url: str
    status: URLStatus
    filename: Optional[str] = None
    screenshot_url: Optional[str] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None


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
