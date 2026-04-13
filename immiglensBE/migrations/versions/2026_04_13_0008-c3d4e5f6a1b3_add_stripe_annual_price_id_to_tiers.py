"""add stripe_annual_price_id to subscription_tiers

Revision ID: c3d4e5f6a1b3
Revises: b2c3d4e5f6a2
Create Date: 2026-04-13 00:01:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a1b3"
down_revision: Union[str, None] = "b2c3d4e5f6a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "subscription_tiers",
        sa.Column("stripe_annual_price_id", sa.String(100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("subscription_tiers", "stripe_annual_price_id")
