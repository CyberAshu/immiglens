"""Audit log router — read-only access to the AuditLog table.

Admins can see all logs; regular users see only their own.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/api/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogOut])
async def list_audit_logs(
    response: Response,
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    actor_id: Optional[int] = Query(None),
    actor_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    employer_id: Optional[int] = Query(None),
    position_id: Optional[int] = Query(None),
    date_from: Optional[datetime] = Query(None, description="ISO-8601 start date (inclusive)"),
    date_to: Optional[datetime] = Query(None, description="ISO-8601 end date (inclusive)"),
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return audit logs. Admins see all; users see their own.

    Supports filtering by entity_type, action, actor_id, actor_type, status, source,
    employer_id, position_id, and date range.
    Returns X-Total-Count header with the total matching row count.
    """
    base = (
        select(AuditLog, User.email.label("actor_email"), User.full_name.label("actor_name"))
        .outerjoin(User, User.id == AuditLog.actor_id)
        .order_by(AuditLog.created_at.desc())
    )

    if not current_user.is_admin:
        base = base.where(AuditLog.actor_id == current_user.id)

    if entity_type:
        base = base.where(AuditLog.entity_type == entity_type)
    if action:
        base = base.where(AuditLog.action == action)
    if actor_id is not None:
        base = base.where(AuditLog.actor_id == actor_id)
    if actor_type:
        base = base.where(AuditLog.actor_type == actor_type)
    if status:
        base = base.where(AuditLog.status == status)
    if source:
        base = base.where(AuditLog.source == source)
    if employer_id is not None:
        base = base.where(AuditLog.employer_id == employer_id)
    if position_id is not None:
        base = base.where(AuditLog.position_id == position_id)
    if date_from is not None:
        base = base.where(AuditLog.created_at >= date_from)
    if date_to is not None:
        base = base.where(AuditLog.created_at <= date_to)

    # Count total matching rows (without limit/offset)
    count_stmt = select(func.count()).select_from(base.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()
    response.headers["X-Total-Count"] = str(total)

    rows = (await db.execute(base.offset(offset).limit(limit))).all()

    result = []
    for row in rows:
        log: AuditLog = row[0]
        out = AuditLogOut.model_validate(log)
        out.actor_email = row.actor_email
        out.actor_name = row.actor_name
        result.append(out)
    return result
