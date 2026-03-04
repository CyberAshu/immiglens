from pydantic import BaseModel


class CaptureBreakdownItem(BaseModel):
    name: str
    value: int
    color: str


class EmployerBreakdownItem(BaseModel):
    name: str
    positions: int
    screenshots: int
    failed: int


class RoundTimelineItem(BaseModel):
    date: str
    completed: int
    pending: int
    failed: int


class DashboardStats(BaseModel):
    total_employers: int
    total_positions: int
    total_job_postings: int
    total_capture_rounds: int
    completed_rounds: int
    pending_rounds: int
    total_screenshots: int
    failed_screenshots: int
    capture_breakdown: list[CaptureBreakdownItem]
    employer_breakdown: list[EmployerBreakdownItem]
    rounds_timeline: list[RoundTimelineItem]
