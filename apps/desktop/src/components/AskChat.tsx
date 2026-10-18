import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Orbit, Plus, UserRound } from "lucide-react";
import { AnswerContent } from "./AnswerContent";
import { answerFromMemory } from "../lib/answer";
import { demoSearch } from "../lib/demo";
import { takeActiveSession } from "../lib/notch";
import {
  appendMessage, commitSession, composeAnswer, loadSessions, newSession, sessionsStorageKey, sessionTime,
  type RewindSession,
} from "../lib/rewind";
import type { ChatMessage } from "../lib/types";
import "./ask-chat.css";

type Props = { sample: boolean; active: boolean; onSessionCount: (count: number) => void };

/** Dashboard Ask Rewind: the same persisted sessions the notch shows. */
export default function AskChat({ sample, active, onSessionCount }: Props) {
  const [sessions, setSessions] = useState<RewindSession[]>(loadSessions);
  const [activeId, setActiveId] = useState<string | null>(() => loadSessions()[0]?.id ?? null);
  const [input, setInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const session = sessions.find((item) => item.id === activeId) ?? null;

  useEffect(() => { onSessionCount(sessions.reduce((sum, item) => sum + item.messages.filter((m) => m.role === "user").length, 0)); }, [sessions, onSessionCount]);

  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === sessionsStorageKey) setSessions(loadSessions()); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  // "Expand" in the notch hands over the session it was showing. The sessions
  // may have changed since this page last loaded, so re-read before selecting.
  useEffect(() => {
    const adopt = () => {
      const fresh = loadSessions();
      setSessions(fresh);
      const requested = takeActiveSession();
      if (requested && fresh.some((item) => item.id === requested)) setActiveId(requested);
      else setActiveId((current) => current && fresh.some((item) => item.id === current) ? current : fresh[0]?.id ?? null);
    };
    if (active) adopt();
    // Already on this page when the notch expands a chat.
    window.addEventListener("rewind:handoff", adopt);
    return () => window.removeEventListener("rewind:handoff", adopt);
  }, [active]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [session?.messages.length, busyId, activeId]);

  const commit = (next: RewindSession) => setSessions(commitSession(next));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || busyRef.current) return;
    const next = session ? appendMessage(session, { role: "user", body: question }) : newSession(question);
    setActiveId(next.id);
    commit(next);
    setInput("");
    busyRef.current = true;
    setBusyId(next.id);
    try {
      const answer = sample
        ? (() => { const found = demoSearch(question); return { body: composeAnswer(question, found.results, true), hits: found.results.slice(0, 3) }; })()
        : await answerFromMemory(question, session?.messages ?? []);
      commit(appendMessage(next, { role: "assistant", body: answer.body, hits: answer.hits }));
    } catch (error) {
      commit(appendMessage(next, { role: "assistant", body: `Rewind could not answer: ${error instanceof Error ? error.message : String(error)}` }));
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  };

  const message = (item: ChatMessage, index: number) => <div key={index} className={`message ${item.role}`}>
    <div className="message-avatar">{item.role === "assistant" ? <Orbit size={17} /> : <UserRound size={17} />}</div>
    <div className="message-content">{item.role === "assistant" ? <AnswerContent text={item.body} /> : <p>{item.body}</p>}</div>
  </div>;

  return <div className="chat-page ask-chat">
    <aside className="ask-sessions" aria-label="Rewind sessions">
      <div className="ask-sessions-head"><span className="eyebrow">Rewinds</span>
        <button type="button" className="ask-new" aria-label="New rewind" title="New rewind" disabled={busyId !== null} onClick={() => { setActiveId(null); setInput(""); }}><Plus size={15} /></button>
      </div>
      <div className="ask-session-scroll">
        {sessions.length ? sessions.map((item) => <button type="button" key={item.id} className={`ask-session ${item.id === activeId ? "active" : ""}`} onClick={() => setActiveId(item.id)}>
          <strong>{item.title}</strong>
          <small>{sessionTime(item.updatedAt)} · {item.messages.length} {item.messages.length === 1 ? "message" : "messages"}</small>
        </button>) : <p className="ask-empty-list">No rewinds yet.</p>}
      </div>
    </aside>
    <section className="ask-thread">
      <div className="chat-heading"><span className="eyebrow">Ask Rewind</span><h1>{session ? session.title : "What’s on your mind?"}</h1>{!session && <p>Ask about what you have seen in your apps.</p>}</div>
      <div className="chat-scroll" ref={scrollRef}>
        {session ? <div className="messages">
          {session.messages.map(message)}
          {busyId === session.id && <div className="message assistant"><div className="message-avatar"><Orbit size={17} /></div><div className="message-content">Thinking…</div></div>}
        </div> : <div className="chat-empty"><span className="chat-illustration"><Orbit size={36} /></span><h2>Start with a question.</h2><p>Try “What did Maya say about the review?” or “Find the accessibility checklist.”</p>
          <div className="suggestions">{["What did Maya say about the review?", "Find the accessibility checklist", "What was in the project notes?"].map((prompt) => <button key={prompt} onClick={() => setInput(prompt)}>{prompt} <ArrowRight size={14} /></button>)}</div></div>}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <div className="composer-box"><input aria-label="Ask Rewind" value={input} onChange={(event) => setInput(event.target.value)} placeholder={session ? "Ask a follow-up…" : "Ask about something you saw…"} /><button disabled={!input.trim() || busyId !== null} type="submit" aria-label="Send question"><ArrowRight size={19} /></button></div>
        <small>{sample ? "Answers use the sample workspace." : "Search results may be incomplete when capture was off or excluded."}</small>
      </form>
    </section>
  </div>;
}
