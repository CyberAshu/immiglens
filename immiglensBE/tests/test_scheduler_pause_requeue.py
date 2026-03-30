"""
Tests for pause_rounds_for_user and requeue_rounds_for_position.

Uses an in-memory SQLite database — no production DB required.

Scenarios verified:
1. pause_rounds_for_user  — rounds stay in DB (PENDING), NOT deleted
2. requeue_rounds_for_position (future rounds) — stale rounds deleted, future rounds
   added back to APScheduler
3. requeue_rounds_for_position (all stale) — all stale rounds deleted, fresh schedule
   created from today
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import event as sa_event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# ── patch DATABASE_URL before any app import touches it ─────────────────────
import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-only-not-real")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test")

from app.core.database import Base
from app.models.capture import CaptureRound, CaptureStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_url import JobUrl
from app.models.user import User

# ── In-memory SQLite engine (shared across all tests) ───────────────────────
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSession = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    """Create all tables once for the entire test session."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db():
    """Fresh DB session per test; rolls back after each test."""
    async with TestSession() as session:
        yield session
        await session.rollback()


# ── Helpers to insert minimal fixture data ───────────────────────────────────

async def make_user(db: AsyncSession) -> User:
    u = User(
        email="rcic@test.com",
        full_name="Test RCIC",
        hashed_password="x",
        is_admin=False,
    )
    db.add(u)
    await db.flush()
    return u


async def make_employer(db: AsyncSession, user_id: int) -> Employer:
    e = Employer(
        user_id=user_id,
        business_name="Acme Corp",
        address="123 St",
        contact_person="Alice",
        is_active=True,
    )
    db.add(e)
    await db.flush()
    return e


async def make_position(db: AsyncSession, employer_id: int) -> JobPosition:
    p = JobPosition(
        employer_id=employer_id,
        job_title="Dev",
        noc_code="21231",
        num_positions=1,
        start_date=date.today(),
        end_date=None,
        capture_frequency_days=7,
        is_active=True,
    )
    db.add(p)
    await db.flush()
    return p


def make_round(position_id: int, scheduled_at: datetime) -> CaptureRound:
    return CaptureRound(
        job_position_id=position_id,
        scheduled_at=scheduled_at,
        status=CaptureStatus.PENDING,
    )


NOW = datetime.now(timezone.utc)
PAST_1  = NOW - timedelta(days=30)
PAST_2  = NOW - timedelta(days=7)
FUTURE_1 = NOW + timedelta(days=7)
FUTURE_2 = NOW + timedelta(days=14)


# ════════════════════════════════════════════════════════════════════════════
# TEST 1 — pause_rounds_for_user keeps rounds in DB
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_pause_keeps_rounds_in_db(db: AsyncSession):
    """pause_rounds_for_user must NOT delete rounds from the DB."""
    from app.services import scheduler as sched_module

    user = await make_user(db)
    employer = await make_employer(db, user.id)
    position = await make_position(db, employer.id)

    r1 = make_round(position.id, FUTURE_1)
    r2 = make_round(position.id, FUTURE_2)
    db.add_all([r1, r2])
    await db.flush()
    round_ids = {r1.id, r2.id}

    # Mock APScheduler so remove_job is a no-op
    mock_scheduler = MagicMock()
    with patch.object(sched_module, "scheduler", mock_scheduler):
        await sched_module.pause_rounds_for_user(db, [employer.id])

    # Both rounds must still exist in DB
    from sqlalchemy import select
    remaining = (
        await db.execute(
            select(CaptureRound).where(CaptureRound.id.in_(round_ids))
        )
    ).scalars().all()

    assert len(remaining) == 2, (
        f"FAIL: expected 2 rounds in DB after pause, got {len(remaining)}. "
        "pause_rounds_for_user is DELETING rounds — schedule will be lost on re-activation."
    )
    assert mock_scheduler.remove_job.call_count == 2, (
        "FAIL: APScheduler remove_job should be called for each PENDING round."
    )
    print("PASS test_pause_keeps_rounds_in_db")


# ════════════════════════════════════════════════════════════════════════════
# TEST 2 — requeue_rounds_for_position: stale deleted, future requeued
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_requeue_deletes_stale_requeues_future(db: AsyncSession):
    """
    Given 2 stale + 2 future PENDING rounds:
    - stale rounds  → deleted from DB, removed from APScheduler
    - future rounds → kept in DB, added back to APScheduler
    """
    from app.services import scheduler as sched_module

    user = await make_user(db)
    employer = await make_employer(db, user.id)
    position = await make_position(db, employer.id)

    stale1 = make_round(position.id, PAST_1)
    stale2 = make_round(position.id, PAST_2)
    future1 = make_round(position.id, FUTURE_1)
    future2 = make_round(position.id, FUTURE_2)
    db.add_all([stale1, stale2, future1, future2])
    await db.flush()

    stale_ids  = {stale1.id, stale2.id}
    future_ids = {future1.id, future2.id}

    mock_scheduler = MagicMock()
    added_job_ids = []
    mock_scheduler.add_job.side_effect = lambda *a, id=None, **kw: added_job_ids.append(id)

    with patch.object(sched_module, "scheduler", mock_scheduler):
        await sched_module.requeue_rounds_for_position(db, position)
    await db.flush()

    from sqlalchemy import select
    all_rounds = (
        await db.execute(
            select(CaptureRound).where(CaptureRound.job_position_id == position.id)
        )
    ).scalars().all()
    remaining_ids = {r.id for r in all_rounds}

    # Stale must be gone
    assert not stale_ids & remaining_ids, (
        f"FAIL: stale rounds {stale_ids & remaining_ids} still in DB — "
        "they would fire as a burst on re-activation."
    )
    # Future must remain
    assert future_ids <= remaining_ids, (
        f"FAIL: future rounds {future_ids - remaining_ids} deleted — "
        "RCIC loses upcoming schedule."
    )
    # APScheduler add_job called exactly for future rounds
    expected_apscheduler_ids = {f"capture_round_{rid}" for rid in future_ids}
    assert set(added_job_ids) == expected_apscheduler_ids, (
        f"FAIL: APScheduler got wrong job IDs. Expected {expected_apscheduler_ids}, got {set(added_job_ids)}"
    )
    print("PASS test_requeue_deletes_stale_requeues_future")


# ════════════════════════════════════════════════════════════════════════════
# TEST 3 — requeue_rounds_for_position: all stale → fresh schedule created
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_requeue_all_stale_creates_fresh_schedule(db: AsyncSession):
    """
    If ALL pending rounds are in the past, requeue must create a brand-new
    schedule via schedule_rounds_for_position rather than doing nothing.
    """
    from app.services import scheduler as sched_module

    user = await make_user(db)
    employer = await make_employer(db, user.id)
    position = await make_position(db, employer.id)

    stale1 = make_round(position.id, PAST_1)
    stale2 = make_round(position.id, PAST_2)
    db.add_all([stale1, stale2])
    await db.flush()

    created_fresh = []

    async def mock_schedule_rounds(db, pos, not_before=None):
        created_fresh.append(pos.id)

    mock_scheduler = MagicMock()
    with (
        patch.object(sched_module, "scheduler", mock_scheduler),
        patch.object(sched_module, "schedule_rounds_for_position", mock_schedule_rounds),
    ):
        await sched_module.requeue_rounds_for_position(db, position)
    await db.flush()

    assert position.id in created_fresh, (
        "FAIL: schedule_rounds_for_position was NOT called when all rounds were stale. "
        "RCIC re-activates but gets zero future captures."
    )
    print("PASS test_requeue_all_stale_creates_fresh_schedule")


# ════════════════════════════════════════════════════════════════════════════
# TEST 4 — pause then requeue full round-trip
# ════════════════════════════════════════════════════════════════════════════

@pytest.mark.asyncio
async def test_pause_then_requeue_roundtrip(db: AsyncSession):
    """
    Full scenario: pause (subscription expired) → requeue (re-activated).
    Future rounds survive the full cycle and end up back in APScheduler.
    """
    from app.services import scheduler as sched_module

    user = await make_user(db)
    employer = await make_employer(db, user.id)
    position = await make_position(db, employer.id)

    future1 = make_round(position.id, FUTURE_1)
    future2 = make_round(position.id, FUTURE_2)
    db.add_all([future1, future2])
    await db.flush()
    future_ids = {future1.id, future2.id}

    mock_scheduler = MagicMock()
    added_after_requeue = []
    mock_scheduler.add_job.side_effect = lambda *a, id=None, **kw: added_after_requeue.append(id)

    with patch.object(sched_module, "scheduler", mock_scheduler):
        # Step 1: subscription expires → pause
        await sched_module.pause_rounds_for_user(db, [employer.id])

        # Step 2: RCIC re-subscribes and re-activates → requeue
        await sched_module.requeue_rounds_for_position(db, position)

    await db.flush()

    from sqlalchemy import select
    remaining = (
        await db.execute(
            select(CaptureRound).where(CaptureRound.id.in_(future_ids))
        )
    ).scalars().all()

    assert len(remaining) == 2, (
        f"FAIL: future rounds lost during pause→requeue cycle. Only {len(remaining)} remain."
    )
    expected = {f"capture_round_{rid}" for rid in future_ids}
    assert set(added_after_requeue) == expected, (
        f"FAIL: APScheduler did not get the right jobs back. "
        f"Expected {expected}, got {set(added_after_requeue)}"
    )
    print("PASS test_pause_then_requeue_roundtrip")
