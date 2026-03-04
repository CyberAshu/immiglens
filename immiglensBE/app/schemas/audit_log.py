from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    user_id: Optional[int]
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[int]
    old_data: Optional[dict[str, Any]]
    new_data: Optional[dict[str, Any]]
    ip_address: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}
