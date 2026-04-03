import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from playwright.async_api import Browser, Playwright, async_playwright
from playwright._impl._errors import TargetClosedError

from app.core.config import settings

logger = logging.getLogger(__name__)


class BrowserManager:
    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_SCREENSHOTS)
        self._lock = asyncio.Lock()

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

    async def start(self) -> None:
        await self._ensure_browser()

    async def stop(self) -> None:
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
    async def acquire_page(self):
        async with self._semaphore:
            for attempt in range(2):
                try:
                    browser = await self._ensure_browser()
                    context = await browser.new_context(
                        viewport={"width": 1280, "height": 720},
                        user_agent=(
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/122.0.0.0 Safari/537.36"
                        ),
                    )
                    page = await context.new_page()
                    break
                except TargetClosedError:
                    logger.warning("Browser closed during page creation — forcing relaunch (attempt %d).", attempt + 1)
                    self._browser = None
                    if attempt == 1:
                        raise
            try:
                yield page
            finally:
                try:
                    await page.close()
                except Exception:
                    pass
                try:
                    await context.close()
                except Exception:
                    pass


browser_manager = BrowserManager()
