import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import Base, engine
from app.models import *
from app.routers.admin import router as admin_router
from app.routers.audit_logs import router as audit_logs_router
from app.routers.auth import router as auth_router
from app.routers.captures import router as captures_router
from app.routers.change_detection import router as changes_router
from app.routers.employers import router as employers_router
from app.routers.notifications import router as notifications_router
from app.routers.organizations import router as organizations_router
from app.routers.positions import router as positions_router
from app.routers.reports import router as reports_router
from app.routers.screenshots import router as screenshots_router
from app.routers.stats import router as stats_router
from app.routers.subscriptions import router as subscriptions_router
from app.core.database import AsyncSessionLocal
from app.services.browser import browser_manager
from app.services.job_store import store
from app.services.scheduler import scheduler


_DEFAULT_TIERS = [
    {
        "name": "free",
        "display_name": "Free",
        "max_employers": 3,
        "max_positions_per_employer": 5,
        "max_postings_per_position": 10,
        "max_captures_per_month": 50,
    },
    {
        "name": "pro",
        "display_name": "Pro",
        "max_employers": 25,
        "max_positions_per_employer": 20,
        "max_postings_per_position": 50,
        "max_captures_per_month": 500,
    },
    {
        "name": "enterprise",
        "display_name": "Enterprise",
        "max_employers": -1,
        "max_positions_per_employer": -1,
        "max_postings_per_position": -1,
        "max_captures_per_month": -1,
    },
]


async def _seed_subscription_tiers() -> None:
    from sqlalchemy import select
    from app.models.subscription import SubscriptionTier

    async with AsyncSessionLocal() as db:
        for tier_data in _DEFAULT_TIERS:
            existing = (await db.execute(
                select(SubscriptionTier).where(SubscriptionTier.name == tier_data["name"])
            )).scalar_one_or_none()
            if not existing:
                db.add(SubscriptionTier(**tier_data))
        await db.commit()


async def _purge_loop() -> None:
    while True:
        await asyncio.sleep(600)
        store.purge_expired()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await _seed_subscription_tiers()

    for d in [settings.SCREENSHOTS_DIR, settings.DOCUMENTS_DIR, settings.REPORTS_DIR]:
        Path(d).mkdir(parents=True, exist_ok=True)

    await browser_manager.start()
    scheduler.start()
    purge_task = asyncio.create_task(_purge_loop())

    yield

    purge_task.cancel()
    scheduler.shutdown(wait=False)
    await browser_manager.stop()


app = FastAPI(title="ImmigLens API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(stats_router)
app.include_router(employers_router)
app.include_router(positions_router)
app.include_router(captures_router)
app.include_router(reports_router)
app.include_router(screenshots_router)
app.include_router(audit_logs_router)
app.include_router(notifications_router)
app.include_router(organizations_router)
app.include_router(subscriptions_router)
app.include_router(changes_router)
app.include_router(screenshots_router)

Path(settings.SCREENSHOTS_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/screenshots", StaticFiles(directory=settings.SCREENSHOTS_DIR), name="screenshots")
