from datetime import datetime, timedelta, timezone
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.capture import CaptureResult, CaptureRound, CaptureStatus, ResultStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.notification import NotificationEvent
from app.services.change_detector import record_snapshot
from app.services.notification_service import dispatch_event
from app.services.screenshot import capture

scheduler = AsyncIOScheduler()


async def schedule_captures(db: AsyncSession, position: JobPosition) -> None:
    start = datetime.combine(position.start_date, datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    end = start + timedelta(days=settings.RECRUITMENT_PERIOD_DAYS)
    freq = timedelta(days=position.capture_frequency_days)

    scheduled_at = start
    while scheduled_at <= end:
        round_ = CaptureRound(
            job_position_id=position.id,
            scheduled_at=scheduled_at,
            status=CaptureStatus.PENDING,
        )
        db.add(round_)
        await db.flush()

        run_at = max(scheduled_at, datetime.now(timezone.utc) + timedelta(hours=1))
        scheduler.add_job(
            _run_capture_round,
            trigger=DateTrigger(run_date=run_at),
            args=[round_.id],
            id=f"capture_round_{round_.id}",
            replace_existing=True,
        )
        scheduled_at += freq

    await db.commit()


async def recapture_result(result_id: int) -> None:
    """Re-run the screenshot for a single capture result."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(CaptureResult)
            .where(CaptureResult.id == result_id)
        )
        result = res.scalar_one_or_none()
        if result is None:
            return

        screenshot_result = await capture(result.url)

        result.status = ResultStatus(screenshot_result.status.value)
        result.screenshot_path = None
        result.screenshot_url = screenshot_result.screenshot_url
        result.page_pdf_url = screenshot_result.page_pdf_url
        result.error = screenshot_result.error
        result.duration_ms = screenshot_result.duration_ms
        await db.commit()

        # If all results for the round are now done/failed, mark round completed
        round_res = await db.execute(
            select(CaptureRound)
            .where(CaptureRound.id == result.capture_round_id)
            .options(selectinload(CaptureRound.results))
        )
        round_ = round_res.scalar_one_or_none()
        if round_ and all(r.status in (ResultStatus.DONE, ResultStatus.FAILED) for r in round_.results):
            round_.status = CaptureStatus.COMPLETED
            await db.commit()


async def _run_capture_round(round_id: int) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureRound)
            .where(CaptureRound.id == round_id)
            .options(
                selectinload(CaptureRound.job_position).selectinload(JobPosition.job_postings),
                selectinload(CaptureRound.job_position).selectinload(JobPosition.employer),
            )
        )
        round_ = result.scalar_one_or_none()
        if round_ is None or round_.status != CaptureStatus.PENDING:
            return
        await _execute_round(db, round_)


async def force_run_capture_round(round_id: int) -> None:
    """Re-run a round regardless of its current status, clearing previous results."""
    from sqlalchemy import delete as sa_delete
    from app.models.capture import CaptureResult as CaptureResultModel
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureRound)
            .where(CaptureRound.id == round_id)
            .options(
                selectinload(CaptureRound.job_position).selectinload(JobPosition.job_postings)
            )
        )
        round_ = result.scalar_one_or_none()
        if round_ is None:
            return
        # Clear previous results so re-run starts fresh
        await db.execute(sa_delete(CaptureResultModel).where(CaptureResultModel.capture_round_id == round_id))
        round_.status = CaptureStatus.PENDING
        round_.captured_at = None
        await db.commit()
        await db.refresh(round_)
        # Reload with postings and employer
        result2 = await db.execute(
            select(CaptureRound)
            .where(CaptureRound.id == round_id)
            .options(
                selectinload(CaptureRound.job_position).selectinload(JobPosition.job_postings),
                selectinload(CaptureRound.job_position).selectinload(JobPosition.employer),
            )
        )
        round_ = result2.scalar_one()
        await _execute_round(db, round_)


async def _execute_round(db: AsyncSession, round_: CaptureRound) -> None:
    round_.status = CaptureStatus.RUNNING
    await db.commit()

    snapshots: list[tuple] = []  # (PostingSnapshot, url)
    for posting in round_.job_position.job_postings:
        screenshot_result = await capture(posting.url)
        capture_result = CaptureResult(
            capture_round_id=round_.id,
            job_posting_id=posting.id,
            url=posting.url,
            status=ResultStatus(screenshot_result.status.value),
            screenshot_path=None,
            screenshot_url=screenshot_result.screenshot_url,
            page_pdf_url=screenshot_result.page_pdf_url,
            error=screenshot_result.error,
            duration_ms=screenshot_result.duration_ms,
        )
        db.add(capture_result)
        await db.flush()  # populate capture_result.id before snapshot
        snap = await record_snapshot(db, capture_result)
        snapshots.append((snap, posting.url))

    round_.status = CaptureStatus.COMPLETED
    round_.captured_at = datetime.now(timezone.utc)
    await db.commit()

    # ── Dispatch notifications ────────────────────────────────────────────────
    try:
        user_id: int | None = getattr(
            getattr(round_.job_position, "employer", None), "user_id", None
        )
        if user_id is None:
            emp_res = await db.execute(
                select(Employer.user_id)
                .join(JobPosition, Employer.id == JobPosition.employer_id)
                .where(JobPosition.id == round_.job_position_id)
            )
            user_id = emp_res.scalar_one_or_none()

        if user_id is not None:
            await dispatch_event(
                db, user_id=user_id,
                event=NotificationEvent.CAPTURE_COMPLETE,
                context={
                    "round_id": round_.id,
                    "position": round_.job_position.job_title,
                    "completed_at": round_.captured_at.isoformat(),
                },
                trigger_id=round_.id,
                trigger_type="capture_round",
            )
            # Notify for each posting that changed
            for snap, posting_url in snapshots:
                if snap.has_changed:
                    await dispatch_event(
                        db, user_id=user_id,
                        event=NotificationEvent.POSTING_CHANGED,
                        context={
                            "posting_url": posting_url,
                            "change_summary": snap.change_summary,
                            "snapshot_id": snap.id,
                        },
                        trigger_id=snap.id,
                        trigger_type="posting_snapshot",
                    )
    except Exception:
        pass  # Notification failures must never block the capture flow
