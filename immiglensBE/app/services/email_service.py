"""Centralised email service.

Single source of truth for all outbound email in ImmigLens.
No router or service imports smtplib directly — everything goes through here.

Architecture:
  _send_email_sync()   Blocking SMTP call; runs in a thread executor.
  send_email()         Async non-blocking dispatch.
  render_email()       Jinja2 HTML render from app/templates/email/.
  send_*()             One typed helper per email type.

Dev mode: when SMTP_HOST is not configured, emails are printed to the
logger at INFO level and the function returns without error.
"""

import asyncio
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any, Optional

from jinja2 import Environment, FileSystemLoader

from app.core.config import settings

logger = logging.getLogger(__name__)

_template_dir = Path(__file__).parent.parent / "templates"
_email_env = Environment(
    loader=FileSystemLoader(str(_template_dir)),
    autoescape=True,
)


# ── Rendering ─────────────────────────────────────────────────────────────────

def render_email(template_name: str, context: dict[str, Any]) -> str:
    """Render a Jinja2 email template from app/templates/email/ to an HTML string."""
    tpl = _email_env.get_template(f"email/{template_name}")
    return tpl.render(**context, frontend_url=settings.FRONTEND_URL)


# ── SMTP core ─────────────────────────────────────────────────────────────────

def _send_email_sync(to: str, subject: str, plain: str, html: Optional[str]) -> None:
    """Blocking SMTP send — must be called via run_in_executor, never directly."""
    if html:
        msg: Any = MIMEMultipart("alternative")
        msg.attach(MIMEText(plain, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
    else:
        msg = MIMEText(plain, "plain", "utf-8")

    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Reply-To"] = settings.SMTP_REPLY_TO

    ctx = ssl.create_default_context()
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as s:
        if settings.SMTP_USE_TLS:
            s.starttls(context=ctx)
        if settings.SMTP_USER:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.sendmail(settings.SMTP_FROM, [to], msg.as_string())


async def send_email(
    to: str,
    subject: str,
    plain: str,
    html: Optional[str] = None,
) -> None:
    """Async email dispatch. No-ops (with INFO log) when SMTP_HOST is not set."""
    if not settings.SMTP_HOST:
        logger.info("[DEV EMAIL] To=%s | Subject=%s\n%s", to, subject, plain)
        return
    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _send_email_sync, to, subject, plain, html)
        logger.info("Email sent — to=%s subject=%s", to, subject)
    except Exception:
        logger.exception("Email send failed — to=%s subject=%s", to, subject)


# ── 1.1 Welcome ───────────────────────────────────────────────────────────────

async def send_welcome_email(to: str, first_name: str, trial_days: int) -> None:
    html = render_email("welcome.html", {
        "first_name": first_name,
        "trial_days": trial_days,
        "dashboard_url": f"{settings.FRONTEND_URL}/dashboard",
    })
    plain = (
        f"Welcome to ImmigLens, {first_name}!\n\n"
        f"Your account is ready. You have a {trial_days}-day free trial with full access.\n\n"
        f"Get started: {settings.FRONTEND_URL}/dashboard\n\n"
        f"Questions? Reply to this email or contact support@immiglens.ca."
    )
    await send_email(
        to,
        f"Welcome to ImmigLens, {first_name} \u2014 your account is ready",
        plain,
        html,
    )


# ── 1.2 OTP ───────────────────────────────────────────────────────────────────

async def send_otp_email(to: str, first_name: str, otp_code: str) -> None:
    html = render_email("otp.html", {
        "first_name": first_name,
        "otp_code": otp_code,
        "expire_minutes": settings.OTP_EXPIRE_MINUTES,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"Your ImmigLens verification code is: {otp_code}\n\n"
        f"This code expires in {settings.OTP_EXPIRE_MINUTES} minutes.\n"
        f"Do not share this code with anyone."
    )
    await send_email(
        to,
        f"{otp_code} is your ImmigLens verification code",
        plain,
        html,
    )


# ── Password reset ────────────────────────────────────────────────────────────

async def send_password_reset_email(
    to: str, first_name: str, reset_url: str
) -> None:
    html = render_email("password_reset.html", {
        "first_name": first_name,
        "reset_url": reset_url,
        "expire_hours": settings.PASSWORD_RESET_EXPIRE_HOURS,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"You requested a password reset for your ImmigLens account.\n\n"
        f"Click the link below to set a new password:\n{reset_url}\n\n"
        f"This link expires in {settings.PASSWORD_RESET_EXPIRE_HOURS} hour(s).\n"
        f"If you did not request this, you can safely ignore this email."
    )
    await send_email(to, "ImmigLens \u2014 Reset your password", plain, html)


# ── 3.4 Capture completed ─────────────────────────────────────────────────────

async def send_capture_completed_email(
    to: str,
    first_name: str,
    position_title: str,
    noc_code: str,
    captured_at: str,
    screenshot_count: int,
    source_count: int,
    sources: list[str],
    capture_id: int,
    total_evidence: int,
    next_run: Optional[str],
    timeline_url: str,
) -> None:
    html = render_email("capture_completed.html", {
        "first_name": first_name,
        "position_title": position_title,
        "noc_code": noc_code,
        "captured_at": captured_at,
        "screenshot_count": screenshot_count,
        "source_count": source_count,
        "sources": sources,
        "capture_id": capture_id,
        "total_evidence": total_evidence,
        "next_run": next_run or "\u2014",
        "timeline_url": timeline_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"Capture completed: {position_title}\n"
        f"Screenshots: {screenshot_count} across {source_count} source(s)\n"
        f"Captured at: {captured_at}\n"
        f"Capture ID: {capture_id}\n\n"
        f"Review your evidence timeline: {timeline_url}"
    )
    await send_email(
        to,
        f"Capture completed \u2014 {position_title}",
        plain,
        html,
    )


# ── 3.6 Capture failed ────────────────────────────────────────────────────────

async def send_capture_failed_email(
    to: str,
    first_name: str,
    position_title: str,
    noc_code: str,
    attempted_at: str,
    error: str,
    affected_sources: list[str],
    capture_id: int,
    last_successful: Optional[str],
    retry_at: Optional[str],
    fix_url: str,
) -> None:
    html = render_email("capture_failed.html", {
        "first_name": first_name,
        "position_title": position_title,
        "noc_code": noc_code,
        "attempted_at": attempted_at,
        "error": error,
        "affected_sources": affected_sources,
        "capture_id": capture_id,
        "last_successful": last_successful or "None",
        "retry_at": retry_at or "Not scheduled",
        "fix_url": fix_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"\u26a0 Capture failed: {position_title}\n"
        f"Attempted at: {attempted_at}\n"
        f"Error: {error}\n"
        f"Capture ID: {capture_id}\n"
        f"Retry scheduled: {retry_at or 'Not scheduled'}\n\n"
        f"Review and fix the capture job: {fix_url}"
    )
    await send_email(
        to,
        f"\u26a0 Capture failed \u2014 {position_title} \u00b7 action may be needed",
        plain,
        html,
    )


# ── 3.11 Report ready ─────────────────────────────────────────────────────────

async def send_report_ready_email(
    to: str,
    first_name: str,
    position_title: str,
    noc_code: str,
    employer_name: str,
    generated_at: str,
    dashboard_url: str,
) -> None:
    html = render_email("report_ready.html", {
        "first_name": first_name,
        "position_title": position_title,
        "noc_code": noc_code,
        "employer_name": employer_name,
        "generated_at": generated_at,
        "dashboard_url": dashboard_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"Your LMIA evidence report for \u2018{position_title}\u2019 has been generated.\n"
        f"Employer: {employer_name}\n"
        f"Generated: {generated_at}\n\n"
        f"Return to your dashboard to regenerate or download: {dashboard_url}"
    )
    await send_email(
        to,
        f"Your LMIA evidence report is ready \u2014 {position_title}",
        plain,
        html,
    )


# ── 5.1 Payment successful ────────────────────────────────────────────────────

async def send_payment_successful_email(
    to: str,
    first_name: str,
    amount: str,
    invoice_number: str,
    plan_name: str,
    billing_start: str,
    billing_end: str,
    next_billing_date: str,
    billing_url: str,
) -> None:
    html = render_email("payment_successful.html", {
        "first_name": first_name,
        "amount": amount,
        "invoice_number": invoice_number,
        "plan_name": plan_name,
        "billing_start": billing_start,
        "billing_end": billing_end,
        "next_billing_date": next_billing_date,
        "billing_url": billing_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"Payment received \u2014 {amount}\n"
        f"Invoice: {invoice_number}\n"
        f"Plan: {plan_name} ({billing_start} \u2013 {billing_end})\n"
        f"Next charge: {next_billing_date}\n\n"
        f"View your billing dashboard: {billing_url}"
    )
    await send_email(
        to,
        f"Payment received \u2014 ImmigLens \u00b7 {invoice_number}",
        plain,
        html,
    )


# ── 5.2 Payment failed ────────────────────────────────────────────────────────

async def send_payment_failed_email(
    to: str,
    first_name: str,
    amount: str,
    attempted_at: str,
    failure_reason: str,
    grace_period_end: str,
    retry_date: str,
    retries_remaining: int,
    billing_url: str,
) -> None:
    html = render_email("payment_failed.html", {
        "first_name": first_name,
        "amount": amount,
        "attempted_at": attempted_at,
        "failure_reason": failure_reason,
        "grace_period_end": grace_period_end,
        "retry_date": retry_date,
        "retries_remaining": retries_remaining,
        "billing_url": billing_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"\u26a0 Your payment of {amount} could not be processed.\n"
        f"Attempted: {attempted_at}\n"
        f"Reason: {failure_reason}\n"
        f"Grace period ends: {grace_period_end}\n"
        f"Next retry: {retry_date}\n\n"
        f"Update your payment method now: {billing_url}"
    )
    await send_email(
        to,
        "\u26a0 Action required: payment failed \u2014 ImmigLens",
        plain,
        html,
    )


# ── 6.1 Subscription created ──────────────────────────────────────────────────

async def send_subscription_confirmed_email(
    to: str,
    first_name: str,
    plan_name: str,
    start_date: str,
    next_billing_date: str,
    dashboard_url: str,
) -> None:
    html = render_email("subscription_created.html", {
        "first_name": first_name,
        "plan_name": plan_name,
        "start_date": start_date,
        "next_billing_date": next_billing_date,
        "dashboard_url": dashboard_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"Your ImmigLens {plan_name} subscription is now active.\n"
        f"Started: {start_date}\n"
        f"Next billing date: {next_billing_date}\n\n"
        f"Go to your dashboard: {dashboard_url}"
    )
    await send_email(
        to,
        f"Your ImmigLens {plan_name} subscription is active",
        plain,
        html,
    )


# ── 6.5 Subscription renewal failed ──────────────────────────────────────────

async def send_renewal_failed_email(
    to: str,
    first_name: str,
    plan_name: str,
    renewal_date: str,
    amount: str,
    failure_reason: str,
    grace_period_end: str,
    retry_date: str,
    retries_remaining: int,
    billing_url: str,
) -> None:
    html = render_email("renewal_failed.html", {
        "first_name": first_name,
        "plan_name": plan_name,
        "renewal_date": renewal_date,
        "amount": amount,
        "failure_reason": failure_reason,
        "grace_period_end": grace_period_end,
        "retry_date": retry_date,
        "retries_remaining": retries_remaining,
        "billing_url": billing_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"\u26a0 Your {plan_name} subscription renewal failed.\n"
        f"Renewal date: {renewal_date}\n"
        f"Amount attempted: {amount}\n"
        f"Reason: {failure_reason}\n"
        f"Grace period ends: {grace_period_end}\n\n"
        f"Update your payment method: {billing_url}"
    )
    await send_email(
        to,
        "\u26a0 Subscription renewal failed \u2014 action required",
        plain,
        html,
    )


# ── 2.7 Trial ending ──────────────────────────────────────────────────────────

async def send_trial_ending_email(
    to: str,
    first_name: str,
    trial_end_date: str,
    days_remaining: int,
    subscribe_url: str,
) -> None:
    unsubscribe_url = (
        f"{settings.FRONTEND_URL}/unsubscribe?email={to}&type=marketing"
    )
    html = render_email("trial_ending.html", {
        "first_name": first_name,
        "trial_end_date": trial_end_date,
        "days_remaining": days_remaining,
        "subscribe_url": subscribe_url,
        "unsubscribe_url": unsubscribe_url,
        "casl_marketing": True,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"Your ImmigLens free trial ends in {days_remaining} day(s) on {trial_end_date}.\n\n"
        f"Subscribe to keep your captures running: {subscribe_url}\n\n"
        f"To unsubscribe from marketing emails: {unsubscribe_url}"
    )
    await send_email(
        to,
        f"Your ImmigLens trial ends in {days_remaining} days \u2014 {first_name}",
        plain,
        html,
    )


# ── 6.9 Plan limit reached ────────────────────────────────────────────────────

async def send_plan_limit_email(
    to: str,
    first_name: str,
    plan_name: str,
    position_limit: int,
    active_count: int,
    manage_url: str,
    upgrade_url: str,
) -> None:
    html = render_email("plan_limit.html", {
        "first_name": first_name,
        "plan_name": plan_name,
        "position_limit": position_limit,
        "active_count": active_count,
        "manage_url": manage_url,
        "upgrade_url": upgrade_url,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"You\u2019ve reached the active position limit on your {plan_name} plan.\n"
        f"Limit: {position_limit} active positions ({active_count} currently in use)\n\n"
        f"Archive a completed position: {manage_url}\n"
        f"Upgrade your plan: {upgrade_url}"
    )
    await send_email(
        to,
        "You\u2019ve reached your active position limit \u2014 ImmigLens",
        plain,
        html,
    )


# ── Invitation ────────────────────────────────────────────────────────────────

async def send_invitation_email(
    to: str,
    org_name: str,
    inviter_name: str,
    role: str,
    expires_at: str,
    accept_url: str,
) -> None:
    html = render_email("invitation.html", {
        "org_name": org_name,
        "inviter_name": inviter_name,
        "role": role,
        "expires_at": expires_at,
        "accept_url": accept_url,
    })
    plain = (
        f"You have been invited to join {org_name} on ImmigLens.\n\n"
        f"Invited by: {inviter_name}\n"
        f"Role: {role}\n"
        f"Invitation expires: {expires_at}\n\n"
        f"Accept this invitation: {accept_url}"
    )
    await send_email(
        to,
        f"You\u2019ve been invited to join {org_name} on ImmigLens",
        plain,
        html,
    )


# ── 4.7 Weekly summary ────────────────────────────────────────────────────────

async def send_weekly_summary_email(
    to: str,
    first_name: str,
    week_start: str,
    week_end: str,
    stats: dict[str, Any],
    positions: list[dict[str, Any]],
    attention_items: list[str],
    dashboard_url: str,
) -> None:
    unsubscribe_url = (
        f"{settings.FRONTEND_URL}/unsubscribe?email={to}&type=weekly_digest"
    )
    html = render_email("weekly_summary.html", {
        "first_name": first_name,
        "week_start": week_start,
        "week_end": week_end,
        "stats": stats,
        "positions": positions,
        "attention_items": attention_items,
        "dashboard_url": dashboard_url,
        "unsubscribe_url": unsubscribe_url,
        "casl_marketing": True,
    })
    plain = (
        f"Hi {first_name},\n\n"
        f"Your ImmigLens activity summary for {week_start} \u2013 {week_end}.\n\n"
        f"Captures: {stats.get('total_runs', 0)} runs "
        f"({stats.get('successful', 0)} successful \u00b7 {stats.get('failed', 0)} failed)\n"
        f"Screenshots: {stats.get('screenshots', 0)} new\n"
        f"Active positions: {stats.get('active_positions', 0)}\n\n"
        f"View full dashboard: {dashboard_url}\n\n"
        f"Unsubscribe from digest emails: {unsubscribe_url}"
    )
    await send_email(
        to,
        f"Your ImmigLens week in review \u2014 {week_start} to {week_end}",
        plain,
        html,
    )


# ── Admin alert (used by notification_service) ────────────────────────────────

async def send_admin_alert(subject: str, body: str) -> None:
    """Send a plain-text alert to ADMIN_ALERT_EMAIL. Silently no-ops if not configured."""
    if not settings.ADMIN_ALERT_EMAIL or not settings.SMTP_HOST:
        return
    await send_email(
        settings.ADMIN_ALERT_EMAIL,
        f"[ImmigLens Admin] {subject}",
        body,
    )
