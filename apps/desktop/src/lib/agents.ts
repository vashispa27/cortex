import { invoke, isTauri } from "@tauri-apps/api/core";

/** Client for the local agent service (`services/agent-api`), reached through the desktop shell. */

export type AgentStatus = "queued" | "running" | "paused" | "waiting_input" | "waiting_approval" | "waiting_event" | "completed" | "failed" | "cancelled";

export type AgentInteraction = {
  id: string;
  kind: "approval" | "clarification";
  operation: string;
  payload: Record<string, unknown>;
  preview: { markdown?: string; reminder_at?: string | null };
  state: "pending" | "resolved" | "invalidated" | "cancelled";
};
export type AgentArtifact = { id: string; logical_name: string; media_type?: string; input_revision?: number };
export type AgentJob = {
  task_id: string;
  status: AgentStatus;
  version: number;
  objective: string;
  progress: Record<string, unknown> | null;
  outcome: { response?: string; rejected?: boolean; incomplete?: boolean } | null;
  error: { message?: string; error?: string } | null;
  created_at: string;
  updated_at: string;
  pending_interaction?: AgentInteraction | null;
  artifacts?: AgentArtifact[];
};
export type AgentEvent = { id: number; event_type: string; payload: Record<string, unknown>; created_at: string };
export type AgentDocument = { name: string; content: string; media_type: string };
export type SpawnRequest = { task: string; maxModelCalls?: number; documents?: AgentDocument[] };
export type AgentResponse = { decision?: "approve" | "reject" | "request_changes"; answer?: Record<string, string>; feedback?: string };

export const modelCallChoices = [8, 16, 24, 40] as const;
export const maxPromptLength = 20_000;
const maxDocumentLength = 200_000;

export const terminal = (status: AgentStatus) => status === "completed" || status === "failed" || status === "cancelled";
export const needsYou = (status: AgentStatus) => status === "waiting_input" || status === "waiting_approval";

const labels: Record<AgentStatus, string> = {
  queued: "Queued", running: "Working", paused: "Paused", waiting_input: "Needs your answer", waiting_approval: "Needs your review",
  waiting_event: "Waiting", completed: "Done", failed: "Failed", cancelled: "Cancelled",
};
export const statusLabel = (status: AgentStatus) => labels[status] ?? status;

/** Which controls make sense for a state; the service still enforces the real rules. */
export function controlsFor(status: AgentStatus): ("pause" | "resume" | "cancel" | "retry")[] {
  if (status === "paused") return ["resume", "cancel"];
  if (status === "failed") return ["retry"];
  if (terminal(status)) return [];
  return ["pause", "cancel"];
}

export function jobTitle(job: Pick<AgentJob, "objective">): string {
  const line = job.objective.replace(/\s+/g, " ").trim();
  return line.length > 90 ? `${line.slice(0, 89)}…` : line || "Untitled agent";
}

/** Attention first, then still working, then finished; newest first inside each group. */
export function sortJobs(jobs: AgentJob[]): AgentJob[] {
  const rank = (job: AgentJob) => needsYou(job.status) ? 0 : terminal(job.status) ? 2 : 1;
  return [...jobs].sort((a, b) => rank(a) - rank(b) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
}

/** One readable line per event; events that carry nothing a person needs return null. */
export function describeEvent(event: AgentEvent): string | null {
  const data = event.payload ?? {};
  switch (event.event_type) {
    case "agent_step": return `Agent: ${String(data.action ?? "thinking")}`;
    case "tool_started": return `Using ${String(data.tool ?? "a tool")}`;
    case "tool_completed": return `Finished ${String(data.tool ?? "a tool")}`;
    case "interaction_resolved": return "You answered";
    case "task_created": return "Started";
    default: return event.event_type.replace(/_/g, " ");
  }
}

/** Builds the response the service expects for the pending question or review. */
export function responseFor(interaction: AgentInteraction, input: { kind: "approve" | "reject" | "text"; text?: string }): AgentResponse {
  if (interaction.kind === "clarification") {
    const fields = interaction.payload.fields as { field?: string }[] | undefined;
    return { answer: { [fields?.[0]?.field || "response"]: (input.text ?? "").trim() } };
  }
  if (input.kind === "approve") return { decision: "approve" };
  if (input.kind === "reject") return { decision: "reject" };
  return { decision: "request_changes", feedback: (input.text ?? "").trim() };
}

export function documentFrom(name: string, content: string, type = "text/plain"): AgentDocument {
  const safe = name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/^[^a-zA-Z0-9]+/, "").slice(0, 120) || "document.txt";
  if (content.length > maxDocumentLength) throw new Error(`${name} is larger than ${maxDocumentLength / 1000} KB of text.`);
  return { name: safe, content, media_type: type.split(";")[0] || "text/plain" };
}

function describe(error: unknown): Error {
  return new Error(error instanceof Error ? error.message : String(error));
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  if (!isTauri()) throw new Error("Agents run from the Cortex desktop app. Open Cortex desktop to use them.");
  try {
    return await invoke<T>("agent_request", { method, path, body: body ?? null, idempotencyKey: idempotencyKey ?? null });
  } catch (error) { throw describe(error); }
}

const id = (value: string) => encodeURIComponent(value);
const key = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function createAgentService() {
  return {
    list: () => call<AgentJob[]>("GET", "/v1/tasks"),
    get: (taskId: string) => call<AgentJob>("GET", `/v1/tasks/${id(taskId)}`),
    events: (taskId: string, after = 0) => call<AgentEvent[]>("GET", `/v1/tasks/${id(taskId)}/events?after_id=${after}&limit=200`),
    spawn: (request: SpawnRequest) => {
      const task = request.task.trim();
      if (!task) throw new Error("Describe what the agent should do.");
      if (task.length > maxPromptLength) throw new Error(`Keep the request under ${maxPromptLength / 1000},000 characters.`);
      return call<{ task_id: string; status: AgentStatus }>("POST", "/v1/tasks", {
        workflow: "agent",
        task,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        supporting_documents: request.documents ?? [],
        limits: { max_model_calls: request.maxModelCalls ?? 16 },
      }, key());
    },
    respond: (job: AgentJob, response: AgentResponse) => {
      if (!job.pending_interaction) throw new Error("Nothing is waiting for you.");
      return call("POST", `/v1/tasks/${id(job.task_id)}/interactions/${id(job.pending_interaction.id)}/responses`, { expected_version: job.version, ...response }, key());
    },
    control: (job: AgentJob, action: "pause" | "resume" | "cancel" | "retry") =>
      call("POST", `/v1/tasks/${id(job.task_id)}/${action}`, { expected_version: job.version }),
    artifactText: async (taskId: string, artifactId: string) => {
      const value = await call<{ text?: string }>("GET", `/v1/tasks/${id(taskId)}/artifacts/${id(artifactId)}`);
      return value.text ?? JSON.stringify(value, null, 2);
    },
  };
}
export type AgentService = ReturnType<typeof createAgentService>;
export const agentService = createAgentService();

// A chat in the notch hands its request to the Agents page through storage, like the chat handoff does.
const draftKey = "cortex.agents.draft.v1";
export function saveAgentDraft(prompt: string): void {
  try { localStorage.setItem(draftKey, prompt.slice(0, maxPromptLength)); } catch { /* The page simply opens empty. */ }
}
export function takeAgentDraft(): string | null {
  try {
    const value = localStorage.getItem(draftKey);
    if (value !== null) localStorage.removeItem(draftKey);
    return value;
  } catch { return null; }
}
