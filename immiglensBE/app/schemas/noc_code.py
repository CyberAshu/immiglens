from datetime import datetime

from pydantic import BaseModel


class NocCodeOut(BaseModel):
    id: int
    code: str
    title: str
    teer: int
    major_group: int
    version_year: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class NocCodeCreate(BaseModel):
    code: str
    title: str
    version_year: int = 2021


class NocCodeUpdate(BaseModel):
    title: str | None = None
    is_active: bool | None = None
    version_year: int | None = None


class NocUploadResult(BaseModel):
    inserted: int
    updated: int
    skipped: int
    errors: list[str] = []
