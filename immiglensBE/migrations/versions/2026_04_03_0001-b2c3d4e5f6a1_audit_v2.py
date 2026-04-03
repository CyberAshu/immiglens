"""audit_v2 — production-grade audit log upgrade

Adds: actor_type, status, entity_type, entity_id, entity_label,
      description, user_agent, source, metadata columns.
Backfills entity_type from resource_type (fixing "url" → "posting").
Migrates action values to the new controlled vocabulary.
Adds composite index for the most common admin query pattern.

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-04-03 00:01:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a1"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Phase A: rename user_id → actor_id, then add new columns ─────────────
    # The initial baseline created audit_logs with a `user_id` FK column.
    # Rename it first so every subsequent step (indexes, model) uses actor_id.
    op.alter_column("audit_logs", "user_id", new_column_name="actor_id")

    op.add_column("audit_logs", sa.Column(
        "actor_type", sa.String(20), nullable=False, server_default="user"
    ))
    op.add_column("audit_logs", sa.Column(
        "status", sa.String(10), nullable=False, server_default="success"
    ))
    op.add_column("audit_logs", sa.Column(
        "entity_type", sa.String(60), nullable=True   # nullable during backfill
    ))
    op.add_column("audit_logs", sa.Column(
        "entity_id", sa.String(40), nullable=True
    ))
    op.add_column("audit_logs", sa.Column(
        "entity_label", sa.String(255), nullable=True
    ))
    op.add_column("audit_logs", sa.Column(
        "description", sa.String(500), nullable=True
    ))
    op.add_column("audit_logs", sa.Column(
        "user_agent", sa.String(500), nullable=True
    ))
    op.add_column("audit_logs", sa.Column(
        "source", sa.String(20), nullable=False, server_default="api"
    ))
    op.add_column("audit_logs", sa.Column(
        "metadata", sa.JSON(), nullable=True
    ))

    # ── Phase B: backfill entity_type from resource_type; fix "url" → "posting" ──
    op.execute("""
        UPDATE audit_logs
        SET
            entity_type = CASE
                WHEN resource_type = 'url' THEN 'posting'
                ELSE resource_type
            END,
            entity_id = CAST(resource_id AS VARCHAR)
        WHERE resource_type IS NOT NULL
    """)
    # Rows with no resource_type (e.g. auth events) get a fallback entity_type
    op.execute("""
        UPDATE audit_logs SET entity_type = 'user'
        WHERE entity_type IS NULL
    """)

    # ── Phase C: migrate action values to the new vocabulary ─────────────────
    op.execute("""
        UPDATE audit_logs SET action = CASE
            WHEN resource_type IN ('employer','position','organization',
                                   'subscription_tier','promotion','org_invitation')
                 AND action = 'CREATE' THEN
                CASE resource_type
                    WHEN 'employer'          THEN 'EMPLOYER_CREATED'
                    WHEN 'position'          THEN 'POSITION_CREATED'
                    WHEN 'organization'      THEN 'ORG_CREATED'
                    WHEN 'subscription_tier' THEN 'TIER_CREATED'
                    WHEN 'promotion'         THEN 'PROMO_CREATED'
                    WHEN 'org_invitation'    THEN 'ORG_INVITATION_SENT'
                    ELSE action
                END
            WHEN resource_type IN ('employer','position','organization',
                                   'subscription_tier','promotion','user','job_position')
                 AND action = 'UPDATE' THEN
                CASE resource_type
                    WHEN 'employer'          THEN 'EMPLOYER_UPDATED'
                    WHEN 'position'          THEN 'POSITION_UPDATED'
                    WHEN 'promotion'         THEN 'PROMO_UPDATED'
                    WHEN 'subscription_tier' THEN 'TIER_UPDATED'
                    WHEN 'user' THEN
                        CASE
                            WHEN new_data::text LIKE '%"is_admin": true%'
                              OR new_data::text LIKE '%is_admin%true%'  THEN 'USER_ADMIN_GRANTED'
                            WHEN new_data::text LIKE '%"is_admin": false%'
                              OR new_data::text LIKE '%is_admin%false%' THEN 'USER_ADMIN_REVOKED'
                            WHEN new_data::text LIKE '%tier_id%'        THEN 'USER_TIER_ASSIGNED'
                            ELSE 'EMPLOYER_UPDATED'
                        END
                    ELSE action
                END
            WHEN resource_type IN ('employer','position','organization',
                                   'subscription_tier','user','org_member','url')
                 AND action = 'DELETE' THEN
                CASE resource_type
                    WHEN 'employer'          THEN 'EMPLOYER_DELETED'
                    WHEN 'position'          THEN 'POSITION_DELETED'
                    WHEN 'organization'      THEN 'ORG_DELETED'
                    WHEN 'subscription_tier' THEN 'TIER_DEACTIVATED'
                    WHEN 'user'              THEN 'USER_DELETED_BY_ADMIN'
                    WHEN 'org_member'        THEN 'ORG_MEMBER_REMOVED'
                    WHEN 'url'               THEN 'POSTING_DELETED'
                    ELSE action
                END
            WHEN resource_type = 'url' AND action = 'CREATE' THEN 'POSTING_CREATED'
            WHEN resource_type = 'url' AND action = 'UPDATE' THEN 'POSTING_UPDATED'
            WHEN resource_type = 'capture_round' AND action = 'CREATE' THEN 'CAPTURE_TRIGGERED'
            WHEN action = 'EARLY_REPORT_ACKNOWLEDGED'                   THEN 'REPORT_EARLY_ACKNOWLEDGED'
            ELSE action
        END
    """)

    # ── Phase D: make entity_type NOT NULL now that every row has a value ────
    op.alter_column("audit_logs", "entity_type", nullable=False)

    # ── Phase E: new indexes ─────────────────────────────────────────────────
    op.create_index("ix_audit_logs_entity_type",  "audit_logs", ["entity_type"])
    op.create_index("ix_audit_logs_status",        "audit_logs", ["status"])
    op.create_index("ix_audit_logs_actor_type",    "audit_logs", ["actor_type"])
    op.create_index("ix_audit_logs_source",        "audit_logs", ["source"])
    op.create_index(
        "ix_audit_logs_actor_created",
        "audit_logs", ["actor_id", "created_at"],
    )

    # resource_type / resource_id columns are kept for backward compatibility.
    # They will be dropped in a separate Phase-7 cleanup migration after the
    # frontend has migrated to the new field names.


def downgrade() -> None:
    op.drop_index("ix_audit_logs_actor_created", "audit_logs")
    op.drop_index("ix_audit_logs_source",        "audit_logs")
    op.drop_index("ix_audit_logs_actor_type",    "audit_logs")
    op.drop_index("ix_audit_logs_status",        "audit_logs")
    op.drop_index("ix_audit_logs_entity_type",   "audit_logs")
    for col in ["metadata", "source", "user_agent", "description",
                "entity_label", "entity_id", "entity_type", "status", "actor_type"]:
        op.drop_column("audit_logs", col)
    # Rename actor_id back to user_id
    op.alter_column("audit_logs", "actor_id", new_column_name="user_id")
