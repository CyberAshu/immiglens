"""Audit log router — read-only access to the AuditLog table.

Admins can see all logs; regular users see only their own.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    resource_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return audit logs. Admins see all; users see their own."""
    stmt = (
        select(AuditLog, User.email.label("user_email"), User.full_name.label("user_name"))
        .outerjoin(User, User.id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc())
    )

    if not current_user.is_admin:
        stmt = stmt.where(AuditLog.user_id == current_user.id)

    if resource_type:
        stmt = stmt.where(AuditLog.resource_type == resource_type)
    if action:
        stmt = stmt.where(AuditLog.action == action)

    stmt = stmt.offset(offset).limit(limit)
    rows = (await db.execute(stmt)).all()

    result = []
    for row in rows:
        log: AuditLog = row[0]
        out = AuditLogOut.model_validate(log)
        out.user_email = row.user_email
        out.user_name = row.user_name
        result.append(out)
    return result
