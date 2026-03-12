from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


def _normalize_gmail(v: str) -> str:
    normalized = v.strip().lower()
    if not normalized.endswith("@gmail.com"):
        raise ValueError("Only Gmail addresses (@gmail.com) are accepted.")
    return normalized


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    @field_validator("email", mode="before")
    @classmethod
    def validate_gmail(cls, v: str) -> str:
        return _normalize_gmail(v)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    device_token: str | None = None  # if present, skip OTP for trusted device

    @field_validator("email", mode="before")
    @classmethod
    def validate_gmail(cls, v: str) -> str:
        return _normalize_gmail(v)


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str
    remember_device: bool = False

    @field_validator("email", mode="before")
    @classmethod
    def validate_gmail(cls, v: str) -> str:
        return _normalize_gmail(v)


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
