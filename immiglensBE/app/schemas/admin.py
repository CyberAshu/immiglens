from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class AdminGlobalStats(BaseModel):
    total_users: int
    total_employers: int
    active_employers: int
    total_positions: int
    active_positions: int
    total_job_urls: int
    active_postings: int
    total_capture_rounds: int
    completed_rounds: int
    pending_rounds: int
    total_screenshots: int
    failed_screenshots: int
    # Rounds that failed before producing any CaptureResult (pre-loop crash,
    # no active URLs, server restart). These are invisible to failed_screenshots
    # but must be counted in the success rate denominator.
    failed_rounds: int


class AdminUserRecord(BaseModel):
    id: int
    email: str
    full_name: str
    is_admin: bool
    employers: int
    positions: int
    screenshots: int
    created_at: str
    tier_id: Optional[int] = None
    tier_name: Optional[str] = None
    tier_expires_at: Optional[datetime] = None


# ── Organization admin schemas ──────────────────────────────

class AdminOrgMember(BaseModel):
    user_id: int
    user_name: str
    user_email: str
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class AdminOrgOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    owner_id: int
    owner_name: str
    owner_email: str
    member_count: int
    created_at: datetime
    members: list[AdminOrgMember] = []

    model_config = {"from_attributes": True}


# ── Subscription Tier admin schemas ─────────────────────────

class TierCreate(BaseModel):
    name: str
    display_name: str
    max_active_positions: int = 5
    max_urls_per_position: int = 7
    max_captures_per_month: int = 50
    min_capture_frequency_days: int = 7
    price_per_month: Optional[float] = None
    watermark_reports: bool = True


class TierUpdate(BaseModel):
    display_name: Optional[str] = None
    max_active_positions: Optional[int] = None
    max_urls_per_position: Optional[int] = None
    max_captures_per_month: Optional[int] = None
    min_capture_frequency_days: Optional[int] = None
    price_per_month: Optional[float] = None
    is_active: Optional[bool] = None
    watermark_reports: Optional[bool] = None


class AssignTierRequest(BaseModel):
    tier_id: Optional[int] = None  # None means revert to free
    tier_expires_at: Optional[datetime] = None


# ── Capture management admin schemas ────────────────────────

class AdminCaptureRoundRecord(BaseModel):
    round_id: int
    status: str
    scheduled_at: datetime
    captured_at: Optional[datetime] = None
    updated_at: datetime
    position_title: str
    employer_name: str
    user_email: str
    user_id: int
    employer_id: int
    position_id: int
    failed_results: int
    total_results: int
    error_sample: Optional[str] = None
    failure_categories: List[str] = []
    proxy_used: bool = False
    profile_ids: List[str] = []
    modal_detected: bool = False
    modal_remaining: bool = False
    modal_actions_clicked: int = 0
    modal_actions_hidden: int = 0
    auto_retry_count: int = 0
    has_manual_uploads: bool = False


class AdminCaptureListResponse(BaseModel):
    rounds: List[AdminCaptureRoundRecord]
    total: int
