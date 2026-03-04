from datetime import datetime

from pydantic import BaseModel


class ReportDocumentOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    original_filename: str
    uploaded_at: datetime
