import { invoke, isTauri } from "@tauri-apps/api/core";
import { loadPreferences } from "./storage";

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
  plan?: { markdown?: string } | null;
  outcome: { response?: string; rejected?: boolean; incomplete?: boolean } | null;
  error: { message?: string; error?: string } | null;
  created_at: string;
  updated_at: string;
  pending_interaction?: AgentInteraction | null;
  artifacts?: AgentArtifact[];
};
export type AgentEvent = { id: number; event_type: string; payload: Record<string, unknown>; created_at: string };
export type AgentDocument = { name: string; content: string; media_type: string };
export type BrowserTab = { tab_id: number; title: string; url: string; site: string };
export type BrowserStatus = { connected: boolean; current_tab: BrowserTab | null; shared_tab: (BrowserTab & { id: string }) | null };
export type SpawnRequest = { task: string; maxModelCalls?: number; documents?: AgentDocument[]; useBrowserTab?: boolean };

/** Agents use the OpenRouter model chosen for answers in Settings (they run in the cloud, never on the local model). */
export function agentModel(): string {
  const preferences = loadPreferences();
  return preferences.layers.answer.cloudModel.trim() || preferences.openrouterModel.trim();
}
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
    case "browser_action": {
      const action = String(data.action ?? 'action');
      const label = String(data.label ?? 'page');
      if (data.outcome === 'needs_user') return `Waiting for you in ${label}`;
      if (data.outcome === 'approval_required') return `Waiting for your review: ${label}`;
      if (data.outcome !== 'ok') return `Browser: ${String(data.outcome ?? 'paused').replace(/_/g, ' ')}`;
      return `${({ type: 'Typed into', select: 'Selected an option in', set_checked: 'Changed', click: 'Clicked', snapshot: 'Read', navigate: 'Navigated', back: 'Went back from', scroll: 'Scrolled', wait: 'Waited on' } as Record<string, string>)[action] ?? action} ${label}`;
    }
    case "browser_paused": return `Browser paused: ${String(data.reason ?? 'needs you').replace(/_/g, ' ')}`;
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

/** Images, PDFs and other binary files read as garbage text, so only real text is attached. */
export function isTextDocument(name: string, content: string, type = ""): boolean {
  if (/^(image|audio|video)\//.test(type) || /\.(png|jpe?g|gif|webp|heic|pdf|zip|docx?|xlsx?|pptx?)$/i.test(name)) return false;
  return !content.includes("\u0000") && (content.match(/\uFFFD/g)?.length ?? 0) <= content.length / 100;
}

export function documentFrom(name: string, content: string, type = "text/plain"): AgentDocument {
  if (!isTextDocument(name, content, type)) throw new Error(`${name} isn't a text file. Attach .txt, .md, .csv or .json files.`);
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
    browserStatus: () => call<BrowserStatus>("GET", "/v1/browser/status"),
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
        ...(request.useBrowserTab ? { use_browser_tab: true } : {}),
        ...(agentModel() ? { model: agentModel() } : {}),
        limits: { max_model_calls: request.maxModelCalls ?? (request.useBrowserTab ? 24 : 16) },
      }, key());
    },
    respond: (job: AgentJob, response: AgentResponse) => {
      if (!job.pending_interaction) throw new Error("Nothing is waiting for you.");
      return call("POST", `/v1/tasks/${id(job.task_id)}/interactions/${id(job.pending_interaction.id)}/responses`, { expected_version: job.version, ...response }, key());
    },
    message: (job: AgentJob, text: string) => call("POST", `/v1/tasks/${id(job.task_id)}/messages`, { expected_version: job.version, text }),
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

const approval = /^(yes|yep|yeah|ok|okay|approve|approved|go|go ahead|do it|sure|looks good|lgtm|proceed|continue)[.! ]*$/i;

/**
 * Something typed in a chat that has an agent. It answers the agent's question (a plain "yes" approves a
 * plan or review; anything else asks for changes), or joins a paused job's task so the agent carries on.
 * "finished" means the agent is done and the message is an ordinary chat message.
 */
export async function followUpAgent(service: AgentService, taskId: string, text: string): Promise<{ result: "answered" | "continued" | "busy" | "finished"; asked?: string }> {
  const job = await service.get(taskId);
  if (terminal(job.status)) return { result: "finished" };
  const pending = job.pending_interaction;
  if (pending && needsYou(job.status)) {
    await service.respond(job, responseFor(pending, { kind: pending.kind !== "clarification" && approval.test(text.trim()) ? "approve" : "text", text }));
    // What it asked becomes part of the chat, above your answer.
    return { result: "answered", asked: pending.preview.markdown || "The agent asked for your input." };
  }
  // Browser agents take new instructions mid-run; other jobs accept them while paused.
  if (job.status === "paused" || job.status === "running" || job.status === "queued") { await service.message(job, text); return { result: "continued" }; }
  return { result: "busy" };
}

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
