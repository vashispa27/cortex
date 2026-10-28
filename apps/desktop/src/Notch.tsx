import { AnswerContent, AnswerSourceLabel } from "./components/AnswerContent";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { CornerDownLeft, Maximize2, Pause, Play, Plus, Settings2, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { desktopRuntime, getServiceSettings, setEvalCapture } from "./lib/api";
import { demoSearch } from "./lib/demo";
import { answerCortex, runAction } from "./lib/answer";
import type { ChatAction } from "./lib/intent";
import ChatActions from "./components/ChatActions";
import { loadPreferences } from "./lib/storage";
import { configureNotchDisplay, configureCortexTrigger, configureTestMode, focusNotch, openMain, restorePreviousApp, setNotchMode, setNotchVisible, showNotchContextMenu, writeActiveSession, type NotchMode } from "./lib/notch";
import {
  appendMessage, commitSession, composeAnswer, finishAction, loadSessions, newSession, sessionsStorageKey, sessionTime, triggerSymbol,
  type CortexSession,
} from "./lib/cortex";
import type { ChatMessage } from "./lib/types";
import CortexMark from "./components/CortexMark";
import CortexChatMark from "./components/CortexChatMark";
import "./notch.css";

const params = new URLSearchParams(window.location.search);
const requestedMode = params.get("mode");
const initialMode: NotchMode = requestedMode === "compose" || requestedMode === "thinking" || requestedMode === "answer" || requestedMode === "history" ? requestedMode : "collapsed";
const isPreview = params.get("preview") === "1";

/** The selection a summary is about, folded to three lines until opened. */
function SelectionQuote({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const long = message.body.length > 240 || message.body.split("\n").length > 3;
  return <div className="cortex-quote">
    {message.origin && <small>{message.origin}</small>}
    <blockquote data-open={open || !long}>{message.body}</blockquote>
    {message.note && <small className="cortex-quote-note">{message.note}</small>}
    {long && <button type="button" onClick={() => setOpen(!open)}>{open ? "Show less" : "Show more"}</button>}
  </div>;
}

function CortexThread({ session, busy, onAction }: { session: CortexSession; busy: boolean; onAction: (index: number, action: ChatAction) => void }) {
  return <>
    {session.messages.map((message, index) => message.role === "user"
      ? <div className="cortex-message user" key={`${session.id}-${index}`}>{message.kind === "summarize" ? <SelectionQuote message={message} /> : <div className="cortex-user-bubble">{message.body}</div>}</div>
      : <div className="cortex-message assistant" key={`${session.id}-${index}`}>
        <span className="cortex-message-mark"><CortexMark /></span>
        <div className="cortex-assistant-body"><AnswerSourceLabel source={message.source} /><AnswerContent text={message.body} />{message.actions?.length ? <ChatActions actions={message.actions} disabled={busy} onRun={(action) => onAction(index, action)} /> : null}</div>
      </div>)}
    {busy && <div className="cortex-message assistant"><span className="cortex-message-mark"><CortexMark processing /></span><div className="cortex-assistant-body cortex-typing"><span /><span /><span /></div></div>}
  </>;
}

export default function NotchApp() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const sample = preferences.sampleMode || !desktopRuntime();
  const previewStage = isPreview || !desktopRuntime();
  const [mode, setMode] = useState<NotchMode>(initialMode);
  const [sessions, setSessions] = useState<CortexSession[]>(loadSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [historyInput, setHistoryInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  // Test mode (Settings): searches use the separate eval archive and this button records into it.
  const [testMode, setTestMode] = useState(false);
  const [evalRecording, setEvalRecording] = useState(false);
  const [evalBusy, setEvalBusy] = useState(false);
  const [evalError, setEvalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const historyInputRef = useRef<HTMLInputElement>(null);
  const answerScrollRef = useRef<HTMLDivElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const hotkeyRef = useRef(false);
  const busyRef = useRef(false);
  const sessionsRef = useRef(sessions);
  const tapTimerRef = useRef<number | null>(null);
  const actionsRef = useRef({
    startNewCortex: (_source: "mouse" | "hotkey") => {}, openHistory: () => {}, closeDrop: () => {}, collapseOnly: () => {},
  });

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const effectiveMode: NotchMode = (mode === "answer" || mode === "thinking") && !activeSession ? "compose" : mode;
  const trigger = triggerSymbol(preferences.cortexTrigger);

  const commit = (session: CortexSession) => {
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

  const startNewCortex = (source: "mouse" | "hotkey" = "mouse") => {
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
    if (effectiveMode === "compose") { closeDrop(); void restorePreviousApp(); return; }
    startNewCortex("mouse");
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
        sample ? Promise.resolve().then(() => { const found = demoSearch(question); return { body: composeAnswer(question, found.results, true), hits: found.results.slice(0, 3), source: "memory" as const }; }) : answerCortex(question, base?.messages ?? []),
        new Promise((resolve) => window.setTimeout(resolve, delay)),
      ]);
      const assistant: ChatMessage = {
        role: "assistant",
        body: answer.body,
        hits: answer.hits,
        source: answer.source,
        ...("pendingIntent" in answer ? { pendingIntent: answer.pendingIntent } : {}),
        ...("actions" in answer && answer.actions ? { actions: answer.actions } : {}),
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
        body: `Cortex could not answer: ${reason instanceof Error ? reason.message : String(reason)}`,
      };
      commit(appendMessage(session, assistant));
      if (target === "bar") setMode((current) => current === "thinking" ? "answer" : current);
    } finally {
      setBusy(false);
      busyRef.current = false;
      setBusySessionId(null);
    }
  };

  // Undo / Confirm / Cancel under a message: run it, drop the buttons, and show what happened.
  const runMessageAction = async (index: number, action: ChatAction) => {
    const session = activeSession;
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setBusySessionId(session.id);
    try {
      const result = await runAction(action, session.messages.slice(0, index + 1));
      commit(finishAction(session, index, { role: "assistant", body: result.body, source: result.source, ...(result.pendingIntent ? { pendingIntent: result.pendingIntent } : {}), ...(result.actions ? { actions: result.actions } : {}) }));
    } catch (reason) {
      commit(finishAction(session, index, { role: "assistant", body: `Cortex could not do that: ${reason instanceof Error ? reason.message : String(reason)}` }));
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

  actionsRef.current = { startNewCortex, openHistory, closeDrop, collapseOnly };

  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    // Sessions started or continued in the dashboard's Ask Cortex page.
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
  useEffect(() => { void configureCortexTrigger(preferences.cortexTrigger, preferences.cortexHotkey); }, [preferences.cortexTrigger, preferences.cortexHotkey]);
  useEffect(() => {
    void configureNotchDisplay(preferences.showOverFullScreen);
  }, [preferences.showOverFullScreen]);
  useEffect(() => { if (preferences.hideDrop) void setNotchVisible(false); }, [preferences.hideDrop]);

  // Clicking away from the open notch dismisses it (not while thinking). Ignore the blur until the window has had focus.
  useEffect(() => {
    if (effectiveMode !== "compose" && effectiveMode !== "answer" && effectiveMode !== "history") return;
    let focused = document.hasFocus();
    const onFocus = () => { focused = true; };
    const onBlur = () => {
      if (!focused) return;
      focused = false;
      actionsRef.current.closeDrop();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [effectiveMode]);

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
      if (next === "compose") actionsRef.current.startNewCortex("mouse");
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
    void listen<number>("cortex-tap", (event) => {
      const count = Number(event.payload) >= 2 ? 2 : 1;
      if (tapTimerRef.current !== null) window.clearTimeout(tapTimerRef.current);
      setTapCount(count);
      // The second tap only shows the badge; `cortex-compose` opens the question box.
      tapTimerRef.current = window.setTimeout(() => {
        tapTimerRef.current = null;
        setTapCount(0);
      }, count >= 2 ? 1600 : 950);
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
    if (!desktopRuntime()) return;
    let disposed = false;
    const offs: (() => void)[] = [];
    void listen("cortex-compose", () => actionsRef.current.startNewCortex("hotkey")).then((off) => { if (disposed) off(); else offs.push(off); });
    return () => { disposed = true; offs.forEach((off) => off()); };
  }, []);

  useEffect(() => {
    if (!desktopRuntime() || isPreview) return;
    let disposed = false;
    const poll = () => {
      getServiceSettings().then((settings) => {
        if (disposed) return;
        setTestMode(settings.test_mode);
        setEvalRecording(settings.test_mode && settings.eval_capture_active);
      }).catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => { void configureTestMode(testMode); }, [testMode]);

  const toggleEvalCapture = async () => {
    if (evalBusy) return;
    setEvalBusy(true);
    setEvalError("");
    try {
      const settings = await setEvalCapture(!evalRecording);
      setEvalRecording(settings.eval_capture_active);
    } catch (error) {
      setEvalError(error instanceof Error ? error.message : "Could not change eval recording");
    } finally {
      setEvalBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      actionsRef.current.closeDrop();
      void restorePreviousApp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shell = <div className="cortex-window" data-reduce-motion={preferences.reduceMotion} data-busy={busy} data-mode={effectiveMode} data-tap={tapCount > 0 ? "true" : "false"}
    onContextMenu={(event) => {
      if (!desktopRuntime() || isPreview) return;
      event.preventDefault();
      void showNotchContextMenu(event.clientX, event.clientY);
    }}>
    <div className="cortex-bar">
      <button type="button" className="cortex-brand" onClick={handleBrand} aria-label={effectiveMode === "compose" ? "Close Cortex" : "Start a new chat"}>
        <CortexMark processing={busy} />
        {tapCount > 0 && <span className="cortex-tap-badge">{trigger} × {tapCount}</span>}
      </button>

      {effectiveMode === "compose" && <form className="cortex-compose" onSubmit={submitBar}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} aria-label="Ask Cortex" placeholder={sample ? "Ask Cortex in sample memory…" : "Ask Cortex…"} />
        <button type="submit" className="cortex-enter" aria-label="Send to Cortex" title="Enter" disabled={!input.trim() || busy}><CornerDownLeft size={13} /></button>
      </form>}

      {effectiveMode === "answer" && <span className="cortex-history-label">Chat</span>}

      {effectiveMode === "thinking" && <div className="cortex-thinking-label"><span>Thinking</span><i /><i /><i /></div>}

      {effectiveMode === "history" && <>
        <span className="cortex-history-label">Chats</span>
        <div className="cortex-actions">
          <button type="button" className="cortex-icon" aria-label="Open settings" title="Settings" onClick={openSettings}><Settings2 size={13} /></button>
          <button type="button" className="cortex-icon" aria-label="Undock chat" title="Open full chat" onClick={undock}><Maximize2 size={13} /></button>
          <button type="button" className="cortex-icon active" aria-label="Close chat history" title="Close" onClick={toggleChat}><CortexChatMark /></button>
        </div>
      </>}

      {effectiveMode === "collapsed" && <>
        <button type="button" className="cortex-open-area" aria-label="Open a new chat" onClick={() => startNewCortex("mouse")} />
        <div className="cortex-actions">
          {testMode && <button type="button" className="cortex-icon cortex-eval" data-recording={evalRecording} data-error={evalError !== ""} disabled={evalBusy}
            aria-label={evalRecording ? "Pause eval recording" : "Start eval recording"}
            title={evalError || (evalRecording ? "Recording to the eval archive. Click to pause." : "Test mode. Click to record this screen to the eval archive.")}
            onClick={() => void toggleEvalCapture()}>{evalRecording ? <Pause size={13} /> : <Play size={13} />}</button>}
          <button type="button" className="cortex-icon" aria-label="Open chats" title="Chats" onClick={toggleChat}><CortexChatMark /></button>
        </div>
      </>}
    </div>

    {effectiveMode === "thinking" && <div className="cortex-cloud">
      <span className="cortex-scan-track"><i /></span>
      <small>Searching your memory</small>
    </div>}

    {effectiveMode === "answer" && activeSession && <section className="cortex-answer-panel">
      <header className="cortex-panel-head">
        <div><span className="cortex-eyebrow">Cortex answer</span><h2>{activeSession.title}</h2></div>
        <div className="cortex-actions">
          <button type="button" className="cortex-icon" aria-label="Expand chat" title="Open in full window" onClick={undock}><Maximize2 size={13} /></button>
          <button type="button" className="cortex-icon" aria-label="Close Cortex" title="Close" onClick={closeDrop}><X size={13} /></button>
        </div>
      </header>
      <div className="cortex-thread-scroll" ref={answerScrollRef}>
        <CortexThread session={activeSession} busy={busy && busySessionId === activeSession.id} onAction={runMessageAction} />
      </div>
      <footer className="cortex-panel-foot">
        <span>{sample ? "Sample workspace" : testMode ? "Test mode · eval archive" : "Your memory"}</span>
        <button type="button" onClick={openHistory}><CortexChatMark /> All chats</button>
      </footer>
      <form className="cortex-history-form cortex-answer-form" onSubmit={submitBar}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onMouseDown={() => { void focusNotch(); }} aria-label="Ask a follow-up" placeholder="Ask a follow-up…" />
        <button type="submit" className="cortex-enter" aria-label="Send follow-up" title="Enter" disabled={!input.trim() || busy}><CornerDownLeft size={13} /></button>
      </form>
    </section>}

    {effectiveMode === "history" && <section className="cortex-history-panel">
      <aside className="cortex-session-list">
        <div className="cortex-session-head"><span className="cortex-eyebrow">Chats</span><button type="button" className="cortex-icon" aria-label="New chat" title="New chat" onClick={() => startNewCortex("mouse")}><Plus size={13} /></button></div>
        <div className="cortex-session-scroll">
          {sessions.length ? sessions.map((session) => <button type="button" className={`cortex-session ${session.id === activeSessionId ? "active" : ""}`} key={session.id} onClick={() => setActiveSessionId(session.id)}>
            <strong>{session.title}</strong>
            <small>{sessionTime(session.updatedAt)} · {session.messages.length} {session.messages.length === 1 ? "message" : "messages"}</small>
          </button>) : <p className="cortex-empty-small">No chats yet.</p>}
        </div>
      </aside>
      <div className="cortex-history-thread">
        {activeSession ? <>
          <header className="cortex-thread-head">
            <div><span className="cortex-eyebrow">Chat</span><h2>{activeSession.title}</h2></div>
            <span className="cortex-pill">{sessionTime(activeSession.updatedAt)}</span>
          </header>
          <div className="cortex-thread-scroll" ref={historyScrollRef}>
            <CortexThread session={activeSession} busy={busy && busySessionId === activeSession.id} onAction={runMessageAction} />
          </div>
          <form className="cortex-history-form" onSubmit={submitHistory}>
            <input ref={historyInputRef} value={historyInput} onChange={(event) => setHistoryInput(event.target.value)} onMouseDown={() => { void focusNotch(); }} aria-label="Ask a follow-up" placeholder="Ask a follow-up…" />
            <button type="submit" className="cortex-enter" aria-label="Send follow-up" title="Enter" disabled={!historyInput.trim() || busy}><CornerDownLeft size={13} /></button>
          </form>
        </> : <div className="cortex-history-empty">
          <CortexMark />
          <h2>No chat selected</h2>
          <p>Start a new chat or pick a chat on the left.</p>
          <button type="button" className="cortex-primary" onClick={() => startNewCortex("mouse")}>Start a chat</button>
        </div>}
      </div>
    </section>}
  </div>;

  if (!previewStage) return shell;
  return <div className="cortex-stage">
    {shell}
    <p className="cortex-stage-note">Cortex · click the brain to ask · open chats for history and settings</p>
  </div>;
}
