import { AnswerContent, AnswerSourceLabel } from "./components/AnswerContent";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, CornerDownLeft, Maximize2, Pause, Play, Plus, Settings2, X } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { desktopRuntime, getServiceSettings, setEvalCapture } from "./lib/api";
import { demoSearch } from "./lib/demo";
import { answerFromMemory } from "./lib/answer";
import { loadPreferences } from "./lib/storage";
import { configureAssist, configureRewindTrigger, configureTestMode, focusNotch, openMain, restorePreviousApp, setAssistActive, setNotchMode, setNotchVisible, writeActiveSession, type NotchMode } from "./lib/notch";
import {
  appInitial, applyFailureMessage, applyText, assistChip, composeHint, generateCompletion, generateRewrite, generateSummary, originLabel,
  TONES, TRUNCATED_NOTE, targetStillCurrent, undoInsertion, type FocusContext, type IntentPayload, type RewriteTone, type UndoToken,
} from "./lib/assist";
import {
  appendMessage, commitSession, composeAnswer, loadSessions, newSession, newSummarySession, sessionsStorageKey, sessionTime, triggerSymbol,
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

/** The selection a summary is about, folded to three lines until opened. */
function SelectionQuote({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const long = message.body.length > 240 || message.body.split("\n").length > 3;
  return <div className="rewind-quote">
    {message.origin && <small>{message.origin}</small>}
    <blockquote data-open={open || !long}>{message.body}</blockquote>
    {message.note && <small className="rewind-quote-note">{message.note}</small>}
    {long && <button type="button" onClick={() => setOpen(!open)}>{open ? "Show less" : "Show more"}</button>}
  </div>;
}

/** What the assist panels in the notch are showing. */
type Assist =
  | { phase: "idle" }
  | { phase: "working"; kind: "autocomplete" | "rewrite"; context: FocusContext }
  | { phase: "done"; label: string; undo: UndoToken | null; undoState: "ready" | "busy" | "disabled" }
  | { phase: "result"; kind: "autocomplete" | "rewrite"; context: FocusContext; original: string; text: string; tone: RewriteTone | null; busy: boolean; message: string; copied: boolean };

const idleAssist: Assist = { phase: "idle" };

function RewindThread({ session, busy }: { session: RewindSession; busy: boolean }) {
  return <>
    {session.messages.map((message, index) => message.role === "user"
      ? <div className="rewind-message user" key={`${session.id}-${index}`}>{message.kind === "summarize" ? <SelectionQuote message={message} /> : <div className="rewind-user-bubble">{message.body}</div>}</div>
      : <div className="rewind-message assistant" key={`${session.id}-${index}`}>
        <span className="rewind-message-mark"><RewindMark /></span>
        <div className="rewind-assistant-body"><AnswerSourceLabel source={message.source} /><AnswerContent text={message.body} /></div>
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
  const [assist, setAssist] = useState<Assist>(idleAssist);
  const [hint, setHint] = useState<string | null>(null);
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
  // Bumped to cancel whatever assist request is in flight; a late reply from an older one is dropped.
  const assistSeqRef = useRef(0);
  const assistTimerRef = useRef<number | null>(null);
  const assistRef = useRef<Assist>(idleAssist);
  const modeRef = useRef<NotchMode>(initialMode);
  const actionsRef = useRef({
    startNewRewind: (_source: "mouse" | "hotkey") => {}, openHistory: () => {}, closeDrop: () => {}, collapseOnly: () => {},
    onIntent: (_payload: IntentPayload) => {}, cancelAssist: () => {},
  });

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const effectiveMode: NotchMode = (mode === "answer" || mode === "thinking") && !activeSession ? "compose" : mode;
  const trigger = triggerSymbol(preferences.rewindTrigger);

  const commit = (session: RewindSession) => {
    setSessions(commitSession(session));
  };

  const collapseOnly = () => {
    assistSeqRef.current += 1;
    if (assistTimerRef.current !== null) { window.clearTimeout(assistTimerRef.current); assistTimerRef.current = null; }
    void setAssistActive(false);
    assistRef.current = idleAssist;
    setAssist(idleAssist);
    setHint(null);
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

  const startNewRewind = (source: "mouse" | "hotkey" = "mouse", reason: string | null = null) => {
    if (busyRef.current) return;
    assistSeqRef.current += 1;
    assistRef.current = idleAssist;
    setAssist(idleAssist);
    setHint(composeHint(reason));
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
        sample ? Promise.resolve().then(() => { const found = demoSearch(question); return { body: composeAnswer(question, found.results, true), hits: found.results.slice(0, 3), source: "memory" as const }; }) : answerFromMemory(question, base?.messages ?? []),
        new Promise((resolve) => window.setTimeout(resolve, delay)),
      ]);
      const assistant: ChatMessage = {
        role: "assistant",
        body: answer.body,
        hits: answer.hits,
        source: answer.source,
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

  // ---- Double-tap assist: autocomplete, rewrite and summarize -------------------------------------

  const showAssist = (next: Assist, nextMode: NotchMode) => {
    assistRef.current = next;
    setAssist(next);
    setMode(nextMode);
  };

  const scheduleCollapse = (seq: number, ms: number) => {
    if (assistTimerRef.current !== null) window.clearTimeout(assistTimerRef.current);
    assistTimerRef.current = window.setTimeout(() => {
      assistTimerRef.current = null;
      if (assistSeqRef.current === seq) actionsRef.current.collapseOnly();
    }, ms);
  };

  const failedAssist = (seq: number, kind: "autocomplete" | "rewrite", context: FocusContext, original: string, reason: unknown) => {
    if (assistSeqRef.current !== seq) return;
    void setAssistActive(false);
    const message = reason instanceof Error ? reason.message : String(reason);
    showAssist({ phase: "result", kind, context, original, text: "", tone: null, busy: false, message: message || "Rewind could not do that.", copied: false }, "assist-result");
  };

  const runAutocomplete = async (context: FocusContext) => {
    const seq = ++assistSeqRef.current;
    hotkeyRef.current = true;
    showAssist({ phase: "working", kind: "autocomplete", context }, "assist");
    void setAssistActive(true);
    try {
      const text = await generateCompletion(context);
      if (assistSeqRef.current !== seq) return;
      // From here the write cannot be cancelled by typing: the guard decides whether it still applies.
      void setAssistActive(false);
      if (!text.trim()) {
        showAssist({ phase: "result", kind: "autocomplete", context, original: "", text: "", tone: null, busy: false, message: "No suggestion", copied: false }, "assist-result");
        scheduleCollapse(seq, 1800);
        return;
      }
      const result = await applyText(context, text);
      if (assistSeqRef.current !== seq) return;
      if (result.outcome === "applied") {
        showAssist({ phase: "done", label: "Inserted", undo: result.undo, undoState: result.undo ? "ready" : "disabled" }, "assist-done");
        scheduleCollapse(seq, 4000);
      } else {
        showAssist({ phase: "result", kind: "autocomplete", context, original: "", text, tone: null, busy: false, message: applyFailureMessage(result, "autocomplete"), copied: false }, "assist-result");
      }
    } catch (reason) {
      failedAssist(seq, "autocomplete", context, "", reason);
    }
  };

  const runRewrite = async (context: FocusContext, tone: RewriteTone | null = null) => {
    const seq = ++assistSeqRef.current;
    hotkeyRef.current = true;
    const original = context.selected_text;
    const previous = assistRef.current;
    if (previous.phase === "result" && previous.kind === "rewrite") {
      showAssist({ ...previous, tone, busy: true, message: "" }, "assist-result");
    } else {
      showAssist({ phase: "working", kind: "rewrite", context }, "assist");
    }
    void setAssistActive(true);
    try {
      const text = await generateRewrite(context, tone ?? undefined);
      if (assistSeqRef.current !== seq) return;
      void setAssistActive(false);
      showAssist({ phase: "result", kind: "rewrite", context, original, text, tone, busy: false, message: text.trim() ? "" : "No rewrite suggested", copied: false }, "assist-result");
    } catch (reason) {
      failedAssist(seq, "rewrite", context, original, reason);
    }
  };

  const runSummarize = async (context: FocusContext) => {
    if (busyRef.current) return;
    assistSeqRef.current += 1;
    void setAssistActive(false);
    setAssist(idleAssist);
    assistRef.current = idleAssist;
    const excerpt = context.selected_text.slice(0, 24_000);
    const truncated = context.selected_text.length >= 24_000;
    const session = newSummarySession(excerpt, originLabel(context), truncated ? TRUNCATED_NOTE : undefined);
    commit(session);
    setActiveSessionId(session.id);
    setBusy(true);
    busyRef.current = true;
    setBusySessionId(session.id);
    // Opened without focus, so reading the summary does not pull focus from the page.
    hotkeyRef.current = true;
    setInput("");
    setMode("answer");
    try {
      const summary = await generateSummary(context);
      if (!summary.text.trim()) throw new Error("The model returned no summary.");
      commit(appendMessage(session, { role: "assistant", body: summary.text, source: "selection" }));
    } catch (reason) {
      commit(appendMessage(session, { role: "assistant", body: `Rewind could not summarize: ${reason instanceof Error ? reason.message : String(reason)}` }));
    } finally {
      setBusy(false);
      busyRef.current = false;
      setBusySessionId(null);
    }
  };

  const replaceWithRewrite = async () => {
    const current = assistRef.current;
    if (current.phase !== "result" || current.kind !== "rewrite" || !current.text.trim() || current.busy) return;
    const seq = ++assistSeqRef.current;
    showAssist({ ...current, busy: true, message: "" }, "assist-result");
    try {
      const result = await applyText(current.context, current.text);
      if (assistSeqRef.current !== seq) return;
      if (result.outcome === "applied") {
        showAssist({ phase: "done", label: "Replaced", undo: null, undoState: "disabled" }, "assist-done");
        scheduleCollapse(seq, 1600);
      } else {
        showAssist({ ...current, busy: false, message: applyFailureMessage(result, "rewrite") }, "assist-result");
      }
    } catch (reason) {
      failedAssist(seq, "rewrite", current.context, current.original, reason);
    }
  };

  const insertSuggestion = async () => {
    const current = assistRef.current;
    if (current.phase !== "result" || current.kind !== "autocomplete" || !current.text.trim() || current.busy) return;
    const seq = ++assistSeqRef.current;
    showAssist({ ...current, busy: true, message: "" }, "assist-result");
    try {
      const result = await applyText(current.context, current.text);
      if (assistSeqRef.current !== seq) return;
      if (result.outcome === "applied") {
        showAssist({ phase: "done", label: "Inserted", undo: result.undo, undoState: result.undo ? "ready" : "disabled" }, "assist-done");
        scheduleCollapse(seq, 4000);
      } else {
        showAssist({ ...current, busy: false, message: applyFailureMessage(result, "autocomplete") }, "assist-result");
      }
    } catch (reason) {
      failedAssist(seq, "autocomplete", current.context, "", reason);
    }
  };

  const undoLastInsertion = async () => {
    const current = assistRef.current;
    if (current.phase !== "done" || !current.undo || current.undoState !== "ready") return;
    const token = current.undo;
    showAssist({ ...current, undoState: "busy" }, "assist-done");
    try {
      const result = await undoInsertion(token);
      if (result.outcome === "applied") actionsRef.current.collapseOnly();
      else showAssist({ ...current, undoState: "disabled" }, "assist-done");
    } catch {
      showAssist({ ...current, undoState: "disabled" }, "assist-done");
    }
  };

  const copyResult = async () => {
    const current = assistRef.current;
    if (current.phase !== "result" || !current.text) return;
    try {
      await navigator.clipboard.writeText(current.text);
      showAssist({ ...current, copied: true }, "assist-result");
      window.setTimeout(() => { if (assistRef.current.phase === "result") showAssist({ ...(assistRef.current as Extract<Assist, { phase: "result" }>), copied: false }, "assist-result"); }, 1200);
    } catch {
      showAssist({ ...current, message: "Couldn't copy. Select the text and copy it." }, "assist-result");
    }
  };

  const summarizeInstead = () => {
    const current = assistRef.current;
    if (current.phase !== "result") return;
    void runSummarize(current.context);
  };

  const onIntent = (payload: IntentPayload) => {
    setTapCount(0);
    const context = payload.context;
    const current = assistRef.current;
    // A double-tap while a request is on its way cancels it.
    if (current.phase === "working") { actionsRef.current.cancelAssist(); return; }
    // A further double-tap while a rewrite preview is open means Replace.
    if (current.phase === "result" && current.kind === "rewrite" && current.text.trim() && modeRef.current === "assist-result") { void replaceWithRewrite(); return; }
    if (busyRef.current) return;
    if (context && payload.intent === "autocomplete") void runAutocomplete(context);
    else if (context && payload.intent === "rewrite") void runRewrite(context);
    else if (context && payload.intent === "summarize") void runSummarize(context);
    else startNewRewind("hotkey", payload.hint);
  };

  const cancelAssist = () => {
    const current = assistRef.current;
    if (current.phase === "working") actionsRef.current.collapseOnly();
  };

  const submitBar = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(input, "bar");
  };

  const submitHistory = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion(historyInput, "history");
  };

  actionsRef.current = { startNewRewind, openHistory, closeDrop, collapseOnly, onIntent, cancelAssist };
  modeRef.current = mode;

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
    const assistMode = effectiveMode === "assist" || effectiveMode === "assist-done" || effectiveMode === "assist-result";
    const shouldFocus = effectiveMode !== "collapsed" && !assistMode && (effectiveMode === "compose" || effectiveMode === "history" || !hotkeyRef.current);
    void setNotchMode(effectiveMode, shouldFocus, preferences.reduceMotion);
  }, [effectiveMode, preferences.reduceMotion]);
  useEffect(() => { void configureRewindTrigger(preferences.rewindTrigger, preferences.rewindHotkey); }, [preferences.rewindTrigger, preferences.rewindHotkey]);
  useEffect(() => {
    void configureAssist({
      autocomplete: preferences.autocompleteOnTap, summarize: preferences.summarizeOnTap, rewrite: preferences.rewriteOnTap,
      privateWindows: preferences.assistInPrivateWindows, showOverFullScreen: preferences.showOverFullScreen,
    });
  }, [preferences.autocompleteOnTap, preferences.summarizeOnTap, preferences.rewriteOnTap, preferences.assistInPrivateWindows, preferences.showOverFullScreen]);
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
      // The second tap only shows the badge; `rewind-intent` says what it means once the field is read.
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
    void listen<IntentPayload>("rewind-intent", (event) => actionsRef.current.onIntent(event.payload)).then((off) => { if (disposed) off(); else offs.push(off); });
    void listen("rewind-cancel", () => actionsRef.current.cancelAssist()).then((off) => { if (disposed) off(); else offs.push(off); });
    return () => { disposed = true; offs.forEach((off) => off()); };
  }, []);

  // While a rewrite preview is open, watch the field: if its text or selection moves, the preview is stale.
  useEffect(() => {
    if (assist.phase !== "result" || assist.kind !== "rewrite" || assist.busy || !desktopRuntime()) return;
    const context = assist.context;
    let misses = 0;
    const timer = window.setInterval(() => {
      void targetStillCurrent(context).then((current) => {
        misses = current ? 0 : misses + 1;
        if (misses >= 2) actionsRef.current.collapseOnly();
      }).catch(() => { misses += 1; });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [assist]);

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
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} aria-label="Rewind a thought" placeholder={hint ?? (sample ? "Rewind a thought in sample memory…" : "Rewind a thought…")} />
        <button type="submit" className="rewind-enter" aria-label="Send to Rewind" title="Enter" disabled={!input.trim() || busy}><CornerDownLeft size={13} /></button>
      </form>}

      {effectiveMode === "answer" && <span className="rewind-history-label">Chat</span>}

      {effectiveMode === "thinking" && <div className="rewind-thinking-label"><span>Rewinding</span><i /><i /><i /></div>}

      {effectiveMode === "assist" && assist.phase === "working" && <div className="rewind-assist-chip" role="status">
        <span className="rewind-app-dot" aria-hidden="true">{appInitial(assist.context)}</span>
        <span>{assistChip(assist.context, assist.kind)}</span>
      </div>}

      {effectiveMode === "assist-done" && assist.phase === "done" && <>
        <div className="rewind-assist-done" role="status"><Check size={14} aria-hidden="true" /><span>{assist.label}</span></div>
        {assist.label === "Inserted" && <button type="button" className="rewind-assist-button" disabled={assist.undoState !== "ready"} onMouseDown={(event) => event.preventDefault()} onClick={() => void undoLastInsertion()}>
          {assist.undoState === "busy" ? "Undoing…" : assist.undoState === "ready" ? "Undo" : "Use ⌘Z"}
        </button>}
      </>}

      {effectiveMode === "assist-result" && assist.phase === "result" && <>
        <div className="rewind-assist-chip">
          <span className="rewind-app-dot" aria-hidden="true">{appInitial(assist.context)}</span>
          <span>{assist.kind === "rewrite" ? "Rewrite" : "Suggestion"}</span>
        </div>
        <div className="rewind-actions"><button type="button" className="rewind-icon" aria-label="Dismiss" title="Dismiss" onMouseDown={(event) => event.preventDefault()} onClick={closeDrop}><X size={13} /></button></div>
      </>}

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
          {testMode && <button type="button" className="rewind-icon rewind-eval" data-recording={evalRecording} data-error={evalError !== ""} disabled={evalBusy}
            aria-label={evalRecording ? "Pause eval recording" : "Start eval recording"}
            title={evalError || (evalRecording ? "Recording to the eval archive. Click to pause." : "Test mode. Click to record this screen to the eval archive.")}
            onClick={() => void toggleEvalCapture()}>{evalRecording ? <Pause size={13} /> : <Play size={13} />}</button>}
          <button type="button" className="rewind-icon" aria-label="Open rewind chats" title="Chats" onClick={toggleChat}><RewindChatMark /></button>
        </div>
      </>}
    </div>

    {effectiveMode === "assist" && <span className="rewind-scan-track rewind-assist-track"><i /></span>}

    {effectiveMode === "assist-result" && assist.phase === "result" && <section className="rewind-assist-panel">
      <div className="rewind-assist-text" data-busy={assist.busy} data-empty={!assist.text}>{assist.busy ? "Working…" : assist.text || assist.message}</div>
      {assist.text && assist.message && <p className="rewind-assist-note">{assist.message}</p>}
      {assist.kind === "rewrite" && <div className="rewind-tones" role="group" aria-label="Tone">
        {TONES.map((tone) => <button type="button" key={tone.id} data-active={assist.tone === tone.id} disabled={assist.busy} onMouseDown={(event) => event.preventDefault()} onClick={() => void runRewrite(assist.context, tone.id)}>{tone.label}</button>)}
      </div>}
      <footer className="rewind-assist-actions">
        {assist.kind === "rewrite" && <button type="button" className="rewind-assist-button primary" disabled={assist.busy || !assist.text.trim()} onMouseDown={(event) => event.preventDefault()} onClick={() => void replaceWithRewrite()}>Replace</button>}
        {assist.kind === "autocomplete" && assist.text.trim() !== "" && <button type="button" className="rewind-assist-button primary" disabled={assist.busy} onMouseDown={(event) => event.preventDefault()} onClick={() => void insertSuggestion()}>Insert</button>}
        {assist.kind === "rewrite" && <button type="button" className="rewind-assist-button" disabled={assist.busy} onMouseDown={(event) => event.preventDefault()} onClick={summarizeInstead}>Summarize instead</button>}
        {assist.text.trim() !== "" && <button type="button" className="rewind-assist-button" onMouseDown={(event) => event.preventDefault()} onClick={() => void copyResult()}>{assist.copied ? "Copied" : "Copy"}</button>}
        <button type="button" className="rewind-assist-button" onMouseDown={(event) => event.preventDefault()} onClick={closeDrop}>Dismiss</button>
        {assist.kind === "rewrite" && assist.text.trim() !== "" && <small>Double-tap {trigger} to replace</small>}
      </footer>
    </section>}

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
        <span>{sample ? "Sample workspace" : testMode ? "Test mode · eval archive" : "Your memory"}</span>
        <button type="button" onClick={openHistory}><RewindChatMark /> All chats</button>
      </footer>
      <form className="rewind-history-form rewind-answer-form" onSubmit={submitBar}>
        <input ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onMouseDown={() => { void focusNotch(); }} aria-label="Ask a follow-up" placeholder="Ask a follow-up…" />
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
            <input ref={historyInputRef} value={historyInput} onChange={(event) => setHistoryInput(event.target.value)} onMouseDown={() => { void focusNotch(); }} aria-label="Ask a follow-up" placeholder="Ask a follow-up…" />
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
