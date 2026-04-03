"""audit_hotfix — make resource_type / resource_id nullable

The v2 migration (b2c3d4e5f6a1) added new columns and backfilled them but
did NOT drop the NOT NULL constraint on the legacy resource_type column.
All new audit inserts omit resource_type (the new schema uses entity_type),
causing:

    NotNullViolationError: null value in column "resource_type" violates
    not-null constraint

This migration drops the constraint immediately. The legacy columns are kept
for backward-compatibility and will be removed in a future Phase-7 cleanup.

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-04-03 12:50:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "c3d4e5f6a1b2"
down_revision: Union[str, None] = "b2c3d4e5f6a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make legacy columns nullable — new inserts no longer populate them
    op.alter_column("audit_logs", "resource_type", nullable=True)
    op.alter_column("audit_logs", "resource_id",   nullable=True)


def downgrade() -> None:
    # Fill any NULLs before re-applying NOT NULL
    op.execute("UPDATE audit_logs SET resource_type = 'unknown' WHERE resource_type IS NULL")
    op.alter_column("audit_logs", "resource_type", nullable=False)
    # resource_id was already nullable in the original schema — leave it
