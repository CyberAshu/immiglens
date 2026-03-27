from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
    ]

    DATABASE_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str

    MAX_CONCURRENT_SCREENSHOTS: int = 5
    PAGE_TIMEOUT_MS: int = 60_000
    NETWORK_IDLE_TIMEOUT_MS: int = 10_000
    JS_SETTLE_DELAY_S: float = 1.5
    MAX_URLS_PER_BATCH: int = 100
    JOB_MAX_AGE_S: int = 3_600

    RECRUITMENT_PERIOD_DAYS: int = 28
    ADMIN_ALERT_EMAIL: str = "immigera@gmail.com"
    STUCK_ROUND_TIMEOUT_MINUTES: int = 60

    # ── Email / SMTP ─────────────────────────────────────────────────────────
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@immiglens.com"
    SMTP_USE_TLS: bool = True

    # ── Invitation token expiry ───────────────────────────────────────────────
    INVITATION_EXPIRE_HOURS: int = 72

    # ── OTP ──────────────────────────────────────────────────────────────────────
    OTP_EXPIRE_MINUTES: int = 10

    # ── Trusted device ──────────────────────────────────────────────────────
    TRUSTED_DEVICE_DAYS: int = 30

    FRONTEND_URL: str = "http://35.183.11.44"
    PASSWORD_RESET_EXPIRE_HOURS: int = 1


settings = Settings()
