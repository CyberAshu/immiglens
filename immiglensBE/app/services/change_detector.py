"""Change-detection service.

After every CaptureResult is written, call ``record_snapshot`` to:
  1. Hash the screenshot file (SHA-256).
  2. Compare with the most recent previous snapshot for the same posting.
  3. Store a PostingSnapshot row with has_changed + change_summary.

This gives a full visual change history per job posting URL.
"""

import hashlib
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.capture import CaptureResult
from app.models.change_detection import PostingSnapshot


def compute_file_hash(path: Optional[str]) -> Optional[str]:
    """Return SHA-256 hex digest of a file, or None if the file doesn't exist."""
    if not path:
        return None
    try:
        p = Path(path)
        if not p.is_file():
            return None
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        return digest
    except OSError:
        return None


async def record_snapshot(
    db: AsyncSession,
    capture_result: CaptureResult,
) -> PostingSnapshot:
    """Create a PostingSnapshot for a freshly-written CaptureResult.

    Must be called *before* the surrounding transaction is committed so that
    the snapshot is flushed in the same unit of work.
    """
    page_hash = compute_file_hash(capture_result.screenshot_path)

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
