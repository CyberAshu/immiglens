"""add runtime identity and modal fields to capture_results

Revision ID: e5f6a1b2c4d5
Revises: d4e5f6a1b2c4
Create Date: 2026-04-22 00:10:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a1b2c4d5"
down_revision: Union[str, None] = "d4e5f6a1b2c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "capture_results",
        sa.Column("proxy_used", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "capture_results",
        sa.Column("proxy_session", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "capture_results",
        sa.Column("profile_id", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "capture_results",
        sa.Column("modal_detected", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "capture_results",
        sa.Column("modal_remaining", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "capture_results",
        sa.Column("modal_actions_clicked", sa.Integer(), nullable=True),
    )
    op.add_column(
        "capture_results",
        sa.Column("modal_actions_hidden", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("capture_results", "modal_actions_hidden")
    op.drop_column("capture_results", "modal_actions_clicked")
    op.drop_column("capture_results", "modal_remaining")
    op.drop_column("capture_results", "modal_detected")
    op.drop_column("capture_results", "profile_id")
    op.drop_column("capture_results", "proxy_session")
    op.drop_column("capture_results", "proxy_used")
