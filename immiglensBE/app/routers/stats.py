from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.capture import CaptureResult, CaptureRound, CaptureStatus, ResultStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_url import JobUrl
from app.models.user import User
from app.schemas.stats import (
    CaptureBreakdownItem,
    DashboardStats,
    EmployerBreakdownItem,
    RoundTimelineItem,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("", response_model=DashboardStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    uid = current_user.id

    emp_rows = (await db.execute(
        select(Employer.id, Employer.business_name, Employer.is_active).where(Employer.user_id == uid)
    )).all()
    emp_ids = [r.id for r in emp_rows]
    emp_name_map = {r.id: r.business_name for r in emp_rows}
    active_employers = sum(1 for r in emp_rows if r.is_active)

    pos_rows = (await db.execute(
        select(JobPosition.id, JobPosition.employer_id, JobPosition.is_active)
        .where(JobPosition.employer_id.in_(emp_ids))
    )).all()
    pos_ids = [r.id for r in pos_rows]
    pos_to_emp = {r.id: r.employer_id for r in pos_rows}
    active_positions = sum(1 for r in pos_rows if r.is_active)

    round_rows = (await db.execute(
        select(CaptureRound.id, CaptureRound.job_position_id,
               CaptureRound.status, CaptureRound.scheduled_at)
        .where(CaptureRound.job_position_id.in_(pos_ids))
        .order_by(CaptureRound.scheduled_at)
    )).all() if pos_ids else []
    round_ids = [r.id for r in round_rows]

    total_employers = len(emp_ids)
    total_positions = len(pos_ids)

    total_postings = (await db.execute(
        select(func.count()).select_from(JobUrl)
        .where(JobUrl.job_position_id.in_(pos_ids))
    )).scalar_one() if pos_ids else 0

    active_postings = (await db.execute(
        select(func.count()).select_from(JobUrl)
        .where(JobUrl.job_position_id.in_(pos_ids), JobUrl.is_active.isnot(False))
    )).scalar_one() if pos_ids else 0

    total_rounds = len(round_ids)
    completed_rounds = sum(1 for r in round_rows if r.status == CaptureStatus.COMPLETED)
    pending_rounds   = sum(1 for r in round_rows if r.status == CaptureStatus.PENDING)

    result_rows = (await db.execute(
        select(CaptureResult.id, CaptureResult.capture_round_id,
               CaptureResult.job_url_id, CaptureResult.status)
        .where(CaptureResult.capture_round_id.in_(round_ids))
    )).all() if round_ids else []

    total_screenshots   = sum(1 for r in result_rows if r.status == ResultStatus.DONE)
    failed_screenshots  = sum(1 for r in result_rows if r.status == ResultStatus.FAILED)
    pending_screenshots = sum(1 for r in result_rows if r.status == ResultStatus.PENDING)

    # Rounds that failed before producing any CaptureResult (pre-loop crash, no active URLs).
    # These are invisible to failed_screenshots but must count against the success rate.
    rounds_with_results = {r.capture_round_id for r in result_rows}
    failed_rounds = sum(
        1 for r in round_rows
        if (r.status == CaptureStatus.FAILED or getattr(r.status, 'value', r.status) == 'failed')
        and r.id not in rounds_with_results
    )

    # ── Donut breakdown ──────────────────────────────
    capture_breakdown = [
        CaptureBreakdownItem(name="Successful", value=total_screenshots,   color="#22c55e"),
        CaptureBreakdownItem(name="Failed",     value=failed_screenshots,  color="#ef4444"),
        CaptureBreakdownItem(name="Pending",    value=pending_screenshots, color="#6366f1"),
    ]

    # ── Per-employer bar chart data ──────────────────
    url_rows = (await db.execute(
        select(JobUrl.id, JobUrl.job_position_id)
        .where(JobUrl.job_position_id.in_(pos_ids))
    )).all() if pos_ids else []
    posting_to_emp: dict[int, int] = {
        pr.id: pos_to_emp[pr.job_position_id]
        for pr in url_rows
        if pr.job_position_id in pos_to_emp
    }

    emp_positions:   dict[int, int] = {}
    emp_screenshots: dict[int, int] = {}
    emp_failed:      dict[int, int] = {}
    for r in pos_rows:
        emp_positions[r.employer_id] = emp_positions.get(r.employer_id, 0) + 1
    for r in result_rows:
        eid = posting_to_emp.get(r.job_url_id)
        if eid:
            if r.status == ResultStatus.DONE:
                emp_screenshots[eid] = emp_screenshots.get(eid, 0) + 1
            elif r.status == ResultStatus.FAILED:
                emp_failed[eid] = emp_failed.get(eid, 0) + 1

    employer_breakdown = [
        EmployerBreakdownItem(
            name=emp_name_map[eid][:22] + ("…" if len(emp_name_map[eid]) > 22 else ""),
            positions=emp_positions.get(eid, 0),
            screenshots=emp_screenshots.get(eid, 0),
            failed=emp_failed.get(eid, 0),
        )
        for eid in emp_ids
    ]

    # ── Rounds timeline area chart ───────────────────
    timeline: dict[str, dict[str, int]] = {}
    for r in round_rows:
        d = r.scheduled_at.strftime("%b %d")
        if d not in timeline:
            timeline[d] = {"completed": 0, "pending": 0, "failed": 0}
        key = r.status.value if hasattr(r.status, "value") else str(r.status)
        if key in timeline[d]:
            timeline[d][key] += 1

    rounds_timeline = [
        RoundTimelineItem(date=d, **v)
        for d, v in list(timeline.items())[-20:]
    ]

    return DashboardStats(
        total_employers=total_employers,
        active_employers=active_employers,
        total_positions=total_positions,
        active_positions=active_positions,
        total_job_urls=total_postings,
        active_postings=active_postings,
        total_capture_rounds=total_rounds,
        completed_rounds=completed_rounds,
        pending_rounds=pending_rounds,
        total_screenshots=total_screenshots,
        failed_screenshots=failed_screenshots,
        failed_rounds=failed_rounds,
        capture_breakdown=capture_breakdown,
        employer_breakdown=employer_breakdown,
        rounds_timeline=rounds_timeline,
    )
