import pytest

from cortex_agent_api.browser import site_for


def test_registrable_domain_and_private_suffixes_offline():
    assert site_for("https://jobs.example.co.uk/form") == "example.co.uk"
    assert site_for("https://a.github.io/") == "a.github.io"
    assert site_for("https://evil-example.com/") != site_for("https://example.com/")
    assert site_for("http://127.0.0.1:1234") == "127.0.0.1"
    for url in ["javascript:alert(1)", "file:///etc/passwd"]:
        with pytest.raises(ValueError):
            site_for(url)


def test_browser_schema_changes_invalidate_worker_image(tmp_path):
    from cortex_agent_api.cli import source_hash

    for name in ("Dockerfile", "pyproject.toml", "uv.lock"):
        (tmp_path / name).write_text("fixture")
    package = tmp_path / "src/cortex_agent_api"
    package.mkdir(parents=True)
    schema = package / "browser_protocol.json"
    schema.write_text('{"version":1}')
    before = source_hash(tmp_path)
    schema.write_text('{"version":2}')
    assert source_hash(tmp_path) != before
