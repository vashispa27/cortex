import uuid
from urllib.parse import urlparse, urlunparse

import pytest


@pytest.fixture
def isolated_agent_database(monkeypatch):
    import psycopg
    from psycopg import sql

    from cortex_agent_api.settings import Settings

    url = Settings().database_url
    name = "agent_test_" + uuid.uuid4().hex
    with psycopg.connect(url, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        target = urlunparse(urlparse(url)._replace(path="/" + name))
        monkeypatch.setenv("DATABASE_URL", target)
        monkeypatch.setenv("CORTEX_AGENT_DATABASE_URL", target)
        try:
            yield
        finally:
            connection.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
            )
