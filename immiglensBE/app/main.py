import asyncio
import sys
from contextlib import asynccontextmanager

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
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
from app.routers.report_config import router as report_config_router
from app.routers.report_config import client_router as report_config_client_router
from app.routers.noc_codes import router as noc_codes_router
from app.routers.noc_codes import admin_router as admin_noc_codes_router
from app.routers.billing import router as billing_router
from app.routers.promotions import router as promotions_router
from apscheduler.triggers.cron import CronTrigger
from app.services.browser import browser_manager
from app.services.job_store import store
from app.services.scheduler import scheduler, recover_pending_rounds, recover_stuck_rounds, _expire_subscriptions_job


async def _purge_loop() -> None:
    while True:
        await asyncio.sleep(600)
        store.purge_expired()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is managed exclusively by Alembic migrations.
    # Run `alembic upgrade head` before starting the server.
    await browser_manager.start()
    scheduler.start()
    await recover_pending_rounds()
    # Daily job: expire paid tiers and deactivate positions
    scheduler.add_job(
        _expire_subscriptions_job,
        trigger=CronTrigger(hour=0, minute=5, timezone="UTC"),
        id="expire_subscriptions",
        replace_existing=True,
    )
    # Every 30 min: detect and reset rounds stuck in RUNNING state
    scheduler.add_job(
        recover_stuck_rounds,
        trigger=CronTrigger(minute="*/30"),
        id="recover_stuck_rounds",
        replace_existing=True,
    )
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
app.include_router(report_config_router)
app.include_router(report_config_client_router)
app.include_router(noc_codes_router)
app.include_router(admin_noc_codes_router)
app.include_router(billing_router)
app.include_router(promotions_router)

