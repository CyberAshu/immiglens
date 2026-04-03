import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
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
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    OTPVerifyRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    TrustedDeviceOut,
    UpdateProfileRequest,
    UserOut,
)
from app.services.email_service import (
    send_otp_email,
    send_password_reset_email,
    send_welcome_email,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_OTP_ATTEMPTS = 5
_DEVICE_COOKIE = "device_id"


def _parse_user_agent(ua_string: str | None) -> tuple[str, str, str]:
    """Parse a User-Agent header into (browser, os, device_name).
    Returns human-readable strings like ('Chrome 123', 'Windows 10/11', 'Chrome 123 on Windows 10/11').
    No external library required.
    """
    if not ua_string:
        return "Unknown Browser", "Unknown OS", "Unknown Device"

    ua = ua_string

    if re.search(r"Edg[eA]?/", ua):
        m = re.search(r"Edg[eA]?/(\d+)", ua)
        browser = f"Edge {m.group(1)}" if m else "Edge"
    elif "OPR/" in ua or "Opera/" in ua:
        m = re.search(r"(?:OPR|Opera)/(\d+)", ua)
        browser = f"Opera {m.group(1)}" if m else "Opera"
    elif "Chrome/" in ua:
        m = re.search(r"Chrome/(\d+)", ua)
        browser = f"Chrome {m.group(1)}" if m else "Chrome"
    elif "Firefox/" in ua:
        m = re.search(r"Firefox/(\d+)", ua)
        browser = f"Firefox {m.group(1)}" if m else "Firefox"
    elif "Safari/" in ua:
        m = re.search(r"Version/(\d+)", ua)
        browser = f"Safari {m.group(1)}" if m else "Safari"
    else:
        browser = "Unknown Browser"

    if "Windows NT 10.0" in ua:
        os_name = "Windows 10/11"
    elif "Windows NT 6.3" in ua:
        os_name = "Windows 8.1"
    elif "Windows NT 6.1" in ua:
        os_name = "Windows 7"
    elif "Windows" in ua:
        os_name = "Windows"
    elif "iPhone" in ua:
        m = re.search(r"iPhone OS ([\d_]+)", ua)
        os_name = f"iOS {m.group(1).replace('_', '.')}" if m else "iOS"
    elif "iPad" in ua:
        os_name = "iPadOS"
    elif "Android" in ua:
        m = re.search(r"Android ([\d.]+)", ua)
        os_name = f"Android {m.group(1)}" if m else "Android"
    elif "Mac OS X" in ua:
        m = re.search(r"Mac OS X ([\d_]+)", ua)
        ver = m.group(1).replace("_", ".") if m else ""
        os_name = f"macOS {ver}" if ver else "macOS"
    elif "Linux" in ua or "X11" in ua:
        os_name = "Linux"
    else:
        os_name = "Unknown OS"

    return browser, os_name, f"{browser} on {os_name}"


def _get_client_ip(request: Request) -> str:
    """Extract the real client IP, accounting for nginx/proxy X-Forwarded-For."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "0.0.0.0"


def _generate_otp() -> str:
    """6-digit OTP using a cryptographically secure RNG."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_token(value: str) -> str:
    """SHA-256 hex digest — used for both OTP and device token hashing."""
    return hashlib.sha256(value.encode()).hexdigest()


def _verify_token(value: str, stored_hash: str) -> bool:
    return secrets.compare_digest(_hash_token(value), stored_hash)





@router.post("/register", response_model=UserOut, status_code=201)
async def register(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")
    user = await create_user(
        db,
        payload.email,
        payload.password,
        payload.full_name,
        terms_accepted=payload.accept_terms,
        privacy_accepted=payload.accept_privacy,
        acceptable_use_accepted=payload.accept_acceptable_use,
    )
    try:
        await send_welcome_email(
            user.email,
            user.full_name or "there",
            settings.TRIAL_DAYS,
        )
    except Exception:
        logger.warning("Welcome email failed for user_id=%s", user.id)
    return user


@router.post("/login", status_code=200)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Step 1 – verify credentials.
    Checks HttpOnly cookie first, then body device_token (backward compat).
    If a valid trusted-device token is found, skip OTP and return JWT directly.
    Otherwise dispatch a one-time code to the user's email.
    """
    user = await get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    candidate_token = request.cookies.get(_DEVICE_COOKIE) or payload.device_token
    if candidate_token:
        now = datetime.now(timezone.utc)
        token_hash = _hash_token(candidate_token)
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
            trusted.last_used_at = now
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
        await send_otp_email(payload.email, user.full_name or "there", otp)
        logger.info("OTP email dispatched to %s", payload.email)
    except Exception as exc:
        logger.warning("OTP email send failed for %s: %s", payload.email, exc)

    return {"message": "A verification code has been sent to your email."}


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    payload: OTPVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
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

    if payload.remember_device:
        raw_device_token = secrets.token_hex(32)
        ua = request.headers.get("user-agent")
        browser, os_name, device_name = _parse_user_agent(ua)
        ip = _get_client_ip(request)
        db.add(
            TrustedDevice(
                user_id=user.id,
                token_hash=_hash_token(raw_device_token),
                device_name=device_name,
                browser=browser,
                os=os_name,
                ip_address=ip,
                expires_at=now + timedelta(days=settings.TRUSTED_DEVICE_DAYS),
            )
        )
        is_secure = settings.FRONTEND_URL.startswith("https")
        response.set_cookie(
            key=_DEVICE_COOKIE,
            value=raw_device_token,
            max_age=settings.TRUSTED_DEVICE_DAYS * 86400,
            httponly=True,
            secure=is_secure,
            samesite="strict",
            path="/",
        )
        logger.info("Trusted device registered for %s (browser=%s, os=%s, ip=%s)", payload.email, browser, os_name, ip)

    await db.commit()

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
async def update_profile(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's display name."""
    full_name = payload.full_name.strip()
    if not full_name:
        raise HTTPException(status_code=422, detail="Full name cannot be empty.")
    current_user.full_name = full_name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.patch("/change-password", status_code=200)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change password for the currently authenticated user."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=422, detail="New password must be at least 8 characters.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=422, detail="New password must differ from the current password.")
    current_user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    logger.info("Password changed for user_id=%s", current_user.id)
    return {"message": "Password updated successfully."}


@router.get("/trusted-devices", response_model=list[TrustedDeviceOut])
async def list_trusted_devices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active trusted devices for the current user."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(TrustedDevice).where(
            TrustedDevice.user_id == current_user.id,
            TrustedDevice.expires_at > now,
        ).order_by(TrustedDevice.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/trusted-devices", status_code=200)
async def revoke_all_trusted_devices(
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke ALL trusted devices for the current user and clear the device cookie."""
    await db.execute(
        delete(TrustedDevice).where(TrustedDevice.user_id == current_user.id)
    )
    await db.commit()
    response.delete_cookie(_DEVICE_COOKIE, path="/")
    logger.info("All trusted devices revoked for user_id=%s", current_user.id)
    return {"message": "All devices revoked."}


@router.delete("/trusted-devices/{device_id}", status_code=200)
async def revoke_trusted_device(
    device_id: int,
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a specific trusted device belonging to the current user."""
    result = await db.execute(
        select(TrustedDevice).where(
            TrustedDevice.id == device_id,
            TrustedDevice.user_id == current_user.id,
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found.")
    cookie_token = request.cookies.get(_DEVICE_COOKIE)
    if cookie_token and _hash_token(cookie_token) == device.token_hash:
        response.delete_cookie(_DEVICE_COOKIE, path="/")
    await db.delete(device)
    await db.commit()
    return {"message": "Device revoked."}


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

    await db.execute(
        delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
    )

    raw_token = secrets.token_hex(32)
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
        await send_password_reset_email(
            payload.email,
            user.full_name or "there",
            reset_url,
            requested_at=datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC"),
        )
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

    await db.execute(
        delete(PasswordResetToken).where(PasswordResetToken.user_id == record.user_id)
    )
    await db.execute(
        delete(TrustedDevice).where(TrustedDevice.user_id == record.user_id)
    )
    await db.commit()

    logger.info("Password reset completed for user_id=%s", record.user_id)
    return {"message": "Password updated successfully. You can now sign in."}

