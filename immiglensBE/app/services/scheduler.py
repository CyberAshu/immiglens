import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
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
from app.services.notification_service import dispatch_event, send_admin_alert
from app.services.screenshot import capture

scheduler = AsyncIOScheduler()
logger = logging.getLogger(__name__)


async def pause_rounds_for_user(db: AsyncSession, emp_ids: list[int]) -> None:
    """Remove PENDING capture rounds from APScheduler without deleting them from the DB.
    Rounds remain as PENDING so they can be re-queued when the position is re-activated.
    Called on subscription expiry or tier downgrade.
    """
    if not emp_ids:
        return
    pos_ids_res = await db.execute(
        select(JobPosition.id).where(JobPosition.employer_id.in_(emp_ids))
    )
    pos_ids = [r[0] for r in pos_ids_res.all()]
    if not pos_ids:
        return
    pending_res = await db.execute(
        select(CaptureRound).where(
            CaptureRound.job_position_id.in_(pos_ids),
            CaptureRound.status == CaptureStatus.PENDING,
        )
    )
    for round_ in pending_res.scalars().all():
        try:
            scheduler.remove_job(f"capture_round_{round_.id}")
        except Exception:
            pass
    # DB records are NOT deleted — preserved as PENDING for re-activation


async def requeue_rounds_for_position(db: AsyncSession, position: JobPosition) -> None:
    """Re-add PENDING DB rounds to APScheduler for a position being re-activated.

    Strategy:
    - Stale rounds (scheduled_at in the past) are deleted — they represent missed captures
      during a deactivation window and would produce a meaningless burst of back-dated
      screenshots if fired now.
    - Future rounds are re-added to APScheduler at their original scheduled time.
    - If no future rounds remain, a fresh schedule is created from today.
    """
    now = datetime.now(timezone.utc)

    all_pending = (
        await db.execute(
            select(CaptureRound).where(
                CaptureRound.job_position_id == position.id,
                CaptureRound.status == CaptureStatus.PENDING,
            )
        )
    ).scalars().all()

    future_rounds = []
    for round_ in all_pending:
        if round_.scheduled_at <= now:
            # Stale — delete silently; no value in firing these late
            try:
                scheduler.remove_job(f"capture_round_{round_.id}")
            except Exception:
                pass
            await db.delete(round_)
        else:
            future_rounds.append(round_)

    await db.flush()

    if future_rounds:
        for round_ in future_rounds:
            try:
                scheduler.add_job(
                    _run_capture_round,
                    trigger=DateTrigger(run_date=round_.scheduled_at),
                    args=[round_.id],
                    id=f"capture_round_{round_.id}",
                    replace_existing=True,
                )
            except Exception:
                pass
    else:
        # No future rounds remain — create a fresh schedule from today
        await schedule_rounds_for_position(db, position, not_before=now)


async def cancel_pending_rounds_for_user(db: AsyncSession, emp_ids: list[int]) -> None:
    """Hard-delete all PENDING capture rounds for positions under the given employer IDs.
    Should be called inside an existing db session before the final commit.
    """
    if not emp_ids:
        return
    pos_ids_res = await db.execute(
        select(JobPosition.id).where(JobPosition.employer_id.in_(emp_ids))
    )
    pos_ids = [r[0] for r in pos_ids_res.all()]
    if not pos_ids:
        return

    pending_res = await db.execute(
        select(CaptureRound).where(
            CaptureRound.job_position_id.in_(pos_ids),
            CaptureRound.status == CaptureStatus.PENDING,
        )
    )
    for round_ in pending_res.scalars().all():
        try:
            scheduler.remove_job(f"capture_round_{round_.id}")
        except Exception:
            pass
        await db.delete(round_)

    await db.flush()


async def _expire_subscriptions_job() -> None:
    """Daily job: deactivate positions for users whose tier_expires_at has passed.

    Only positions are deactivated — employers and URLs are intentionally left
    untouched.  Each user is processed in its own DB session so a failure for
    one user never blocks the others.
    """
    from app.models.user import User

    # Snapshot the list of expired user IDs first (read-only query)
    async with AsyncSessionLocal() as db:
        now = datetime.now(timezone.utc)
        res = await db.execute(
            select(User.id).where(
                User.tier_expires_at.isnot(None),
                User.tier_expires_at <= now,
                User.tier_id.isnot(None),
            )
        )
        expired_user_ids = [r[0] for r in res.all()]

    if not expired_user_ids:
        return

    for user_id in expired_user_ids:
        # Each user gets its own session + transaction — failure is isolated
        try:
            async with AsyncSessionLocal() as db:
                user = await db.get(User, user_id)
                if user is None:
                    continue

                user.tier_id = None
                user.tier_expires_at = None

                emp_ids_res = await db.execute(
                    select(Employer.id).where(Employer.user_id == user.id)
                )
                emp_ids = [r[0] for r in emp_ids_res.all()]

                if emp_ids:
                    pos_res = await db.execute(
                        select(JobPosition).where(
                            JobPosition.employer_id.in_(emp_ids),
                            JobPosition.is_active.is_(True),
                        )
                    )
                    positions = pos_res.scalars().all()
                    for pos in positions:
                        pos.is_active = False

                    await db.flush()
                    await pause_rounds_for_user(db, emp_ids)

                await db.commit()
                logger.info("Expired subscription for user_id=%s", user_id)

        except Exception:
            logger.exception("Failed to expire subscription for user_id=%s — skipping", user_id)


async def recover_pending_rounds() -> None:
    """Re-queue all PENDING capture rounds into APScheduler after a server restart.
    Without this, rounds scheduled before the restart would never fire.

    Stale past rounds (position end_date passed or just old) are deleted from DB —
    re-firing them would produce a burst of meaningless backdated captures.
    Only genuinely future rounds are re-added to APScheduler.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CaptureRound).where(CaptureRound.status == CaptureStatus.PENDING)
        )
        rounds = result.scalars().all()
        now = datetime.now(timezone.utc)
        requeued = 0
        deleted = 0
        for round_ in rounds:
            if round_.scheduled_at <= now:
                # Stale — delete; no value in backdated captures
                try:
                    scheduler.remove_job(f"capture_round_{round_.id}")
                except Exception:
                    pass
                await db.delete(round_)
                deleted += 1
            else:
                scheduler.add_job(
                    _run_capture_round,
                    trigger=DateTrigger(run_date=round_.scheduled_at),
                    args=[round_.id],
                    id=f"capture_round_{round_.id}",
                    replace_existing=True,
                )
                requeued += 1
        if deleted or requeued:
            await db.commit()
        if deleted:
            logger.info("recover_pending_rounds: deleted %s stale rounds, requeued %s future rounds", deleted, requeued)
        else:
            logger.info("recover_pending_rounds: requeued %s pending rounds", requeued)


async def schedule_rounds_for_position(
    db: AsyncSession,
    position: JobPosition,
    not_before: datetime | None = None,
) -> None:
    start = datetime.combine(position.start_date, datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    if position.end_date is not None:
        end = datetime.combine(position.end_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    else:
        end = start + timedelta(days=settings.RECRUITMENT_PERIOD_DAYS)
    freq = timedelta(days=position.capture_frequency_days)

    if not_before is not None:
        while start < not_before:
            start += freq

    existing_result = await db.execute(
        select(CaptureRound.scheduled_at).where(
            CaptureRound.job_position_id == position.id,
            CaptureRound.status.in_([
                CaptureStatus.PENDING,
                CaptureStatus.RUNNING,
                CaptureStatus.COMPLETED,
            ]),
        )
    )
    existing_dates: set[str] = {
        row[0].date().isoformat() for row in existing_result.fetchall()
    }

    # ── Posting-date capture ──────────────────────────────────────────────────
    # On initial creation (not_before is None): always create one scheduled
    # capture for today so the user gets a same-day snapshot regardless of
    # whether start_date is today or a future date.
    # - 1-hour gap rule preserved: run_at = now + 1h
    # - today_str is added to existing_dates so the main loop skips today,
    #   preventing a duplicate when start_date == today.
    now_utc = datetime.now(timezone.utc)
    if not_before is None:
        today_str = now_utc.date().isoformat()
        # Fresh DB query covering ALL statuses — safer than the pre-populated
        # existing_dates which is blind to rounds flushed-but-not-committed by
        # a concurrent call and does not include rounds created mid-transaction.
        today_start = datetime.combine(now_utc.date(), datetime.min.time()).replace(tzinfo=timezone.utc)
        today_end   = today_start + timedelta(days=1)
        same_day_exists = (
            await db.execute(
                select(CaptureRound.id).where(
                    CaptureRound.job_position_id == position.id,
                    CaptureRound.scheduled_at >= today_start,
                    CaptureRound.scheduled_at <  today_end,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if same_day_exists is None:
            run_at = now_utc + timedelta(hours=1)
            posting_round = CaptureRound(
                job_position_id=position.id,
                scheduled_at=run_at,
                status=CaptureStatus.PENDING,
            )
            db.add(posting_round)
            await db.flush()
            scheduler.add_job(
                _run_capture_round,
                trigger=DateTrigger(run_date=run_at),
                args=[posting_round.id],
                id=f"capture_round_{posting_round.id}",
                replace_existing=True,
            )
            # Mark today covered so the main loop skips start_date = today
            existing_dates.add(today_str)
    # ─────────────────────────────────────────────────────────────────────────

    scheduled_at = start
    while scheduled_at <= end:
        date_str = scheduled_at.date().isoformat()
        if date_str in existing_dates:
            scheduled_at += freq
            continue
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


async def reschedule_rounds_for_position(db: AsyncSession, position: JobPosition) -> None:
    """Cancel all PENDING and FAILED rounds for a position and create a fresh schedule."""
    cancellable = (
        await db.execute(
            select(CaptureRound).where(
                CaptureRound.job_position_id == position.id,
                CaptureRound.status.in_([CaptureStatus.PENDING, CaptureStatus.FAILED]),
            )
        )
    ).scalars().all()

    for round_ in cancellable:
        try:
            scheduler.remove_job(f"capture_round_{round_.id}")
        except Exception:
            pass
        await db.delete(round_)

    await db.flush()
    await schedule_rounds_for_position(db, position, not_before=datetime.now(timezone.utc))


async def recapture_result(result_id: int) -> None:
    """Re-run the screenshot for a single capture result and record a new snapshot."""
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
        await db.flush()

        # Record a change snapshot for the recaptured result
        await record_snapshot(db, result)

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
                selectinload(CaptureRound.job_position).selectinload(JobPosition.job_urls),
                selectinload(CaptureRound.job_position).selectinload(JobPosition.employer),
            )
        )
        round_ = result.scalar_one_or_none()
        if round_ is None or round_.status != CaptureStatus.PENDING:
            return
        if not round_.job_position.is_active:
            # Position was manually deactivated — skip silently, leave PENDING
            return
        if not any(p.is_active for p in round_.job_position.job_urls):
            # All URLs are deactivated — leave PENDING
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
                selectinload(CaptureRound.job_position).selectinload(JobPosition.job_urls)
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
                selectinload(CaptureRound.job_position).selectinload(JobPosition.job_urls),
                selectinload(CaptureRound.job_position).selectinload(JobPosition.employer),
            )
        )
        round_ = result2.scalar_one()
        await _execute_round(db, round_)


async def _execute_round(db: AsyncSession, round_: CaptureRound) -> None:
    round_.status = CaptureStatus.RUNNING
    await db.commit()

    # Resolve the owning user once — reused for all notifications in this round
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

    # ── ROUND_STARTED ────────────────────────────────────────────────────────
    if user_id is not None:
        try:
            await dispatch_event(
                db, user_id=user_id,
                event=NotificationEvent.ROUND_STARTED,
                context={
                    "round_id": round_.id,
                    "position": round_.job_position.job_title,
                    "scheduled_at": round_.scheduled_at.isoformat(),
                },
                trigger_id=round_.id,
                trigger_type="capture_round",
            )
        except Exception:
            pass  # Never block capture flow for notification errors

    snapshots: list[tuple] = []
    try:
        for posting in round_.job_position.job_urls:
            if not posting.is_active:
                continue  # skip deactivated URLs
            screenshot_result = await capture(posting.url)
            capture_result = CaptureResult(
                capture_round_id=round_.id,
                job_url_id=posting.id,
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
    except Exception as exc:
        # Unexpected failure during capture loop — mark round FAILED and notify
        round_.status = CaptureStatus.FAILED
        await db.commit()
        if user_id is not None:
            try:
                await dispatch_event(
                    db, user_id=user_id,
                    event=NotificationEvent.CAPTURE_FAILED,
                    context={
                        "round_id": round_.id,
                        "position": round_.job_position.job_title,
                        "error": str(exc),
                    },
                    trigger_id=round_.id,
                    trigger_type="capture_round",
                )
            except Exception:
                pass
        # Always alert the platform admin regardless of user preference settings
        await send_admin_alert(
            subject=f"Capture round {round_.id} FAILED",
            body=(
                f"Capture round {round_.id} failed unexpectedly.\n\n"
                f"Position : {round_.job_position.job_title}\n"
                f"Round ID : {round_.id}\n"
                f"Error    : {exc}\n"
                f"Time     : {datetime.now(timezone.utc).isoformat()}\n"
            ),
        )
        logger.exception("Capture round %s failed", round_.id)
        return

    round_.status = CaptureStatus.COMPLETED
    round_.captured_at = datetime.now(timezone.utc)
    await db.commit()

    # ── Dispatch notifications ────────────────────────────────────────────────
    if user_id is not None:
        try:
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


async def recover_stuck_rounds() -> None:
    """Periodic job: find RUNNING rounds that have been stuck too long, reset and auto-retry them.

    A round stuck in RUNNING state means the server crashed mid-capture.
    We reset them to FAILED and immediately re-trigger so they run without manual intervention.
    Runs every 30 minutes via APScheduler (registered in main.py lifespan).
    """
    timeout_minutes = settings.STUCK_ROUND_TIMEOUT_MINUTES
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=timeout_minutes)

    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(CaptureRound)
            .where(
                CaptureRound.status == CaptureStatus.RUNNING,
                CaptureRound.scheduled_at <= cutoff,
            )
            .options(
                selectinload(CaptureRound.job_position)
            )
        )
        stuck = res.scalars().all()
        if not stuck:
            return

        for round_ in stuck:
            round_.status = CaptureStatus.FAILED
            logger.warning(
                "Stuck round detected and reset to FAILED: round_id=%s position=%s",
                round_.id,
                getattr(round_.job_position, "job_title", "?"),
            )

        await db.commit()

        round_ids = [r.id for r in stuck]
        positions = [getattr(r.job_position, "job_title", f"Position #{r.job_position_id}") for r in stuck]
        await send_admin_alert(
            subject=f"{len(stuck)} stuck capture round(s) detected and auto-retried",
            body=(
                f"{len(stuck)} capture round(s) were stuck in RUNNING state "
                f"for more than {timeout_minutes} minutes. They have been reset and re-queued automatically.\n\n"
                f"Round IDs : {', '.join(str(i) for i in round_ids)}\n"
                f"Positions : {', '.join(positions)}\n"
                f"Time      : {datetime.now(timezone.utc).isoformat()}\n"
            ),
        )

    # Auto-retry each recovered round outside the DB session
    import asyncio
    for round_id in round_ids:
        asyncio.create_task(force_run_capture_round(round_id))
