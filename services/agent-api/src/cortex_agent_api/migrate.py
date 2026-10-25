from __future__ import annotations

import asyncio
from pathlib import Path

import asyncpg

from .settings import Settings


async def migrate(database_url: str) -> None:
    migrations = sorted(Path(__file__).parents[2].joinpath("migrations").glob("*.sql"))
    conn = await asyncpg.connect(database_url)
    try:
        await conn.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())""")
        for migration in migrations:
            already = await conn.fetchval(
                "SELECT 1 FROM schema_migrations WHERE version = $1", migration.name
            )
            if already:
                continue
            async with conn.transaction():
                await conn.execute(migration.read_text())
                await conn.execute(
                    "INSERT INTO schema_migrations(version) VALUES ($1)", migration.name
                )
    finally:
        await conn.close()


def main() -> None:
    asyncio.run(migrate(Settings().database_url))


if __name__ == "__main__":
    main()
