"""Opt-in proof that the actual Postgres checkpointer survives a new graph instance."""

import os
import uuid

import pytest
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.types import Command

from cortex_agent_api.adapters import FakeSearchAdapter
from cortex_agent_api.workflow import FakeModelAdapter, build_graph

pytestmark = pytest.mark.integration


@pytest.mark.skipif(
    os.getenv("RUN_AGENT_INTEGRATION") != "1",
    reason="set RUN_AGENT_INTEGRATION=1 with compose Postgres running",
)
def test_postgres_checkpoint_resumes_after_graph_recreation():
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql://cortex:cortex@127.0.0.1:54329/cortex_agent"
    )
    config = {"configurable": {"thread_id": f"integration-checkpointer-{uuid.uuid4()}"}}
    initial = {
        "task_id": "integration-task",
        "input_revision": 1,
        "inputs": {
            "task": "Research role",
            "conversation": "send resume",
            "master_resume": "Used SQL",
            "timezone": "UTC",
        },
    }
    with PostgresSaver.from_conn_string(database_url) as saver:
        saver.setup()
        first_graph = build_graph(saver, FakeSearchAdapter(), FakeModelAdapter())
        first = first_graph.invoke(initial, config)
        assert first["__interrupt__"][0].value["operation"] == "approve_research_and_drafting_plan"
    with PostgresSaver.from_conn_string(database_url) as saver:
        second_graph = build_graph(saver, FakeSearchAdapter(), FakeModelAdapter())
        resumed = second_graph.invoke(Command(resume={"decision": "approve"}), config)
        assert (
            resumed["__interrupt__"][0].value["operation"] == "approve_final_application_materials"
        )
