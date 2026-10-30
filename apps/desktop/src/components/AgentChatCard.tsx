import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Bot } from "lucide-react";
import { agentService, jobTitle, needsYou, responseFor, statusLabel, terminal, type AgentJob, type AgentService } from "../lib/agents";
import { AnswerContent } from "./AnswerContent";

/** A live agent inside a chat: shows its state, and lets you answer or approve without leaving the notch. */
export default function AgentChatCard({ jobId, service = agentService, onOpen }: { jobId: string; service?: AgentService; onOpen: () => void }) {
  const [job, setJob] = useState<AgentJob | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setJob(await service.get(jobId)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [service, jobId]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && !(job && terminal(job.status))) void refresh(); }, 3000);
    return () => window.clearInterval(timer);
  }, [refresh, job?.status]);

  const pending = job?.pending_interaction;
  const send = async (kind: "approve" | "reject" | "text") => {
    if (!job || !pending || busy || (kind === "text" && !text.trim())) return;
    setBusy(true);
    try { await service.respond(job, responseFor(pending, { kind, text })); setText(""); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  return <div className="cortex-agent-card" data-status={job?.status ?? "queued"}>
    <div className="cortex-agent-card-head">
      <span className="cortex-agent-tag"><Bot size={11} /> Agent</span>
      <span className="cortex-agent-state">{job ? statusLabel(job.status) : "Starting…"}</span>
      <button type="button" className="cortex-agent-open" title="Open in the Agents page" aria-label="Open in the Agents page" onClick={onOpen}><ArrowUpRight size={12} /></button>
    </div>
    {job && <strong className="cortex-agent-title">{jobTitle(job)}</strong>}
    {error && <small className="cortex-agent-error" role="alert">{error}</small>}
    {job && pending && needsYou(job.status) && <div className="cortex-agent-ask">
      {pending.preview.markdown && <AnswerContent text={pending.preview.markdown} />}
      <input value={text} onChange={(event) => setText(event.target.value)} aria-label={pending.kind === "approval" ? "Feedback for the agent" : "Answer the agent"} placeholder={pending.kind === "approval" ? "Or say what to change…" : "Your answer…"}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void send("text"); } }} />
      <div className="cortex-agent-buttons">
        {pending.kind === "approval" ? <>
          <button type="button" className="cortex-agent-go" disabled={busy} onClick={() => void send("approve")}>Approve</button>
          <button type="button" disabled={busy || !text.trim()} onClick={() => void send("text")}>Request changes</button>
          <button type="button" disabled={busy} onClick={() => void send("reject")}>Reject</button>
        </> : <button type="button" className="cortex-agent-go" disabled={busy || !text.trim()} onClick={() => void send("text")}>Send</button>}
      </div>
    </div>}
    {job?.outcome?.response && <AnswerContent text={job.outcome.response} />}
    {job?.error && <small className="cortex-agent-error">{job.error.message ?? job.error.error ?? "The agent failed."}</small>}
  </div>;
}
