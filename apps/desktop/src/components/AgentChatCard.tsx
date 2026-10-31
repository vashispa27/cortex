import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Bot } from "lucide-react";
import { agentService, describeEvent, needsYou, responseFor, statusLabel, terminal, type AgentEvent, type AgentJob, type AgentService } from "../lib/agents";
import { AnswerContent } from "./AnswerContent";

export type AgentState = { job: AgentJob | null; events: AgentEvent[]; error: string; refresh: () => Promise<void> };

/** Polls one agent job while it is unfinished. */
export function useAgentJob(jobId: string | undefined, service: AgentService = agentService): AgentState {
  const [job, setJob] = useState<AgentJob | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (!jobId) return;
    try { const [current, log] = await Promise.all([service.get(jobId), service.events(jobId)]); setJob(current); setEvents(log); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [service, jobId]);
  useEffect(() => { setJob(null); setEvents([]); setError(""); }, [jobId]);
  useEffect(() => {
    if (!jobId) return;
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !(job && terminal(job.status))) void refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh, jobId, job?.status]);
  return { job, events, error, refresh };
}

/** Provider failures arrive as raw API errors; say what to do instead. */
export function agentErrorText(job: AgentJob): string {
  const text = String(job.error?.message ?? job.error?.error ?? "The agent failed.");
  if (/budget limit|guardrail/i.test(text)) return "Your OpenRouter spending limit is used up. Raise it at openrouter.ai/settings or wait for it to reset, then Retry.";
  if (/\b402\b|credits/i.test(text)) return "OpenRouter doesn't have enough credits for this. Add credits at openrouter.ai/settings/credits, then Retry.";
  if (/\b401\b|unauthori[sz]ed|invalid api key/i.test(text)) return "OpenRouter rejected the API key. Check it in Settings, then Retry.";
  if (/\b429\b|rate limit/i.test(text)) return "OpenRouter is rate limiting. Wait a minute, then Retry.";
  const line = text.split("\n")[0];
  return line.length > 800 ? `${line.slice(0, 799)}…` : line;
}

/**
 * The chat's agent, pinned above the message box: what it is doing, what it is waiting for, and the
 * buttons for it. Answers and changes are typed in the chat box itself.
 */
export default function AgentChatCard({ state, service = agentService, onOpen }: { state: AgentState; service?: AgentService; onOpen: () => void }) {
  const { job, events, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = job && needsYou(job.status) ? job.pending_interaction : null;
  const run = async (work: (current: AgentJob) => Promise<unknown>) => {
    if (!job || busy) return;
    setBusy(true);
    try { await work(job); setError(""); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const step = events.filter((event) => event.event_type === "browser_action" || event.event_type === "agent_step").map(describeEvent).filter(Boolean).at(-1);
  const shownError = error || state.error;

  return <div className="cortex-agent-card" data-status={job?.status ?? "queued"}>
    <div className="cortex-agent-card-head">
      <span className="cortex-agent-tag"><Bot size={11} /> Agent</span>
      <span className="cortex-agent-state">{job ? statusLabel(job.status) : "Starting…"}</span>
      {job && !terminal(job.status) && <button type="button" className="cortex-agent-stop" disabled={busy} title="Stop this agent" onClick={() => void run((current) => service.control(current, "cancel"))}>Stop</button>}
      {job?.status === "failed" && <button type="button" className="cortex-agent-stop" disabled={busy} title="Try again from where it stopped" onClick={() => void run((current) => service.control(current, "retry"))}>Retry</button>}
      <button type="button" className="cortex-agent-open" title="Open in the Agents page" aria-label="Open in the Agents page" onClick={onOpen}><ArrowUpRight size={12} /></button>
    </div>
    {job && !pending && !terminal(job.status) && job.status !== "paused" && step && <small className="cortex-agent-hint">{step}</small>}
    {pending && <div className="cortex-agent-ask">
      <div className="cortex-agent-question">{pending.preview.markdown ? <AnswerContent text={pending.preview.markdown} /> : <p>The agent needs your input.</p>}</div>
      {pending.kind === "clarification" ? <small className="cortex-agent-hint">Type your answer below.</small> : <div className="cortex-agent-buttons">
        <button type="button" className="cortex-agent-go" disabled={busy} onClick={() => void run((current) => service.respond(current, responseFor(pending, { kind: "approve" })))}>Approve</button>
        <button type="button" disabled={busy} onClick={() => void run((current) => service.respond(current, responseFor(pending, { kind: "reject" })))}>Reject</button>
        <small className="cortex-agent-hint">or type what to change below</small>
      </div>}
    </div>}
    {job?.status === "paused" && <div className="cortex-agent-ask">
      <small>{job.progress?.browser_reason ? `Browser paused: ${String(job.progress.browser_reason).replace(/_/g, " ")}.` : "Paused."} Resume, or type below to add details and continue.</small>
      <div className="cortex-agent-buttons"><button type="button" className="cortex-agent-go" disabled={busy} onClick={() => void run((current) => service.control(current, "resume"))}>Resume</button></div>
    </div>}
    {job?.status === "completed" && job.outcome?.response && <div className="cortex-agent-question"><AnswerContent text={job.outcome.response} /></div>}
    {job?.status === "failed" && <small className="cortex-agent-error">{agentErrorText(job)}</small>}
    {shownError && <small className="cortex-agent-error" role="alert">{shownError}</small>}
  </div>;
}
