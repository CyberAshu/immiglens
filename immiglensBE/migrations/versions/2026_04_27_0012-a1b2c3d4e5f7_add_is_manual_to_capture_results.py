"""add is_manual to capture_results

Revision ID: b3c4d5e6f7a2
Revises: f6a1b2c3d4e6
Create Date: 2026-04-27 00:12:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a2"
down_revision: Union[str, None] = "f6a1b2c3d4e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "capture_results",
        sa.Column(
            "is_manual",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("capture_results", "is_manual")
