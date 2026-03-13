from datetime import datetime, timezone

from sqlalchemy import DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

DEFAULT_CONFIG: dict = {
    "blocks": [
        {
            "id": "cover",
            "type": "cover",
            "enabled": True,
            "label": "Recruitment Evidence Package",
            "fields": {
                "show_address": True,
                "show_contact_person": True,
                "show_contact_email": True,
                "show_contact_phone": True,
                "show_noc_code": True,
                "show_wage_stream": True,
                "show_wage": True,
                "show_work_location": True,
                "show_positions_sought": True,
                "show_start_date": True,
                "show_capture_frequency": True,
                "show_total_rounds": True,
                "show_generated_at": True,
            },
        },
        {
            "id": "section2",
            "type": "summary_table",
            "enabled": True,
            "title": "Recruitment Summary",
            "fields": {
                "show_url": True,
                "show_start_date": True,
                "show_capture_count": True,
                "show_ongoing": True,
            },
        },
        {
            "id": "section3",
            "type": "evidence",
            "enabled": True,
            "title": "Per-Platform Advertising Evidence",
            "fields": {
                "show_capture_datetime": True,
            },
        },
        {
            "id": "job_match",
            "type": "job_match_activity",
            "enabled": True,
            "title": "Job Match Activity",
        },
        {
            "id": "appendix",
            "type": "appendix",
            "enabled": True,
            "title": "Appendix — Uploaded Supporting Documents",
        },
    ]
}


class ReportConfig(Base):
    __tablename__ = "report_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
