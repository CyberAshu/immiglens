from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class PromotionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    code: Optional[str] = None       # auto-generated if blank (e.g. "LAUNCH30")
    discount_type: str               # "percent" | "fixed"
    discount_value: float
    duration: str = "forever"        # "forever" | "once" | "repeating"
    duration_in_months: Optional[int] = None
    max_redemptions: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    show_on_pricing_page: bool = False

    @field_validator("discount_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("percent", "fixed"):
            raise ValueError("discount_type must be 'percent' or 'fixed'")
        return v

    @field_validator("duration")
    @classmethod
    def validate_duration(cls, v: str) -> str:
        if v not in ("forever", "once", "repeating"):
            raise ValueError("duration must be 'forever', 'once', or 'repeating'")
        return v

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip().upper()
            if not v:
                return None
        return v


class PromotionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_redemptions: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: Optional[bool] = None
    show_on_pricing_page: Optional[bool] = None


class PromotionOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    code: str
    show_on_pricing_page: bool
    stripe_coupon_id: Optional[str] = None
    discount_type: str
    discount_value: float
    duration: str
    duration_in_months: Optional[int] = None
    max_redemptions: Optional[int] = None
    redemptions_count: int
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    remaining: Optional[int] = None  # computed: max_redemptions - redemptions_count

    model_config = {"from_attributes": True}


class ActivePromotionPublic(BaseModel):
    """Public view of a promotion shown on the pricing page."""
    id: int
    name: str
    description: Optional[str] = None
    code: str
    discount_type: str
    discount_value: float
    duration: str
    duration_in_months: Optional[int] = None
    max_redemptions: Optional[int] = None
    redemptions_count: int
    remaining: Optional[int] = None
    valid_until: Optional[datetime] = None


class PromoCodeValidation(BaseModel):
    """Returned when a user validates a promo code before checkout."""
    id: int
    name: str
    description: Optional[str] = None
    code: str
    discount_type: str
    discount_value: float
    duration: str
    duration_in_months: Optional[int] = None
    remaining: Optional[int] = None
    valid_until: Optional[datetime] = None
