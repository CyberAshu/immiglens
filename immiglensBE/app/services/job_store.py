import asyncio
import time
import uuid
from typing import Dict, Optional

from app.core.config import settings
from app.schemas.screenshot import BatchJob, JobStatus, ScreenshotResult, URLStatus


class JobStore:
    def __init__(self) -> None:
        self._jobs: Dict[str, BatchJob] = {}
        self._lock = asyncio.Lock()

    def create(self, urls: list[str]) -> BatchJob:
        job_id = str(uuid.uuid4())
        now = time.time()
        job = BatchJob(
            job_id=job_id,
            status=JobStatus.QUEUED,
            total=len(urls),
            completed=0,
            failed=0,
            results=[
                ScreenshotResult(url=url, status=URLStatus.PENDING)
                for url in urls
            ],
            created_at=now,
            updated_at=now,
        )
        self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> Optional[BatchJob]:
        return self._jobs.get(job_id)

    async def update_result(self, job_id: str, result: ScreenshotResult) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                return
            for i, r in enumerate(job.results):
                if r.url == result.url:
                    job.results[i] = result
                    break
            if result.status == URLStatus.DONE:
                job.completed += 1
            elif result.status == URLStatus.FAILED:
                job.failed += 1
            job.updated_at = time.time()
            if job.completed + job.failed == job.total:
                job.status = JobStatus.COMPLETED

    async def mark_running(self, job_id: str) -> None:
        async with self._lock:
            job = self._jobs.get(job_id)
            if job:
                job.status = JobStatus.RUNNING
                job.updated_at = time.time()

    def purge_expired(self) -> None:
        cutoff = time.time() - settings.JOB_MAX_AGE_S
        expired = [jid for jid, job in self._jobs.items() if job.created_at < cutoff]
        for jid in expired:
            del self._jobs[jid]


store = JobStore()
