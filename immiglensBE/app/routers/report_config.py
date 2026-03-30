from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.report_config import DEFAULT_CONFIG, ReportConfig
from app.models.user import User
from app.routers.admin import require_admin
from app.schemas.report_config import ReportConfigOut, ReportConfigUpdate
from app.services.pdf import render_report_html

router = APIRouter(prefix="/api/admin/report-config", tags=["admin"])

# Read-only config endpoint available to all authenticated users
client_router = APIRouter(prefix="/api/report-config", tags=["report-config"])


@client_router.get("", response_model=ReportConfigOut)
async def get_report_config_client(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await _get_or_create(db)


async def _get_or_create(db: AsyncSession) -> ReportConfig:
    row = (await db.execute(select(ReportConfig).limit(1))).scalar_one_or_none()
    if row is None:
        row = ReportConfig(config=DEFAULT_CONFIG)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row

    # Inject any new default blocks that are missing from the saved config
    existing_types = {b["type"] for b in row.config.get("blocks", [])}
    missing = [b for b in DEFAULT_CONFIG["blocks"] if b["type"] not in existing_types]
    if missing:
        merged = list(row.config.get("blocks", [])) + missing
        row.config = {**row.config, "blocks": merged}
        row.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(row)

    return row


@router.get("", response_model=ReportConfigOut)
async def get_report_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return await _get_or_create(db)


@router.patch("", response_model=ReportConfigOut)
async def update_report_config(
    body: ReportConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    row = await _get_or_create(db)
    row.config = body.config
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/reset", response_model=ReportConfigOut)
async def reset_report_config(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    row = await _get_or_create(db)
    row.config = DEFAULT_CONFIG
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/preview", response_class=HTMLResponse)
async def preview_report(
    body: ReportConfigUpdate,
    _: User = Depends(require_admin),
):
    """Render the report template with sample data and return HTML for preview."""
    html = render_report_html(_dummy_context(body.config))
    return HTMLResponse(content=html)


def _dummy_context(config: dict[str, Any]) -> dict[str, Any]:
    from datetime import date, timedelta

    posting = SimpleNamespace(
        id=1,
        platform="Indeed",
        url="https://ca.indeed.com/viewjob?jk=abc123",
        job_position_id=1,
    )
    position = SimpleNamespace(
        id=1,
        job_title="Software Engineer",
        noc_code="21231",
        wage_stream="High-wage",
        wage="$45/hr",
        work_location="Toronto, ON",
        num_positions=2,
        start_date=date.today() - timedelta(days=30),
        capture_frequency_days=7,
        job_urls=[posting],
    )
    employer = SimpleNamespace(
        business_name="Acme Corp Ltd.",
        business_number="123456789",
        address="100 King St W, Toronto, ON M5X 1A1",
        contact_person="Jane Smith",
        contact_email="jane@acmecorp.com",
        contact_phone="+1 416-555-0100",
    )
    now = datetime.now(timezone.utc)
    result1 = SimpleNamespace(
        id=1, job_url_id=1, status="done", duration_ms=1200, error=None, page_pdf_url=None,
    )
    result2 = SimpleNamespace(
        id=2, job_url_id=1, status="done", duration_ms=980, error=None, page_pdf_url=None,
    )
    round1 = SimpleNamespace(
        id=1,
        scheduled_at=now - timedelta(days=14),
        captured_at=now - timedelta(days=14),
        status="completed",
        results=[result1],
    )
    round2 = SimpleNamespace(
        id=2,
        scheduled_at=now - timedelta(days=7),
        captured_at=now - timedelta(days=7),
        status="completed",
        results=[result2],
    )
    platform_stats = {
        1: {
            "count": 2,
            "first": now - timedelta(days=14),
            "last": now - timedelta(days=7),
        }
    }
    return dict(
        employer=employer,
        position=position,
        capture_rounds=[round1, round2],
        report_documents=[],
        platform_stats=platform_stats,
        recruitment_end=position.start_date + timedelta(days=28),
        generated_at=now.strftime("%Y-%m-%d %H:%M UTC"),
        config=config,
    )
