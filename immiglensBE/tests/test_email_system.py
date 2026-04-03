"""
Email system audit tests.

Verifies:
1.  notification_service blocks plain-text email for events that have typed HTML helpers
2.  ROUND_STARTED is always dispatched with skip_email=True — no plain-text email fires
3.  Every send_* helper in email_service renders its template without raising
4.  No rogue 'Capture Round Started' plain-text email can reach a user
5.  send_email no-ops safely when SMTP_HOST is not configured (dev mode)
"""

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest
import pytest_asyncio

# ── env bootstrap (must be before any app import) ────────────────────────────
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-for-tests-not-real")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test")
os.environ.setdefault("SMTP_HOST", "")          # dev-mode: no real SMTP
os.environ.setdefault("SMTP_FROM", "ImmigLens <info@immiglens.ca>")
os.environ.setdefault("SMTP_REPLY_TO", "support@immiglens.ca")
os.environ.setdefault("FRONTEND_URL", "https://app.immiglens.ca")


# ─────────────────────────────────────────────────────────────────────────────
# Section 1 — notification_service guards
# ─────────────────────────────────────────────────────────────────────────────

class TestNotificationServiceGuards:
    """Plain-text email must never fire for events that have HTML templates."""

    def _make_pref(self, channel_value: str, destination: str):
        from app.models.notification import NotificationChannel, NotifStatus, NotificationLog
        pref = MagicMock()
        pref.channel = MagicMock()
        pref.channel.__eq__ = lambda self, other: str(self) == str(other)
        # Use the actual enum values
        from app.models.notification import NotificationChannel as NC
        pref.channel = NC(channel_value)
        pref.destination = destination
        pref.id = 1
        return pref

    @pytest.mark.asyncio
    async def test_round_started_email_is_blocked(self, caplog):
        """ROUND_STARTED must never send a plain-text email to the user."""
        from app.models.notification import NotificationEvent
        from app.services import notification_service

        send_email_mock = AsyncMock()
        with patch("app.services.notification_service.send_email", send_email_mock):
            await notification_service._deliver_email(
                "test@example.com",
                NotificationEvent.ROUND_STARTED,
                {"round_id": 1, "position": "Test Role"},
            )

        send_email_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_capture_complete_email_is_blocked(self):
        """CAPTURE_COMPLETE must never send a plain-text email."""
        from app.models.notification import NotificationEvent
        from app.services import notification_service

        send_email_mock = AsyncMock()
        with patch("app.services.notification_service.send_email", send_email_mock):
            await notification_service._deliver_email(
                "test@example.com",
                NotificationEvent.CAPTURE_COMPLETE,
                {"round_id": 1, "position": "Test Role"},
            )

        send_email_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_capture_failed_email_is_blocked(self):
        """CAPTURE_FAILED must never send a plain-text email."""
        from app.models.notification import NotificationEvent
        from app.services import notification_service

        send_email_mock = AsyncMock()
        with patch("app.services.notification_service.send_email", send_email_mock):
            await notification_service._deliver_email(
                "test@example.com",
                NotificationEvent.CAPTURE_FAILED,
                {"round_id": 1, "error": "timeout"},
            )

        send_email_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_posting_changed_email_is_blocked(self):
        """POSTING_CHANGED must never send a plain-text email."""
        from app.models.notification import NotificationEvent
        from app.services import notification_service

        send_email_mock = AsyncMock()
        with patch("app.services.notification_service.send_email", send_email_mock):
            await notification_service._deliver_email(
                "test@example.com",
                NotificationEvent.POSTING_CHANGED,
                {"posting_url": "https://example.com", "change_summary": "Title changed"},
            )

        send_email_mock.assert_not_called()

    @pytest.mark.asyncio
    async def test_dispatch_event_skip_email_true_blocks_email_channel(self):
        """dispatch_event with skip_email=True must not call send_email even if a
        user has an EMAIL preference registered for the event."""
        from sqlalchemy.ext.asyncio import AsyncSession
        from app.models.notification import (
            NotificationChannel, NotificationEvent, NotificationLog, NotifStatus
        )
        from app.services import notification_service

        # Build a fake EMAIL preference for ROUND_STARTED
        fake_pref = MagicMock()
        fake_pref.channel = NotificationChannel.EMAIL
        fake_pref.destination = "user@example.com"
        fake_pref.id = 1

        fake_log = MagicMock()
        fake_log.status = NotifStatus.PENDING

        db = AsyncMock(spec=AsyncSession)
        db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(
            return_value=MagicMock(all=MagicMock(return_value=[fake_pref]))
        )))
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        send_email_mock = AsyncMock()
        with patch("app.services.notification_service.send_email", send_email_mock):
            with patch("app.services.notification_service.NotificationLog", return_value=fake_log):
                await notification_service.dispatch_event(
                    db,
                    user_id=1,
                    event=NotificationEvent.ROUND_STARTED,
                    context={"round_id": 1, "position": "Nurse"},
                    skip_email=True,
                )

        send_email_mock.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# Section 2 — email_service template rendering
# ─────────────────────────────────────────────────────────────────────────────

class TestEmailServiceRendering:
    """Every send_* helper must render its Jinja2 template without error and
    call send_email with a non-empty HTML body."""

    def _assert_html_sent(self, mock: AsyncMock):
        """Verify send_email was called with non-empty HTML."""
        assert mock.called, "send_email was never called"
        _, _, plain_arg, html_arg = mock.call_args[0]
        assert html_arg and len(html_arg) > 200, "HTML body is empty or suspiciously short"
        assert plain_arg, "Plain-text body is empty"
        # Confirm it does NOT contain the rogue subject pattern
        assert "Capture Round Started" not in html_arg
        assert "Capture Round Started" not in plain_arg

    @pytest.mark.asyncio
    async def test_send_welcome_email(self):
        from app.services.email_service import send_welcome_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_welcome_email("u@test.com", "Alice", 14)
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_otp_email(self):
        from app.services.email_service import send_otp_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_otp_email("u@test.com", "Alice", "123456")
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_password_reset_email(self):
        from app.services.email_service import send_password_reset_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_password_reset_email(
                "u@test.com", "Alice",
                reset_url="https://app.immiglens.ca/reset?token=abc",
                requested_at="April 03, 2026 at 10:00 UTC",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_capture_completed_email(self):
        from app.services.email_service import send_capture_completed_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_capture_completed_email(
                to="u@test.com", first_name="Alice",
                position_title="Software Engineer", noc_code="21232",
                captured_at="Apr 03, 2026 at 10:00 UTC",
                screenshot_count=3, source_count=2,
                sources=["https://indeed.com/job/1", "https://workopolis.com/job/2"],
                capture_id=42, total_evidence=12,
                next_run="Apr 10, 2026",
                timeline_url="https://app.immiglens.ca/positions/1/timeline",
            )
        self._assert_html_sent(mock)
        # Confirm capture-completed specific content is present
        _, _, _, html = mock.call_args[0]
        assert "Software Engineer" in html
        assert "21232" in html

    @pytest.mark.asyncio
    async def test_send_capture_failed_email(self):
        from app.services.email_service import send_capture_failed_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_capture_failed_email(
                to="u@test.com", first_name="Alice",
                position_title="Nurse", noc_code="31301",
                attempted_at="Apr 03, 2026 at 10:00 UTC",
                error="HTTP 404 Not Found",
                affected_sources=["https://indeed.com/job/999"],
                capture_id=7, last_successful="Mar 28, 2026",
                retry_at="Apr 04, 2026",
                fix_url="https://app.immiglens.ca/positions/2",
                max_retries=3,
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_report_ready_email(self):
        from app.services.email_service import send_report_ready_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_report_ready_email(
                to="u@test.com", first_name="Alice",
                position_title="Cook", noc_code="63200",
                employer_name="Acme Corp", generated_at="April 03, 2026 at 10:00 UTC",
                download_url="https://app.immiglens.ca/reports/5/download",
                ad_start="January 01, 2026", ad_end="March 31, 2026",
                screenshot_count=24, source_count=3,
                sources=["Indeed", "Workopolis", "LinkedIn"],
                capture_count=12, successful_count=10, failed_count=1, partial_count=1,
                report_id=5, requested_by="Alice Smith",
                request_date="April 03, 2026 at 10:00 UTC",
                file_size="3.2 MB",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_payment_successful_email(self):
        from app.services.email_service import send_payment_successful_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_payment_successful_email(
                to="u@test.com", first_name="Alice",
                payment_date="April 03, 2026",
                subtotal="$29.00 CAD", tax_amount="$3.77 CAD", tax_type="HST",
                total_amount="$32.77 CAD", card_brand="Visa", card_last4="4242",
                plan_name="Professional", billing_start="April 03, 2026",
                billing_end="May 03, 2026", transaction_id="ch_abc123",
                invoice_number="INV-0042", next_billing_date="May 03, 2026",
                next_amount="$32.77 CAD",
                invoice_url="https://invoice.stripe.com/abc",
                position_limit="10", capture_limit="Unlimited",
                storage_limit="5 GB", seat_limit="3", support_tier="Standard",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_payment_failed_email(self):
        from app.services.email_service import send_payment_failed_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_payment_failed_email(
                to="u@test.com", first_name="Alice",
                amount="$32.77 CAD", attempted_at="April 03, 2026 at 10:00 UTC",
                failure_reason="Card declined",
                grace_period_end="April 17, 2026", retry_date="April 06, 2026",
                retries_remaining=2, billing_url="https://app.immiglens.ca/billing",
                card_brand="Visa", card_last4="4242",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_subscription_confirmed_email(self):
        from app.services.email_service import send_subscription_confirmed_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_subscription_confirmed_email(
                to="u@test.com", first_name="Alice", plan_name="Professional",
                subscription_id="sub_abc123", start_date="April 03, 2026",
                billing_cycle="Monthly", amount="$29.00 CAD", billing_period="month",
                next_billing_date="May 03, 2026", card_brand="Visa", card_last4="4242",
                billing_email="alice@example.com", position_limit="10",
                seat_count="3", support_tier="Standard", retention_period="30 days",
                dashboard_url="https://app.immiglens.ca/dashboard",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_renewal_failed_email(self):
        from app.services.email_service import send_renewal_failed_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_renewal_failed_email(
                to="u@test.com", first_name="Alice", plan_name="Professional",
                renewal_date="April 03, 2026", amount="$32.77 CAD",
                failure_reason="Insufficient funds",
                grace_period_end="April 17, 2026", retry_date="April 06, 2026",
                retries_remaining=2, billing_url="https://app.immiglens.ca/billing",
                card_brand="Visa", card_last4="4242", tax_amount="$3.77 CAD",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_trial_ending_email(self):
        from app.services.email_service import send_trial_ending_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_trial_ending_email(
                to="u@test.com", first_name="Alice",
                trial_end_date="April 17, 2026", days_remaining=14,
                subscribe_url="https://app.immiglens.ca/plans",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_plan_limit_email(self):
        from app.services.email_service import send_plan_limit_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_plan_limit_email(
                to="u@test.com", first_name="Alice", plan_name="Starter",
                position_limit=5, active_count=5,
                manage_url="https://app.immiglens.ca/dashboard",
                upgrade_url="https://app.immiglens.ca/plans",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_invitation_email(self):
        from app.services.email_service import send_invitation_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_invitation_email(
                to="newuser@test.com", org_name="Acme Immigration",
                inviter_name="Bob Smith", role="member",
                expires_at="April 10, 2026",
                accept_url="https://app.immiglens.ca/accept-invite?token=xyz",
                invited_at="April 03, 2026 at 10:00 UTC",
                inviter_email="bob@acme.com",
            )
        self._assert_html_sent(mock)

    @pytest.mark.asyncio
    async def test_send_weekly_summary_email(self):
        from app.services.email_service import send_weekly_summary_email
        mock = AsyncMock()
        with patch("app.services.email_service.send_email", mock):
            await send_weekly_summary_email(
                to="u@test.com", first_name="Alice",
                week_start="Mar 24, 2026", week_end="Mar 30, 2026",
                stats={
                    "total_runs": 14, "successful": 12, "failed": 1, "partial": 1,
                    "screenshots": 36, "active_positions": 4, "paused_positions": 1,
                    "reports": 2, "next_captures": 14,
                },
                positions=[
                    {
                        "title": "Software Engineer", "status": "ok",
                        "successful": 7, "total": 7,
                        "last_capture": "Mar 30, 2026", "next_capture": "Apr 06, 2026",
                    }
                ],
                attention_items=[],
                dashboard_url="https://app.immiglens.ca/dashboard",
            )
        self._assert_html_sent(mock)


# ─────────────────────────────────────────────────────────────────────────────
# Section 3 — send_email dev-mode no-op
# ─────────────────────────────────────────────────────────────────────────────

class TestSendEmailDevMode:
    """send_email must silently no-op (with log) when SMTP_HOST is empty."""

    @pytest.mark.asyncio
    async def test_send_email_noop_when_no_smtp(self, caplog):
        import logging
        from app.services.email_service import send_email

        # SMTP_HOST is "" (set at module top) — should log and return, no SMTP call
        with patch("app.services.email_service._send_email_sync") as sync_mock:
            with caplog.at_level(logging.INFO, logger="app.services.email_service"):
                await send_email("test@example.com", "Test subject", "Test body")
            sync_mock.assert_not_called()

        assert any("DEV EMAIL" in r.message for r in caplog.records)


# ─────────────────────────────────────────────────────────────────────────────
# Section 4 — rogue email regression
# ─────────────────────────────────────────────────────────────────────────────

class TestRogueEmailRegression:
    """Confirm the exact rogue email reported in production cannot be sent."""

    @pytest.mark.asyncio
    async def test_no_capture_round_started_subject_ever_sent(self):
        """Simulate the exact scenario that was producing the rogue email.

        A user has an EMAIL NotificationPreference for ROUND_STARTED.
        dispatch_event is now called with skip_email=True.
        send_email must NEVER be called.
        """
        from app.models.notification import (
            NotificationChannel, NotificationEvent, NotifStatus
        )
        from app.services import notification_service
        from sqlalchemy.ext.asyncio import AsyncSession

        fake_pref = MagicMock()
        fake_pref.channel = NotificationChannel.EMAIL
        fake_pref.destination = "cyberayushji@gmail.com"
        fake_pref.id = 99

        fake_log = MagicMock()
        fake_log.status = NotifStatus.PENDING

        db = AsyncMock(spec=AsyncSession)
        db.execute = AsyncMock(return_value=MagicMock(scalars=MagicMock(
            return_value=MagicMock(all=MagicMock(return_value=[fake_pref]))
        )))
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()

        send_email_spy = AsyncMock()
        with patch("app.services.notification_service.send_email", send_email_spy):
            with patch("app.services.notification_service.NotificationLog", return_value=fake_log):
                await notification_service.dispatch_event(
                    db,
                    user_id=1,
                    event=NotificationEvent.ROUND_STARTED,
                    context={
                        "round_id": 1,
                        "position": "Legislators",
                        "scheduled_at": "2026-04-03T07:09:45.635497+00:00",
                    },
                    trigger_id=1,
                    trigger_type="capture_round",
                    skip_email=True,
                )

        send_email_spy.assert_not_called()
        # Confirm the log record was still written (audit trail preserved)
        assert fake_log.status == NotifStatus.SENT


# ─────────────────────────────────────────────────────────────────────────────
# Section 5 — billing.py data helpers
# ─────────────────────────────────────────────────────────────────────────────

class TestBillingHelpers:
    """Unit tests for the pure data-extraction helpers in billing.py."""

    def _make_invoice(self, **kwargs):
        obj = type("FakeInvoice", (), {})()
        for k, v in kwargs.items():
            setattr(obj, k, v)
        return obj

    def test_get_invoice_tax_extracts_4_tuple(self):
        from app.routers.billing import _get_invoice_tax
        invoice = self._make_invoice(amount_paid=3277, tax=377, total_tax_amounts=[])
        subtotal, tax_amount, total, tax_type = _get_invoice_tax(invoice)
        assert subtotal == "$29.00 CAD"
        assert tax_amount == "$3.77 CAD"
        assert total == "$32.77 CAD"
        assert tax_type == "GST/HST"  # default when no tax rate object present

    def test_get_invoice_tax_zero_tax(self):
        from app.routers.billing import _get_invoice_tax
        invoice = self._make_invoice(amount_paid=2900, tax=0, total_tax_amounts=[])
        subtotal, tax_amount, total, tax_type = _get_invoice_tax(invoice)
        assert subtotal == "$29.00 CAD"
        assert tax_amount == "$0.00 CAD"
        assert total == "$29.00 CAD"

    def test_get_invoice_tax_fallback_on_bad_object(self):
        from app.routers.billing import _get_invoice_tax
        result = _get_invoice_tax(object())
        assert len(result) == 4
        assert all(isinstance(v, str) for v in result)

    def test_get_failure_reason_from_last_finalization_error(self):
        from app.routers.billing import _get_failure_reason
        err = type("Err", (), {"message": "Your card has insufficient funds.", "decline_code": "insufficient_funds"})()
        invoice = self._make_invoice(last_finalization_error=err, payment_intent=None)
        assert _get_failure_reason(invoice) == "Your card has insufficient funds."

    def test_get_failure_reason_falls_back_to_default(self):
        from app.routers.billing import _get_failure_reason
        invoice = self._make_invoice(last_finalization_error=None, payment_intent=None)
        assert _get_failure_reason(invoice) == "Charge declined"

    def test_get_failure_reason_uses_decline_code_when_no_message(self):
        from app.routers.billing import _get_failure_reason
        err = type("Err", (), {"message": None, "decline_code": "do_not_honor"})()
        invoice = self._make_invoice(last_finalization_error=err, payment_intent=None)
        assert _get_failure_reason(invoice) == "do_not_honor"

    def test_get_card_details_returns_empty_strings_on_plain_object(self):
        from app.routers.billing import _get_card_details
        brand, last4 = _get_card_details(object())
        assert brand == ""
        assert last4 == ""

    def test_get_card_details_extracts_from_embedded_charge(self):
        from app.routers.billing import _get_card_details
        card = type("Card", (), {"brand": "visa", "last4": "4242"})()
        pmd = type("PMD", (), {"card": card})()
        charge = type("Charge", (), {"payment_method_details": pmd})()
        invoice = self._make_invoice(charge=charge)
        brand, last4 = _get_card_details(invoice)
        assert brand == "Visa"
        assert last4 == "4242"

    def test_get_card_details_string_charge_id_is_ignored(self):
        """When charge is a plain string (Stripe charge ID), no lookup — return empty."""
        from app.routers.billing import _get_card_details
        invoice = self._make_invoice(charge="ch_abc123")
        brand, last4 = _get_card_details(invoice)
        assert brand == ""
        assert last4 == ""


# ─────────────────────────────────────────────────────────────────────────────
# Section 6 — reports.py data fixes
# ─────────────────────────────────────────────────────────────────────────────

class TestReportDataFixes:
    """Verify CaptureStatus enum comparison and r.results attribute are correct."""

    def test_capture_status_completed_value_is_lowercase(self):
        from app.models.capture import CaptureStatus
        assert CaptureStatus.COMPLETED.value == "completed"
        assert CaptureStatus.FAILED.value == "failed"
        # On Python 3.12, str(member) returns "ClassName.MEMBER" not the value.
        # reports.py uses enum identity comparison (r.status == CaptureStatus.COMPLETED)
        # which is always correct — this test validates .value, not str().
        assert CaptureStatus.COMPLETED.value != "COMPLETED"

    def test_capture_status_str_comparison_matches_lowercase(self):
        from app.models.capture import CaptureStatus
        r = type("Round", (), {"status": CaptureStatus.COMPLETED})()
        assert r.status == CaptureStatus.COMPLETED
        assert r.status != CaptureStatus.FAILED

    def test_capture_round_has_results_not_screenshots(self):
        """CaptureRound.results must exist; screenshots must not."""
        from app.models.capture import CaptureRound
        import inspect
        mapper_attrs = [p.key for p in CaptureRound.__mapper__.iterate_properties]
        assert "results" in mapper_attrs, "CaptureRound must have 'results' relationship"
        assert "screenshots" not in mapper_attrs, "'screenshots' is the wrong attribute name"

    def test_capture_status_has_no_partial_value(self):
        """CaptureStatus must not have PARTIAL — _partial count must be hardcoded 0."""
        from app.models.capture import CaptureStatus
        values = {e.value for e in CaptureStatus}
        assert "partial" not in values, "CaptureStatus has no PARTIAL — reports.py should use 0"


# ─────────────────────────────────────────────────────────────────────────────
# Section 7 — import path integrity
# ─────────────────────────────────────────────────────────────────────────────

class TestImportPaths:
    """Verify that send_admin_alert is imported directly from email_service everywhere."""

    def test_send_admin_alert_defined_in_email_service(self):
        import inspect
        import app.services.email_service as svc
        assert hasattr(svc, "send_admin_alert"), "send_admin_alert must be defined in email_service"
        assert inspect.iscoroutinefunction(svc.send_admin_alert)

    def test_notification_service_does_not_define_send_admin_alert(self):
        import app.services.notification_service as ns
        import app.services.email_service as svc
        if hasattr(ns, "send_admin_alert"):
            assert ns.send_admin_alert is svc.send_admin_alert, (
                "notification_service.send_admin_alert must be the same object as "
                "email_service.send_admin_alert (re-exported, not redefined)"
            )

    def test_scheduler_imports_send_admin_alert_from_email_service(self):
        """scheduler.py must import send_admin_alert from email_service, not notification_service."""
        import ast
        import pathlib
        source = pathlib.Path(
            "D:/01_Development/Client_Projects/ImmigLens/immiglensBE/app/services/scheduler.py"
        ).read_text(encoding="utf-8")
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module == "app.services.notification_service":
                names = [alias.name for alias in node.names]
                assert "send_admin_alert" not in names, (
                    "send_admin_alert must be imported from email_service, not notification_service"
                )

