import pytest

from cortex_agent_api.adapters import public_http_url
from cortex_agent_api.tracing import redact


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/x",
        "http://localhost/x",
        "file:///etc/passwd",
        "http://169.254.169.254/latest",
    ],
)
def test_private_or_non_http_fetch_targets_are_rejected(url):
    with pytest.raises(ValueError):
        public_http_url(url)


def test_trace_redaction_drops_resume_and_conversation_content():
    value = redact(
        {
            "conversation": "private",
            "master_resume": "private",
            "api_key": "secret",
            "note": "authorization: abc",
        }
    )
    assert "conversation" not in value
    assert "master_resume" not in value
    assert "secret" not in str(value)
    assert "abc" not in str(value)
