import hashlib
import logging
import secrets
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.security import (
    create_access_token,
    create_user,
    get_user_by_email,
    hash_password,
    verify_password,
)
from app.models.otp import OTPRecord
from app.models.password_reset import PasswordResetToken
from app.models.trusted_device import TrustedDevice
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    OTPVerifyRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_OTP_ATTEMPTS = 5



def _generate_otp() -> str:
    """6-digit OTP using a cryptographically secure RNG."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_token(value: str) -> str:
    """SHA-256 hex digest — used for both OTP and device token hashing."""
    return hashlib.sha256(value.encode()).hexdigest()


def _verify_token(value: str, stored_hash: str) -> bool:
    return secrets.compare_digest(_hash_token(value), stored_hash)


def _send_otp_email(to_email: str, otp: str) -> None:
    if not settings.SMTP_HOST:
        print(f"[DEV OTP] {to_email} → {otp}")
        return
    msg = MIMEText(
        f"Your ImmigLens verification code is: {otp}\n\n"
        f"This code expires in {settings.OTP_EXPIRE_MINUTES} minutes.\n"
        f"Do not share this code with anyone."
    )
    msg["Subject"] = "ImmigLens – Your login verification code"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    ctx = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls(context=ctx)
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)



def _send_reset_email(to_email: str, reset_url: str) -> None:
    if not settings.SMTP_HOST:
        print(f"[DEV RESET] {to_email} → {reset_url}")
        return
    msg = MIMEText(
        f"You requested a password reset for your ImmigLens account.\n\n"
        f"Click the link below to set a new password:\n{reset_url}\n\n"
        f"This link expires in {settings.PASSWORD_RESET_EXPIRE_HOURS} hour(s).\n"
        f"If you did not request this, you can safely ignore this email."
    )
    msg["Subject"] = "ImmigLens – Reset your password"
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    ctx = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls(context=ctx)
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


@router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")
    user = await create_user(db, payload.email, payload.password, payload.full_name)
    return user


@router.post("/login", status_code=200)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Step 1 – verify credentials.
    If a valid trusted-device token is supplied, skip OTP and return JWT directly.
    Otherwise dispatch a one-time code to the Gmail.
    """
    user = await get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    if payload.device_token:
        now = datetime.now(timezone.utc)
        token_hash = _hash_token(payload.device_token)
        td_result = await db.execute(
            select(TrustedDevice).where(
                TrustedDevice.user_id == user.id,
                TrustedDevice.token_hash == token_hash,
                TrustedDevice.expires_at > now,
            )
        )
        trusted = td_result.scalar_one_or_none()
        if trusted:
            trusted.expires_at = now + timedelta(days=settings.TRUSTED_DEVICE_DAYS)
            await db.execute(
                delete(TrustedDevice).where(
                    TrustedDevice.user_id == user.id,
                    TrustedDevice.expires_at <= now,
                )
            )
            await db.commit()
            logger.info("Trusted device login for %s", payload.email)
            return TokenResponse(access_token=create_access_token(user.id))
        logger.info("Device token invalid/expired for %s, requiring OTP", payload.email)

    await db.execute(delete(OTPRecord).where(OTPRecord.user_id == user.id))

    otp = _generate_otp()
    db.add(
        OTPRecord(
            user_id=user.id,
            otp_hash=_hash_token(otp),
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        )
    )
    await db.commit()

    logger.debug("OTP generated for %s", payload.email)
    try:
        _send_otp_email(payload.email, otp)
        logger.info("OTP email dispatched to %s", payload.email)
    except Exception as exc:
        logger.warning("OTP email send failed for %s: %s", payload.email, exc)

    return {"message": "A verification code has been sent to your email."}


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    payload: OTPVerifyRequest, db: AsyncSession = Depends(get_db)
):
    """Step 2 – validate the OTP and return a JWT access token."""
    user = await get_user_by_email(db, payload.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code.")

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(OTPRecord)
        .where(
            OTPRecord.user_id == user.id,
            OTPRecord.used == False,  # noqa: E712
            OTPRecord.expires_at > now,
        )
        .order_by(OTPRecord.created_at.desc())
    )
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=401, detail="Invalid or expired verification code.")

    if record.attempts >= MAX_OTP_ATTEMPTS:
        await db.execute(delete(OTPRecord).where(OTPRecord.id == record.id))
        await db.commit()
        raise HTTPException(
            status_code=429, detail="Too many attempts. Please sign in again."
        )

    if not _verify_token(payload.otp, record.otp_hash):
        record.attempts += 1
        await db.commit()
        remaining = MAX_OTP_ATTEMPTS - record.attempts
        raise HTTPException(
            status_code=401,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
        )

    record.used = True

    raw_device_token: str | None = None
    if payload.remember_device:
        raw_device_token = secrets.token_hex(32)
        db.add(
            TrustedDevice(
                user_id=user.id,
                token_hash=_hash_token(raw_device_token),
                expires_at=now + timedelta(days=settings.TRUSTED_DEVICE_DAYS),
            )
        )
        logger.info("Trusted device registered for %s", payload.email)

    await db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id),
        device_token=raw_device_token,
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password", status_code=200)
async def forgot_password(
    payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """Send a password-reset link to the user's email.
    Always returns success to prevent email enumeration.
    """
    _GENERIC_MSG = {"message": "If that email is registered, a reset link has been sent."}

    user = await get_user_by_email(db, payload.email)
    if not user:
        return _GENERIC_MSG

    # Invalidate any existing reset tokens for this user
    await db.execute(
        delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    )

    raw_token = secrets.token_hex(32)  # 64 hex chars, URL-safe
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(hours=settings.PASSWORD_RESET_EXPIRE_HOURS),
        )
    )
    await db.commit()

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
    logger.debug("Password reset token generated for %s", payload.email)
    try:
        _send_reset_email(payload.email, reset_url)
        logger.info("Password reset email dispatched to %s", payload.email)
    except Exception as exc:
        logger.warning("Password reset email failed for %s: %s", payload.email, exc)

    return _GENERIC_MSG


@router.post("/reset-password", status_code=200)
async def reset_password(
    payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)
):
    """Validate the reset token and update the user's password."""
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")

    token_hash = _hash_token(payload.token)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.expires_at > now,
        )
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link. Please request a new one.")

    user = await db.get(User, record.user_id)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    user.hashed_password = hash_password(payload.new_password)

    # Consume the token and clear all trusted devices (security: force re-auth)
    await db.execute(
        delete(PasswordResetToken).where(PasswordResetToken.user_id == record.user_id)
    )
    await db.execute(
        delete(TrustedDevice).where(TrustedDevice.user_id == record.user_id)
    )
    await db.commit()

    logger.info("Password reset completed for user_id=%s", record.user_id)
    return {"message": "Password updated successfully. You can now sign in."}

