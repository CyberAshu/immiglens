from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class SubscriptionTierOut(BaseModel):
    id: int
    name: str
    display_name: str
    max_active_positions: int
    max_urls_per_position: int
    max_captures_per_month: int
    min_capture_frequency_days: int
    price_per_month: Optional[float] = None
    stripe_product_id: Optional[str] = None
    stripe_price_id: Optional[str] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UsageSummary(BaseModel):
    """Current user's tier + consumption counters for the current month."""
    tier: SubscriptionTierOut
    active_positions_used: int
    captures_this_month: int
    has_billing_account: bool = False  # True when user has a stripe_customer_id
