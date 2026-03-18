from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.schemas.report import ReportDocumentOut


class JobPostingCreate(BaseModel):
    platform: str
    url: str

    @field_validator("url")
    @classmethod
    def url_must_be_http(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    @field_validator("platform")
    @classmethod
    def platform_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Platform cannot be empty")
        return v.strip()


class JobPostingOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    platform: str
    url: str
    created_at: datetime


class JobPostingUpdate(BaseModel):
    platform: Optional[str] = None
    url: Optional[str] = None

    @field_validator("url", mode="before")
    @classmethod
    def url_must_be_http(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v

    @field_validator("platform", mode="before")
    @classmethod
    def platform_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Platform cannot be empty")
        return v.strip()


class JobPositionCreate(BaseModel):
    job_title: str
    noc_code: str
    num_positions: int
    start_date: date
    capture_frequency_days: int = 7
    wage: Optional[str] = None
    work_location: str
    wage_stream: Optional[str] = None

    @field_validator("start_date")
    @classmethod
    def start_date_not_in_past(cls, v: date) -> date:
        from datetime import date as _date
        if v < _date.today():
            raise ValueError("start_date cannot be in the past")
        return v

    @field_validator("num_positions")
    @classmethod
    def num_positions_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("num_positions must be at least 1")
        return v

    @field_validator("capture_frequency_days")
    @classmethod
    def frequency_in_range(cls, v: int) -> int:
        if v < 1 or v > 365:
            raise ValueError("capture_frequency_days must be between 1 and 365")
        return v

    @field_validator("noc_code")
    @classmethod
    def noc_code_format(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("NOC code cannot be empty")
        return v

    @field_validator("job_title", "work_location", mode="before")
    @classmethod
    def strip_strings(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if isinstance(v, str) else v


class JobPositionUpdate(BaseModel):
    job_title: Optional[str] = None
    noc_code: Optional[str] = None
    num_positions: Optional[int] = None
    start_date: Optional[date] = None
    capture_frequency_days: Optional[int] = None
    wage: Optional[str] = None
    work_location: Optional[str] = None
    wage_stream: Optional[str] = None

    @field_validator("num_positions")
    @classmethod
    def num_positions_positive(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("num_positions must be at least 1")
        return v

    @field_validator("capture_frequency_days")
    @classmethod
    def frequency_in_range(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 1 or v > 365):
            raise ValueError("capture_frequency_days must be between 1 and 365")
        return v


class JobPositionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    employer_id: int
    job_title: str
    noc_code: str
    num_positions: int
    start_date: date
    capture_frequency_days: int
    wage: Optional[str] = None
    work_location: Optional[str] = None
    wage_stream: Optional[str] = None
    created_at: datetime
    job_postings: list[JobPostingOut] = []
    report_documents: list[ReportDocumentOut] = []
