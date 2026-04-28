"""
Alembic environment for ImmigLens — async SQLAlchemy (asyncpg) edition.

How it works
------------
SQLAlchemy uses an *async* engine (asyncpg driver).  Alembic itself is
synchronous, so we bridge the two worlds with asyncio.run() + run_sync():

    asyncio.run(run_async_migrations())
        └─ async with engine.begin() as conn
               └─ await conn.run_sync(do_run_migrations)
                       └─ context.run_migrations()  (synchronous Alembic API)

Offline mode (--sql flag) renders SQL to stdout without touching the DB.

IMPORTANT — never hard-code credentials here.  The DATABASE_URL is always
read at runtime from the .env file via app.core.config.settings.
"""

import asyncio
import logging
import sys
import os
from logging.config import fileConfig

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from alembic import context

# ── Ensure the immiglensBE directory is on sys.path so `app` is importable ─
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Load project settings (reads .env / environment variables) ────────────
from app.core.config import settings  # noqa: E402  (project root must be on sys.path)

# ── Import every model so their metadata is registered on Base ────────────
from app.core.database import Base  # noqa: E402
import app.models  # noqa: F401, E402  – registers all ORM classes

# ── Alembic Config object (access to alembic.ini values) ─────────────────
config = context.config

# Wire up Python logging from alembic.ini [loggers] section
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

logger = logging.getLogger("alembic.env")

# The metadata object Alembic compares against when autogenerating migrations
target_metadata = Base.metadata


# ── Core migration callbacks ──────────────────────────────────────────────

def do_run_migrations(connection):
    """Called inside a synchronous context via conn.run_sync()."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        # Render server defaults so autogenerate picks up server_default=
        render_as_batch=False,
        # Compare server defaults (e.g. server_default="true")
        compare_server_defaults=True,
        # Compare type changes (VARCHAR length, etc.)
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine, obtain a connection, run migrations."""
    # Supabase: the app uses the PgBouncer transaction pooler (port 6543) which is
    # incompatible with asyncpg for DDL/migrations.  Switch to the session pooler
    # (port 5432) which behaves like a direct connection and supports asyncpg fine.
    migration_url = settings.DATABASE_URL.replace(":6543/", ":5432/")
    engine = create_async_engine(
        migration_url,
        echo=False,
        poolclass=NullPool,  # no pool needed for a one-shot CLI run
        connect_args={"statement_cache_size": 0},
    )
    async with engine.begin() as conn:
        await conn.run_sync(do_run_migrations)

    await engine.dispose()


# ── Entry points (called by Alembic CLI) ─────────────────────────────────

def run_migrations_offline() -> None:
    """
    'Offline' mode: generate SQL script without a live DB connection.
    Run with:  alembic upgrade head --sql > migration.sql
    """
    url = settings.DATABASE_URL
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_server_defaults=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """'Online' mode: connect to the database and apply migrations."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
