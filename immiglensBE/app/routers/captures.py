import logging
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.audit_events import AuditAction, AuditEntity
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import check_monthly_capture_limit
from app.models.capture import CaptureResult, CaptureRound, CaptureStatus, ResultStatus
from app.models.employer import Employer
from app.models.job_position import JobPosition
from app.models.job_url import JobUrl
from app.models.user import User
from app.schemas.capture import CaptureResultOut, CaptureRoundOut
from app.services import storage
from app.services.scheduler import (
    queue_force_run_capture_round,
    queue_recapture_result,
)

router = APIRouter(prefix="/api/employers/{employer_id}/positions/{position_id}/captures", tags=["captures"])
logger = logging.getLogger(__name__)


async def _assert_owns_position(
    employer_id: int, position_id: int, user: User, db: AsyncSession
) -> None:
    result = await db.execute(
        select(JobPosition.id)
        .join(Employer)
        .where(
            JobPosition.id == position_id,
            JobPosition.employer_id == employer_id,
            Employer.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Job position not found.")


@router.get("", response_model=list[CaptureRoundOut])
async def list_capture_rounds(
    employer_id: int,
    position_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_owns_position(employer_id, position_id, current_user, db)
    result = await db.execute(
        select(CaptureRound)
        .where(CaptureRound.job_position_id == position_id)
        .options(selectinload(CaptureRound.results))
        .order_by(CaptureRound.scheduled_at)
    )
    return result.scalars().all()


@router.post("/{round_id}/run", status_code=202)
async def trigger_capture_round(
    employer_id: int,
    position_id: int,
    round_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_owns_position(employer_id, position_id, current_user, db)

    # Block captures on deactivated positions
    pos_active = (
        await db.execute(
            select(JobPosition.is_active).where(JobPosition.id == position_id)
        )
    ).scalar_one()
    if not pos_active:
        raise HTTPException(
            status_code=403,
            detail="This position is deactivated. Activate it to re-enable captures.",
        )

    result = await db.execute(
        select(CaptureRound)
        .where(
            CaptureRound.id == round_id,
            CaptureRound.job_position_id == position_id,
        )
        .options(selectinload(CaptureRound.job_position).selectinload(JobPosition.job_urls))
    )
    round_ = result.scalar_one_or_none()
    if round_ is None:
        raise HTTPException(status_code=404, detail="Capture round not found.")

    if not any(p.is_active for p in round_.job_position.job_urls):
        raise HTTPException(
            status_code=400,
            detail="No active job board URLs on this position. Add or activate at least one URL before running a capture."
        )

    await check_monthly_capture_limit(db, current_user)
    await audit(
        db,
        action=AuditAction.CAPTURE_TRIGGERED,
        entity_type=AuditEntity.CAPTURE_ROUND,
        actor_id=current_user.id,
        entity_id=round_id,
        employer_id=employer_id,
        position_id=position_id,
        description=f'Manually triggered capture round #{round_id} for position #{position_id}',
        new_data={"position_id": position_id, "triggered_manually": True},
        request=request,
    )
    await db.commit()
    queue_force_run_capture_round(round_id)
    return {"detail": "Retry queued", "round_id": round_id}


@router.post("/{round_id}/results/{result_id}/recapture", status_code=202)
async def recapture_single_result(
    employer_id: int,
    position_id: int,
    round_id: int,
    result_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_owns_position(employer_id, position_id, current_user, db)

    # Block recapture on deactivated positions
    pos_active = (
        await db.execute(
            select(JobPosition.is_active).where(JobPosition.id == position_id)
        )
    ).scalar_one()
    if not pos_active:
        raise HTTPException(
            status_code=403,
            detail="This position is deactivated. Activate it to re-enable captures.",
        )

    await check_monthly_capture_limit(db, current_user)

    res = await db.execute(
        select(CaptureResult).where(
            CaptureResult.id == result_id,
            CaptureResult.capture_round_id == round_id,
        )
    )
    capture_res = res.scalar_one_or_none()
    if capture_res is None:
        raise HTTPException(status_code=404, detail="Capture result not found.")
    if capture_res.status == ResultStatus.DONE:
        raise HTTPException(
            status_code=400,
            detail="This result was already captured successfully and cannot be re-captured.",
        )

    queue_recapture_result(result_id)

    await audit(
        db,
        action=AuditAction.CAPTURE_TRIGGERED,
        entity_type=AuditEntity.CAPTURE_ROUND,
        actor_id=current_user.id,
        entity_id=round_id,
        employer_id=employer_id,
        position_id=position_id,
        description=f'User recaptured result #{result_id} in round #{round_id}',
        new_data={"result_id": result_id, "round_id": round_id, "recaptured": True},
        request=request,
    )
    await db.commit()

    return {"detail": "Recapture queued", "round_id": round_id, "result_id": result_id}


_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp"}
_MIME_TO_EXT = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def _sniff_mime(data: bytes) -> str | None:
    """Detect MIME type from magic bytes to prevent content-type spoofing."""
    if len(data) < 12:
        return None
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    return None


@router.post("/{round_id}/manual-upload", response_model=CaptureResultOut, status_code=201)
async def manual_upload_screenshot(
    employer_id: int,
    position_id: int,
    round_id: int,
    request: Request,
    file: UploadFile = File(...),
    job_url_id: int = Query(..., description="ID of the job board URL this screenshot belongs to"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a manual screenshot for a failed capture result.

    Accepted formats: PNG, JPG, WEBP. Max size: 10 MB.
    The uploaded image is stored in the screenshots bucket and recorded as a
    CaptureResult with is_manual=True and status=done.
    If all active URLs on the round now have a DONE result, the round is
    automatically promoted to COMPLETED.
    """
    await _assert_owns_position(employer_id, position_id, current_user, db)

    # ── Validate file type (declared MIME) ───────────────────────────────────
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{content_type}'. Accepted: PNG, JPG, WEBP.",
        )

    # ── Read with hard size cap (avoids buffering oversized uploads) ─────────
    data = await file.read(_MAX_SIZE_BYTES + 1)
    if len(data) > _MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum allowed is 10 MB.",
        )

    # ── Validate magic bytes (prevent MIME type spoofing) ────────────────────
    sniffed = _sniff_mime(data)
    if sniffed is None or sniffed != content_type:
        raise HTTPException(
            status_code=415,
            detail="File content does not match the declared content type.",
        )

    # ── Load and validate round (row-locked to prevent concurrent duplicate uploads) ──
    round_res = await db.execute(
        select(CaptureRound)
        .where(
            CaptureRound.id == round_id,
            CaptureRound.job_position_id == position_id,
        )
        .with_for_update()
        .options(selectinload(CaptureRound.results))
    )
    round_ = round_res.scalar_one_or_none()
    if round_ is None:
        raise HTTPException(status_code=404, detail="Capture round not found.")
    if round_.status != CaptureStatus.FAILED:
        raise HTTPException(
            status_code=400,
            detail="Manual upload is only allowed for FAILED capture rounds.",
        )

    # ── Deduplicate: reject if a manual DONE result already exists for this URL ──
    existing_done = await db.execute(
        select(CaptureResult.id).where(
            CaptureResult.capture_round_id == round_id,
            CaptureResult.job_url_id == job_url_id,
            CaptureResult.status == ResultStatus.DONE,
            CaptureResult.is_manual.is_(True),
        ).limit(1)
    )
    if existing_done.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail="A manual screenshot has already been uploaded for this URL in this round.",
        )

    # ── Validate job_url_id belongs to this position ──────────────────────────
    url_res = await db.execute(
        select(JobUrl).where(
            JobUrl.id == job_url_id,
            JobUrl.job_position_id == position_id,
        )
    )
    job_url = url_res.scalar_one_or_none()
    if job_url is None:
        raise HTTPException(status_code=404, detail="Job board URL not found on this position.")

    # ── Upload to Supabase storage ────────────────────────────────────────────
    ext = _MIME_TO_EXT[content_type]
    path = f"manual/{round_id}/{job_url_id}/{_uuid.uuid4().hex}.{ext}"
    screenshot_url = await storage.upload(
        bucket="screenshots",
        path=path,
        data=data,
        content_type=content_type,
    )

    # ── Persist result + audit (clean up storage if DB write fails) ──────────
    try:
        # ── Create CaptureResult ──────────────────────────────────────────────
        result = CaptureResult(
            capture_round_id=round_id,
            job_url_id=job_url_id,
            url=job_url.url,
            status=ResultStatus.DONE,
            screenshot_url=screenshot_url,
            page_pdf_url=None,
            is_manual=True,
        )
        db.add(result)
        await db.flush()  # assign result.id

        # ── Check if round is now fully covered ───────────────────────────────
        pos_res = await db.execute(
            select(JobPosition)
            .where(JobPosition.id == position_id)
            .options(selectinload(JobPosition.job_urls))
        )
        position = pos_res.scalar_one()
        active_url_ids = {u.id for u in position.job_urls if u.is_active}

        # Reload all results for this round (includes the flushed new one)
        all_results_res = await db.execute(
            select(CaptureResult).where(CaptureResult.capture_round_id == round_id)
        )
        all_results = all_results_res.scalars().all()
        done_url_ids = {r.job_url_id for r in all_results if r.status == ResultStatus.DONE}

        if active_url_ids and active_url_ids.issubset(done_url_ids):
            round_.status = CaptureStatus.COMPLETED
            round_.captured_at = datetime.now(timezone.utc)

        await audit(
            db,
            action=AuditAction.MANUAL_SCREENSHOT_UPLOADED,
            entity_type=AuditEntity.CAPTURE_ROUND,
            actor_id=current_user.id,
            entity_id=round_id,
            employer_id=employer_id,
            position_id=position_id,
            description=f'Manual screenshot uploaded for round #{round_id}, URL #{job_url_id}',
            new_data={"round_id": round_id, "job_url_id": job_url_id, "is_manual": True},
            request=request,
        )
        await db.commit()
    except Exception:
        # Storage upload succeeded but DB write failed — delete the orphaned file.
        try:
            await storage.delete("screenshots", [path])
        except Exception:
            logger.warning("Failed to clean up orphaned storage object after DB failure: %s", path)
        raise

    await db.refresh(result)
    return result
