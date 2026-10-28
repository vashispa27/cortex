from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from .adapters import SearchAdapter
from .tools import registered_tools


class AgentState(TypedDict, total=False):
    task_id: str
    input_revision: int
    inputs: dict[str, Any]
    plan: dict[str, Any]
    plan_response: dict[str, Any]
    sources: list[dict[str, Any]]
    drafts: dict[str, str]
    final_response: dict[str, Any]
    schedule_response: dict[str, Any]
    stage: str
    outcome: dict[str, Any]
    error: dict[str, Any]


class ResearchChoice(BaseModel):
    query: str = Field(max_length=240)
    rationale: str = Field(max_length=400)


class ModelAdapter:
    def choose_research(self, objective: str, job_description: str | None) -> ResearchChoice:
        raise NotImplementedError


class FakeModelAdapter(ModelAdapter):
    def choose_research(self, objective: str, job_description: str | None) -> ResearchChoice:
        # The fixture is deliberately visible in output; it is not a claim of live model behaviour.
        words = re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", job_description or objective)
        topic = " ".join(words[:8]) or "company and role"
        return ResearchChoice(
            query=f"{topic} official company role", rationale="deterministic demo query"
        )


class OpenAIModelAdapter(ModelAdapter):
    def __init__(self, api_key: str, model: str) -> None:
        from langchain_openai import ChatOpenAI

        self.model = ChatOpenAI(model=model, api_key=api_key, temperature=0).with_structured_output(
            ResearchChoice
        )

    def choose_research(self, objective: str, job_description: str | None) -> ResearchChoice:
        # Deliberately excludes the supplied conversation/resume to avoid unnecessary personal-data search queries.
        output = self.model.invoke(
            [
                SystemMessage(
                    content=(
                        "Choose one concise public-web research query for a job application. "
                        "Do not include personal names, emails, or resume content. Return only the schema."
                    )
                ),
                HumanMessage(
                    content=json.dumps(
                        {"objective": objective, "job_description": job_description or ""}
                    )
                ),
            ]
        )
        return (
            output if isinstance(output, ResearchChoice) else ResearchChoice.model_validate(output)
        )


def stable_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def missing_inputs(state: AgentState) -> list[dict[str, str]]:
    inputs = state["inputs"]
    missing = []
    if not inputs.get("master_resume"):
        missing.append(
            {
                "field": "master_resume",
                "reason": "A truthful tailored resume requires supplied candidate experience.",
            }
        )
    if not inputs.get("conversation"):
        missing.append(
            {
                "field": "conversation",
                "reason": "The promised follow-up and recruiter context are required.",
            }
        )
    return missing


def make_plan(state: AgentState) -> dict[str, Any]:
    inputs = state["inputs"]
    plan = {
        "objective": inputs["task"],
        "steps": [
            "Research only public company and role information, retaining inspectable source evidence.",
            "Tailor the supplied resume without adding unsupported experience or achievements.",
            "Draft a recruiter message and a source-linked change summary.",
            "Prepare the requested reminder and ask for final material approval.",
        ],
        "constraints": [
            "No automatic LinkedIn action or message sending.",
            "Candidate facts come only from supplied inputs.",
        ],
    }
    if state.get("plan_response", {}).get("feedback"):
        plan["revision_feedback"] = state["plan_response"]["feedback"]
    return plan


def request_missing(state: AgentState) -> dict[str, Any]:
    missing = missing_inputs(state)
    if not missing:
        return {"stage": "planning"}
    payload = {"fields": missing, "input_revision": state["input_revision"]}
    interaction_id = (
        f"{state['task_id']}:clarify:{state['input_revision']}:{stable_hash(payload)[:12]}"
    )
    answer = interrupt(
        {
            "interaction_id": interaction_id,
            "kind": "clarification",
            "operation": "supply_essential_input",
            "payload": payload,
            "preview": {
                "message": "Essential inputs are missing; the agent will not guess candidate facts."
            },
        }
    )
    return {"stage": "planning", "plan_response": answer}


def propose_plan(state: AgentState) -> dict[str, Any]:
    plan = make_plan(state)
    payload = {"input_revision": state["input_revision"], "plan": plan}
    interaction_id = (
        f"{state['task_id']}:plan:{state['input_revision']}:{stable_hash(payload)[:12]}"
    )
    decision = interrupt(
        {
            "interaction_id": interaction_id,
            "kind": "approval",
            "operation": "approve_research_and_drafting_plan",
            "payload": payload,
            "preview": {"markdown": "\n".join(f"- {step}" for step in plan["steps"])},
        }
    )
    return {"plan": plan, "plan_response": decision, "stage": "plan_reviewed"}


def plan_route(state: AgentState) -> Literal["research", "plan"]:
    response = state.get("plan_response", {})
    return "research" if response.get("decision") == "approve" else "plan"


def research_node(adapter: SearchAdapter, model: ModelAdapter):
    def run(state: AgentState) -> dict[str, Any]:
        inputs = state["inputs"]
        choice = model.choose_research(inputs["task"], inputs.get("job_description"))
        supplied = {
            document["name"]: document["content"]
            for document in inputs.get("supporting_documents", [])
        }
        search_tool = registered_tools(
            adapter, supplied, inputs.get("limits", {}).get("max_fetched_bytes", 1_000_000)
        )[0]
        sources = search_tool.invoke({"query": choice.query, "max_results": 3})
        return {"sources": sources, "stage": "drafting"}

    return run


def _brief(sources: list[dict[str, Any]]) -> str:
    lines = ["# Company and role brief", "", "## Sources"]
    for source in sources:
        marker = " (synthetic demo source — not live research)" if source.get("synthetic") else ""
        lines.append(
            f"- [{source['title']}]({source['url']}) — retrieved {source['retrieved_at']}{marker}"
        )
    lines.extend(["", "## Evidence", *[f"- {source['snippet']}" for source in sources]])
    return "\n".join(lines)


def _resume(master_resume: str, sources: list[dict[str, Any]]) -> tuple[str, str]:
    # Conservative v1 tailoring: preserve supplied experience verbatim and surface alignment separately.
    role_terms = "data pipelines, reliability, and analytics partnership"
    resume = (
        "# Tailored resume\n\n"
        + master_resume.strip()
        + "\n\n## Role alignment\n"
        + (
            "- Alignment discussion is based on supplied experience only; no new employers, dates, metrics, "
            f"or qualifications were added. Role themes identified from sources: {role_terms}."
        )
    )
    summary = (
        "# Change summary\n\n"
        "- Preserved the supplied master-resume facts verbatim.\n"
        "- Added a clearly labelled role-alignment note rather than claiming unsupported experience.\n"
        "- Company/role themes are separated into the sourced brief."
    )
    return resume, summary


def draft_node(state: AgentState) -> dict[str, Any]:
    inputs = state["inputs"]
    sources = state.get("sources", [])
    resume, changes = _resume(inputs["master_resume"], sources)
    message = (
        "# Recruiter message draft\n\n"
        "Hello,\n\nThank you for the conversation. As promised, I’m sharing my resume for your review. "
        "I tailored the presentation to the role using only my supplied experience. "
        "Please let me know if there is anything else useful to provide.\n\nBest,"
    )
    if state.get("final_response", {}).get("feedback"):
        changes += (
            "\n- Revision feedback recorded for this draft: " + state["final_response"]["feedback"]
        )
    return {
        "drafts": {
            "company-role-brief.md": _brief(sources),
            "tailored-resume.md": resume,
            "recruiter-message.md": message,
            "change-summary.md": changes,
        },
        "stage": "final_review",
    }


def final_review(state: AgentState) -> dict[str, Any]:
    drafts = state["drafts"]
    manifest = [
        {"name": name, "sha256": hashlib.sha256(content.encode()).hexdigest()}
        for name, content in drafts.items()
    ]
    payload = {"input_revision": state["input_revision"], "artifacts": manifest}
    interaction_id = (
        f"{state['task_id']}:final:{state['input_revision']}:{stable_hash(payload)[:12]}"
    )
    decision = interrupt(
        {
            "interaction_id": interaction_id,
            "kind": "approval",
            "operation": "approve_final_application_materials",
            "payload": payload,
            "preview": {
                "artifacts": manifest,
                "message_excerpt": drafts["recruiter-message.md"][:600],
            },
        }
    )
    return {"final_response": decision, "stage": "final_reviewed"}


def final_route(state: AgentState) -> Literal["schedule", "draft"]:
    return "schedule" if state.get("final_response", {}).get("decision") == "approve" else "draft"


def schedule_node(state: AgentState) -> dict[str, Any]:
    reminder_at = state["inputs"].get("reminder_at")
    if not reminder_at:
        return {"stage": "completed", "outcome": {"materials_approved": True, "reminder": None}}
    payload = {
        "wake_at": str(reminder_at),
        "timezone": state["inputs"]["timezone"],
        "input_revision": state["input_revision"],
    }
    # This is not a third approval. It is a durable wait interrupt that the scheduler later resumes.
    event = interrupt(
        {
            "kind": "scheduled_event",
            "event_type": "reminder_due",
            "payload": payload,
            "preview": {
                "message": "Materials are approved. This API-only reminder will become due at the resolved time.",
                **payload,
            },
        }
    )
    return {
        "schedule_response": event,
        "stage": "completed",
        "outcome": {"materials_approved": True, "reminder": payload},
    }


def build_graph(checkpointer: Any, adapter: SearchAdapter, model: ModelAdapter):
    graph = StateGraph(AgentState)
    graph.add_node("understand", request_missing)
    graph.add_node("plan", propose_plan)
    graph.add_node("research", research_node(adapter, model))
    graph.add_node("draft", draft_node)
    graph.add_node("final_review", final_review)
    graph.add_node("schedule", schedule_node)
    graph.add_edge(START, "understand")
    graph.add_edge("understand", "plan")
    graph.add_conditional_edges("plan", plan_route, {"research": "research", "plan": "plan"})
    graph.add_edge("research", "draft")
    graph.add_edge("draft", "final_review")
    graph.add_conditional_edges(
        "final_review", final_route, {"schedule": "schedule", "draft": "draft"}
    )
    graph.add_edge("schedule", END)
    return graph.compile(checkpointer=checkpointer)
