from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.organization import OrgRole


class OrganizationCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Organization name cannot be empty")
        return v.strip()


class OrganizationOut(BaseModel):
    id: int
    name: str
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class OrgMembershipOut(BaseModel):
    id: int
    org_id: int
    user_id: int
    user_name: str = ""
    user_email: str = ""
    role: OrgRole
    joined_at: datetime

    model_config = {"from_attributes": True}


class InviteRequest(BaseModel):
    email: str
    role: OrgRole = OrgRole.VIEWER

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email address")
        return v.strip().lower()


class OrgInvitationOut(BaseModel):
    id: int
    org_id: int
    email: str
    role: OrgRole
    token: str
    expires_at: datetime
    accepted_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
