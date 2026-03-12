import base64
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


def _is_blank_page(page) -> bool:
    """Heuristic: a page with no text and no image XObjects is considered blank."""
    try:
        text = page.extract_text() or ""
        if len(text.strip()) > 10:
            return False
        resources = page.get("/Resources")
        if resources:
            xobjects = resources.get("/XObject")
            if xobjects and len(xobjects) > 0:
                return False  # has embedded images / form XObjects
        return True
    except Exception:
        return False


def render_report_html(context: dict[str, Any]) -> str:
    """Render the report.html Jinja2 template with the given context dict."""
    template = _jinja_env.get_template("report.html")
    return template.render(**context)


async def _load_config(db: AsyncSession) -> dict:
    """Load active report config from DB, falling back to defaults."""
    from app.models.report_config import DEFAULT_CONFIG, ReportConfig
    row = (await db.execute(select(ReportConfig).limit(1))).scalar_one_or_none()
    return row.config if row is not None else DEFAULT_CONFIG


async def _inline_external_images(html: str) -> str:
    """Fetch all external <img src="..."> URLs and replace them with base64 data URIs.

    Playwright's headless Chromium sometimes fails to load images from external
    origins (CORS restrictions, no session cookies, timing).  Embedding them
    inline guarantees they always appear in the generated PDF.
    """
    img_urls = re.findall(r'<img\b[^>]+\bsrc="(https?://[^"]+)"', html, re.IGNORECASE)
    if not img_urls:
        return html

    async with httpx.AsyncClient(timeout=30) as client:
        for url in dict.fromkeys(img_urls):  # unique, order-preserved
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    content_type = r.headers.get("content-type", "image/png").split(";")[0]
                    b64 = base64.b64encode(r.content).decode()
                    data_uri = f"data:{content_type};base64,{b64}"
                    html = html.replace(f'src="{url}"', f'src="{data_uri}"')
            except Exception:
                pass  # leave original URL as fallback
    return html


async def _html_to_pdf_bytes(html: str) -> bytes:
    """Render an HTML string to full A4 PDF bytes via Playwright headless Chromium."""
    html = await _inline_external_images(html)
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


async def _html_to_compact_pdf_bytes(html: str) -> bytes:
    """Render a short HTML snippet to a compact-height PDF (auto-sized to content)."""
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        # Render at A4 width, let height be determined by content
        await page.set_viewport_size({"width": 794, "height": 200})
        await page.set_content(html, wait_until="networkidle")
        # Measure actual content height
        content_height = await page.evaluate("document.body.scrollHeight")
        height_mm = max(30, int(content_height * 0.264583) + 10)  # px → mm + padding
        pdf_bytes = await page.pdf(
            width="210mm",
            height=f"{height_mm}mm",
            print_background=True,
            margin={"top": "6mm", "bottom": "6mm", "left": "15mm", "right": "15mm"},
        )
        await browser.close()
    return pdf_bytes


def _make_capture_header_html(
    section_title: str | None,
    platform: str | None,
    platform_url: str | None,
    capture_idx: int,
    captured_at: datetime | None,
    show_datetime: bool,
    posting_url: str,
) -> str:
    """Compact styled capture header rendered just before each captured PDF."""
    date_str = (
        f" &nbsp;&middot;&nbsp; {captured_at.strftime('%Y-%m-%d %H:%M UTC')}"
        if show_datetime and captured_at else ""
    )
    section_html = (
        f'<div class="section-heading">{section_title}</div>'
        if section_title else ""
    )
    platform_html = (
        f'<div class="platform-header">'
        f'<div class="pf-name">{platform}</div>'
        f'<div class="pf-url">{platform_url}</div>'
        f'</div>'
        if platform else ""
    )
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; }}
  .section-heading {{ font-size: 13pt; font-weight: 700; color: #fff; padding: 9px 14px;
    background: #003087; border-radius: 3px; margin-bottom: 12px; }}
  .platform-header {{ background: #003087; color: #fff; padding: 10px 14px;
    border-radius: 3px 3px 0 0; }}
  .pf-name {{ font-size: 12pt; font-weight: 700; }}
  .pf-url {{ font-size: 8.5pt; color: #b8cef0; word-break: break-all; margin-top: 2px; }}
  .capture-meta {{ background: #f0f4f8; padding: 8px 12px; font-size: 9pt;
    border: 1px solid #c8d2e0; border-top: none; }}
</style></head><body>
  {section_html}
  <div>
    {platform_html}
    <div class="capture-meta">
      <strong>Capture {capture_idx}</strong>{date_str}
      &nbsp;&middot;&nbsp; <span style="color:#0050aa;">{posting_url}</span>
    </div>
  </div>
</body></html>"""


async def _fetch_pdf_bytes(url: str) -> bytes | None:
    """Download PDF bytes from a URL (Supabase public URL)."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url)
        return r.content if r.status_code == 200 else None
    except Exception:
        return None


async def build_pdf(
    employer: Employer,
    position: JobPosition,
    capture_rounds: list[CaptureRound],
    report_documents: list[ReportDocument],
    db: AsyncSession | None = None,
    remove_blank_pages: bool = False,
    config_override: dict | None = None,
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

    # ── Load report config (client override takes priority over DB) ───────
    from app.models.report_config import DEFAULT_CONFIG
    if config_override is not None:
        config = config_override
    else:
        config = await _load_config(db) if db is not None else DEFAULT_CONFIG

    # ── Split documents by type ───────────────────────────────────────────
    job_match_docs = [d for d in report_documents if getattr(d, "doc_type", "supporting") == "job_match"]
    supporting_docs = [d for d in report_documents if getattr(d, "doc_type", "supporting") != "job_match"]

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # ── Shared context for all HTML renders ───────────────────────────────
    base_ctx = dict(
        employer=employer,
        position=position,
        capture_rounds=capture_rounds,
        report_documents=supporting_docs,
        job_match_docs=job_match_docs,
        platform_stats=platform_stats,
        recruitment_end=recruitment_end,
        generated_at=generated_at,
        preview_mode=False,
    )

    # ── Assemble final PDF block-by-block so attached PDFs sit immediately
    #    after their section — matching the preview's inline structure ──────
    writer = PdfWriter()

    async def _flush_html(block_list: list[dict]) -> None:
        """Render a batch of HTML-only blocks and add their pages to writer."""
        if not block_list:
            return
        html = render_report_html({**base_ctx, "config": {**config, "blocks": block_list}})
        pdf_bytes = await _html_to_pdf_bytes(html)
        for page in PdfReader(io.BytesIO(pdf_bytes)).pages:
            writer.add_page(page)

    async def _add_remote_pdf(url: str) -> None:
        data = await _fetch_pdf_bytes(url)
        if not data:
            return
        try:
            for page in PdfReader(io.BytesIO(data)).pages:
                writer.add_page(page)
        except Exception:
            pass

    # Walk blocks in config order.
    # HTML-only blocks are batched; attachment blocks flush the batch first,
    # render their own section HTML, then immediately insert their PDFs.
    pending: list[dict] = []
    _evidence_done = _job_match_done = _appendix_done = False

    for block in config.get("blocks", []):
        if not block.get("enabled", True):
            continue
        btype = block.get("type")

        if btype == "evidence" and not _evidence_done:
            await _flush_html(pending); pending = []
            # Per-capture interleaving: compact header page → actual captured PDF pages
            f = block.get("fields", {})
            show_dt = f.get("show_capture_datetime", True)
            section_title = block.get("title", "Per-Platform Advertising Evidence")
            is_first_of_section = True
            for posting in position.job_postings:
                is_first_of_platform = True
                cap_idx = 0
                for round_ in capture_rounds:
                    for result in round_.results:
                        if result.job_posting_id != posting.id:
                            continue
                        if result.status != "done" or not result.page_pdf_url:
                            continue
                        cap_idx += 1
                        hdr_html = _make_capture_header_html(
                            section_title=section_title if is_first_of_section else None,
                            platform=posting.platform if is_first_of_platform else None,
                            platform_url=posting.url if is_first_of_platform else None,
                            capture_idx=cap_idx,
                            captured_at=round_.captured_at,
                            show_datetime=show_dt,
                            posting_url=posting.url,
                        )
                        hdr_bytes = await _html_to_compact_pdf_bytes(hdr_html)
                        for page in PdfReader(io.BytesIO(hdr_bytes)).pages:
                            writer.add_page(page)
                        await _add_remote_pdf(result.page_pdf_url)
                        is_first_of_section = False
                        is_first_of_platform = False
            _evidence_done = True

        elif btype == "job_match_activity" and not _job_match_done:
            await _flush_html(pending); pending = []
            await _flush_html([block])
            for jm_doc in job_match_docs:
                await _add_remote_pdf(jm_doc.stored_path)
            _job_match_done = True

        elif btype == "appendix" and not _appendix_done:
            await _flush_html(pending); pending = []
            await _flush_html([block])
            for doc in supporting_docs:
                await _add_remote_pdf(doc.stored_path)
            _appendix_done = True

        else:
            pending.append(block)

    # Flush any remaining HTML-only blocks (custom_text, divider, etc.)
    await _flush_html(pending)

    # Safety fallback: if any attachment type was absent from the config blocks,
    # still append its PDFs so documents are never silently dropped.
    if not _evidence_done:
        for posting in position.job_postings:
            for round_ in capture_rounds:
                for result in round_.results:
                    if result.job_posting_id != posting.id:
                        continue
                    if result.status != "done" or not result.page_pdf_url:
                        continue
                    await _add_remote_pdf(result.page_pdf_url)
    if not _job_match_done:
        for jm_doc in job_match_docs:
            await _add_remote_pdf(jm_doc.stored_path)
    if not _appendix_done:
        for doc in supporting_docs:
            await _add_remote_pdf(doc.stored_path)

    # ── Write merged PDF and upload to Supabase ───────────────────────────
    output = io.BytesIO()
    if remove_blank_pages:
        # Re-read all pages through a filter that skips blank ones
        filtered = PdfWriter()
        for page in writer.pages:
            if not _is_blank_page(page):
                filtered.add_page(page)
        filtered.write(output)
    else:
        writer.write(output)
    final_bytes = output.getvalue()

    timestamp = int(datetime.now(timezone.utc).timestamp())
    safe_name = _safe_filename(f"{employer.business_name}_{position.job_title}")
    pdf_key = f"{safe_name}_{timestamp}.pdf"
    pdf_url = await storage.upload("reports", pdf_key, final_bytes, "application/pdf")
    return pdf_url

