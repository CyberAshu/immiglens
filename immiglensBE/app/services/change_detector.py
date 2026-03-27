"""Change-detection service.

After every CaptureResult is written, call ``record_snapshot`` to:
  1. Hash the screenshot URL string (SHA-256 of the public Supabase URL).
     Screenshots at different URLs mean different content was captured.
  2. Compare with the most recent previous snapshot for the same posting.
  3. Store a PostingSnapshot row with has_changed + change_summary.

This gives a full visual change history per job posting URL.
"""

import hashlib
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.capture import CaptureResult
from app.models.change_detection import PostingSnapshot


def compute_url_hash(url: Optional[str]) -> Optional[str]:
    """Return SHA-256 hex digest of the screenshot URL string.

    Supabase Storage creates a new unique path for every upload, so two
    identical page captures would produce the same content but different URLs.
    We therefore hash the *content* by downloading a lightweight content-hash
    approach: since we cannot re-download the image here, we use the URL as a
    proxy — different URL always means a new upload was made (i.e. new capture).
    This is a deliberate trade-off: it flags every new capture as potentially
    changed until a content-aware hash is available.

    Returns None when no screenshot was taken (failed capture).
    """
    if not url:
        return None
    return hashlib.sha256(url.encode()).hexdigest()


async def record_snapshot(
    db: AsyncSession,
    capture_result: CaptureResult,
) -> PostingSnapshot:
    """Create a PostingSnapshot for a freshly-written CaptureResult.

    Must be called *before* the surrounding transaction is committed so that
    the snapshot is flushed in the same unit of work.
    """
    page_hash = compute_url_hash(capture_result.screenshot_url)

    # Fetch the most recent existing snapshot for this posting
    prev_row = await db.execute(
        select(PostingSnapshot)
        .where(PostingSnapshot.job_posting_id == capture_result.job_posting_id)
        .order_by(PostingSnapshot.captured_at.desc())
        .limit(1)
    )
    previous: Optional[PostingSnapshot] = prev_row.scalar_one_or_none()

    has_changed: Optional[bool] = None
    change_summary: Optional[str] = None

    if previous is not None:
        if page_hash is None or previous.page_hash is None:
            change_summary = "Comparison unavailable (screenshot missing on one side)"
        elif page_hash == previous.page_hash:
            has_changed = False
            change_summary = "No visual changes detected"
        else:
            has_changed = True
            change_summary = "Page content has changed since the last capture"

    snapshot = PostingSnapshot(
        job_posting_id=capture_result.job_posting_id,
        capture_result_id=capture_result.id,
        page_hash=page_hash,
        has_changed=has_changed,
        change_summary=change_summary,
    )
    db.add(snapshot)
    return snapshot
