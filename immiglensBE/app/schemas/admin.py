from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AdminGlobalStats(BaseModel):
    total_users: int
    total_employers: int
    total_positions: int
    total_job_postings: int
    total_capture_rounds: int
    completed_rounds: int
    pending_rounds: int
    total_screenshots: int
    failed_screenshots: int


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
    max_employers: int = 3
    max_positions_per_employer: int = 5
    max_postings_per_position: int = 10
    max_captures_per_month: int = 50
    min_capture_frequency_days: int = 7


class TierUpdate(BaseModel):
    display_name: Optional[str] = None
    max_employers: Optional[int] = None
    max_positions_per_employer: Optional[int] = None
    max_postings_per_position: Optional[int] = None
    max_captures_per_month: Optional[int] = None
    min_capture_frequency_days: Optional[int] = None
    is_active: Optional[bool] = None


class AssignTierRequest(BaseModel):
    tier_id: Optional[int] = None  # None means revert to free
