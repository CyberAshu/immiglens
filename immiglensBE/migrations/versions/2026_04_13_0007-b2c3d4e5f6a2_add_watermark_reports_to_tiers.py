"""add watermark_reports to subscription_tiers

Revision ID: b2c3d4e5f6a2
Revises: a1b2c3d4e5f7
Create Date: 2026-04-13 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a2"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add with server_default=true so existing rows get watermark_reports=True
    # (conservative default: restrict first, then unlock for paid tiers below).
    op.add_column(
        "subscription_tiers",
        sa.Column(
            "watermark_reports",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )

    # Immediately disable watermarking for all non-free tiers that already
    # exist in the database.  Without this, every existing paid subscriber
    # would receive watermarked reports the moment this migration runs.
    op.execute(
        "UPDATE subscription_tiers SET watermark_reports = false WHERE name != 'free'"
    )


def downgrade() -> None:
    op.drop_column("subscription_tiers", "watermark_reports")
