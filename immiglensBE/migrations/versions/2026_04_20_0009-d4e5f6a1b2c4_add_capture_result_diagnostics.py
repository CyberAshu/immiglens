"""add failure_category, response_status, page_title to capture_results

Revision ID: d4e5f6a1b2c4
Revises: c3d4e5f6a1b3
Create Date: 2026-04-20 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a1b2c4"
down_revision: Union[str, None] = "c3d4e5f6a1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "capture_results",
        sa.Column("failure_category", sa.String(30), nullable=True),
    )
    op.create_index(
        "ix_capture_results_failure_category",
        "capture_results",
        ["failure_category"],
    )
    op.add_column(
        "capture_results",
        sa.Column("response_status", sa.SmallInteger(), nullable=True),
    )
    op.add_column(
        "capture_results",
        sa.Column("page_title", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("capture_results", "page_title")
    op.drop_column("capture_results", "response_status")
    op.drop_index("ix_capture_results_failure_category", table_name="capture_results")
    op.drop_column("capture_results", "failure_category")
