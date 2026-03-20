import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.noc_code import NocCode
from app.models.user import User
from app.schemas.noc_code import NocCodeCreate, NocCodeOut, NocCodeUpdate, NocUploadResult

router = APIRouter(prefix="/api/noc-codes", tags=["noc-codes"])
admin_router = APIRouter(prefix="/api/admin/noc-codes", tags=["admin-noc-codes"])


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return current_user


def _derive_fields(code: str) -> tuple[int, int]:
    padded = code.strip().zfill(5)
    teer = int(padded[1])
    major_group = int(padded[0])
    return teer, major_group


# ── Public search ─────────────────────────────────────────────

@router.get("", response_model=list[NocCodeOut])
async def search_noc_codes(
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=20, le=50),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(NocCode).where(NocCode.is_active == True)  # noqa: E712
    if q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(NocCode.code.ilike(term), NocCode.title.ilike(term))
        )
    stmt = stmt.order_by(NocCode.code).limit(limit)
    results = (await db.execute(stmt)).scalars().all()
    return results


# ── Admin CRUD ────────────────────────────────────────────────

@admin_router.get("", response_model=list[NocCodeOut])
async def admin_list_noc_codes(
    q: str = Query(default="", max_length=100),
    active_only: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=500),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    stmt = select(NocCode)
    if active_only:
        stmt = stmt.where(NocCode.is_active == True)  # noqa: E712
    if q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(NocCode.code.ilike(term), NocCode.title.ilike(term))
        )
    stmt = stmt.order_by(NocCode.code).offset(skip).limit(limit)
    return (await db.execute(stmt)).scalars().all()


@admin_router.get("/count")
async def admin_count_noc_codes(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    total = (await db.execute(select(func.count()).select_from(NocCode))).scalar_one()
    active = (await db.execute(
        select(func.count()).select_from(NocCode).where(NocCode.is_active == True)  # noqa: E712
    )).scalar_one()
    return {"total": total, "active": active}


@admin_router.post("", response_model=NocCodeOut, status_code=201)
async def admin_create_noc_code(
    body: NocCodeCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = (await db.execute(
        select(NocCode).where(NocCode.code == body.code.strip())
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"NOC code {body.code} already exists.")
    teer, major_group = _derive_fields(body.code)
    noc = NocCode(
        code=body.code.strip().zfill(5),
        title=body.title.strip(),
        teer=teer,
        major_group=major_group,
        version_year=body.version_year,
        is_active=True,
    )
    db.add(noc)
    await db.commit()
    await db.refresh(noc)
    return noc


@admin_router.patch("/{noc_id}", response_model=NocCodeOut)
async def admin_update_noc_code(
    noc_id: int,
    body: NocCodeUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    noc = (await db.execute(select(NocCode).where(NocCode.id == noc_id))).scalar_one_or_none()
    if noc is None:
        raise HTTPException(status_code=404, detail="NOC code not found.")
    if body.title is not None:
        noc.title = body.title.strip()
    if body.is_active is not None:
        noc.is_active = body.is_active
    if body.version_year is not None:
        noc.version_year = body.version_year
    await db.commit()
    await db.refresh(noc)
    return noc


@admin_router.delete("/{noc_id}", status_code=204)
async def admin_delete_noc_code(
    noc_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    result = await db.execute(delete(NocCode).where(NocCode.id == noc_id))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="NOC code not found.")
    await db.commit()


# ── Bulk CSV upload ───────────────────────────────────────────

@admin_router.post("/upload", response_model=NocUploadResult)
async def admin_upload_noc_codes(
    file: UploadFile = File(...),
    version_year: int = Query(default=2021),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    contents = await file.read()
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = contents.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    # Accept flexible column names
    fieldnames = reader.fieldnames or []
    code_col = next((f for f in fieldnames if "code" in f.lower()), None)
    title_col = next((f for f in fieldnames if "title" in f.lower() or "class" in f.lower()), None)

    if not code_col or not title_col:
        raise HTTPException(
            status_code=400,
            detail=f"CSV must have a code column and a title column. Found: {fieldnames}",
        )

    inserted = updated = skipped = 0
    errors: list[str] = []

    for i, row in enumerate(reader, start=2):
        raw_code = (row.get(code_col) or "").strip()
        raw_title = (row.get(title_col) or "").strip()

        if not raw_code or not raw_title:
            skipped += 1
            continue

        code = raw_code.zfill(5)
        if len(code) != 5 or not code.isdigit():
            errors.append(f"Row {i}: invalid code '{raw_code}'")
            skipped += 1
            continue

        teer, major_group = _derive_fields(code)

        existing = (await db.execute(
            select(NocCode).where(NocCode.code == code)
        )).scalar_one_or_none()

        if existing:
            if existing.title != raw_title:
                existing.title = raw_title
                existing.version_year = version_year
                existing.is_active = True
                updated += 1
            else:
                skipped += 1
        else:
            db.add(NocCode(
                code=code,
                title=raw_title,
                teer=teer,
                major_group=major_group,
                version_year=version_year,
                is_active=True,
            ))
            inserted += 1

    await db.commit()
    return NocUploadResult(inserted=inserted, updated=updated, skipped=skipped, errors=errors)
