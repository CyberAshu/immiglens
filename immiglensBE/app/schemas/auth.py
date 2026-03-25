from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator


def _normalize_email(v: str) -> str:
    return v.strip().lower()


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return _normalize_email(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_token: str | None = None  # if present, skip OTP for trusted device

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return _normalize_email(v)


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str
    remember_device: bool = False

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return _normalize_email(v)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return _normalize_email(v)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    email: str
    full_name: str
    is_admin: bool = False
    tier_expires_at: Optional[datetime] = None
    created_at: datetime


class UpdateProfileRequest(BaseModel):
    full_name: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TrustedDeviceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    device_name: Optional[str] = None
    browser: Optional[str] = None
    os: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    last_used_at: Optional[datetime] = None
