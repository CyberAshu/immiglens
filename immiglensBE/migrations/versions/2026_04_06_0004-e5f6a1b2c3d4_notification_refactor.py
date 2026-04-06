"""notification_refactor: remove preference rules, add user_id to logs, add notification_email to users

Revision ID: e5f6a1b2c3d4
Revises: d4e5f6a1b2c3
Create Date: 2026-04-06 00:00:01.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a1b2c3d4"
down_revision: Union[str, None] = "d4e5f6a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add notification_email override column to users
    op.add_column(
        "users",
        sa.Column("notification_email", sa.String(255), nullable=True),
    )

    # 2. Add user_id column to notification_logs (nullable initially for data migration)
    op.add_column(
        "notification_logs",
        sa.Column("user_id", sa.Integer(), nullable=True),
    )

    # 3. Back-fill user_id from the linked notification_preferences row
    op.execute(
        """
        UPDATE notification_logs nl
        SET user_id = (
            SELECT np.user_id
            FROM notification_preferences np
            WHERE np.id = nl.preference_id
        )
        WHERE nl.preference_id IS NOT NULL
        """
    )

    # 4. Create FK index and constraint for user_id (after back-fill)
    op.create_index("ix_notification_logs_user_id", "notification_logs", ["user_id"])
    op.create_foreign_key(
        "fk_notification_logs_user_id",
        "notification_logs",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 5. Drop the FK constraint that links notification_logs.preference_id →
    #    notification_preferences.id.  This must happen before we can drop the
    #    referenced table.  PostgreSQL requires an explicit DROP CONSTRAINT;
    #    batch_alter_table handles the SQLite equivalent automatically.
    with op.batch_alter_table("notification_logs") as batch:
        batch.drop_constraint(
            "fk_notification_logs_preference_id_notification_preferences",
            type_="foreignkey",
        )
        batch.alter_column("preference_id", existing_type=sa.Integer(), nullable=True)

    # 6. Drop the notification_preferences table (no remaining dependents)
    op.drop_table("notification_preferences")


def downgrade() -> None:
    # Recreate notification_preferences (minimal schema — data is not recoverable)
    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("destination", sa.String(500), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Re-add preference_id NOT NULL constraint (will fail if any rows lack it)
    with op.batch_alter_table("notification_logs") as batch:
        batch.alter_column("preference_id", existing_type=sa.Integer(), nullable=False)

    # Remove user_id column and FK
    op.drop_constraint("fk_notification_logs_user_id", "notification_logs", type_="foreignkey")
    op.drop_index("ix_notification_logs_user_id", table_name="notification_logs")
    op.drop_column("notification_logs", "user_id")

    # Remove notification_email from users
    op.drop_column("users", "notification_email")
