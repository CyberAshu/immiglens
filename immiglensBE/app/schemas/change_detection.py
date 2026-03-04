from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PostingSnapshotOut(BaseModel):
    id: int
    job_posting_id: int
    capture_result_id: Optional[int]
    page_hash: Optional[str]
    has_changed: Optional[bool]
    change_summary: Optional[str]
    captured_at: datetime

    model_config = {"from_attributes": True}


class ChangeHistoryItem(BaseModel):
    """Simplified view used for timeline display."""
    snapshot_id: int
    captured_at: datetime
    has_changed: Optional[bool]
    change_summary: Optional[str]
    screenshot_url: Optional[str]  # from linked CaptureResult
