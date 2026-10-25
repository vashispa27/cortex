from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from cortex_agent_api.adapters import FakeSearchAdapter
from cortex_agent_api.agent_graph import Decision, build_prompt_graph
from cortex_agent_api.schemas import CreateTaskRequest


class ScriptedModel:
    def __init__(self, *decisions):
        self.decisions = iter(decisions)
        self.contexts = []

    def decide(self, context):
        self.contexts.append(context)
        return next(self.decisions)


def state():
    return {
        "task_id": "prompt-test",
        "input_revision": 1,
        "inputs": CreateTaskRequest(
            workflow="agent", task="Write a brief about a company"
        ).model_dump(mode="json"),
    }


CONFIG = {"configurable": {"thread_id": "prompt-test"}}


def pending(result):
    return result["__interrupt__"][0].value


def test_clarification_tool_memory_revisions_and_recreated_graph():
    model = ScriptedModel(
        Decision(action="clarify", text="Which company?"),
        Decision(action="plan", text="Research the supplied company and write a brief."),
        Decision(
            action="tool",
            text="Find a public source",
            tool="search_web",
            query="Northstar official",
            working_notes="The user identified Northstar. Search its official site.",
        ),
        Decision(
            action="finish",
            text="# Brief\nSynthetic Northstar result.",
            working_notes="Found a synthetic demo source; no live facts confirmed.",
        ),
        Decision(action="finish", text="# Revised brief\nSynthetic Northstar result, now concise."),
    )
    saver = InMemorySaver()
    graph = build_prompt_graph(saver, FakeSearchAdapter(), model, "fake")
    first = graph.invoke(state(), CONFIG)
    assert pending(first)["kind"] == "clarification"
    plan = graph.invoke(Command(resume={"answer": {"response": "Northstar"}}), CONFIG)
    assert "Northstar" in str(model.contexts[-1]["history"])
    assert pending(plan)["operation"] == "approve_plan"
    # Recreate the runtime at the approval boundary, retaining only the checkpoint backend.
    graph = build_prompt_graph(saver, FakeSearchAdapter(), model, "fake")
    result = graph.invoke(Command(resume={"decision": "approve"}), CONFIG)
    assert result["tool_calls"] == 1
    assert "identified Northstar" in model.contexts[-1]["working_notes"]
    assert model.contexts[-1]["history"][-1]["tool"] == "search_web"
    assert pending(result)["operation"] == "approve_result"
    previous = pending(result)["payload"]["artifacts"][0]["sha256"]
    revised = graph.invoke(
        Command(resume={"decision": "request_changes", "feedback": "Shorter please"}), CONFIG
    )
    assert model.contexts[-1]["history"][-1]["review"]["feedback"] == "Shorter please"
    assert pending(revised)["payload"]["artifacts"][0]["sha256"] != previous
    done = graph.invoke(Command(resume={"decision": "approve"}), CONFIG)
    assert done["stage"] == "completed"


def test_rejection_stops_without_another_model_call():
    model = ScriptedModel(Decision(action="plan", text="Write a brief"))
    graph = build_prompt_graph(InMemorySaver(), FakeSearchAdapter(), model)
    graph.invoke(state(), CONFIG)
    result = graph.invoke(Command(resume={"decision": "reject"}), CONFIG)
    assert result["outcome"] == {"rejected": "plan"}
    assert len(model.contexts) == 1


def test_model_cannot_skip_plan_and_budget_survives_review():

    graph = build_prompt_graph(
        InMemorySaver(),
        FakeSearchAdapter(),
        ScriptedModel(
            Decision(
                action="tool",
                text="Research the company",
                tool="search_web",
                query="company official",
            )
        ),
    )
    result = graph.invoke(state(), CONFIG)
    assert pending(result)["operation"] == "approve_plan"
    assert result.get("tool_calls", 0) == 0
    limited = state()
    limited["inputs"]["limits"]["max_model_calls"] = 1
    graph = build_prompt_graph(
        InMemorySaver(), FakeSearchAdapter(), ScriptedModel(Decision(action="plan", text="Plan"))
    )
    graph.invoke(limited, CONFIG)
    budget = graph.invoke(Command(resume={"decision": "approve"}), CONFIG)
    assert pending(budget)["operation"] == "extend_model_budget"
    assert budget["model_calls"] == 1
    stopped = graph.invoke(Command(resume={"decision": "reject"}), CONFIG)
    assert stopped["outcome"]["incomplete"]
    assert "research-progress.md" in stopped["drafts"]


def test_budget_extension_is_persisted_and_remaining_calls_reach_model():
    model = ScriptedModel(
        Decision(action="plan", text="Plan"), Decision(action="finish", text="Finished result")
    )
    saver = InMemorySaver()
    graph = build_prompt_graph(saver, FakeSearchAdapter(), model)
    initial = state()
    initial["inputs"]["limits"]["max_model_calls"] = 1
    graph.invoke(initial, CONFIG)
    exhausted = graph.invoke(Command(resume={"decision": "approve"}), CONFIG)
    assert pending(exhausted)["payload"]["proposed_limit"] == 9
    assert len(model.contexts) == 1
    graph = build_prompt_graph(saver, FakeSearchAdapter(), model)
    result = graph.invoke(Command(resume={"decision": "approve"}), CONFIG)
    assert result["model_call_limit"] == 9
    assert model.contexts[-1]["execution_budget"]["model_calls_remaining"] == 8
    assert pending(result)["operation"] == "approve_result"


def test_final_calls_are_reserved_for_synthesis_and_hard_cap_stops_honestly():
    model = ScriptedModel(Decision(action="finish", text="A sourced draft"))
    initial = {**state(), "phase": "executing", "model_calls": 6}
    graph = build_prompt_graph(InMemorySaver(), FakeSearchAdapter(), model)
    graph.invoke(initial, CONFIG)
    assert model.contexts[-1]["execution_budget"]["synthesize_now"] is True
    capped = {**state(), "phase": "executing", "model_calls": 40, "model_call_limit": 40}
    result = build_prompt_graph(InMemorySaver(), FakeSearchAdapter(), ScriptedModel()).invoke(
        capped, CONFIG
    )
    assert result["outcome"]["incomplete"]
    assert result["stage"] == "stopped"


def test_greeting_completes_with_direct_reply_and_no_review():
    model = ScriptedModel(Decision(action="reply", text="Hello! What would you like to work on?"))
    graph = build_prompt_graph(InMemorySaver(), FakeSearchAdapter(), model)
    initial = state()
    initial["inputs"]["task"] = "hello"
    result = graph.invoke(initial, CONFIG)
    assert not result.get("__interrupt__")
    assert result["outcome"]["response"] == "Hello! What would you like to work on?"


def test_model_finishing_without_a_plan_requests_final_review_instead_of_failing():
    graph = build_prompt_graph(
        InMemorySaver(),
        FakeSearchAdapter(),
        ScriptedModel(Decision(action="finish", text="Hello!")),
    )
    result = graph.invoke(state(), CONFIG)
    assert pending(result)["operation"] == "approve_result"
    assert result["drafts"]["result.md"] == "Hello!"


def test_openrouter_uses_explicit_endpoint_and_never_adds_key_to_context(monkeypatch):
    from cortex_agent_api.agent_graph import PromptModel
    from cortex_agent_api.settings import Settings

    observed = {}

    class StubChat:
        def __init__(self, **kwargs):
            observed.update(kwargs)

        def with_structured_output(self, schema, **kwargs):
            assert schema is Decision
            assert kwargs["method"] == "function_calling"
            return self

        def invoke(self, messages):
            assert "test-key" not in str(messages)
            return Decision(action="plan", text="A plan")

    monkeypatch.setattr("langchain_openai.ChatOpenAI", StubChat)
    settings = Settings(
        _env_file=None,
        CORTEX_AGENT_MODEL_MODE="openrouter",
        OPENROUTER_API_KEY="test-key",
        OPENROUTER_MODEL="provider/example-model",
    )
    assert PromptModel(settings).decide({"inputs": {"task": "Hello"}}).action == "plan"
    assert observed["base_url"] == "https://openrouter.ai/api/v1"
    assert observed["model"] == "provider/example-model"


def test_failed_first_model_call_can_retry_from_checkpoint():
    import pytest

    class InitiallyOffline:
        calls = 0

        def decide(self, context):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("Connection error")
            return Decision(action="plan", text="A recovered plan")

    model = InitiallyOffline()
    saver = InMemorySaver()
    graph = build_prompt_graph(saver, FakeSearchAdapter(), model)
    with pytest.raises(RuntimeError, match="Connection error"):
        graph.invoke(state(), CONFIG)
    graph = build_prompt_graph(saver, FakeSearchAdapter(), model)
    result = graph.invoke(None, CONFIG)
    assert pending(result)["operation"] == "approve_plan"
    assert model.calls == 2


def test_connection_diagnostic_keeps_cause_category_without_printing_secrets():
    import httpx
    import pytest
    from langchain_core.exceptions import ModelConnectionError

    from cortex_agent_api.agent_graph import PromptModel

    class Offline:
        def invoke(self, messages):
            try:
                raise httpx.ConnectError(
                    "Temporary failure in name resolution; key=private-diagnostic-key"
                )
            except httpx.ConnectError as exc:
                raise ModelConnectionError("Connection error") from exc

    model = PromptModel.__new__(PromptModel)
    model.structured = Offline()
    with pytest.raises(RuntimeError) as caught:
        model.decide({})
    assert "DNS lookup failed" in str(caught.value)
    assert "ConnectError" in str(caught.value)
    assert "private-diagnostic-key" not in str(caught.value)
