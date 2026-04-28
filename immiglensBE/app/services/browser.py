import asyncio
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Optional

from playwright.async_api import Browser, Playwright, async_playwright
from playwright._impl._errors import TargetClosedError

from app.core.config import settings

logger = logging.getLogger(__name__)

# Close the browser after this many seconds of no active captures.
BROWSER_IDLE_TIMEOUT = 300  # 5 minutes


@dataclass(frozen=True)
class CaptureContextOptions:
    user_agent: str
    viewport_width: int
    viewport_height: int
    locale: str = "en-CA"
    timezone_id: str = "America/Toronto"
    extra_headers: dict[str, str] | None = None
    proxy: dict[str, str] | None = None
    stealth: bool = True
    profile_id: str = "default"
    proxy_session: str | None = None


DEFAULT_CONTEXT_OPTIONS = CaptureContextOptions(
    user_agent=(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    viewport_width=1280,
    viewport_height=720,
)


STEALTH_INIT_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-CA', 'en'] });

const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(param) {
  if (param === 37445) return 'Intel Inc.';
  if (param === 37446) return 'Intel Iris OpenGL Engine';
  return getParameter.call(this, param);
};
"""


class BrowserManager:
    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_SCREENSHOTS)
        self._lock = asyncio.Lock()
        self._active_pages: int = 0
        self._last_active: float = time.monotonic()
        self._idle_task: Optional[asyncio.Task] = None

    def _on_disconnected(self) -> None:
        logger.warning("Chromium browser disconnected — will relaunch on next capture.")
        self._browser = None

    async def _ensure_browser(self) -> Browser:
        """Return a connected browser, launching one if needed."""
        if self._browser and self._browser.is_connected():
            return self._browser
        async with self._lock:
            if self._browser and self._browser.is_connected():
                return self._browser
            logger.info("Launching Chromium browser.")
            if self._playwright is None:
                self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--no-zygote",
                    "--js-flags=--max-old-space-size=128",
                ]
            )
            self._browser.on("disconnected", lambda _: self._on_disconnected())
            return self._browser

    async def _idle_watcher(self) -> None:
        """Close the browser after BROWSER_IDLE_TIMEOUT seconds of inactivity."""
        while True:
            await asyncio.sleep(60)  # check every minute
            if self._browser is None or not self._browser.is_connected():
                continue
            if self._active_pages > 0:
                continue
            idle_secs = time.monotonic() - self._last_active
            if idle_secs >= BROWSER_IDLE_TIMEOUT:
                logger.info("Browser idle for %.0f s — closing to free memory.", idle_secs)
                async with self._lock:
                    if self._browser and self._active_pages == 0:
                        try:
                            await self._browser.close()
                        except Exception:
                            pass
                        self._browser = None
                        # Keep _playwright alive so relaunch is fast (avoids node restart)

    async def start(self) -> None:
        """Start the idle watcher; the browser is launched lazily on first acquire_page()."""
        self._idle_task = asyncio.create_task(self._idle_watcher())

    async def stop(self) -> None:
        if self._idle_task:
            self._idle_task.cancel()
            self._idle_task = None
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._playwright:
            try:
                await self._playwright.stop()
            except Exception:
                pass
            self._playwright = None

    @asynccontextmanager
    async def acquire_page(self, options: CaptureContextOptions | None = None):
        async with self._semaphore:
            opts = options or DEFAULT_CONTEXT_OPTIONS
            self._active_pages += 1
            context = None
            page = None
            try:
                for attempt in range(2):
                    try:
                        browser = await self._ensure_browser()
                        context = await browser.new_context(
                            viewport={"width": opts.viewport_width, "height": opts.viewport_height},
                            user_agent=opts.user_agent,
                            locale=opts.locale,
                            timezone_id=opts.timezone_id,
                            extra_http_headers=opts.extra_headers,
                            proxy=opts.proxy,
                        )
                        if opts.stealth:
                            await context.add_init_script(STEALTH_INIT_SCRIPT)
                        page = await context.new_page()
                        break
                    except TargetClosedError:
                        logger.warning("Browser closed during page creation — forcing relaunch (attempt %d).", attempt + 1)
                        self._browser = None
                        if context:
                            try:
                                await context.close()
                            except Exception:
                                pass
                            context = None
                        if attempt == 1:
                            raise
                yield page
            finally:
                if page:
                    try:
                        await page.close()
                    except Exception:
                        pass
                if context:
                    try:
                        await context.close()
                    except Exception:
                        pass
                self._active_pages -= 1
                self._last_active = time.monotonic()


browser_manager = BrowserManager()
