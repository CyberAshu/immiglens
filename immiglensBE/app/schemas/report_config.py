from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ReportConfigOut(BaseModel):
    id: int
    config: dict[str, Any]
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportConfigUpdate(BaseModel):
    config: dict[str, Any]
