import { AnswerContent } from "./components/AnswerContent";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CornerDownLeft, Maximize2, Plus, Settings2, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { desktopRuntime } from "./lib/api";
import { demoSearch } from "./lib/demo";
import { answerFromMemory } from "./lib/answer";
import { loadPreferences } from "./lib/storage";
import { configureRewindTrigger, openMain, restorePreviousApp, setNotchMode, setNotchVisible, writeActiveSession, type NotchMode } from "./lib/notch";
import {
  appendMessage, commitSession, composeAnswer, loadSessions, newSession, sessionsStorageKey, sessionTime, triggerSymbol,
  type RewindSession,
} from "./lib/rewind";
import type { ChatMessage } from "./lib/types";
import RewindMark from "./components/RewindMark";
import RewindChatMark from "./components/RewindChatMark";
import "./notch.css";

const params = new URLSearchParams(window.location.search);
const requestedMode = params.get("mode");
const initialMode: NotchMode = requestedMode === "compose" || requestedMode === "thinking" || requestedMode === "answer" || requestedMode === "history" ? requestedMode : "collapsed";
const isPreview = params.get("preview") === "1";

function RewindThread({ session, busy }: { session: RewindSession; busy: boolean }) {
  return <>
    {session.messages.map((message, index) => message.role === "user"
      ? <div className="rewind-message user" key={`${session.id}-${index}`}><div className="rewind-user-bubble">{message.body}</div></div>
      : <div className="rewind-message assistant" key={`${session.id}-${index}`}>
        <span className="rewind-message-mark"><RewindMark /></span>
        <div className="rewind-assistant-body"><AnswerContent text={message.body} /></div>
      </div>)}
    {busy && <div className="rewind-message assistant"><span className="rewind-message-mark"><RewindMark processing /></span><div className="rewind-assistant-body rewind-typing"><span /><span /><span /></div></div>}
  </>;
}

export default function NotchApp() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const sample = preferences.sampleMode || !desktopRuntime();
  const previewStage = isPreview || !desktopRuntime();
  const [mode, setMode] = useState<NotchMode>(initialMode);
  const [sessions, setSessions] = useState<RewindSession[]>(loadSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [historyInput, setHistoryInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const answerScrollRef = useRef<HTMLDivElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const hotkeyRef = useRef(false);
  const busyRef = useRef(false);
  const sessionsRef = useRef(sessions);
  const tapTimerRef = useRef<number | null>(null);
  const actionsRef = useRef({ startNewRewind: (_source: "mouse" | "hotkey") => {}, openHistory: () => {}, closeDrop: () => {}, collapseOnly: () => {} });

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const effectiveMode: NotchMode = (mode === "answer" || mode === "thinking") && !activeSession ? "compose" : mode;
  const trigger = triggerSymbol(preferences.rewindTrigger);

  const commit = (session: RewindSession) => {
    setSessions(commitSession(session));
  };

  const collapseOnly = () => {
    hotkeyRef.current = false;
    setMode("collapsed");
    setActiveSessionId(null);
    setInput("");
    setHistoryInput("");
    setTapCount(0);
  };

  const closeDrop = () => {
    collapseOnly();
    if (preferences.hideDrop) window.setTimeout(() => { void setNotchVisible(false); }, 180);
  };

  const startNewRewind = (source: "mouse" | "hotkey" = "mouse") => {
    if (busyRef.current) return;
    hotkeyRef.current = source === "hotkey";
    setTapCount(0);
    setActiveSessionId(null);
    setInput("");
    setHistoryInput("");
    setMode("compose");
  };

  const openHistory = () => {
    if (busyRef.current) return;
    hotkeyRef.current = false;
    setMode("history");
    setActiveSessionId((current) => {
      const list = sessionsRef.current;
      return current && list.some((session) => session.id === current) ? current : list[0]?.id ?? null;
    });
    setTapCount(0);
  };

  const openSettings = () => {
    collapseOnly();
    void openMain("settings");
  };

  const undock = () => {
    if (activeSession) writeActiveSession(activeSession.id);
    collapseOnly();
    void openMain("ask");
  };

  const toggleChat = () => {
    if (effectiveMode === "history") closeDrop();
    else openHistory();
  };

  const handleBrand = () => {
    if (effectiveMode === "thinking") return;
    if (effectiveMode === "compose") { closeDrop(); return; }
    startNewRewind("mouse");
  };

  const submitQuestion = async (raw: string, target: "bar" | "history") => {
    const question = raw.trim();
    if (!question || busyRef.current) return;
    const useExisting = target === "history" || (target === "bar" && effectiveMode === "answer");
    const base = useExisting ? activeSession : null;
    const session = base ? appendMessage(base, { role: "user", body: question }) : newSession(question);
    if (!base) setActiveSessionId(session.id);
    commit(session);
    setBusy(true);
    busyRef.current = true;
    setBusySessionId(session.id);
    if (target === "bar") {
      setInput("");
      // Only the first question uses the compact thinking view.
      // Follow-ups stay in the mounted conversation with an inline indicator.
      if (!base) {
        setMode("thinking");
        if (hotkeyRef.current) {
          window.setTimeout(() => { void restorePreviousApp(); }, 280);
        }
      }
    } else {
      setHistoryInput("");
    }
    try {
      const delay = base ? 500 : 1350;
      const [answer] = await Promise.all([
        sample ? Promise.resolve().then(() => { const found = demoSearch(question); return { body: composeAnswer(question, found.results, true), hits: found.results.slice(0, 3) }; }) : answerFromMemory(question, base?.messages ?? []),
        new Promise((resolve) => window.setTimeout(resolve, delay)),
      ]);
      const assistant: ChatMessage = {
        role: "assistant",
        body: answer.body,
        hits: answer.hits,
      };
      commit(appendMessage(session, assistant));
      if (target === "bar") {
        setMode((current) => current === "thinking" ? "answer" : current);
        if (!hotkeyRef.current) window.setTimeout(() => inputRef.current?.focus(), 90);
      } else {
        window.setTimeout(() => historyInputRef.current?.focus(), 90);
      }
    } catch (reason) {
      const assistant: ChatMessage = {
        role: "assistant",
        body: `Rewind could not answer: ${reason instanceof Error ? reason.message : String(reason)}`,
      };
      commit(appendMessage(session, assistant));
      if (target === "bar") setMode((current) => current === "thinking" ? "answer" : current);
    } finally {
      setBusy(false);
      busyRef.current = false;
      setBusySessionId(null);
    }
  };

  const submitBar = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(input, "bar");
  };

  const submitHistory = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(historyInput, "history");
  };

  actionsRef.current = { startNewRewind, openHistory, closeDrop, collapseOnly };

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    // Sessions started or continued in the dashboard's Ask Rewind page.
    const syncSessions = (event: StorageEvent) => { if (event.key === sessionsStorageKey) setSessions(loadSessions()); };
    window.addEventListener("storage", syncSessions);
    return () => window.removeEventListener("storage", syncSessions);
  }, []);

  useEffect(() => {
    const syncPreferences = () => setPreferences(loadPreferences());
    window.addEventListener("storage", syncPreferences);
    window.addEventListener("focus", syncPreferences);
    return () => {
      window.removeEventListener("storage", syncPreferences);
      window.removeEventListener("focus", syncPreferences);
    };
  }, []);

  useEffect(() => {
    const shouldFocus = effectiveMode !== "collapsed" && (effectiveMode === "compose" || effectiveMode === "history" || !hotkeyRef.current);
    void setNotchMode(effectiveMode, shouldFocus, preferences.reduceMotion);
  }, [effectiveMode, preferences.reduceMotion]);
  useEffect(() => { void configureRewindTrigger(preferences.rewindTrigger, preferences.rewindHotkey); }, [preferences.rewindTrigger, preferences.rewindHotkey]);
  useEffect(() => { if (preferences.hideDrop) void setNotchVisible(false); }, [preferences.hideDrop]);

  useEffect(() => {
    if (effectiveMode === "compose" || (effectiveMode === "answer" && !hotkeyRef.current)) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 90);
      return () => window.clearTimeout(timer);
    }
    if (effectiveMode === "history" && activeSessionId) {
      const timer = window.setTimeout(() => historyInputRef.current?.focus(), 90);
      return () => window.clearTimeout(timer);
    }
  }, [effectiveMode, activeSessionId]);

  useEffect(() => {
    if (effectiveMode !== "history") return;
    setActiveSessionId((current) => current && sessions.some((session) => session.id === current) ? current : sessions[0]?.id ?? null);
  }, [effectiveMode, sessions]);

  useEffect(() => {
    const element = answerScrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [activeSession?.messages.length, busy, effectiveMode]);

  useEffect(() => {
    const element = historyScrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [activeSession?.messages.length, busy, effectiveMode]);

  useEffect(() => {
    if (!desktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<NotchMode>("notch-mode", (event) => {
      const next = event.payload;
      if (next === "compose") actionsRef.current.startNewRewind("mouse");
      else if (next === "history") actionsRef.current.openHistory();
      else if (next === "collapsed") actionsRef.current.collapseOnly();
      else if (next === "thinking" || next === "answer") setMode(next);
    }).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    if (!desktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<number>("rewind-tap", (event) => {
      const count = Number(event.payload) >= 2 ? 2 : 1;
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
      setTapCount(count);
      tapTimerRef.current = window.setTimeout(() => {
        tapTimerRef.current = null;
        if (count >= 2) actionsRef.current.startNewRewind("hotkey");
        else setTapCount(0);
      }, count >= 2 ? 190 : 950);
    }).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });
    return () => {
      disposed = true;
      unlisten?.();
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") actionsRef.current.closeDrop(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shell = <div className="rewind-window" data-reduce-motion={preferences.reduceMotion} data-busy={busy} data-mode={effectiveMode} data-tap={tapCount > 0 ? "true" : "false"}>
    <div className="rewind-bar">
      <button type="button" className="rewind-brand" onClick={handleBrand} aria-label={effectiveMode === "compose" ? "Close Rewind" : "Start a new rewind"}>
        <RewindMark processing={busy} />
        {tapCount > 0 && <span className="rewind-tap-badge">{trigger} × {tapCount}</span>}
      </button>

      {effectiveMode === "compose" && <form className="rewind-compose" onSubmit={submitBar}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} aria-label="Rewind a thought" placeholder={sample ? "Rewind a thought in sample memory…" : "Rewind a thought…"} />
        <button type="submit" className="rewind-enter" aria-label="Send to Rewind" title="Enter" disabled={!input.trim() || busy}><CornerDownLeft size={13} /></button>
      </form>}

      {effectiveMode === "answer" && <span className="rewind-history-label">Chat</span>}

      {effectiveMode === "thinking" && <div className="rewind-thinking-label"><span>Rewinding</span><i /><i /><i /></div>}

      {effectiveMode === "history" && <>
        <span className="rewind-history-label">Chats</span>
        <div className="rewind-actions">
          <button type="button" className="rewind-icon" aria-label="Open settings" title="Settings" onClick={openSettings}><Settings2 size={13} /></button>
          <button type="button" className="rewind-icon" aria-label="Undock chat" title="Open full chat" onClick={undock}><Maximize2 size={13} /></button>
          <button type="button" className="rewind-icon active" aria-label="Close chat history" title="Close" onClick={toggleChat}><RewindChatMark /></button>
        </div>
      </>}

      {effectiveMode === "collapsed" && <>
        <button type="button" className="rewind-open-area" aria-label="Open a new rewind" onClick={() => startNewRewind("mouse")} />
        <div className="rewind-actions">
          <button type="button" className="rewind-icon" aria-label="Open rewind chats" title="Chats" onClick={toggleChat}><RewindChatMark /></button>
        </div>
      </>}
    </div>

    {effectiveMode === "thinking" && <div className="rewind-cloud">
      <span className="rewind-scan-track"><i /></span>
      <small>Searching your memory</small>
    </div>}

    {effectiveMode === "answer" && activeSession && <section className="rewind-answer-panel">
      <header className="rewind-panel-head">
        <div><span className="rewind-eyebrow">Rewind answer</span><h2>{activeSession.title}</h2></div>
        <div className="rewind-actions">
          <button type="button" className="rewind-icon" aria-label="Expand chat" title="Open in full window" onClick={undock}><Maximize2 size={13} /></button>
          <button type="button" className="rewind-icon" aria-label="Close Rewind" title="Close" onClick={closeDrop}><X size={13} /></button>
        </div>
      </header>
      <div className="rewind-thread-scroll" ref={answerScrollRef}>
        <RewindThread session={activeSession} busy={busy && busySessionId === activeSession.id} />
      </div>
      <footer className="rewind-panel-foot">
        <span>{sample ? "Sample workspace" : "Your memory"}</span>
        <button type="button" onClick={openHistory}><RewindChatMark /> All chats</button>
      </footer>
      <form className="rewind-history-form rewind-answer-form" onSubmit={submitBar}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} aria-label="Ask a follow-up" placeholder="Ask a follow-up…" />
        <button type="submit" className="rewind-enter" aria-label="Send follow-up" title="Enter" disabled={!input.trim() || busy}><CornerDownLeft size={13} /></button>
      </form>
    </section>}

    {effectiveMode === "history" && <section className="rewind-history-panel">
      <aside className="rewind-session-list">
        <div className="rewind-session-head"><span className="rewind-eyebrow">Rewinds</span><button type="button" className="rewind-icon" aria-label="New rewind" title="New rewind" onClick={() => startNewRewind("mouse")}><Plus size={13} /></button></div>
        <div className="rewind-session-scroll">
          {sessions.length ? sessions.map((session) => <button type="button" className={`rewind-session ${session.id === activeSessionId ? "active" : ""}`} key={session.id} onClick={() => setActiveSessionId(session.id)}>
            <strong>{session.title}</strong>
            <small>{sessionTime(session.updatedAt)} · {session.messages.length} {session.messages.length === 1 ? "message" : "messages"}</small>
          </button>) : <p className="rewind-empty-small">No rewinds yet.</p>}
        </div>
      </aside>
      <div className="rewind-history-thread">
        {activeSession ? <>
          <header className="rewind-thread-head">
            <div><span className="rewind-eyebrow">Chat</span><h2>{activeSession.title}</h2></div>
            <span className="rewind-pill">{sessionTime(activeSession.updatedAt)}</span>
          </header>
          <div className="rewind-thread-scroll" ref={historyScrollRef}>
            <RewindThread session={activeSession} busy={busy && busySessionId === activeSession.id} />
          </div>
          <form className="rewind-history-form" onSubmit={submitHistory}>
            <input ref={historyInputRef} value={historyInput} onChange={(event) => setHistoryInput(event.target.value)} aria-label="Ask a follow-up" placeholder="Ask a follow-up…" />
            <button type="submit" className="rewind-enter" aria-label="Send follow-up" title="Enter" disabled={!historyInput.trim() || busy}><CornerDownLeft size={13} /></button>
          </form>
        </> : <div className="rewind-history-empty">
          <RewindMark />
          <h2>No rewind selected</h2>
          <p>Start a new rewind or pick a chat on the left.</p>
          <button type="button" className="rewind-primary" onClick={() => startNewRewind("mouse")}>Start a rewind</button>
        </div>}
      </div>
    </section>}
  </div>;

  if (!previewStage) return shell;
  return <div className="rewind-stage">
    {shell}
    <p className="rewind-stage-note">Rewind · click rewind to ask · open chats for history and settings</p>
  </div>;
}
