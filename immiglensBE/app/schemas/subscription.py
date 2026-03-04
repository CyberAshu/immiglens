from datetime import datetime
from pydantic import BaseModel, field_validator


class SubscriptionTierOut(BaseModel):
    id: int
    name: str
    display_name: str
    max_employers: int
    max_positions_per_employer: int
    max_postings_per_position: int
    max_captures_per_month: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageSummary(BaseModel):
    """Current user's tier + consumption counters for the current month."""
    tier: SubscriptionTierOut
    employers_used: int
    captures_this_month: int
    positions_used: int   # across all employers
