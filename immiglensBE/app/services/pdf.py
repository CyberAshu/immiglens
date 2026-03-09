import io
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from jinja2 import Environment, FileSystemLoader
from playwright.async_api import async_playwright
from pypdf import PdfReader, PdfWriter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.capture import CaptureRound
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.report import ReportDocument
from app.services import storage

_template_dir = Path(__file__).parent.parent / "templates"
_jinja_env = Environment(loader=FileSystemLoader(str(_template_dir)))


def _safe_filename(text: str) -> str:
    return re.sub(r"[^\w\-]", "_", text).strip("_")[:60]


def render_report_html(context: dict[str, Any]) -> str:
    """Render the report.html Jinja2 template with the given context dict."""
    template = _jinja_env.get_template("report.html")
    return template.render(**context)


async def _load_config(db: AsyncSession) -> dict:
    """Load active report config from DB, falling back to defaults."""
    from app.models.report_config import DEFAULT_CONFIG, ReportConfig
    row = (await db.execute(select(ReportConfig).limit(1))).scalar_one_or_none()
    return row.config if row is not None else DEFAULT_CONFIG


async def _html_to_pdf_bytes(html: str) -> bytes:
    """Render an HTML string to PDF bytes via Playwright headless Chromium."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_content(html, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "18mm", "bottom": "18mm", "left": "15mm", "right": "15mm"},
        )
        await browser.close()
    return pdf_bytes


async def _fetch_pdf_bytes(url: str) -> bytes | None:
    """Download PDF bytes from a URL (Supabase public URL)."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url)
        return r.content if r.status_code == 200 else None
    except Exception:
        return None


def _make_evidence_separator(
    employer_name: str,
    position_title: str,
    platform: str,
    url: str,
    round_number: int,
    captured_at: datetime | None,
    status: str,
) -> str:
    """Generate a minimal HTML separator page shown before each captured page PDF."""
    date_str = captured_at.strftime("%B %d, %Y at %H:%M UTC") if captured_at else "—"
    status_color = {"done": "#155724", "failed": "#721c24"}.get(status, "#383d41")
    status_bg = {"done": "#d4edda", "failed": "#f8d7da"}.get(status, "#e2e3e5")
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body {{ font-family: Arial, sans-serif; color: #111; margin: 0; padding: 40px 50px; }}
  .stripe {{ height: 6px; background: #003087; margin-bottom: 30px; }}
  .label {{ font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px; }}
  .title {{ font-size: 20pt; font-weight: 700; color: #003087; margin-bottom: 4px; }}
  .sub {{ font-size: 11pt; color: #444; margin-bottom: 24px; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 10pt; }}
  td {{ padding: 8px 10px; border: 1px solid #c8d2e0; }}
  td:first-child {{ font-weight: 600; background: #eef2f8; width: 180px; color: #333; }}
  .badge {{ display:inline-block; padding: 2px 10px; border-radius: 3px; font-weight:700;
            font-size: 9pt; background: {status_bg}; color: {status_color}; }}
</style></head><body>
  <div class="stripe"></div>
  <div class="label">LMIA Recruitment Evidence — Capture #{round_number}</div>
  <div class="title">{platform}</div>
  <div class="sub">{employer_name} · {position_title}</div>
  <table>
    <tr><td>Platform</td><td>{platform}</td></tr>
    <tr><td>Job Posting URL</td><td style="word-break:break-all; color:#0050aa;">{url}</td></tr>
    <tr><td>Capture #</td><td>{round_number}</td></tr>
    <tr><td>Captured At</td><td>{date_str}</td></tr>
    <tr><td>Status</td><td><span class="badge">{status.upper()}</span></td></tr>
  </table>
</body></html>"""


async def build_pdf(
    employer: Employer,
    position: JobPosition,
    capture_rounds: list[CaptureRound],
    report_documents: list[ReportDocument],
    db: AsyncSession | None = None,
) -> str:
    # ── Per-platform statistics for the summary table ─────────────────────
    platform_stats: dict[int, dict] = {}
    for posting in position.job_postings:
        dates = []
        count = 0
        for round_ in capture_rounds:
            for result in round_.results:
                if result.job_posting_id == posting.id and result.status == "done":
                    count += 1
                    if round_.captured_at:
                        dates.append(round_.captured_at)
        platform_stats[posting.id] = {
            "count": count,
            "first": min(dates) if dates else None,
            "last": max(dates) if dates else None,
        }

    recruitment_end = position.start_date + timedelta(days=settings.RECRUITMENT_PERIOD_DAYS)

    # ── Load report config from DB ────────────────────────────────────────
    from app.models.report_config import DEFAULT_CONFIG
    config = await _load_config(db) if db is not None else DEFAULT_CONFIG

    # ── Render main report HTML → PDF ─────────────────────────────────────
    html_str = render_report_html(dict(
        employer=employer,
        position=position,
        capture_rounds=capture_rounds,
        report_documents=report_documents,
        platform_stats=platform_stats,
        recruitment_end=recruitment_end,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        config=config,
    ))
    main_pdf_bytes = await _html_to_pdf_bytes(html_str)

    # ── Assemble final PDF using pypdf ────────────────────────────────────
    writer = PdfWriter()

    # Add all pages from the main report
    main_reader = PdfReader(io.BytesIO(main_pdf_bytes))
    for page in main_reader.pages:
        writer.add_page(page)

    # For each posting, append: separator page + its captured print-PDFs
    for posting in position.job_postings:
        round_number = 0
        for round_ in capture_rounds:
            for result in round_.results:
                if result.job_posting_id != posting.id:
                    continue
                if result.status != "done" or not result.page_pdf_url:
                    continue

                round_number += 1

                # Separator page
                sep_html = _make_evidence_separator(
                    employer_name=employer.business_name,
                    position_title=position.job_title,
                    platform=posting.platform,
                    url=posting.url,
                    round_number=round_number,
                    captured_at=round_.captured_at,
                    status=result.status,
                )
                sep_bytes = await _html_to_pdf_bytes(sep_html)
                sep_reader = PdfReader(io.BytesIO(sep_bytes))
                for page in sep_reader.pages:
                    writer.add_page(page)

                # Actual captured print-PDF of the job posting page
                page_pdf_bytes = await _fetch_pdf_bytes(result.page_pdf_url)
                if page_pdf_bytes:
                    try:
                        posting_reader = PdfReader(io.BytesIO(page_pdf_bytes))
                        for page in posting_reader.pages:
                            writer.add_page(page)
                    except Exception:
                        pass  # skip corrupt PDFs gracefully

    # ── Write merged PDF and upload to Supabase ───────────────────────────
    output = io.BytesIO()
    writer.write(output)
    final_bytes = output.getvalue()

    timestamp = int(datetime.now(timezone.utc).timestamp())
    safe_name = _safe_filename(f"{employer.business_name}_{position.job_title}")
    pdf_key = f"{safe_name}_{timestamp}.pdf"
    pdf_url = await storage.upload("reports", pdf_key, final_bytes, "application/pdf")
    return pdf_url

