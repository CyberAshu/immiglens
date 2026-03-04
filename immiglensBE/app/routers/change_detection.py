"""Change-detection router — query visual change history per job posting."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.capture import CaptureResult
from app.models.change_detection import PostingSnapshot
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_posting import JobPosting
from app.models.user import User
from app.schemas.change_detection import ChangeHistoryItem, PostingSnapshotOut

router = APIRouter(prefix="/api/changes", tags=["changes"])


async def _assert_posting_owned(db: AsyncSession, posting_id: int, user_id: int) -> JobPosting:
    """Raise 404 if posting doesn't exist or doesn't belong to the user."""
    row = (
        await db.execute(
            select(JobPosting)
            .join(JobPosition, JobPosting.job_position_id == JobPosition.id)
            .join(Employer, JobPosition.employer_id == Employer.id)
            .where(JobPosting.id == posting_id, Employer.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Posting not found")
    return row


@router.get("/postings/{posting_id}", response_model=list[PostingSnapshotOut])
async def get_snapshots(
    posting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all snapshots for a posting, newest first."""
    await _assert_posting_owned(db, posting_id, current_user.id)

    rows = (
        await db.execute(
            select(PostingSnapshot)
            .where(PostingSnapshot.job_posting_id == posting_id)
            .order_by(PostingSnapshot.captured_at.desc())
        )
    ).scalars().all()
    return rows


@router.get("/postings/{posting_id}/history", response_model=list[ChangeHistoryItem])
async def get_change_history(
    posting_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a timeline view with screenshot URLs for easy front-end rendering."""
    await _assert_posting_owned(db, posting_id, current_user.id)

    snapshots = (
        await db.execute(
            select(PostingSnapshot)
            .where(PostingSnapshot.job_posting_id == posting_id)
            .order_by(PostingSnapshot.captured_at.desc())
        )
    ).scalars().all()

    items: list[ChangeHistoryItem] = []
    for snap in snapshots:
        screenshot_url: str | None = None
        if snap.capture_result_id:
            result = await db.get(CaptureResult, snap.capture_result_id)
            if result:
                screenshot_url = result.screenshot_url

        items.append(
            ChangeHistoryItem(
                snapshot_id=snap.id,
                captured_at=snap.captured_at,
                has_changed=snap.has_changed,
                change_summary=snap.change_summary,
                screenshot_url=screenshot_url,
            )
        )
    return items
