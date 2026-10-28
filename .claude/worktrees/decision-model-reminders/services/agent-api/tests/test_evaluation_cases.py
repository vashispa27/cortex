"""Offline assertion-based evaluation cases; no live provider calls."""

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from cortex_agent_api.adapters import FakeSearchAdapter
from cortex_agent_api.workflow import FakeModelAdapter, build_graph


def test_missing_candidate_facts_becomes_a_clarification():
    graph = build_graph(InMemorySaver(), FakeSearchAdapter(), FakeModelAdapter())
    result = graph.invoke(
        {
            "task_id": "eval",
            "input_revision": 1,
            "inputs": {
                "task": "Tailor",
                "conversation": "send it",
                "master_resume": None,
                "timezone": "UTC",
            },
        },
        {"configurable": {"thread_id": "eval"}},
    )
    assert result["__interrupt__"][0].value["kind"] == "clarification"


def test_unsupported_resume_claims_are_not_created_and_demo_sources_are_labelled():
    resume = "Worked at Example Co. from 2024. Used SQL."
    graph = build_graph(InMemorySaver(), FakeSearchAdapter(), FakeModelAdapter())
    config = {"configurable": {"thread_id": "claims"}}
    graph.invoke(
        {
            "task_id": "claims",
            "input_revision": 1,
            "inputs": {
                "task": "Data Engineer",
                "conversation": "send resume",
                "master_resume": resume,
                "timezone": "UTC",
            },
        },
        config,
    )
    drafted = graph.invoke(Command(resume={"decision": "approve"}), config)
    assert resume in drafted["drafts"]["tailored-resume.md"]
    assert "synthetic demo source" in drafted["drafts"]["company-role-brief.md"]
