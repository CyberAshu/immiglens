"""initial baseline — captures entire schema as of April 2026

This revision was generated to baseline an **already-existing production
database**.  It contains a complete CREATE TABLE / DROP TABLE script that:

  * lets fresh environments (local dev, staging, CI) be stood up from scratch
    via ``alembic upgrade head``
  * is skipped on the live production database by running once:
      alembic stamp a1b2c3d4e5f6

DO NOT run ``alembic upgrade head`` against production before stamping.
See README → "Alembic first-run on production" for the safe procedure.

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2026-04-02 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_capturestatus_enum(bind) -> None:
    """Create the native PostgreSQL ENUM used by capture_rounds.status."""
    op.execute(
        "DO $$ BEGIN "
        "  CREATE TYPE capturestatus AS ENUM ('pending', 'running', 'completed', 'failed'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; "
        "END $$"
    )


def _drop_capturestatus_enum() -> None:
    op.execute("DROP TYPE IF EXISTS capturestatus")


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:
    # ── 1. Native PostgreSQL enum ─────────────────────────────────────────
    _create_capturestatus_enum(op.get_bind())

    # ── 2. subscription_tiers (no FK deps) ───────────────────────────────
    op.create_table(
        "subscription_tiers",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=False),
        sa.Column("max_active_positions", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("max_urls_per_position", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("max_captures_per_month", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("min_capture_frequency_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("price_per_month", sa.Float(), nullable=True),
        sa.Column("stripe_product_id", sa.String(100), nullable=True),
        sa.Column("stripe_price_id", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("name", name=op.f("uq_subscription_tiers_name")),
    )
    op.create_index(op.f("ix_subscription_tiers_name"), "subscription_tiers", ["name"])

    # ── 3. users ─────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tier_id", sa.Integer(), nullable=True),
        sa.Column("tier_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stripe_customer_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("privacy_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acceptable_use_accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["tier_id"], ["subscription_tiers.id"], name=op.f("fk_users_tier_id_subscription_tiers")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"])
    op.create_index(op.f("ix_users_tier_id"), "users", ["tier_id"])

    # ── 4. organizations ─────────────────────────────────────────────────
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_organizations_created_by_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_organizations")),
    )
    op.create_index(op.f("ix_organizations_created_by"), "organizations", ["created_by"])

    # ── 5. employers ─────────────────────────────────────────────────────
    op.create_table(
        "employers",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=True),
        sa.Column("business_name", sa.String(255), nullable=False),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("contact_person", sa.String(255), nullable=False),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("contact_phone", sa.String(50), nullable=True),
        sa.Column("business_number", sa.String(30), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"], ["organizations.id"], name=op.f("fk_employers_org_id_organizations")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_employers_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employers")),
    )
    op.create_index(op.f("ix_employers_user_id"), "employers", ["user_id"])
    op.create_index(op.f("ix_employers_org_id"), "employers", ["org_id"])

    # ── 6. job_positions ─────────────────────────────────────────────────
    op.create_table(
        "job_positions",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("employer_id", sa.Integer(), nullable=False),
        sa.Column("job_title", sa.String(255), nullable=False),
        sa.Column("noc_code", sa.String(10), nullable=False),
        sa.Column("num_positions", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("capture_frequency_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("wage", sa.String(100), nullable=True),
        sa.Column("work_location", sa.String(255), nullable=True),
        sa.Column("wage_stream", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["employer_id"],
            ["employers.id"],
            name=op.f("fk_job_positions_employer_id_employers"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_job_positions")),
    )
    op.create_index(op.f("ix_job_positions_employer_id"), "job_positions", ["employer_id"])

    # ── 7. job_urls ──────────────────────────────────────────────────────
    op.create_table(
        "job_urls",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("job_position_id", sa.Integer(), nullable=False),
        sa.Column("platform", sa.String(255), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_position_id"],
            ["job_positions.id"],
            name=op.f("fk_job_urls_job_position_id_job_positions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_job_urls")),
    )
    op.create_index(op.f("ix_job_urls_job_position_id"), "job_urls", ["job_position_id"])

    # ── 8. capture_rounds ────────────────────────────────────────────────
    op.create_table(
        "capture_rounds",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("job_position_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending", "running", "completed", "failed",
                name="capturestatus",
                create_type=False,  # already created above
            ),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_position_id"],
            ["job_positions.id"],
            name=op.f("fk_capture_rounds_job_position_id_job_positions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_capture_rounds")),
    )
    op.create_index(op.f("ix_capture_rounds_job_position_id"), "capture_rounds", ["job_position_id"])
    op.create_index(op.f("ix_capture_rounds_scheduled_at"), "capture_rounds", ["scheduled_at"])
    op.create_index(op.f("ix_capture_rounds_status"), "capture_rounds", ["status"])

    # ── 9. capture_results ───────────────────────────────────────────────
    op.create_table(
        "capture_results",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("capture_round_id", sa.Integer(), nullable=False),
        sa.Column("job_url_id", sa.Integer(), nullable=False),
        sa.Column("url", sa.String(2048), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),   # native_enum=False VARCHAR
        sa.Column("screenshot_path", sa.String(500), nullable=True),
        sa.Column("screenshot_url", sa.String(500), nullable=True),
        sa.Column("page_pdf_url", sa.String(1024), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["capture_round_id"],
            ["capture_rounds.id"],
            name=op.f("fk_capture_results_capture_round_id_capture_rounds"),
        ),
        sa.ForeignKeyConstraint(
            ["job_url_id"],
            ["job_urls.id"],
            name=op.f("fk_capture_results_job_url_id_job_urls"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_capture_results")),
    )
    op.create_index(op.f("ix_capture_results_capture_round_id"), "capture_results", ["capture_round_id"])
    op.create_index(op.f("ix_capture_results_job_url_id"), "capture_results", ["job_url_id"])
    op.create_index(op.f("ix_capture_results_status"), "capture_results", ["status"])

    # ── 10. report_documents ─────────────────────────────────────────────
    op.create_table(
        "report_documents",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("job_position_id", sa.Integer(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(500), nullable=False),
        sa.Column("doc_type", sa.String(50), nullable=False, server_default="supporting"),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["job_position_id"],
            ["job_positions.id"],
            name=op.f("fk_report_documents_job_position_id_job_positions"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_report_documents")),
    )
    op.create_index(op.f("ix_report_documents_job_position_id"), "report_documents", ["job_position_id"])

    # ── 11. audit_logs ───────────────────────────────────────────────────
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("employer_id", sa.Integer(), nullable=True),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column("old_data", sa.JSON(), nullable=True),
        sa.Column("new_data", sa.JSON(), nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_audit_logs_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_user_id"), "audit_logs", ["user_id"])
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"])
    op.create_index(op.f("ix_audit_logs_resource_type"), "audit_logs", ["resource_type"])
    op.create_index(op.f("ix_audit_logs_employer_id"), "audit_logs", ["employer_id"])
    op.create_index(op.f("ix_audit_logs_position_id"), "audit_logs", ["position_id"])
    op.create_index(op.f("ix_audit_logs_created_at"), "audit_logs", ["created_at"])

    # ── 12. notification_preferences ─────────────────────────────────────
    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False),    # native_enum=False
        sa.Column("channel", sa.String(20), nullable=False),       # native_enum=False
        sa.Column("destination", sa.String(500), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_notification_preferences_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notification_preferences")),
    )
    op.create_index(op.f("ix_notification_preferences_user_id"), "notification_preferences", ["user_id"])
    op.create_index(op.f("ix_notification_preferences_event_type"), "notification_preferences", ["event_type"])

    # ── 13. notification_logs ─────────────────────────────────────────────
    op.create_table(
        "notification_logs",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("preference_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=True),
        sa.Column("trigger_id", sa.Integer(), nullable=True),
        sa.Column("trigger_type", sa.String(50), nullable=True),
        sa.Column("context_json", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),        # native_enum=False
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["preference_id"],
            ["notification_preferences.id"],
            name=op.f("fk_notification_logs_preference_id_notification_preferences"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notification_logs")),
    )
    op.create_index(op.f("ix_notification_logs_preference_id"), "notification_logs", ["preference_id"])
    op.create_index(op.f("ix_notification_logs_event_type"), "notification_logs", ["event_type"])
    op.create_index(op.f("ix_notification_logs_status"), "notification_logs", ["status"])

    # ── 14. org_memberships ──────────────────────────────────────────────
    op.create_table(
        "org_memberships",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),          # native_enum=False
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_org_memberships_org_id_organizations"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_org_memberships_user_id_users"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_memberships")),
        sa.UniqueConstraint("org_id", "user_id", name="uq_org_membership"),
    )
    op.create_index(op.f("ix_org_memberships_org_id"), "org_memberships", ["org_id"])
    op.create_index(op.f("ix_org_memberships_user_id"), "org_memberships", ["user_id"])

    # ── 15. org_invitations ──────────────────────────────────────────────
    op.create_table(
        "org_invitations",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("invited_by", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),          # native_enum=False
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["invited_by"],
            ["users.id"],
            name=op.f("fk_org_invitations_invited_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["org_id"],
            ["organizations.id"],
            name=op.f("fk_org_invitations_org_id_organizations"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_invitations")),
        sa.UniqueConstraint("token", name=op.f("uq_org_invitations_token")),
    )
    op.create_index(op.f("ix_org_invitations_org_id"), "org_invitations", ["org_id"])
    op.create_index(op.f("ix_org_invitations_invited_by"), "org_invitations", ["invited_by"])
    op.create_index(op.f("ix_org_invitations_email"), "org_invitations", ["email"])
    op.create_index(op.f("ix_org_invitations_token"), "org_invitations", ["token"])

    # ── 16. posting_snapshots ────────────────────────────────────────────
    op.create_table(
        "posting_snapshots",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("job_url_id", sa.Integer(), nullable=False),
        sa.Column("capture_result_id", sa.Integer(), nullable=True),
        sa.Column("page_hash", sa.String(64), nullable=True),
        sa.Column("has_changed", sa.Boolean(), nullable=True),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["capture_result_id"],
            ["capture_results.id"],
            name=op.f("fk_posting_snapshots_capture_result_id_capture_results"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["job_url_id"],
            ["job_urls.id"],
            name=op.f("fk_posting_snapshots_job_url_id_job_urls"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_posting_snapshots")),
        sa.UniqueConstraint("capture_result_id", name=op.f("uq_posting_snapshots_capture_result_id")),
    )
    op.create_index(op.f("ix_posting_snapshots_job_url_id"), "posting_snapshots", ["job_url_id"])
    op.create_index(op.f("ix_posting_snapshots_captured_at"), "posting_snapshots", ["captured_at"])

    # ── 17. report_config ────────────────────────────────────────────────
    op.create_table(
        "report_config",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_report_config")),
    )

    # ── 18. otp_records ──────────────────────────────────────────────────
    op.create_table(
        "otp_records",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("otp_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_otp_records_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_otp_records")),
    )
    op.create_index(op.f("ix_otp_records_user_id"), "otp_records", ["user_id"])

    # ── 19. trusted_devices ──────────────────────────────────────────────
    op.create_table(
        "trusted_devices",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("device_name", sa.String(120), nullable=True),
        sa.Column("browser", sa.String(80), nullable=True),
        sa.Column("os", sa.String(80), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_trusted_devices_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trusted_devices")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_trusted_devices_token_hash")),
    )
    op.create_index(op.f("ix_trusted_devices_user_id"), "trusted_devices", ["user_id"])
    op.create_index(op.f("ix_trusted_devices_token_hash"), "trusted_devices", ["token_hash"])

    # ── 20. noc_codes ────────────────────────────────────────────────────
    op.create_table(
        "noc_codes",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("code", sa.String(10), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("teer", sa.Integer(), nullable=False),
        sa.Column("major_group", sa.Integer(), nullable=False),
        sa.Column("version_year", sa.Integer(), nullable=False, server_default="2021"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_noc_codes")),
        sa.UniqueConstraint("code", name="uq_noc_codes_code"),
    )
    op.create_index(op.f("ix_noc_codes_code"), "noc_codes", ["code"])

    # ── 21. password_reset_tokens ────────────────────────────────────────
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_password_reset_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_password_reset_tokens")),
    )
    op.create_index(op.f("ix_password_reset_tokens_user_id"), "password_reset_tokens", ["user_id"])

    # ── 22. promotions ───────────────────────────────────────────────────
    op.create_table(
        "promotions",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("show_on_pricing_page", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("stripe_coupon_id", sa.String(100), nullable=True),
        sa.Column("discount_type", sa.String(20), nullable=False),
        sa.Column("discount_value", sa.Float(), nullable=False),
        sa.Column("duration", sa.String(20), nullable=False, server_default="forever"),
        sa.Column("duration_in_months", sa.Integer(), nullable=True),
        sa.Column("max_redemptions", sa.Integer(), nullable=True),
        sa.Column("redemptions_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("valid_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_promotions")),
        sa.UniqueConstraint("code", name="uq_promotions_code"),
    )

    # ── 23. promotion_redemptions ────────────────────────────────────────
    op.create_table(
        "promotion_redemptions",
        sa.Column("id", sa.Integer(), nullable=False, primary_key=True),
        sa.Column("promotion_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["promotion_id"],
            ["promotions.id"],
            name=op.f("fk_promotion_redemptions_promotion_id_promotions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_promotion_redemptions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_promotion_redemptions")),
    )
    op.create_index(op.f("ix_promotion_redemptions_promotion_id"), "promotion_redemptions", ["promotion_id"])
    op.create_index(op.f("ix_promotion_redemptions_user_id"), "promotion_redemptions", ["user_id"])


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    # Drop tables in reverse FK-dependency order
    op.drop_table("promotion_redemptions")
    op.drop_table("promotions")
    op.drop_table("password_reset_tokens")
    op.drop_table("noc_codes")
    op.drop_table("trusted_devices")
    op.drop_table("otp_records")
    op.drop_table("report_config")
    op.drop_table("posting_snapshots")
    op.drop_table("org_invitations")
    op.drop_table("org_memberships")
    op.drop_table("notification_logs")
    op.drop_table("notification_preferences")
    op.drop_table("audit_logs")
    op.drop_table("report_documents")
    op.drop_table("capture_results")
    op.drop_table("capture_rounds")
    op.drop_table("job_urls")
    op.drop_table("job_positions")
    op.drop_table("employers")
    op.drop_table("organizations")
    op.drop_table("users")
    op.drop_table("subscription_tiers")

    _drop_capturestatus_enum()
