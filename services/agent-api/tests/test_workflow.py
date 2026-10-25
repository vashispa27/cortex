from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from cortex_agent_api.adapters import FakeSearchAdapter
from cortex_agent_api.workflow import FakeModelAdapter, build_graph


def task_state(reminder_at=None):
    return {
        "task_id": "synthetic-task",
        "input_revision": 1,
        "inputs": {
            "task": "Research a data engineering role and prepare truthful materials.",
            "conversation": "Recruiter: Please send your resume tomorrow.",
            "master_resume": "Data Analyst — built SQL reporting pipelines.",
            "job_description": "Build reliable data pipelines.",
            "timezone": "Asia/Kolkata",
            "reminder_at": reminder_at,
        },
    }


def workflow():
    return build_graph(InMemorySaver(), FakeSearchAdapter(), FakeModelAdapter())


def interrupt(result):
    return result["__interrupt__"][0].value


def test_plan_final_approval_and_truthful_artifacts():
    graph = workflow()
    config = {"configurable": {"thread_id": "synthetic-task"}}
    initial = graph.invoke(task_state(), config)
    assert interrupt(initial)["operation"] == "approve_research_and_drafting_plan"

    drafted = graph.invoke(Command(resume={"decision": "approve"}), config)
    assert interrupt(drafted)["operation"] == "approve_final_application_materials"
    assert "synthetic demo source" in drafted["drafts"]["company-role-brief.md"]
    assert "no new employers, dates, metrics" in drafted["drafts"]["tailored-resume.md"]
    assert drafted["drafts"]["tailored-resume.md"].startswith("# Tailored resume")

    complete = graph.invoke(Command(resume={"decision": "approve"}), config)
    assert complete["outcome"] == {"materials_approved": True, "reminder": None}


def test_missing_resume_becomes_a_typed_clarification():
    graph = workflow()
    config = {"configurable": {"thread_id": "missing-resume"}}
    state = task_state()
    state["task_id"] = "missing-resume"
    state["inputs"]["master_resume"] = None
    result = graph.invoke(state, config)
    request = interrupt(result)
    assert request["kind"] == "clarification"
    assert request["payload"]["fields"][0]["field"] == "master_resume"


def test_change_request_generates_a_new_final_approval_payload():
    graph = workflow()
    config = {"configurable": {"thread_id": "revision"}}
    state = task_state()
    state["task_id"] = "revision"
    graph.invoke(state, config)
    first_final = graph.invoke(Command(resume={"decision": "approve"}), config)
    first_id = interrupt(first_final)["interaction_id"]
    revised = graph.invoke(
        Command(resume={"decision": "request_changes", "feedback": "Make the note more concise."}),
        config,
    )
    assert interrupt(revised)["interaction_id"] != first_id
    assert "Make the note more concise" in revised["drafts"]["change-summary.md"]
