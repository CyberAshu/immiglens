"""fix capture_round uniqueness constraint to use CST timezone

The existing constraint uq_capture_round_position_day was created manually outside
Alembic and enforces uniqueness on DATE(scheduled_at AT TIME ZONE 'UTC').

This is wrong: the business rule is "one capture per CST/CDT calendar day per
position", but both the immediate round (now+1h) and a noon-CST recurring round
can fall on the same UTC date during the 00:00–06:00 UTC window (= late evening
CDT the previous day), causing an IntegrityError on every position creation
during that window.

This migration:
  1. Drops the UTC-based constraint (whether it was created manually or by Alembic).
  2. Recreates it using America/Chicago so the constraint matches the business logic.

Revision ID: f6a1b2c3d4e5
Revises: e5f6a1b2c3d4
Create Date: 2026-04-07 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "f6a1b2c3d4e5"
down_revision: Union[str, None] = "e5f6a1b2c3d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old UTC-based constraint (created outside Alembic — use IF EXISTS
    # so this is safe to run on fresh installs that never had the UTC version).
    op.execute("DROP INDEX IF EXISTS uq_capture_round_position_day")

    # Identify the "loser" duplicate capture_rounds per (job_position_id, CST date).
    # For each group we keep the single best row:
    #   priority: COMPLETED > RUNNING > PENDING > FAILED, then highest id wins.
    # The losers are stored in a temp table so we can cascade-delete dependents first.
    op.execute(
        """
        CREATE TEMP TABLE _dup_round_ids AS
        SELECT id FROM (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY job_position_id,
                                    DATE(scheduled_at AT TIME ZONE 'America/Chicago')
                       ORDER BY
                           CASE status
                               WHEN 'COMPLETED' THEN 1
                               WHEN 'RUNNING'   THEN 2
                               WHEN 'PENDING'   THEN 3
                               ELSE                  4
                           END,
                           id DESC
                   ) AS rn
            FROM capture_rounds
        ) ranked
        WHERE rn > 1
        """
    )

    # Delete capture_results that belong to the loser rounds first
    # (no CASCADE on capture_results.capture_round_id FK).
    op.execute(
        "DELETE FROM capture_results WHERE capture_round_id IN (SELECT id FROM _dup_round_ids)"
    )

    # Now delete the loser rounds themselves.
    op.execute(
        "DELETE FROM capture_rounds WHERE id IN (SELECT id FROM _dup_round_ids)"
    )

    op.execute("DROP TABLE _dup_round_ids")

    # Recreate using CST/CDT so uniqueness aligns with the business-day definition.
    op.execute(
        "CREATE UNIQUE INDEX uq_capture_round_position_day "
        "ON capture_rounds "
        "(job_position_id, (DATE(scheduled_at AT TIME ZONE 'America/Chicago')))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_capture_round_position_day")

    # Restore the original UTC-based constraint.
    op.execute(
        "CREATE UNIQUE INDEX uq_capture_round_position_day "
        "ON capture_rounds "
        "(job_position_id, (DATE(scheduled_at AT TIME ZONE 'UTC')))"
    )
