from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AuditLogOut(BaseModel):
    id: int

    # Actor
    actor_id: Optional[int] = None
    actor_type: str = "user"
    actor_email: Optional[str] = None
    actor_name: Optional[str] = None

    # Action
    action: str
    status: str = "success"

    # Entity
    entity_type: str
    entity_id: Optional[str] = None
    entity_label: Optional[str] = None

    # Scope
    employer_id: Optional[int] = None
    position_id: Optional[int] = None

    # Payload
    description: Optional[str] = None
    old_data: Optional[dict[str, Any]] = None
    new_data: Optional[dict[str, Any]] = None
    # The ORM column is named metadata_ to avoid collision with SQLAlchemy's
    # reserved MetaData. validation_alias maps it back to the API field name.
    metadata: Optional[dict[str, Any]] = Field(None, validation_alias="metadata_")

    # Context
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    source: str = "api"

    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}

