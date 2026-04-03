import asyncio
import os
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.core.config import settings
from app.schemas.screenshot import ScreenshotResult, URLStatus
from app.services import storage
from app.services.browser import browser_manager


def _sanitize_filename(url: str) -> str:
    parsed = urlparse(url)
    raw = f"{parsed.netloc}{parsed.path}".strip("/")
    safe = re.sub(r"[^\w\-.]", "_", raw)
    safe = re.sub(r"_+", "_", safe).strip("_")
    timestamp = int(time.time() * 1000)
    return f"{safe}_{timestamp}"


async def _attempt_capture(url: str, dest: Path, pdf_dest: Path) -> ScreenshotResult:
    """Single capture attempt — saves full-page PNG and print-layout PDF."""
    start = time.monotonic()

    async with browser_manager.acquire_page() as page:
        try:
            await page.goto(url, timeout=settings.PAGE_TIMEOUT_MS, wait_until="commit")

            try:
                await page.wait_for_load_state(
                    "networkidle",
                    timeout=settings.NETWORK_IDLE_TIMEOUT_MS,
                )
            except PlaywrightTimeoutError:
                pass

            await asyncio.sleep(settings.JS_SETTLE_DELAY_S)

            # Full-page PNG screenshot (for UI thumbnails)
            await page.screenshot(path=str(dest), full_page=True)

            # Print-layout PDF (for report embedding)
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
            )

        except PlaywrightTimeoutError:
            duration = int((time.monotonic() - start) * 1000)
            return ScreenshotResult(
                url=url, status=URLStatus.FAILED,
                error="Navigation timed out.", duration_ms=duration,
            )

        except Exception as exc:
            duration = int((time.monotonic() - start) * 1000)
            return ScreenshotResult(
                url=url, status=URLStatus.FAILED,
                error=str(exc), duration_ms=duration,
            )


async def capture(url: str, max_attempts: int = 2) -> ScreenshotResult:
    """Capture PNG screenshot + print-layout PDF, upload both to Supabase Storage."""
    last_result: ScreenshotResult | None = None

    for attempt in range(1, max_attempts + 1):
        stem = _sanitize_filename(url)
        png_fd, png_path_str = tempfile.mkstemp(suffix=".png")
        os.close(png_fd)
        pdf_fd, pdf_path_str = tempfile.mkstemp(suffix=".pdf")
        os.close(pdf_fd)
        dest_png = Path(png_path_str)
        dest_pdf = Path(pdf_path_str)

        result = await _attempt_capture(url, dest_png, dest_pdf)

        if result.status == URLStatus.DONE:
            try:
                png_bytes = dest_png.read_bytes()
                pdf_bytes = dest_pdf.read_bytes()

                # Supabase returns 400 for empty or near-empty uploads.
                # A valid full-page PNG is always > 5 KB; anything smaller means
                # Playwright captured a blank/bot-block page.
                MIN_PNG_BYTES = 5_120  # 5 KB
                if len(png_bytes) < MIN_PNG_BYTES:
                    last_result = ScreenshotResult(
                        url=url,
                        status=URLStatus.FAILED,
                        error=(
                            f"Screenshot too small ({len(png_bytes)} bytes) — "
                            "page may have been blocked or returned an empty response."
                        ),
                        duration_ms=result.duration_ms,
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
                )
            except Exception as exc:
                last_result = ScreenshotResult(
                    url=url, status=URLStatus.FAILED,
                    error=f"Storage upload failed: {exc}",
                    duration_ms=result.duration_ms,
                )
            finally:
                dest_png.unlink(missing_ok=True)
                dest_pdf.unlink(missing_ok=True)
        else:
            dest_png.unlink(missing_ok=True)
            dest_pdf.unlink(missing_ok=True)
            last_result = result

        if attempt < max_attempts:
            await asyncio.sleep(3)

    return last_result  # type: ignore[return-value]

