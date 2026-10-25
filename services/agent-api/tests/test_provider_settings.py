import pytest
from pydantic import ValidationError

from cortex_agent_api.settings import Settings


def test_copied_key_surrounding_whitespace_is_removed_before_transport():
    settings = Settings(
        _env_file=None, OPENROUTER_API_KEY="  synthetic-key\n", OPENROUTER_MODEL=" provider/model\n"
    )
    assert settings.openrouter_api_key == "synthetic-key"
    assert settings.openrouter_model == "provider/model"


@pytest.mark.parametrize(
    "key",
    [
        "synthetic-key\ninjected",
        "Bearer synthetic-key",
        "synthetic\tkey",
        "synthetic\x00key",
        "synthetic-🔑",
    ],
)
def test_malformed_provider_key_is_rejected_without_printing_it(key):
    with pytest.raises(ValidationError) as caught:
        Settings(_env_file=None, OPENROUTER_API_KEY=key)
    assert "Provider API key contains" in str(caught.value)
    assert key not in str(caught.value)


def test_local_protocol_error_is_diagnosed_without_echoing_header_value():
    import httpx
    from langchain_core.exceptions import ModelConnectionError

    from cortex_agent_api.agent_graph import PromptModel

    class InvalidHeader:
        def invoke(self, messages):
            try:
                raise httpx.LocalProtocolError(
                    "Illegal header value b'Bearer synthetic-private-key\\n'"
                )
            except httpx.LocalProtocolError as exc:
                raise ModelConnectionError("Connection error") from exc

    model = PromptModel.__new__(PromptModel)
    model.structured = InvalidHeader()
    with pytest.raises(RuntimeError) as caught:
        model.decide({})
    assert "invalid header" in str(caught.value)
    assert "synthetic-private-key" not in str(caught.value)
