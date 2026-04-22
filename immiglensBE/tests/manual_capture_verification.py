import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
import sys

import httpx

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.screenshot import capture
from app.services.browser import browser_manager

URLS = {
    "JobSpider": "https://www.jobspider.com/job/carpenter-delta-british-columbia-13951894",
}

ARTIFACT_DIR = Path(__file__).parent / "artifacts"


async def _download_if_present(url: str | None, target: Path) -> bool:
    if not url:
        return False
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.get(url)
        if resp.status_code != 200:
            return False
        target.write_bytes(resp.content)
        return True
    except Exception:
        return False


async def run_once(name: str, url: str) -> dict:
    result = await capture(url, max_attempts=2)

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    screenshot_file = ARTIFACT_DIR / f"{name}_{timestamp}.png"
    pdf_file = ARTIFACT_DIR / f"{name}_{timestamp}.pdf"

    screenshot_saved = await _download_if_present(result.screenshot_url, screenshot_file)
    pdf_saved = await _download_if_present(result.page_pdf_url, pdf_file)

    return {
        "name": name,
        "url": url,
        "status": result.status.value,
        "failure_category": result.failure_category.value if result.failure_category else None,
        "response_status": result.response_status,
        "page_title": result.page_title,
        "duration_ms": result.duration_ms,
        "proxy_used": result.proxy_used,
        "proxy_session": result.proxy_session,
        "profile_id": result.profile_id,
        "modal_detected": result.modal_detected,
        "modal_remaining": result.modal_remaining,
        "modal_actions_clicked": result.modal_actions_clicked,
        "modal_actions_hidden": result.modal_actions_hidden,
        "screenshot_url": result.screenshot_url,
        "page_pdf_url": result.page_pdf_url,
        "local_screenshot": str(screenshot_file) if screenshot_saved else None,
        "local_pdf": str(pdf_file) if pdf_saved else None,
        "error": result.error,
    }


async def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    outputs = []
    try:
        for name, url in URLS.items():
            outputs.append(await run_once(name, url))
    finally:
        await browser_manager.stop()

    print(json.dumps(outputs, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
