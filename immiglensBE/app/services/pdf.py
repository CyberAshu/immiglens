import asyncio
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

from app.core.config import settings
from app.models.capture import CaptureRound
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.report import ReportDocument

_template_dir = Path(__file__).parent.parent / "templates"
_jinja_env = Environment(loader=FileSystemLoader(str(_template_dir)))

# Cached watermark stamp — generated once on first use, reused for every request.
_WATERMARK_STAMP_CACHE: bytes | None = None

_WATERMARK_HTML = """\
<!DOCTYPE html>
<html style="background:transparent!important">
<body style="margin:0;padding:0;width:210mm;height:297mm;
             background:transparent!important;overflow:hidden">
  <div style="
    position:fixed;top:0;left:0;width:100%;height:100%;
    display:flex;align-items:center;justify-content:center;
    pointer-events:none;
  ">
    <div style="
      transform:rotate(-45deg);
      font-size:96px;
      font-weight:900;
      color:rgba(160,160,160,0.22);
      white-space:nowrap;
      font-family:Arial,Helvetica,sans-serif;
      text-transform:uppercase;
      letter-spacing:18px;
      user-select:none;
    ">SAMPLE</div>
  </div>
</body>
</html>"""


async def _get_watermark_stamp() -> bytes:
    """Return a cached single-page watermark stamp PDF (transparent background)."""
    global _WATERMARK_STAMP_CACHE
    if _WATERMARK_STAMP_CACHE is not None:
        return _WATERMARK_STAMP_CACHE
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.set_content(_WATERMARK_HTML, wait_until="domcontentloaded")
        stamp = await page.pdf(
            format="A4",
            print_background=False,  # no opaque white background in the PDF stream
            margin={"top": "0mm", "bottom": "0mm", "left": "0mm", "right": "0mm"},
        )
        await browser.close()
    _WATERMARK_STAMP_CACHE = stamp
    return stamp


def render_report_html(context: dict[str, Any]) -> str:
    template = _jinja_env.get_template("report.html")
    return template.render(**context)


async def _inline_external_images(html: str) -> str:
    img_urls = re.findall(r'<img\b[^>]+\bsrc="(https?://[^"]+)"', html, re.IGNORECASE)
    if not img_urls:
        return html
    async with httpx.AsyncClient(timeout=30) as client:
        for url in dict.fromkeys(img_urls):
            try:
                r = await client.get(url)
                if r.status_code == 200:
                    content_type = r.headers.get("content-type", "image/png").split(";")[0]
                    b64 = base64.b64encode(r.content).decode()
                    html = html.replace(f'src="{url}"', f'src="data:{content_type};base64,{b64}"')
            except Exception:
                pass
    return html


async def _html_to_pdf_bytes(html: str) -> bytes:
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


async def _fetch_pdf_bytes(url: str) -> bytes | None:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(url)
        return r.content if r.status_code == 200 else None
    except Exception:
        return None


def _split_config_blocks(config: dict) -> tuple[list, list, list]:
    """Split enabled config blocks into three render groups:
    group0 = everything up to & including 'evidence' (plus preceding custom/divider)
    group1 = job_match_activity + adjacent custom/divider
    group2 = appendix + remaining custom/divider
    """
    enabled = [b for b in config.get("blocks", []) if b.get("enabled", True)]
    groups: list[list] = [[], [], []]
    current = 0
    for block in enabled:
        btype = block["type"]
        if btype == "evidence":
            groups[0].append(block)
        elif btype == "job_match_activity":
            current = 1
            groups[1].append(block)
        elif btype == "appendix":
            current = 2
            groups[2].append(block)
        else:
            groups[current].append(block)
    return groups[0], groups[1], groups[2]


async def build_pdf_bytes(
    employer: Employer,
    position: JobPosition,
    capture_rounds: list[CaptureRound],
    report_documents: list[ReportDocument],
    config: dict | None = None,
    watermark: bool = False,
) -> bytes:
    from app.models.report_config import DEFAULT_CONFIG
    if config is None:
        config = DEFAULT_CONFIG

    platform_stats: dict[int, dict] = {}
    for posting in position.job_urls:
        dates, count = [], 0
        for round_ in capture_rounds:
            for result in round_.results:
                if result.job_url_id == posting.id and result.status == "done":
                    count += 1
                    if round_.captured_at:
                        dates.append(round_.captured_at)
        platform_stats[posting.id] = {
            "count": count,
            "first": min(dates) if dates else None,
            "last": max(dates) if dates else None,
        }

    recruitment_end = (
        position.end_date
        if position.end_date is not None
        else position.start_date + timedelta(days=settings.RECRUITMENT_PERIOD_DAYS)
    )
    job_match_docs = [d for d in report_documents if d.doc_type == "job_match"]
    supporting_docs = [d for d in report_documents if d.doc_type != "job_match"]
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    today = datetime.now(timezone.utc).date()

    base_ctx = dict(
        employer=employer,
        position=position,
        capture_rounds=capture_rounds,
        report_documents=supporting_docs,
        job_match_docs=job_match_docs,
        platform_stats=platform_stats,
        recruitment_end=recruitment_end,
        today=today,
        generated_at=generated_at,
        preview_mode=False,
    )

    evidence_pdf_urls: list[str] = []
    for posting in position.job_urls:
        for round_ in capture_rounds:
            for result in round_.results:
                if result.job_url_id == posting.id and result.status == "done" and result.page_pdf_url:
                    evidence_pdf_urls.append(result.page_pdf_url)

    static_blocks, jm_blocks, appendix_blocks = _split_config_blocks(config)

    remote_urls = (
        evidence_pdf_urls
        + [d.stored_path for d in job_match_docs]
        + [d.stored_path for d in supporting_docs]
    )

    fetched: list[bytes | None] = list(
        await asyncio.gather(*[_fetch_pdf_bytes(url) for url in remote_urls])
    ) if remote_urls else []

    n_ev = len(evidence_pdf_urls)
    n_jm = len(job_match_docs)
    evidence_pdfs = fetched[:n_ev]
    jm_doc_pdfs = fetched[n_ev:n_ev + n_jm]
    supp_doc_pdfs = fetched[n_ev + n_jm:]

    static_pdf = await _html_to_pdf_bytes(
        render_report_html({**base_ctx, "config": {"blocks": static_blocks}})
    )
    jm_section_pdf = await _html_to_pdf_bytes(
        render_report_html({**base_ctx, "config": {"blocks": jm_blocks}})
    ) if jm_blocks else None
    appendix_section_pdf = await _html_to_pdf_bytes(
        render_report_html({**base_ctx, "config": {"blocks": appendix_blocks}})
    ) if appendix_blocks and supporting_docs else None

    writer = PdfWriter()

    def _add(data: bytes | None) -> None:
        if not data:
            return
        for pg in PdfReader(io.BytesIO(data)).pages:
            writer.add_page(pg)

    _add(static_pdf)
    for capture_pdf in evidence_pdfs:
        _add(capture_pdf)
    _add(jm_section_pdf)
    for pdf in jm_doc_pdfs:
        _add(pdf)
    _add(appendix_section_pdf)
    for pdf in supp_doc_pdfs:
        _add(pdf)

    output = io.BytesIO()
    writer.write(output)
    pdf_bytes = output.getvalue()

    if watermark:
        # Apply the watermark stamp to every page — HTML-rendered pages, capture
        # screenshot PDFs, and user-uploaded document PDFs all get it uniformly.
        stamp_bytes = await _get_watermark_stamp()
        stamp_page = PdfReader(io.BytesIO(stamp_bytes)).pages[0]
        watermarked_writer = PdfWriter()
        for page in PdfReader(io.BytesIO(pdf_bytes)).pages:
            page.merge_page(stamp_page)
            watermarked_writer.add_page(page)
        out = io.BytesIO()
        watermarked_writer.write(out)
        return out.getvalue()

    return pdf_bytes

