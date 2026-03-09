import asyncio
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
    return f"{safe}_{timestamp}.png"


async def _attempt_capture(url: str, dest: Path) -> ScreenshotResult:
    """Single capture attempt. Returns DONE or FAILED ScreenshotResult."""
    filename = dest.name
    start = time.monotonic()

    async with browser_manager.acquire_page() as page:
        try:
            # "commit" fires as soon as the response starts streaming —
            # much more reliable for slow/bot-protected sites than "domcontentloaded".
            await page.goto(url, timeout=settings.PAGE_TIMEOUT_MS, wait_until="commit")

            try:
                await page.wait_for_load_state(
                    "networkidle",
                    timeout=settings.NETWORK_IDLE_TIMEOUT_MS,
                )
            except PlaywrightTimeoutError:
                pass

            await asyncio.sleep(settings.JS_SETTLE_DELAY_S)
            await page.screenshot(path=str(dest), full_page=True)

            duration = int((time.monotonic() - start) * 1000)
            return ScreenshotResult(
                url=url,
                status=URLStatus.DONE,
                filename=filename,
                screenshot_url=f"/screenshots/{filename}",
                duration_ms=duration,
            )

        except PlaywrightTimeoutError:
            duration = int((time.monotonic() - start) * 1000)
            return ScreenshotResult(
                url=url,
                status=URLStatus.FAILED,
                error="Navigation timed out.",
                duration_ms=duration,
            )

        except Exception as exc:
            duration = int((time.monotonic() - start) * 1000)
            return ScreenshotResult(
                url=url,
                status=URLStatus.FAILED,
                error=str(exc),
                duration_ms=duration,
            )


async def capture(url: str, max_attempts: int = 2) -> ScreenshotResult:
    """Capture a screenshot, upload to Supabase Storage, and return public URL."""
    last_result: ScreenshotResult | None = None
    for attempt in range(1, max_attempts + 1):
        filename = _sanitize_filename(url)
        tmp_fd, tmp_path_str = tempfile.mkstemp(suffix=".png")
        import os; os.close(tmp_fd)
        dest = Path(tmp_path_str)
        result = await _attempt_capture(url, dest)
        if result.status == URLStatus.DONE:
            try:
                img_bytes = dest.read_bytes()
                public_url = await storage.upload("screenshots", filename, img_bytes, "image/png")
                return ScreenshotResult(
                    url=url,
                    status=URLStatus.DONE,
                    filename=filename,
                    screenshot_url=public_url,
                    duration_ms=result.duration_ms,
                )
            except Exception as exc:
                last_result = ScreenshotResult(
                    url=url, status=URLStatus.FAILED,
                    error=f"Storage upload failed: {exc}",
                    duration_ms=result.duration_ms,
                )
            finally:
                dest.unlink(missing_ok=True)
        else:
            dest.unlink(missing_ok=True)
            last_result = result
        if attempt < max_attempts:
            await asyncio.sleep(3)
    return last_result  # type: ignore[return-value]
