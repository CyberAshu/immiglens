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
    verify_password,
)
from app.models.otp import OTPRecord
from app.models.trusted_device import TrustedDevice
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    OTPVerifyRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_OTP_ATTEMPTS = 5


# ── OTP helpers ─────────────────────────────────────────────────────────────────

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
        # Development fallback: print to console
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


# ── Routes ───────────────────────────────────────────────────────────────────────

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

    # ── Trusted-device fast path ───────────────────────
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
            logger.info("Trusted device login for %s", payload.email)
            return TokenResponse(access_token=create_access_token(user.id))
        logger.info("Device token invalid/expired for %s, requiring OTP", payload.email)

    # ── Normal OTP flow ────────────────────────────────
    # Invalidate any prior OTPs for this user
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

    # Brute-force guard
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

    # ── Trusted-device token ────────────────────────────
    raw_device_token: str | None = None
    if payload.remember_device:
        raw_device_token = secrets.token_hex(32)  # 64-char hex, 256 bits entropy
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
