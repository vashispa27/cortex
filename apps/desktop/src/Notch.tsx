import { AnswerContent, AnswerSourceLabel } from "./components/AnswerContent";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, CornerDownLeft, Paperclip, Maximize2, Pause, Play, Plus, Settings2, X } from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { desktopRuntime, getServiceSettings, setEvalCapture } from "./lib/api";
import { demoSearch } from "./lib/demo";
import { answerCortex, runAction } from "./lib/answer";
import type { ChatAction } from "./lib/intent";
import ChatActions from "./components/ChatActions";
import { agentService, documentFrom, followUpAgent, needsYou, terminal, type AgentDocument } from "./lib/agents";
import { loadNotchDraft, saveNotchDraft } from "./lib/notch-draft";
import AgentChatCard, { useAgentJob } from "./components/AgentChatCard";
import { BrowserTarget, useBrowserStatus } from "./components/BrowserTabControls";
import { loadPreferences } from "./lib/storage";
import { configureNotchDisplay, configureCortexTrigger, configureTestMode, focusNotch, notchIsPointerDisplay, openMain, restorePreviousApp, setNotchMode, setNotchVisible, showNotchContextMenu, writeActiveSession, type NotchMode } from "./lib/notch";
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

/** The agent this chat is talking to: the job of its latest agent message. */
function chatAgentJob(session: CortexSession): string | undefined {
  return [...session.messages].reverse().find((message) => message.agentJobId)?.agentJobId;
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
  const [initialDraft] = useState(loadNotchDraft);
  const [input, setInput] = useState(initialDraft.input);
  const [historyInput, setHistoryInput] = useState(initialDraft.historyInput);
  const [files, setFiles] = useState<AgentDocument[]>(initialDraft.files);
  const [attachError, setAttachError] = useState("");
  const [newHistoryChat, setNewHistoryChat] = useState(false);
  const pickerRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [tapCount, setTapCount] = useState(0);
  // Agent mode: the next message starts a long-running agent instead of asking memory.
  const [agentMode, setAgentMode] = useState(initialDraft.agent);
  const { status: browserStatus } = useBrowserStatus(agentService, agentMode);
  // Whether the agent works in the Chrome tab you are on. On by default whenever Chrome has a page open.
  const [useBrowserTab, setUseBrowserTab] = useState(true);
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
  // A chat that started an agent is that agent's conversation: its status and questions sit above the box.
  const chatJob = activeSession ? chatAgentJob(activeSession) : undefined;
  const agentState = useAgentJob(chatJob);
  const agentLive = !!chatJob && !(agentState.job && terminal(agentState.job.status));
  useEffect(() => { if (agentMode && effectiveMode === "compose") setUseBrowserTab(true); }, [agentMode, effectiveMode]);
  // The bigger chat view is for conversation; agent mode (and its attachments) lives in the bar and answer panel.
  const agent = agentMode && effectiveMode !== "history";
  useEffect(() => { saveNotchDraft({ input, historyInput, agent: agentMode, files }); }, [input, historyInput, agentMode, files]);

  const commit = (session: CortexSession) => {
    setSessions(commitSession(session));
  };

  const collapseOnly = () => {
    hotkeyRef.current = false;
    setMode("collapsed");
    setActiveSessionId(null);
    setNewHistoryChat(false);
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
    setMode("compose");
  };

  const openHistory = () => {
    if (busyRef.current) return;
    hotkeyRef.current = false;
    setNewHistoryChat(false);
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

  const openAgents = () => { collapseOnly(); void openMain("jobs"); };

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
    if (await followUpInChat(question, target)) return;
    if (agent) { await spawnInChat(question, target); return; }
    const useExisting = target === "history" || (target === "bar" && effectiveMode === "answer");
    const base = useExisting ? activeSession : null;
    const session = base ? appendMessage(base, { role: "user", body: question }) : newSession(question);
    if (!base) setActiveSessionId(session.id);
    setNewHistoryChat(false);
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

  const pickFiles = () => { pickerRef.current = true; fileInputRef.current?.click(); };
  const attachFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = "";
    window.setTimeout(() => { pickerRef.current = false; }, 400);
    try {
      const added = await Promise.all(picked.map(async (file) => documentFrom(file.name, await file.text(), file.type)));
      setFiles((old) => [...old.filter((f) => !added.some((a) => a.name === f.name)), ...added].slice(0, 20)); setAttachError("");
    } catch (reason) { setAttachError(reason instanceof Error ? reason.message : String(reason)); }
    void focusNotch();
  };
  const startHistoryChat = () => { setNewHistoryChat(true); setActiveSessionId(null); };

  /** Starts a long-running agent from the chat; its card then tracks it in place. */
  const spawnInChat = async (question: string, target: "bar" | "history") => {
    const useExisting = target === "history" || (target === "bar" && effectiveMode === "answer");
    const base = useExisting ? activeSession : null;
    const session = base ? appendMessage(base, { role: "user", body: question }) : newSession(question);
    if (!base) setActiveSessionId(session.id);
    commit(session);
    const documents = files;
    setInput(""); setHistoryInput(""); setFiles([]);
    if (target === "bar") setMode((current) => current === "compose" ? "answer" : current);
    busyRef.current = true; setBusy(true); setBusySessionId(session.id);
    try {
      const job = await agentService.spawn({ task: question, documents, useBrowserTab: useBrowserTab && !!browserStatus?.current_tab });
      const startedInTab = useBrowserTab && !!browserStatus?.current_tab;
      commit(appendMessage(session, { role: "assistant", body: startedInTab ? `Working in your Chrome tab: ${browserStatus?.current_tab?.title ?? ""}. Questions show up here.` : "Agent started. It will plan first and wait for your approval before using tools.", agentJobId: job.task_id }));
    } catch (reason) {
      commit(appendMessage(session, { role: "assistant", body: `Could not start an agent: ${reason instanceof Error ? reason.message : String(reason)}` }));
      // Nothing was sent, so give the text and files back.
      setInput((current) => current || question); setFiles((current) => current.length ? current : documents);
    } finally { busyRef.current = false; setBusy(false); setBusySessionId(null); }
  };

  /** In a chat with an unfinished agent, what you type goes to that agent. Returns false once the agent is done. */
  const followUpInChat = async (question: string, target: "bar" | "history") => {
    const session = target === "history" || (target === "bar" && effectiveMode === "answer") ? activeSession : null;
    const jobId = session && chatAgentJob(session);
    if (!session || !jobId) return false;
    busyRef.current = true; setBusy(true); setBusySessionId(session.id);
    try {
      const { result, asked } = await followUpAgent(agentService, jobId, question);
      if (result === "finished") return false;
      let next = asked ? appendMessage(session, { role: "assistant", body: asked, agentJobId: jobId }) : session;
      next = appendMessage(next, { role: "user", body: question });
      if (result === "busy") next = appendMessage(next, { role: "assistant", body: "The agent is in the middle of a step and didn't get this. Send it again when it asks, or Stop it.", agentJobId: jobId });
      commit(next);
      if (target === "bar") setInput(""); else setHistoryInput("");
      void agentState.refresh();
    } catch (reason) {
      commit(appendMessage(appendMessage(session, { role: "user", body: question }), { role: "assistant", body: `Could not reach the agent: ${reason instanceof Error ? reason.message : String(reason)}`, agentJobId: jobId }));
    } finally { busyRef.current = false; setBusy(false); setBusySessionId(null); }
    return true;
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
    const onFocus = () => { focused = true; window.setTimeout(() => { pickerRef.current = false; }, 400); };
    const onBlur = () => {
      // The file picker takes focus from the notch; that is not clicking away.
      if (!focused || pickerRef.current) return;
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
    if (effectiveMode === "history" && (activeSessionId || newHistoryChat)) {
      const timer = window.setTimeout(() => historyInputRef.current?.focus(), 90);
      return () => window.clearTimeout(timer);
    }
  }, [effectiveMode, activeSessionId, newHistoryChat]);

  useEffect(() => {
    if (effectiveMode !== "history" || newHistoryChat) return;
    setActiveSessionId((current) => current && sessions.some((session) => session.id === current) ? current : sessions[0]?.id ?? null);
  }, [effectiveMode, sessions, newHistoryChat]);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = effectiveMode; }, [effectiveMode]);
  useEffect(() => {
    if (!desktopRuntime()) return;
    const shown = new Set<string>();
    const check = async () => {
      if (modeRef.current !== "collapsed" || !sessionsRef.current.some(chatAgentJob) || !(await notchIsPointerDisplay())) return;
      try {
        for (const job of await agentService.list()) {
          // The job list carries no pending question, so a new waiting state shows as a new status/version.
          const waiting = needsYou(job.status) || job.status === "paused" ? `${job.status}:${job.version}` : null;
          const session = waiting && sessionsRef.current.find((item) => chatAgentJob(item) === job.task_id);
          if (!waiting || !session || shown.has(`${job.task_id}:${waiting}`)) continue;
          shown.add(`${job.task_id}:${waiting}`);
          hotkeyRef.current = true; // Show it without stealing focus.
          setActiveSessionId(session.id);
          setMode("answer");
          if (preferences.hideDrop) void setNotchVisible(true);
          return;
        }
      } catch { /* The agent service is not running; nothing to show. */ }
    };
    const timer = window.setInterval(() => { void check(); }, 4000);
    return () => window.clearInterval(timer);
  }, [preferences.hideDrop]);

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
    void getCurrentWebviewWindow().listen<NotchMode>("notch-mode", (event) => {
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
    void getCurrentWebviewWindow().listen<number>("cortex-tap", (event) => {
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
    void getCurrentWebviewWindow().listen("cortex-compose", () => actionsRef.current.startNewCortex("hotkey")).then((off) => { if (disposed) off(); else offs.push(off); });
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

  const shell = <div className="cortex-window" data-reduce-motion={preferences.reduceMotion} data-busy={busy} data-mode={effectiveMode} data-agent={agent} data-tap={tapCount > 0 ? "true" : "false"}
    onContextMenu={(event) => {
      if (!desktopRuntime() || isPreview) return;
      event.preventDefault();
      void showNotchContextMenu(event.clientX, event.clientY);
    }}>
    <input ref={fileInputRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.log,text/*" onChange={(event) => void attachFiles(event)} />
    <div className="cortex-bar">
      <button type="button" className="cortex-brand" onClick={handleBrand} aria-label={effectiveMode === "compose" ? "Close Cortex" : "Start a new chat"}>
        <CortexMark processing={busy} electric={agent} />
        {tapCount > 0 && <span className="cortex-tap-badge">{trigger} × {tapCount}</span>}
      </button>

      {effectiveMode === "compose" && <form className="cortex-compose" onSubmit={submitBar}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} aria-label="Ask Cortex" placeholder={agent ? "Describe a job for an agent…" : sample ? "Ask Cortex in sample memory…" : "Ask Cortex…"} />
        <button type="button" className="cortex-agent-btn" data-on={agentMode} aria-pressed={agentMode} aria-label="Agent mode" title="Agent mode: start a long-running agent" onClick={() => setAgentMode((on) => !on)}><Bot size={12} /></button>
        {agent && <button type="button" className="cortex-icon cortex-attach" aria-label="Attach files" title={files.length ? `Attached: ${files.map((f) => f.name).join(", ")}` : "Attach text files for the agent"} onClick={pickFiles}><Paperclip size={13} />{files.length > 0 && <b>{files.length}</b>}</button>}
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

    {agent && effectiveMode === "compose" && <div className="cortex-browser-choice"><BrowserTarget status={browserStatus} selected={useBrowserTab} onChange={setUseBrowserTab}/></div>}
    {effectiveMode === "answer" && activeSession && <section className="cortex-answer-panel">
      <header className="cortex-panel-head">
        <div><span className="cortex-eyebrow">Cortex answer</span><h2>{activeSession.title}</h2></div>
        <div className="cortex-actions">
          <button type="button" className="cortex-agent-btn" data-on={agentMode} aria-pressed={agentMode} aria-label="Agent mode" title={agentMode ? "Agent mode on: your next message starts a long-running agent" : "Turn on agent mode to start a long-running agent"} onClick={() => setAgentMode((on) => !on)}><Bot size={12} /> Agent</button>
          <button type="button" className="cortex-icon" aria-label="Expand chat" title="Open in full window" onClick={undock}><Maximize2 size={13} /></button>
          <button type="button" className="cortex-icon" aria-label="Close Cortex" title="Close" onClick={closeDrop}><X size={13} /></button>
        </div>
      </header>
      <div className="cortex-thread-scroll" ref={answerScrollRef}>
        <CortexThread session={activeSession} busy={busy && busySessionId === activeSession.id} onAction={runMessageAction} />
      </div>
      {chatJob ? <div className="cortex-agent-pin"><AgentChatCard state={agentState} onOpen={openAgents} /></div> : <footer className="cortex-panel-foot">
        <span>{sample ? "Sample workspace" : testMode ? "Test mode · eval archive" : "Your memory"}</span>
        <button type="button" onClick={openHistory}><CortexChatMark /> All chats</button>
      </footer>}
      {agent && !chatJob && <div className="cortex-browser-choice"><BrowserTarget status={browserStatus} selected={useBrowserTab} onChange={setUseBrowserTab}/></div>}
      {agent && (files.length > 0 || attachError) && <div className="cortex-chips">{files.map((file) => <span key={file.name} className="cortex-chip">{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((old) => old.filter((f) => f !== file))}>×</button></span>)}{attachError && <small className="cortex-agent-error">{attachError}</small>}</div>}
      <form className="cortex-history-form cortex-answer-form" onSubmit={submitBar}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onMouseDown={() => { void focusNotch(); }} aria-label="Ask a follow-up" placeholder={agentLive ? "Reply to the agent…" : agent ? "Describe a job for an agent…" : "Ask a follow-up…"} />
        {agent && <button type="button" className="cortex-icon cortex-attach" aria-label="Attach files" title={files.length ? `Attached: ${files.map((f) => f.name).join(", ")}` : "Attach text files for the agent"} onClick={pickFiles}><Paperclip size={13} />{files.length > 0 && <b>{files.length}</b>}</button>}
        <button type="submit" className="cortex-enter" aria-label="Send follow-up" title="Enter" disabled={!input.trim() || busy}><CornerDownLeft size={13} /></button>
      </form>
    </section>}

    {effectiveMode === "history" && <section className="cortex-history-panel">
      <aside className="cortex-session-list">
        <div className="cortex-session-head"><span className="cortex-eyebrow">Chats</span><button type="button" className="cortex-icon" aria-label="New chat" title="New chat" onClick={startHistoryChat}><Plus size={13} /></button></div>
        <div className="cortex-session-scroll">
          {sessions.length ? sessions.map((session) => <button type="button" className={`cortex-session ${session.id === activeSessionId ? "active" : ""}`} key={session.id} onClick={() => { setNewHistoryChat(false); setActiveSessionId(session.id); }}>
            <strong>{session.title}</strong>
            <small>{sessionTime(session.updatedAt)} · {session.messages.length} {session.messages.length === 1 ? "message" : "messages"}</small>
          </button>) : <p className="cortex-empty-small">No chats yet.</p>}
        </div>
      </aside>
      <div className="cortex-history-thread">
        <header className="cortex-thread-head">
          <div><span className="cortex-eyebrow">Chat</span><h2>{activeSession ? activeSession.title : "New chat"}</h2></div>
          {activeSession && <span className="cortex-pill">{sessionTime(activeSession.updatedAt)}</span>}
        </header>
        <div className="cortex-thread-scroll" ref={historyScrollRef}>
          {activeSession ? <CortexThread session={activeSession} busy={busy && busySessionId === activeSession.id} onAction={runMessageAction} />
            : <div className="cortex-history-empty"><CortexMark /><h2>New chat</h2><p>Ask about what you have seen, or pick a chat on the left.</p></div>}
        </div>
        {chatJob && <div className="cortex-agent-pin"><AgentChatCard state={agentState} onOpen={openAgents} /></div>}
        <form className="cortex-history-form" onSubmit={submitHistory}>
          <input ref={historyInputRef} value={historyInput} onChange={(event) => setHistoryInput(event.target.value)} onMouseDown={() => { void focusNotch(); }} aria-label={activeSession ? "Ask a follow-up" : "Ask Cortex"} placeholder={agentLive ? "Reply to the agent…" : activeSession ? "Ask a follow-up…" : "Ask Cortex…"} />
          <button type="submit" className="cortex-enter" aria-label="Send" title="Enter" disabled={!historyInput.trim() || busy}><CornerDownLeft size={13} /></button>
        </form>
      </div>
    </section>}
  </div>;

  if (!previewStage) return shell;
  return <div className="cortex-stage">
    {shell}
    <p className="cortex-stage-note">Cortex · click the brain to ask · open chats for history and settings</p>
  </div>;
}
