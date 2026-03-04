import base64
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from playwright.async_api import async_playwright

from app.core.config import settings
from app.models.capture import CaptureRound
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.report import ReportDocument

_template_dir = Path(__file__).parent.parent / "templates"
_jinja_env = Environment(loader=FileSystemLoader(str(_template_dir)))

_BASE_DIR = Path(__file__).parent.parent.parent  # immiglensBE/


def _safe_filename(text: str) -> str:
    return re.sub(r"[^\w\-]", "_", text).strip("_")[:60]


def _screenshot_to_data_uri(path: str | None) -> str | None:
    """Read a screenshot file and return a base64 data URI, or None if unavailable."""
    if not path:
        return None
    p = Path(path)
    if not p.is_absolute():
        p = (_BASE_DIR / path).resolve()
    if not p.exists():
        return None
    data = base64.b64encode(p.read_bytes()).decode()
    return f"data:image/png;base64,{data}"


async def build_pdf(
    employer: Employer,
    position: JobPosition,
    capture_rounds: list[CaptureRound],
    report_documents: list[ReportDocument],
) -> Path:
    # Pre-compute base64 data URIs keyed by capture result id
    screenshot_data: dict[int, str | None] = {}
    for round_ in capture_rounds:
        for result in round_.results:
            screenshot_data[result.id] = _screenshot_to_data_uri(result.screenshot_path)

    # Per-platform statistics for the summary table
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

    template = _jinja_env.get_template("report.html")
    html_str = template.render(
        employer=employer,
        position=position,
        capture_rounds=capture_rounds,
        report_documents=report_documents,
        screenshot_data=screenshot_data,
        platform_stats=platform_stats,
        recruitment_end=recruitment_end,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    )

    output_dir = (_BASE_DIR / settings.REPORTS_DIR).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = int(datetime.now(timezone.utc).timestamp())
    safe_name = _safe_filename(f"{employer.business_name}_{position.job_title}")
    pdf_path = output_dir / f"{safe_name}_{timestamp}.pdf"

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_content(html_str, wait_until="networkidle")
        pdf_bytes = await page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "20mm", "bottom": "20mm", "left": "15mm", "right": "15mm"},
        )
        await browser.close()

    pdf_path.write_bytes(pdf_bytes)
    return pdf_path
