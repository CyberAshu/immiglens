"""Central audit service.

Usage in a router handler (single-commit pattern):

    from app.core.audit import audit
    from app.core.audit_events import AuditAction, AuditEntity

    db.add(employer)
    await db.flush()               # get employer.id without committing

    await audit(
        db,
        action=AuditAction.EMPLOYER_CREATED,
        entity_type=AuditEntity.EMPLOYER,
        actor_id=current_user.id,
        entity_id=employer.id,
        entity_label=employer.business_name,
        employer_id=employer.id,
        description=f'Created employer "{employer.business_name}"',
        new_data={"business_name": employer.business_name},
        request=request,
    )
    await db.commit()              # single commit covers both entity + audit row
"""
from __future__ import annotations

import logging
from typing import Any, Literal, Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

ActorType  = Literal["user", "admin", "system"]
AuditStatus = Literal["success", "failed"]
AuditSource = Literal["api", "system", "webhook"]


def _extract_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "0.0.0.0"


def _extract_ua(request: Request) -> str | None:
    ua = request.headers.get("user-agent")
    return ua[:500] if ua else None


async def audit(
    db: AsyncSession,
    *,
    action: str,
    entity_type: str,
    actor_id: Optional[int] = None,
    actor_type: ActorType = "user",
    entity_id: Optional[int | str] = None,
    entity_label: Optional[str] = None,
    employer_id: Optional[int] = None,
    position_id: Optional[int] = None,
    status: AuditStatus = "success",
    description: Optional[str] = None,
    old_data: Optional[dict[str, Any]] = None,
    new_data: Optional[dict[str, Any]] = None,
    metadata: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
    ip_address: Optional[str] = None,
    source: AuditSource = "api",
) -> AuditLog:
    """Append an immutable audit record to the current DB session.

    CRITICAL: Only calls flush() — the CALLER owns commit().
    This guarantees the audit row is always atomic with the business operation.
    If this function raises internally it logs the error and returns a sentinel
    so it never crashes the calling request handler.
    """
    try:
        ip = _extract_ip(request) if request else ip_address
        ua = _extract_ua(request) if request else None

        entry = AuditLog(
            actor_id=actor_id,
            actor_type=actor_type,
            action=action,
            status=status,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            entity_label=entity_label,
            employer_id=employer_id,
            position_id=position_id,
            description=description,
            old_data=old_data,
            new_data=new_data,
            metadata_=metadata,
            ip_address=ip,
            user_agent=ua,
            source=source,
        )
        db.add(entry)
        await db.flush()
        return entry

    except Exception:
        logger.exception(
            "AUDIT_WRITE_FAILED action=%s entity=%s/%s actor=%s",
            action, entity_type, entity_id, actor_id,
        )
        return AuditLog(actor_id=actor_id, action=action, entity_type=entity_type)

