import asyncio
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.core.config import settings
from app.schemas.screenshot import FailureCategory, ScreenshotResult, URLStatus
from app.services import storage
from app.services.browser import browser_manager

_BOT_KEYWORDS: frozenset[str] = frozenset([
    "just a moment",
    "checking your browser",
    "ddos protection by cloudflare",
    "cf-browser-verification",
    "__cf_chl",
    "enable javascript and cookies to continue",
    "ray id",
    "please wait while we verify",
    "datadome",
    "px-captcha",
])

_CAPTCHA_KEYWORDS: frozenset[str] = frozenset([
    "captcha",
    "recaptcha",
    "g-recaptcha",
    "hcaptcha",
    "h-captcha",
    "verify you are human",
    "i am not a robot",
    "prove you are human",
    "challenge-form",
])

_ACCESS_DENIED_KEYWORDS: frozenset[str] = frozenset([
    "access denied",
    "403 forbidden",
    "you do not have permission",
    "too many requests",
    "rate limit exceeded",
    "this site can\u2019t be reached",
])

_NO_RETRY_CATEGORIES: frozenset[FailureCategory] = frozenset([
    FailureCategory.CAPTCHA,
    FailureCategory.ACCESS_DENIED,
])


def _sanitize_filename(url: str) -> str:
    parsed = urlparse(url)
    netloc_safe = parsed.netloc.replace(".", "-")
    raw = f"{netloc_safe}{parsed.path}".strip("/")
    safe = re.sub(r"[^\w\-]", "_", raw)
    safe = re.sub(r"_+", "_", safe).strip("_")
    timestamp = int(time.time() * 1000)
    return f"{safe}_{timestamp}"


def _classify(
    response_status: int | None,
    page_title: str,
    html_snippet: str,
) -> FailureCategory | None:
    if response_status in (401, 403, 429):
        return FailureCategory.ACCESS_DENIED

    combined = page_title.lower() + " " + html_snippet

    if any(kw in combined for kw in _CAPTCHA_KEYWORDS):
        return FailureCategory.CAPTCHA

    if any(kw in combined for kw in _BOT_KEYWORDS):
        return FailureCategory.BOT_DETECTED

    if any(kw in combined for kw in _ACCESS_DENIED_KEYWORDS):
        return FailureCategory.ACCESS_DENIED

    return None


async def _attempt_capture(url: str, dest: Path, pdf_dest: Path) -> ScreenshotResult:
    start = time.monotonic()
    response_status: int | None = None
    page_title: str = ""

    try:
        async with browser_manager.acquire_page() as page:
            response = await page.goto(url, timeout=settings.PAGE_TIMEOUT_MS, wait_until="commit")
            response_status = response.status if response else None

            try:
                await page.wait_for_load_state(
                    "networkidle",
                    timeout=settings.NETWORK_IDLE_TIMEOUT_MS,
                )
            except PlaywrightTimeoutError:
                pass

            await asyncio.sleep(settings.JS_SETTLE_DELAY_S)

            page_title = await page.title()
            html_snippet = (await page.content())[:32_000].lower()

            category = _classify(response_status, page_title, html_snippet)
            if category is not None:
                duration = int((time.monotonic() - start) * 1000)
                return ScreenshotResult(
                    url=url,
                    status=URLStatus.FAILED,
                    error=f"Page blocked: {category.value}",
                    duration_ms=duration,
                    failure_category=category,
                    response_status=response_status,
                    page_title=page_title,
                )

            await page.screenshot(path=str(dest), full_page=True)

            await page.emulate_media(media="print")
            await page.pdf(
                path=str(pdf_dest),
                format="A4",
                print_background=True,
                display_header_footer=True,
                header_template=(
                    "<div style='width:100%;font-size:8px;color:#555;padding:0 10mm;"
                    "font-family:Arial,sans-serif;display:flex;justify-content:space-between;'>"
                    "<span class='url'></span>"
                    "<span></span>"
                    "</div>"
                ),
                footer_template=(
                    "<div style='width:100%;font-size:8px;color:#555;padding:0 10mm;"
                    "font-family:Arial,sans-serif;display:flex;justify-content:space-between;'>"
                    "<span class='date'></span>"
                    "<span>Page <span class='pageNumber'></span> of <span class='totalPages'></span></span>"
                    "</div>"
                ),
                margin={"top": "18mm", "bottom": "14mm", "left": "10mm", "right": "10mm"},
            )

            duration = int((time.monotonic() - start) * 1000)
            return ScreenshotResult(
                url=url,
                status=URLStatus.DONE,
                filename=dest.name,
                duration_ms=duration,
                response_status=response_status,
                page_title=page_title,
            )

    except PlaywrightTimeoutError:
        duration = int((time.monotonic() - start) * 1000)
        return ScreenshotResult(
            url=url,
            status=URLStatus.FAILED,
            error="Navigation timed out.",
            duration_ms=duration,
            failure_category=FailureCategory.TIMEOUT,
            response_status=response_status,
            page_title=page_title or None,
        )

    except Exception as exc:
        duration = int((time.monotonic() - start) * 1000)
        return ScreenshotResult(
            url=url,
            status=URLStatus.FAILED,
            error=str(exc),
            duration_ms=duration,
            failure_category=FailureCategory.NETWORK_ERROR,
            response_status=response_status,
            page_title=page_title or None,
        )


async def capture(url: str, max_attempts: int = 2) -> ScreenshotResult:
    """Capture PNG screenshot + print-layout PDF, upload both to Supabase Storage."""
    last_result: ScreenshotResult | None = None

    for attempt in range(1, max_attempts + 1):
        stem = _sanitize_filename(url)
        try:
            png_fd, png_path_str = tempfile.mkstemp(suffix=".png")
            os.close(png_fd)
            pdf_fd, pdf_path_str = tempfile.mkstemp(suffix=".pdf")
            os.close(pdf_fd)
        except OSError as exc:
            last_result = ScreenshotResult(
                url=url,
                status=URLStatus.FAILED,
                error=f"Failed to create temporary capture file: {exc}",
                failure_category=FailureCategory.UNKNOWN,
            )
            if attempt < max_attempts:
                await asyncio.sleep(3)
            continue

        dest_png = Path(png_path_str)
        dest_pdf = Path(pdf_path_str)

        result = await _attempt_capture(url, dest_png, dest_pdf)

        if result.status == URLStatus.DONE:
            try:
                png_bytes = dest_png.read_bytes()
                pdf_bytes = dest_pdf.read_bytes()

                MIN_PNG_BYTES = 5_120
                if len(png_bytes) < MIN_PNG_BYTES:
                    last_result = ScreenshotResult(
                        url=url,
                        status=URLStatus.FAILED,
                        error=(
                            f"Screenshot too small ({len(png_bytes)} bytes) — "
                            "page may have been blocked or returned an empty response."
                        ),
                        duration_ms=result.duration_ms,
                        failure_category=FailureCategory.EMPTY_PAGE,
                        response_status=result.response_status,
                        page_title=result.page_title,
                    )
                    continue

                png_filename = f"{stem}.png"
                pdf_filename = f"{stem}_print.pdf"

                png_url = await storage.upload(
                    "screenshots", png_filename, png_bytes, "image/png"
                )
                pdf_url = await storage.upload(
                    "screenshots", pdf_filename, pdf_bytes, "application/pdf"
                )
                return ScreenshotResult(
                    url=url,
                    status=URLStatus.DONE,
                    filename=png_filename,
                    screenshot_url=png_url,
                    page_pdf_url=pdf_url,
                    duration_ms=result.duration_ms,
                    response_status=result.response_status,
                    page_title=result.page_title,
                )
            except Exception as exc:
                last_result = ScreenshotResult(
                    url=url,
                    status=URLStatus.FAILED,
                    error=f"Storage upload failed: {exc}",
                    duration_ms=result.duration_ms,
                    failure_category=FailureCategory.UNKNOWN,
                )
            finally:
                dest_png.unlink(missing_ok=True)
                dest_pdf.unlink(missing_ok=True)
        else:
            dest_png.unlink(missing_ok=True)
            dest_pdf.unlink(missing_ok=True)
            last_result = result
            if result.failure_category in _NO_RETRY_CATEGORIES:
                break

        if attempt < max_attempts:
            await asyncio.sleep(3)

    return last_result  # type: ignore[return-value]

