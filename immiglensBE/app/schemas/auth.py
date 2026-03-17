from datetime import datetime

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


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    device_token: str | None = None  # only set when remember_device=True


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    email: str
    full_name: str
    is_admin: bool = False
    created_at: datetime
