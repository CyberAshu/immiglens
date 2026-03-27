import asyncio

from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.schemas.screenshot import BatchJob, BatchRequest, BatchSubmitResponse
from app.services.job_store import store
from app.services.screenshot import capture

router = APIRouter(prefix="/api/screenshots")


async def _run_batch(job_id: str, urls: list[str]) -> None:
    await store.mark_running(job_id)
    await asyncio.gather(*[_process_url(job_id, url) for url in urls])


async def _process_url(job_id: str, url: str) -> None:
    result = await capture(url)
    await store.update_result(job_id, result)


@router.post("/batch", response_model=BatchSubmitResponse, status_code=202)
async def submit_batch(payload: BatchRequest, background_tasks: BackgroundTasks):
    job = store.create(payload.urls)
    background_tasks.add_task(_run_batch, job.job_id, payload.urls)
    return BatchSubmitResponse(job_id=job.job_id, total=job.total)


@router.get("/jobs/{job_id}", response_model=BatchJob)
async def get_job(job_id: str):
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job
