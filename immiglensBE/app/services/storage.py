"""Supabase Storage helpers.

Buckets expected (create as PUBLIC in Supabase dashboard):
  - screenshots
  - documents
  - reports
"""
import httpx

from app.core.config import settings

_STORAGE_BASE = f"{settings.SUPABASE_URL}/storage/v1/object"


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}"}


def public_url(bucket: str, path: str) -> str:
    return f"{_STORAGE_BASE}/public/{bucket}/{path}"


async def upload(
    bucket: str,
    path: str,
    data: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """Upload bytes to a Supabase Storage bucket. Returns the public URL."""
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(
            f"{_STORAGE_BASE}/{bucket}/{path}",
            content=data,
            headers={
                **_headers(),
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )
        r.raise_for_status()
    return public_url(bucket, path)


async def delete(bucket: str, paths: list[str]) -> None:
    """Delete one or more objects from a bucket (paths relative to bucket root)."""
    async with httpx.AsyncClient(timeout=30) as client:
        await client.request(
            "DELETE",
            f"{_STORAGE_BASE}/{bucket}",
            json={"prefixes": paths},
            headers=_headers(),
        )
