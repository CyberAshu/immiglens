import asyncio
import base64
from datetime import datetime
import os
import random
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.core.config import settings
from app.schemas.screenshot import FailureCategory, ScreenshotResult, URLStatus
from app.services import storage
from app.services.browser import CaptureContextOptions, browser_manager

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

_PROFILES: tuple[dict, ...] = (
    {
        "id": "desktop_a",
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "viewport": (1366, 768),
        "locale": "en-CA",
        "timezone_id": "America/Toronto",
        "headers": {"Accept-Language": "en-CA,en;q=0.9"},
    },
    {
        "id": "desktop_b",
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/121.0.0.0 Safari/537.36"
        ),
        "viewport": (1440, 900),
        "locale": "en-CA",
        "timezone_id": "America/Vancouver",
        "headers": {"Accept-Language": "en-CA,en;q=0.9"},
    },
)

_COMMON_CLOSE_SELECTORS: tuple[str, ...] = (
    'button[aria-label*="close" i]',
    'button[title*="close" i]',
    '[data-testid*="close"]',
    '[data-dismiss="modal"]',
    '.fc-cta-consent',
    '.fc-button-label',
    '#didomi-notice-agree-button',
    '#onetrust-accept-btn-handler',
    '#cookieAcceptButton',
    '#cookie-accept',
    '#accept-cookies',
    '#gdpr-consent-accept',
    '.cc-accept',
    '.cc-btn.cc-allow',
    '.cookie-consent-accept',
    '.consent-accept',
    '#consent-accept',
    '.klaviyo-close-form',
    '.email-popup-close',
    '[aria-label="Close"]',
    '[aria-label="close"]',
    '[aria-label="Dismiss"]',
    '.modal-close',
    '.close',
    'button[class*="close" i]',
    'button[id*="close" i]',
    'button[class*="dismiss" i]',
    'button[class*="accept" i]',
    'button[id*="accept" i]',
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("Accept all cookies")',
    'button:has-text("I Agree")',
    'button:has-text("I Accept")',
    'button:has-text("Continue")',
    'button:has-text("No thanks")',
    'button:has-text("Not now")',
    'button:has-text("Allow all")',
    'button:has-text("Got it")',
)


def _proxy_session_token(attempt: int) -> str:
    return f"a{attempt}-{int(time.time() * 1000)}"


def _build_proxy_config(session_token: str) -> dict[str, str] | None:
    if not settings.RES_PROXY_ENABLED or not settings.RES_PROXY_SERVER:
        return None
    cfg: dict[str, str] = {"server": settings.RES_PROXY_SERVER}

    username = settings.RES_PROXY_USERNAME
    if settings.RES_PROXY_USERNAME_SESSION_TEMPLATE:
        username = settings.RES_PROXY_USERNAME_SESSION_TEMPLATE.format(session=session_token)
    elif "{session}" in username:
        username = username.format(session=session_token)

    if username:
        cfg["username"] = username
    if settings.RES_PROXY_PASSWORD:
        cfg["password"] = settings.RES_PROXY_PASSWORD
    return cfg


def _is_proxy_error(error_message: str) -> bool:
    text = error_message.lower()
    markers = (
        "proxy",
        "407",
        "tunnel",
        "err_proxy_connection_failed",
        "err_tunnel_connection_failed",
    )
    return any(m in text for m in markers)


def _should_use_proxy_for_attempt(
    attempt: int,
    last_result: ScreenshotResult | None,
    *,
    force_proxy_first_attempt: bool,
    retry_blocked_categories: bool,
) -> bool:
    if not settings.RES_PROXY_ENABLED or not settings.RES_PROXY_SERVER:
        return False
    if attempt == 1 and force_proxy_first_attempt:
        return True
    if not settings.RES_PROXY_RETRY_ONLY:
        return True
    if attempt == 1:
        return False
    if last_result is None or last_result.failure_category is None:
        return False

    if last_result.failure_category in {
        FailureCategory.BOT_DETECTED,
        FailureCategory.TIMEOUT,
        FailureCategory.NETWORK_ERROR,
    }:
        return True

    if retry_blocked_categories and last_result.failure_category in {
        FailureCategory.CAPTCHA,
        FailureCategory.ACCESS_DENIED,
    }:
        return True

    return (
        last_result.failure_category == FailureCategory.ACCESS_DENIED
        and last_result.response_status == 429
    )


def _build_context_options(
    attempt: int,
    use_proxy: bool,
    proxy_session: str | None,
) -> CaptureContextOptions:
    profile = _PROFILES[(attempt - 1) % len(_PROFILES)]
    proxy_cfg = _build_proxy_config(proxy_session or "") if use_proxy and proxy_session else None
    return CaptureContextOptions(
        user_agent=profile["user_agent"],
        viewport_width=profile["viewport"][0],
        viewport_height=profile["viewport"][1],
        locale=profile["locale"],
        timezone_id=profile["timezone_id"],
        extra_headers=profile["headers"],
        proxy=proxy_cfg,
        stealth=True,
        profile_id=profile["id"],
        proxy_session=proxy_session,
    )


async def _click_first_visible_in_frame(frame, selectors: tuple[str, ...]) -> int:
    clicked = 0
    for sel in selectors:
        try:
            locator = frame.locator(sel).first
            if await locator.is_visible(timeout=250):
                await locator.click(timeout=500)
                clicked += 1
        except Exception:
            continue
    return clicked


async def _hide_blocking_overlays(page) -> int:
    script = """
() => {
  const nodes = Array.from(document.querySelectorAll('*'));
  let hidden = 0;
  for (const el of nodes) {
    const cs = window.getComputedStyle(el);
    if (!cs) continue;
    const z = parseInt(cs.zIndex || '0', 10);
    const pos = cs.position;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const covers = rect.width >= vw * 0.7 && rect.height >= vh * 0.5;
    const tag = [el.id || '', el.className || '', el.getAttribute('role') || ''].join(' ');
    const modalish = /modal|overlay|consent|cookie|gdpr|subscribe|newsletter/i.test(tag);
    if ((pos === 'fixed' || pos === 'sticky') && z >= 1000 && covers && modalish) {
      el.setAttribute('data-il-hidden-overlay', '1');
      el.style.setProperty('display', 'none', 'important');
      hidden += 1;
    }
  }
  return hidden;
}
"""
    try:
        return int(await page.evaluate(script))
    except Exception:
        return 0


async def _has_blocking_overlay(page) -> bool:
    script = """
() => {
  const nodes = Array.from(document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[id*="modal"],[class*="overlay"],[id*="overlay"],[class*="cookie"],[id*="cookie"],[class*="consent"],[id*="consent"],[class*="gdpr"],[id*="gdpr"]'));
  const vw = window.innerWidth || document.documentElement.clientWidth;
  const vh = window.innerHeight || document.documentElement.clientHeight;
  for (const el of nodes) {
    const cs = window.getComputedStyle(el);
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden') continue;
    const z = parseInt(cs.zIndex || '0', 10);
    const r = el.getBoundingClientRect();
    if (z >= 1000 && r.width >= vw * 0.6 && r.height >= vh * 0.35) {
      return true;
    }
  }
  return false;
}
"""
    try:
        return bool(await page.evaluate(script))
    except Exception:
        return False


async def _handle_modals(page, budget_ms: int) -> dict[str, int | bool]:
    start = time.monotonic()
    clicked = 0
    hidden = 0
    detected = False

    for _ in range(2):
        clicked += await _click_first_visible_in_frame(page, _COMMON_CLOSE_SELECTORS)
        try:
            for frame in page.frames:
                if frame == page.main_frame:
                    continue
                clicked += await _click_first_visible_in_frame(frame, _COMMON_CLOSE_SELECTORS)
        except Exception:
            pass

        try:
            await page.keyboard.press("Escape")
        except Exception:
            pass

        blocking = await _has_blocking_overlay(page)
        detected = detected or blocking or clicked > 0

        if not blocking:
            break

        hidden += await _hide_blocking_overlays(page)
        await page.wait_for_timeout(120)

        if (time.monotonic() - start) * 1000 > budget_ms:
            break

    remaining = await _has_blocking_overlay(page)
    return {
        "modal_detected": detected,
        "modal_actions_clicked": clicked,
        "modal_actions_hidden": hidden,
        "modal_remaining": remaining,
    }


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


async def _attempt_capture(
    url: str,
    dest: Path,
    pdf_dest: Path,
    context_options: CaptureContextOptions,
    proxy_used: bool,
    proxy_session: str | None,
    persist_blocked_artifacts: bool,
) -> ScreenshotResult:
    start = time.monotonic()
    response_status: int | None = None
    page_title: str = ""
    modal_diag: dict[str, int | bool] | None = None

    try:
        async with browser_manager.acquire_page(options=context_options) as page:
            response = await page.goto(url, timeout=settings.PAGE_TIMEOUT_MS, wait_until="domcontentloaded")
            response_status = response.status if response else None

            try:
                await page.wait_for_load_state(
                    "load",
                    timeout=settings.NETWORK_IDLE_TIMEOUT_MS,
                )
            except PlaywrightTimeoutError:
                pass

            try:
                await page.wait_for_load_state(
                    "networkidle",
                    timeout=settings.NETWORK_IDLE_TIMEOUT_MS,
                )
            except PlaywrightTimeoutError:
                pass

            modal_diag = await _handle_modals(page, budget_ms=1400)

            page_title = await page.title()
            html_snippet = (await page.content())[:32_000].lower()

            category = _classify(response_status, page_title, html_snippet)
            if category is not None:
                if persist_blocked_artifacts:
                    try:
                        await page.screenshot(path=str(dest), full_page=True)

                        png_b64 = base64.b64encode(dest.read_bytes()).decode("ascii")
                        captured_at_label = datetime.now(ZoneInfo(context_options.timezone_id)).strftime("%d/%m/%Y, %H:%M")
                        pdf_html = f"""
<!doctype html>
<html>
    <head>
        <meta charset=\"utf-8\" />
        <style>
            @page {{ size: A4; margin: 8mm; }}
            html, body {{ margin: 0; padding: 0; background: #fff; }}
            .wrap {{ width: 100%; }}
            img {{ width: 100%; height: auto; display: block; }}
            .stamp {{
                position: fixed;
                right: 8mm;
                bottom: 5mm;
                font-family: Arial, sans-serif;
                font-size: 9px;
                color: #555;
                background: rgba(255,255,255,0.75);
                padding: 1px 4px;
                border-radius: 2px;
            }}
        </style>
    </head>
    <body>
        <div class=\"wrap\">
            <img alt=\"capture\" src=\"data:image/png;base64,{png_b64}\" />
        </div>
        <div class=\"stamp\">{captured_at_label}</div>
    </body>
</html>
"""
                        await page.set_content(pdf_html, wait_until="domcontentloaded")
                        await page.emulate_media(media="screen")
                        await page.pdf(
                            path=str(pdf_dest),
                            format="A4",
                            print_background=True,
                            display_header_footer=False,
                            margin={"top": "8mm", "bottom": "8mm", "left": "8mm", "right": "8mm"},
                        )
                    except Exception:
                        pass

                duration = int((time.monotonic() - start) * 1000)
                return ScreenshotResult(
                    url=url,
                    status=URLStatus.FAILED,
                    error=f"Page blocked: {category.value}",
                    duration_ms=duration,
                    failure_category=category,
                    response_status=response_status,
                    page_title=page_title,
                    proxy_used=proxy_used,
                    proxy_session=proxy_session,
                    profile_id=context_options.profile_id,
                    modal_detected=bool(modal_diag and modal_diag.get("modal_detected")),
                    modal_remaining=bool(modal_diag and modal_diag.get("modal_remaining")),
                    modal_actions_clicked=int(modal_diag.get("modal_actions_clicked", 0)) if modal_diag else 0,
                    modal_actions_hidden=int(modal_diag.get("modal_actions_hidden", 0)) if modal_diag else 0,
                )

            second_modal_diag = await _handle_modals(page, budget_ms=500)
            modal_detected = bool(modal_diag and modal_diag.get("modal_detected")) or bool(second_modal_diag.get("modal_detected"))
            modal_actions_clicked = int(modal_diag.get("modal_actions_clicked", 0)) if modal_diag else 0
            modal_actions_clicked += int(second_modal_diag.get("modal_actions_clicked", 0))
            modal_actions_hidden = int(modal_diag.get("modal_actions_hidden", 0)) if modal_diag else 0
            modal_actions_hidden += int(second_modal_diag.get("modal_actions_hidden", 0))
            modal_remaining = bool(second_modal_diag.get("modal_remaining"))

            await page.screenshot(path=str(dest), full_page=True)

            png_b64 = base64.b64encode(dest.read_bytes()).decode("ascii")
            captured_at_label = datetime.now(ZoneInfo(context_options.timezone_id)).strftime("%d/%m/%Y, %H:%M")
            pdf_html = f"""
<!doctype html>
<html>
    <head>
        <meta charset=\"utf-8\" />
        <style>
            @page {{ size: A4; margin: 8mm; }}
            html, body {{ margin: 0; padding: 0; background: #fff; }}
            .wrap {{ width: 100%; }}
            img {{ width: 100%; height: auto; display: block; }}
            .stamp {{
                position: fixed;
                right: 8mm;
                bottom: 5mm;
                font-family: Arial, sans-serif;
                font-size: 9px;
                color: #555;
                background: rgba(255,255,255,0.75);
                padding: 1px 4px;
                border-radius: 2px;
            }}
        </style>
    </head>
    <body>
        <div class=\"wrap\">
            <img alt=\"capture\" src=\"data:image/png;base64,{png_b64}\" />
        </div>
        <div class=\"stamp\">{captured_at_label}</div>
    </body>
</html>
"""

            await page.set_content(pdf_html, wait_until="domcontentloaded")
            await page.emulate_media(media="screen")
            await page.pdf(
                path=str(pdf_dest),
                format="A4",
                print_background=True,
                display_header_footer=False,
                margin={"top": "8mm", "bottom": "8mm", "left": "8mm", "right": "8mm"},
            )

            duration = int((time.monotonic() - start) * 1000)
            return ScreenshotResult(
                url=url,
                status=URLStatus.DONE,
                filename=dest.name,
                duration_ms=duration,
                response_status=response_status,
                page_title=page_title,
                proxy_used=proxy_used,
                proxy_session=proxy_session,
                profile_id=context_options.profile_id,
                modal_detected=modal_detected,
                modal_remaining=modal_remaining,
                modal_actions_clicked=modal_actions_clicked,
                modal_actions_hidden=modal_actions_hidden,
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
            proxy_used=proxy_used,
            proxy_session=proxy_session,
            profile_id=context_options.profile_id,
            modal_detected=bool(modal_diag and modal_diag.get("modal_detected")),
            modal_remaining=bool(modal_diag and modal_diag.get("modal_remaining")),
            modal_actions_clicked=int(modal_diag.get("modal_actions_clicked", 0)) if modal_diag else 0,
            modal_actions_hidden=int(modal_diag.get("modal_actions_hidden", 0)) if modal_diag else 0,
        )

    except Exception as exc:
        failure = FailureCategory.NETWORK_ERROR
        if _is_proxy_error(str(exc)):
            failure = FailureCategory.NETWORK_ERROR
        duration = int((time.monotonic() - start) * 1000)
        return ScreenshotResult(
            url=url,
            status=URLStatus.FAILED,
            error=str(exc),
            duration_ms=duration,
            failure_category=failure,
            response_status=response_status,
            page_title=page_title or None,
            proxy_used=proxy_used,
            proxy_session=proxy_session,
            profile_id=context_options.profile_id,
            modal_detected=bool(modal_diag and modal_diag.get("modal_detected")),
            modal_remaining=bool(modal_diag and modal_diag.get("modal_remaining")),
            modal_actions_clicked=int(modal_diag.get("modal_actions_clicked", 0)) if modal_diag else 0,
            modal_actions_hidden=int(modal_diag.get("modal_actions_hidden", 0)) if modal_diag else 0,
        )


async def capture(
    url: str,
    max_attempts: int = 2,
    *,
    manual_retry: bool = False,
    persist_blocked_artifacts: bool = False,
) -> ScreenshotResult:
    """Capture PNG screenshot + print-layout PDF, upload both to Supabase Storage."""
    last_result: ScreenshotResult | None = None

    for attempt in range(1, max_attempts + 1):
        use_proxy = _should_use_proxy_for_attempt(
            attempt,
            last_result,
            force_proxy_first_attempt=manual_retry,
            retry_blocked_categories=manual_retry,
        )
        proxy_session = _proxy_session_token(attempt) if use_proxy else None
        context_options = _build_context_options(attempt, use_proxy, proxy_session)

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
                proxy_used=use_proxy,
                proxy_session=proxy_session,
                profile_id=context_options.profile_id,
            )
            if attempt < max_attempts:
                await asyncio.sleep(random.uniform(2.5, 3.5))
            continue

        dest_png = Path(png_path_str)
        dest_pdf = Path(pdf_path_str)

        result = await _attempt_capture(
            url,
            dest_png,
            dest_pdf,
            context_options=context_options,
            proxy_used=use_proxy,
            proxy_session=proxy_session,
            persist_blocked_artifacts=persist_blocked_artifacts,
        )

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
                        proxy_used=result.proxy_used,
                        proxy_session=result.proxy_session,
                        profile_id=result.profile_id,
                        modal_detected=result.modal_detected,
                        modal_remaining=result.modal_remaining,
                        modal_actions_clicked=result.modal_actions_clicked,
                        modal_actions_hidden=result.modal_actions_hidden,
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
                    proxy_used=result.proxy_used,
                    proxy_session=result.proxy_session,
                    profile_id=result.profile_id,
                    modal_detected=result.modal_detected,
                    modal_remaining=result.modal_remaining,
                    modal_actions_clicked=result.modal_actions_clicked,
                    modal_actions_hidden=result.modal_actions_hidden,
                )
            except Exception as exc:
                last_result = ScreenshotResult(
                    url=url,
                    status=URLStatus.FAILED,
                    error=f"Storage upload failed: {exc}",
                    duration_ms=result.duration_ms,
                    failure_category=FailureCategory.UNKNOWN,
                    response_status=result.response_status,
                    page_title=result.page_title,
                    proxy_used=result.proxy_used,
                    proxy_session=result.proxy_session,
                    profile_id=result.profile_id,
                    modal_detected=result.modal_detected,
                    modal_remaining=result.modal_remaining,
                    modal_actions_clicked=result.modal_actions_clicked,
                    modal_actions_hidden=result.modal_actions_hidden,
                )
            finally:
                dest_png.unlink(missing_ok=True)
                dest_pdf.unlink(missing_ok=True)
        else:
            if persist_blocked_artifacts and dest_png.exists() and dest_png.stat().st_size > 1024:
                try:
                    failed_png_name = f"{stem}.png"
                    failed_pdf_name = f"{stem}_print.pdf"
                    failed_png_url = await storage.upload(
                        "screenshots", failed_png_name, dest_png.read_bytes(), "image/png"
                    )
                    failed_pdf_url = None
                    if dest_pdf.exists() and dest_pdf.stat().st_size > 1024:
                        failed_pdf_url = await storage.upload(
                            "screenshots", failed_pdf_name, dest_pdf.read_bytes(), "application/pdf"
                        )
                    result = result.model_copy(
                        update={
                            "filename": failed_png_name,
                            "screenshot_url": failed_png_url,
                            "page_pdf_url": failed_pdf_url,
                        }
                    )
                except Exception:
                    pass

            dest_png.unlink(missing_ok=True)
            dest_pdf.unlink(missing_ok=True)
            last_result = result
            if not manual_retry and result.failure_category in _NO_RETRY_CATEGORIES:
                break

        if attempt < max_attempts:
            await asyncio.sleep(random.uniform(2.5, 3.5))

    return last_result  # type: ignore[return-value]

