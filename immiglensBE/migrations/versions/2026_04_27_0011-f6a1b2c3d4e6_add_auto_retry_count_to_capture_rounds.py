"""add auto_retry_count to capture_rounds

Revision ID: f6a1b2c3d4e6
Revises: e5f6a1b2c4d5
Create Date: 2026-04-27 00:11:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a1b2c3d4e6"
down_revision: Union[str, None] = "e5f6a1b2c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "capture_rounds",
        sa.Column(
            "auto_retry_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("capture_rounds", "auto_retry_count")
