"""Lightweight helper for writing AuditLog rows.

Import and call from any router/service that modifies data:

    from app.core.audit import log_action
    await log_action(db, user_id=current_user.id,
                     action="CREATE", resource_type="employer", resource_id=emp.id,
                     employer_id=emp.id,
                     new_data={"name": emp.business_name},
                     ip_address=get_client_ip(request))
"""
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    user_id: Optional[int],
    action: str,                        # "CREATE" | "UPDATE" | "DELETE" | "VIEW"
    resource_type: str,                 # "employer" | "position" | "capture_round" …
    resource_id: Optional[int] = None,
    employer_id: Optional[int] = None,  # denormalized for efficient filtering
    position_id: Optional[int] = None,  # denormalized for efficient filtering
    old_data: Optional[dict[str, Any]] = None,
    new_data: Optional[dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        employer_id=employer_id,
        position_id=position_id,
        old_data=old_data,
        new_data=new_data,
        ip_address=ip_address,
    )
    db.add(entry)
    await db.flush()
    return entry
