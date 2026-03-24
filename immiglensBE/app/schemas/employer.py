from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


class EmployerCreate(BaseModel):
    business_name: str
    address: str
    contact_person: str
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    business_number: Optional[str] = None

    @field_validator("business_name", "address", "contact_person", mode="before")
    @classmethod
    def required_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("This field cannot be empty")
        return v.strip()

    @field_validator("business_number")
    @classmethod
    def business_number_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        digits = v.strip().replace("-", "").replace(" ", "")
        if digits and not digits.isdigit():
            raise ValueError("Business Number must contain only digits")
        if digits and len(digits) != 9:
            raise ValueError("Business Number must be exactly 9 digits")
        return digits or None


class EmployerUpdate(BaseModel):
    business_name: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    business_number: Optional[str] = None


class EmployerOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    business_name: str
    address: str
    contact_person: str
    contact_email: Optional[str]
    contact_phone: Optional[str]
    business_number: Optional[str]
    is_active: bool
    created_at: datetime
