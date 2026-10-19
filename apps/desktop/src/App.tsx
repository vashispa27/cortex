import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowRight, Bell, BookOpen, Check, ChevronRight,
  CircleHelp, Clock3, Copy, Database, FileText, Orbit, House,
  LockKeyhole, MessageCircle, Mic, Moon, Pause, Play, Plus, Search, Settings2,
  ShieldCheck, Sparkles, Square, Trash2, UserRound, Volume2, WandSparkles, X,
} from "lucide-react";
import {
  deleteAllMemory, desktopRuntime, getServiceSettings, getStatus, pauseCapture, patchSettings, recentMemory, requestCapturePermission, resetEvalData,
  searchMemory, type MemoryHit, type SearchData, type ServiceStatus,
} from "./lib/api";
import { demoSearch } from "./lib/demo";
import {
  dueOccurrence, loadPreferences, loadReminders, savePreferences,
  saveReminders, type Preferences, type Reminder, type RewindTrigger,
} from "./lib/storage";
import { canApplyDraft, classifyWriting, draftSample, type WritingOperation } from "./lib/writing";
import { aiTarget, testConnection, validLocalEndpoint } from "./lib/provider";
import { configureAssist, configureRewindTrigger, configureTestMode, openMain, previewNotch, quitApp, setNotchVisible } from "./lib/notch";
import { saveSessions, triggerName } from "./lib/rewind";
import type { Page, SettingsPage } from "./lib/types";
import { HomeDashboard, TimelinePage } from "./Dashboard";
import RewindMark from "./components/RewindMark";
import AskChat from "./components/AskChat";

const navGroups: { label: string; items: { id: Page; label: string; icon: typeof House }[] }[] = [
  { label: "Overview", items: [
    { id: "today", label: "Home", icon: House },
    { id: "timeline", label: "Timeline", icon: Clock3 },
  ] },
  { label: "Workspace", items: [
    { id: "ask", label: "Ask Rewind", icon: MessageCircle },
    { id: "memory", label: "Memory", icon: Database },
    { id: "wiki", label: "People & things", icon: BookOpen },
    { id: "write", label: "Write", icon: WandSparkles },
    { id: "reminders", label: "Reminders", icon: Bell },
  ] },
  { label: "System", items: [
    { id: "settings", label: "Settings", icon: Settings2 },
  ] },
];
const navItems = navGroups.flatMap((group) => group.items);

const settingsNav: { id: SettingsPage; label: string }[] = [
  { id: "account", label: "Account" }, { id: "ai", label: "AI model" }, { id: "capture", label: "Capture & privacy" },
  { id: "notch", label: "Rewind & notch" },
  { id: "shortcuts", label: "Shortcuts" }, { id: "voice", label: "Voice" },
  { id: "appearance", label: "Appearance" }, { id: "memory", label: "Memory" },
  { id: "identity", label: "Identity" }, { id: "notifications", label: "Notifications" },
  { id: "connected", label: "Connected AI apps" }, { id: "diagnostics", label: "Diagnostics" },
  { id: "updates", label: "Updates" },
];

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}

function initialPage(): Page {
  const requested = new URLSearchParams(window.location.search).get("page");
  return requested === "timeline" || requested === "ask" || requested === "memory" || requested === "wiki" || requested === "write" || requested === "reminders" || requested === "settings" ? requested : "today";
}

function IconButton({ children, onClick, label, className = "" }: { children: ReactNode; onClick: () => void; label: string; className?: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</button>;
}

function Button({ children, onClick, kind = "primary", disabled = false, type = "button" }: { children: ReactNode; onClick?: () => void; kind?: "primary" | "secondary" | "quiet"; disabled?: boolean; type?: "button" | "submit" }) {
  return <button type={type} className={`button button-${kind}`} disabled={disabled} onClick={onClick}>{children}</button>;
}

function Toggle({ checked, onChange, label, description, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return <label className={`setting-row ${disabled ? "muted" : ""}`}>
    <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
    <input className="switch-input" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true" className={`switch ${checked ? "on" : ""}`} />
  </label>;
}

function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{body}</p>{action}</div>;
}

function MemoryCard({ hit }: { hit: MemoryHit }) {
  return <article className="evidence-card"><div className="evidence-meta"><time>{formatTime(hit.observed_ms)}</time></div><h3>{hit.title || "Activity"}</h3></article>;
}

function Onboarding({ preferences, onDone }: { preferences: Preferences; onDone: (enabled: boolean) => void }) {
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const finishing = useRef(false);

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    const check = async () => {
      if (finishing.current) return;
      try {
        const status = await getStatus();
        if (cancelled || status.permission !== "granted") return;
        finishing.current = true;
        await patchSettings({ capture_enabled: true, capture_paused: false,
          excluded_apps: preferences.excludedApps.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
          excluded_domains: preferences.excludedDomains.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) });
        if (!cancelled) onDone(true);
      } catch (err) {
        finishing.current = false;
        if (!cancelled) setError(`Could not start capture: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    void check();
    const interval = window.setInterval(check, 2000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [waiting]);

  const begin = async () => {
    setError("");
    try {
      await requestCapturePermission();
      setWaiting(true);
    } catch (err) {
      setError(`Could not connect to Rewind: ${err instanceof Error ? err.message : String(err)}. Try again.`);
    }
  };
  return <div className="onboarding-wrap"><div className="onboarding-card">
    <div className="onboarding-top"><span className="brand-inline"><RewindMark className="brand-icon" /> Rewind</span></div>
    <div className="onboarding-body"><span className="eyebrow">Welcome to Rewind</span><h1>Let Rewind remember<br /><em>what you see.</em></h1>
      <p>Allow Accessibility access so Rewind can read text in the foreground app and save it locally. Normal browser windows can be read; private/incognito windows, credential apps and protected fields are skipped. You can pause or stop capture anytime.</p>
      <div className="callout neutral"><ShieldCheck size={18} /> When you ask a question, relevant saved text is sent to your chosen OpenRouter model.</div>
      {waiting && <div className="callout neutral">Waiting for Accessibility permission. Enable <strong>Rewind</strong> in macOS System Settings; capture will start automatically.</div>}
      {waiting && <div className="manage-actions"><Button kind="secondary" onClick={() => void invoke("open_accessibility_settings")}>Open Accessibility settings</Button><Button kind="secondary" onClick={() => void invoke("reveal_rewind_app")}>Show Rewind in Finder</Button></div>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="onboarding-footer"><Button kind="quiet" onClick={() => onDone(false)}>Not now</Button><Button disabled={waiting} onClick={() => void begin()}>{waiting ? "Waiting for permission…" : "Allow & start"} <ArrowRight size={16} /></Button></div>
  </div></div>;
}

function VoicePanel({ enabled, onTranscript }: { enabled: boolean; onTranscript: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const requestId = useRef(0);
  const mounted = useRef(true);

  const stop = () => {
    requestId.current++;
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (mounted.current) setRecording(false);
  };
  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => { if (document.visibilityState !== "visible") stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      mounted.current = false;
      stop();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    };
  }, []);

  const start = async () => {
    if (!enabled) { setMessage("Enable microphone consent in Settings → Voice first."); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setMessage("Recording is unavailable in this runtime."); return; }
    const nextRequest = ++requestId.current;
    try {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
      setAudioUrl(null);
      const device = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || nextRequest !== requestId.current || document.visibilityState !== "visible") {
        device.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = device;
      const chunks: BlobPart[] = [];
      const next = new MediaRecorder(device);
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => {
        if (chunks.length && mounted.current) {
          const url = URL.createObjectURL(new Blob(chunks, { type: next.mimeType || "audio/webm" }));
          if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = url;
          setAudioUrl(url);
        }
        device.getTracks().forEach((track) => track.stop());
      };
      next.start();
      setRecording(true);
      setMessage("Recording locally. Stops after one minute or when this window is hidden.");
      timer.current = window.setTimeout(stop, 60_000);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      if (mounted.current && nextRequest === requestId.current) setMessage("Could not start recording. Check microphone permission and device.");
    }
  };
  return <div className="voice-panel"><div className="voice-heading"><Volume2 size={18} /><strong>Voice scratchpad</strong></div><p>Record only when you press the button. Audio stays in this window and is discarded when you leave. Transcription requires a configured service and is not available in this build.</p><div className="voice-actions"><Button kind={recording ? "secondary" : "primary"} onClick={recording ? stop : start}>{recording ? <><Square size={15} /> Stop recording</> : <><Mic size={15} /> Record audio</>}</Button>{audioUrl && <audio controls src={audioUrl} aria-label="Recorded audio preview" />}</div>{message && <small className="muted-text">{message}</small>}<label className="field-label" htmlFor="transcript-fallback">Have a transcript already?</label><div className="inline-form"><input id="transcript-fallback" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Paste or type the words here" /><Button kind="secondary" disabled={!transcript.trim()} onClick={() => { onTranscript(transcript); setTranscript(""); }}>Use in Write</Button></div></div>;
}

function WritingSandbox({ onOpenVoice, initialText }: { onOpenVoice: () => void; initialText: string }) {
  const [text, setText] = useState(initialText);
  const [tone, setTone] = useState("Keep the meaning");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [draft, setDraft] = useState<string | null>(null);
  const [operation, setOperation] = useState<WritingOperation>("draft");
  const [revision, setRevision] = useState<{ text: string; start: number; end: number } | null>(null);
  const [applied, setApplied] = useState<{ before: string; after: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (initialText) setText(initialText); }, [initialText]);

  const generate = () => {
    const current = textarea.current;
    const start = current?.selectionStart ?? selection.start;
    const end = current?.selectionEnd ?? selection.end;
    const nextOperation = classifyWriting(text, start, end);
    const source = nextOperation === "selection" ? text.slice(start, end) : text;
    const nextRequest = ++requestId.current;
    setRevision({ text, start, end });
    setOperation(nextOperation);
    setDraft(null);
    setBusy(true);
    setNotice("");
    window.setTimeout(() => {
      if (nextRequest !== requestId.current) return;
      setDraft(draftSample(source, nextOperation, tone));
      setBusy(false);
    }, 250);
  };
  const apply = () => {
    if (!draft || !revision) return;
    const current = textarea.current;
    const start = current?.selectionStart ?? selection.start;
    const end = current?.selectionEnd ?? selection.end;
    if (!canApplyDraft(revision.text, text, revision.start, revision.end, start, end)) {
      setNotice("The text or selection changed. Draft kept below; copy it or generate again.");
      return;
    }
    const after = operation === "selection" ? text.slice(0, start) + draft + text.slice(end) : draft;
    setApplied({ before: text, after });
    setText(after);
    setDraft(null);
    setNotice("Applied to this sandbox field. Nothing was sent.");
  };
  const undo = () => {
    if (!applied) return;
    if (text !== applied.after) { setNotice("The field changed after applying. Undo was skipped to preserve your edits."); return; }
    setText(applied.before);
    setApplied(null);
    setNotice("Last sandbox edit undone.");
  };
  return <div className="write-layout"><div className="surface-card write-main"><div className="section-top"><div><span className="eyebrow">Writing workspace</span><h2>A draft you control</h2></div><button className="text-link" onClick={onOpenVoice}><Mic size={16} /> Voice</button></div><p className="subtle">Select words to rewrite only that range. Without a selection, this sandbox replaces the field. A request starting with <code>/g</code> is treated as a question.</p><label className="field-label" htmlFor="write-area">Your text</label><textarea id="write-area" ref={textarea} className="writing-field" value={text} onChange={(event) => { setText(event.target.value); setSelection({ start: event.target.selectionStart, end: event.target.selectionEnd }); }} onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} placeholder="Write an instruction, paste a draft, or leave empty to try a reply…" /><div className="write-toolbar"><select aria-label="Writing style" value={tone} onChange={(event) => setTone(event.target.value)}><option>Keep the meaning</option><option>Short and concise</option><option>Friendly and warm</option><option>Formal and professional</option></select><div><Button kind="quiet" onClick={undo} disabled={!applied}>Undo</Button><Button onClick={generate} disabled={busy}><Sparkles size={16} /> {busy ? "Thinking…" : "Make a draft"}</Button></div></div>{notice && <div className="callout neutral" role="status">{notice}</div>}</div><aside className="write-side"><div className="surface-card draft-card"><div className="draft-heading"><span className="eyebrow">Draft</span>{draft && <span className="mini-label">{operation === "selection" ? "Selected text" : operation === "answer" ? "Direct request" : operation === "draft" ? "Reply" : "Whole field"}</span>}</div>{busy ? <div className="draft-loading"><Orbit size={25} className="fish-pulse" /><span>Preparing a local sample…</span><Button kind="quiet" onClick={() => { requestId.current++; setBusy(false); setNotice("Draft cancelled. Your text was untouched."); }}>Cancel</Button></div> : draft ? <><p className="draft-text">{draft}</p><div className="draft-actions"><Button kind="secondary" onClick={() => navigator.clipboard.writeText(draft).then(() => setNotice("Draft copied.")).catch(() => setNotice("Copy failed; select the draft text manually."))}><Copy size={15} /> Copy</Button><Button onClick={apply}><Check size={15} /> Apply here</Button></div></> : <EmptyState icon={<FileText size={23} />} title="Your draft appears here" body="Generate a sample to see the edit before it touches the field." />}</div><div className="callout neutral"><ShieldCheck size={17} /> This is a local tutorial field. Cross-app insertion is unavailable until native target validation is implemented and tested.</div></aside></div>;
}

function RemindersPage({ reminders, setReminders, notices }: { reminders: Reminder[]; setReminders: (value: Reminder[]) => void; notices: string[] }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState("");
  const [repeat, setRepeat] = useState<"none" | "daily">("none");
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || !at) return;
    setReminders([{ id: crypto.randomUUID(), text: text.trim(), at: new Date(at).toISOString(), repeat, delivered: [] }, ...reminders]);
    setText(""); setAt(""); setRepeat("none");
  };
  return <div className="page-content"><div className="page-heading"><span className="eyebrow">Stay on track</span><h1>Reminders</h1><p>Gentle prompts for things you choose to remember.</p></div><div className="two-column"><section className="surface-card"><h2>New reminder</h2><form onSubmit={add} className="stack-form"><label className="field-label" htmlFor="reminder-text">What should I remind you?</label><input id="reminder-text" required value={text} onChange={(event) => setText(event.target.value)} placeholder="Review the launch checklist" /><label className="field-label" htmlFor="reminder-date">When</label><input id="reminder-date" required type="datetime-local" value={at} onChange={(event) => setAt(event.target.value)} /><label className="field-label" htmlFor="reminder-repeat">Repeat</label><select id="reminder-repeat" value={repeat} onChange={(event) => setRepeat(event.target.value as "none" | "daily")}><option value="none">Once</option><option value="daily">Daily</option></select><Button type="submit"><Plus size={16} /> Add reminder</Button></form><div className="callout neutral"><Clock3 size={16} /> Reminders appear while this app is open. This build does not install an OS background scheduler.</div></section><section className="surface-card"><h2>Upcoming & delivered</h2>{notices.length > 0 && <div className="notice-list">{notices.map((notice, index) => <div key={`${notice}-${index}`} className="callout success"><Bell size={16} /> {notice}</div>)}</div>}{reminders.length ? <div className="reminder-list">{reminders.map((reminder) => <div className="reminder-item" key={reminder.id}><span className="reminder-icon"><Bell size={18} /></span><div><strong>{reminder.text}</strong><small>{formatTime(new Date(reminder.at).getTime())} · {reminder.repeat === "daily" ? "Daily" : reminder.delivered.length ? "Delivered" : "Once"}</small></div><IconButton label={`Delete reminder ${reminder.text}`} onClick={() => setReminders(reminders.filter((item) => item.id !== reminder.id))}><Trash2 size={16} /></IconButton></div>)}</div> : <EmptyState icon={<Bell size={23} />} title="Nothing scheduled" body="Add a reminder to see it here." />}</section></div></div>;
}

export default function App() {
  const [preferences, setPreferencesState] = useState(loadPreferences);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [page, setPage] = useState<Page>(initialPage);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("capture");
  const [search, setSearch] = useState("");
  const [memoryData, setMemoryData] = useState<SearchData | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [chatCount, setChatCount] = useState(0);
  const [reminders, setRemindersState] = useState(loadReminders);
  const [notices, setNotices] = useState<string[]>([]);
  const [showVoice, setShowVoice] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [evalDir, setEvalDir] = useState("");
  const [confirmEvalReset, setConfirmEvalReset] = useState(false);
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [hasOpenrouterKey, setHasOpenrouterKey] = useState(false);
  const [localTesting, setLocalTesting] = useState(false);
  const [localTestResult, setLocalTestResult] = useState("");
  const [modelDraft, setModelDraft] = useState(() => loadPreferences().openrouterModel);
  const [wikiQuery, setWikiQuery] = useState("");
  const sample = preferences.sampleMode;

  const setPreferences = (value: Preferences) => { setPreferencesState(value); savePreferences(value); };
  const setReminders = (value: Reminder[]) => { setRemindersState(value); saveReminders(value); };
  const refreshStatus = async () => {
    try {
      const nextStatus = await getStatus();
      try {
        const settings = await getServiceSettings();
        nextStatus.capturePaused = settings.capture_paused;
        nextStatus.captureRequested = settings.capture_enabled;
        setTestMode(settings.test_mode); setEvalDir(settings.eval_dir);
        setPreferencesState((current) => {
          const next = { ...current, mcpConsent: settings.mcp_enabled, captureConsent: current.captureConsent || settings.capture_enabled };
          savePreferences(next);
          return next;
        });
      } catch { /* Keep status available with older local services. */ }
      setStatus(nextStatus); setStatusError("");
    }
    catch (error) { setStatus(null); setStatusError(error instanceof Error ? error.message : String(error)); }
  };
  useEffect(() => { void refreshStatus(); const interval = window.setInterval(refreshStatus, 5_000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { if (desktopRuntime() && (!loadPreferences().onboardingComplete || !loadPreferences().captureSetupComplete)) void openMain("today"); }, []);
  useEffect(() => { if (desktopRuntime()) void invoke<boolean>("openrouter_has_key").then(setHasOpenrouterKey).catch(() => setHasOpenrouterKey(false)); }, [settingsPage]);
  useEffect(() => { document.documentElement.style.fontSize = `${preferences.textScale}%`; document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion); }, [preferences.textScale, preferences.reduceMotion]);
  useEffect(() => { void configureRewindTrigger(preferences.rewindTrigger, preferences.rewindHotkey); }, [preferences.rewindTrigger, preferences.rewindHotkey]);
  useEffect(() => {
    void configureAssist({
      autocomplete: preferences.autocompleteOnTap, summarize: preferences.summarizeOnTap, rewrite: preferences.rewriteOnTap,
      privateWindows: preferences.assistInPrivateWindows, showOverFullScreen: preferences.showOverFullScreen,
    });
  }, [preferences.autocompleteOnTap, preferences.summarizeOnTap, preferences.rewriteOnTap, preferences.assistInPrivateWindows, preferences.showOverFullScreen]);
  useEffect(() => {
    if (!desktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("navigate", (event) => {
      const target = event.payload;
      if (target === "ask") window.dispatchEvent(new Event("rewind:handoff"));
      if (target === "settings") setSettingsPage("notch");
      setPage(target === "ask" ? "ask" : target === "timeline" ? "timeline" : target === "memory" ? "memory" : target === "settings" ? "settings" : "today");
    }).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const delivered = reminders.map((reminder) => {
        const occurrence = dueOccurrence(reminder, now);
        if (!occurrence) return reminder;
        setNotices((current) => [`Reminder: ${reminder.text}`, ...current].slice(0, 5));
        return { ...reminder, delivered: [...reminder.delivered, occurrence] };
      });
      if (delivered.some((reminder, index) => reminder !== reminders[index])) setReminders(delivered);
    };
    check(); const interval = window.setInterval(check, 15_000); return () => window.clearInterval(interval);
  }, [reminders]);

  const runSearch = async (query: string, recent = false) => {
    setMemoryBusy(true); setMemoryError("");
    try { setMemoryData(sample ? demoSearch(recent ? "" : query) : recent ? await recentMemory() : await searchMemory(query)); }
    catch (error) { setMemoryError(error instanceof Error ? error.message : String(error)); setMemoryData(null); }
    finally { setMemoryBusy(false); }
  };
  useEffect(() => { if ((page === "memory" || page === "today" || page === "timeline") && !memoryData) void runSearch("", true); }, [page, sample]);
  const updateSetting = (changes: Partial<Preferences>) => {
    setPreferences({ ...preferences, ...changes }); setSettingsNotice("");
  };
  const runLocalTest = async () => {
    const target = aiTarget(loadPreferences());
    if (!validLocalEndpoint(target.endpoint ?? "")) { setLocalTestResult("Enter an http address on this Mac, such as http://127.0.0.1:8080/v1."); return; }
    if (!target.model) { setLocalTestResult("Enter the model name first."); return; }
    setLocalTesting(true); setLocalTestResult("");
    try { await testConnection(target); setLocalTestResult("Connected. The local model answered."); }
    catch (error) { setLocalTestResult(error instanceof Error ? error.message : String(error)); }
    finally { setLocalTesting(false); }
  };
  const saveModel = async () => {
    const model = modelDraft.trim();
    if (!model || model.length > 160 || /\s/.test(model)) { setSettingsNotice("Enter a valid OpenRouter model ID, such as provider/model-name."); return; }
    try {
      if (openrouterKey.trim()) {
        await invoke("openrouter_save_key", { key: openrouterKey });
        setOpenrouterKey("");
        setHasOpenrouterKey(true);
      }
      setPreferences({ ...preferences, openrouterModel: model });
      setSettingsNotice(openrouterKey.trim() || hasOpenrouterKey ? "OpenRouter settings saved. Your key is stored locally on this Mac." : "Model saved. Add your OpenRouter API key to enable answers.");
    } catch (error) { setSettingsNotice(`Could not save settings: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const updateMcpConsent = async (enabled: boolean) => {
    if (!status) { setSettingsNotice("The local service is offline. MCP access remains off."); return; }
    try {
      const next = await patchSettings({ mcp_enabled: enabled });
      setPreferences({ ...preferences, mcpConsent: next.mcp_enabled });
      setSettingsNotice(next.mcp_enabled ? "MCP access is enabled for approved local clients. No client was registered." : "MCP access is disabled.");
      void refreshStatus();
    } catch (error) { setSettingsNotice(`MCP access was not changed: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const togglePause = async () => {
    if (!status) return;
    try { await pauseCapture(!status.capturePaused); setSettingsNotice(status.capturePaused ? "Capture resumed." : "Capture paused."); await refreshStatus(); }
    catch (error) { setSettingsNotice(`Pause request failed: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const exclusions = () => ({
    excluded_apps: preferences.excludedApps.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    excluded_domains: preferences.excludedDomains.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
  });
  const saveCaptureExclusions = async () => {
    if (!status) return;
    try {
      await patchSettings(exclusions());
      setSettingsNotice("Exclusions are applied to the local capture service.");
      await refreshStatus();
    } catch (error) { setSettingsNotice(`Exclusions were not applied: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const startCapture = async () => {
    if (!status) return;
    if (status.permission !== "granted") {
      setPreferences({ ...preferences, captureSetupComplete: false });
      return;
    }
    try {
      await patchSettings({ capture_enabled: true, capture_paused: false, ...exclusions() });
      setSettingsNotice("Mac capture is on. Only permitted foreground accessibility text is stored locally.");
      await refreshStatus();
    } catch (error) { setSettingsNotice(`Capture did not start: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const stopCapture = async (): Promise<boolean> => {
    if (!status) return false;
    try {
      await patchSettings({ capture_enabled: false });
      setSettingsNotice("Mac capture is off.");
      await refreshStatus();
      return true;
    } catch (error) { setSettingsNotice(`Capture did not stop: ${error instanceof Error ? error.message : String(error)}`); return false; }
  };
  const changeTestMode = async (enabled: boolean) => {
    try {
      const settings = await patchSettings({ test_mode: enabled });
      setTestMode(settings.test_mode); setEvalDir(settings.eval_dir || evalDir);
      void configureTestMode(settings.test_mode);
      setSettingsNotice(enabled ? "Test mode is on. Questions are answered from the eval archive; use the notch play button to record into it." : "Test mode is off. Questions are answered from your real memory again.");
      await refreshStatus();
    } catch (error) { setSettingsNotice(`Test mode did not change: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const eraseEvalData = async () => {
    try {
      await resetEvalData();
      setConfirmEvalReset(false);
      setSettingsNotice("Eval archive erased. Your real memory was not touched.");
      await refreshStatus();
    } catch (error) { setSettingsNotice(`Eval archive was not erased: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const performDelete = async () => {
    if (deletePhrase !== "DELETE ALL LOCAL MEMORY" || !status) return;
    setDeleteBusy(true); setDeleteError("");
    try {
      const receipt = await deleteAllMemory();
      setReminders([]);
      setPreferences({ ...preferences, identity: "" });
      setMemoryData(null);
      saveSessions([]);
      setShowDelete(false);
      setDeletePhrase("");
      setSettingsNotice(`Deleted ${receipt.deleted_snapshots} local source records. Memory epoch ${receipt.memory_epoch}; capture paused. Shell reminders and identity note were also cleared.`);
      await refreshStatus();
    } catch (error) { setDeleteError(error instanceof Error ? error.message : String(error)); }
    finally { setDeleteBusy(false); }
  };

  const openSettingsPage = (next: SettingsPage) => { setPage("settings"); setSettingsPage(next); setSettingsNotice(""); };
  const setDropVisible = (visible: boolean) => {
    updateSetting({ hideDrop: !visible });
    void setNotchVisible(visible);
  };
  const searchFromDashboard = (query: string) => {
    setSearch(query);
    setPage("memory");
    void runSearch(query);
  };
  const toggleCaptureFromDashboard = async () => {
    if (!status) { openSettingsPage("capture"); return; }
    if (!status.captureRequested) {
      await startCapture();
      return;
    }
    await togglePause();
  };

  if (!preferences.onboardingComplete || !preferences.captureSetupComplete) return <Onboarding preferences={preferences} onDone={(enabled) => { setPreferences({ ...preferences, onboardingComplete: true, captureSetupComplete: true, captureConsent: enabled || preferences.captureConsent }); setPage("today"); void refreshStatus(); }} />;

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-top"><button className="brand" onClick={() => setPage("today")} aria-label="Rewind home"><RewindMark className="brand-icon" /><span>Rewind<span className="brand-dot">.</span></span></button><span className="edition">LOCAL PREVIEW</span></div><nav aria-label="Main navigation">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => setPage(id)}><Icon size={18} /><span>{label}</span>{id === "reminders" && notices.length > 0 && <span className="nav-count">{notices.length}</span>}</button>)}</div>)}</nav><div className="sidebar-bottom"><div className="capture-card"><div className="capture-line"><span className={`status-light ${sample ? "sample" : status?.captureEnabled && !status.capturePaused ? "good" : ""}`} /><strong>{sample ? "Sample workspace" : status?.captureEnabled ? status.capturePaused ? "Capture paused" : "Capture on" : "Capture off"}</strong></div><p>{sample ? "Invented activity only" : status ? "Local service connected" : "Local service offline"}</p><button onClick={() => openSettingsPage("capture")}>Manage privacy <ChevronRight size={14} /></button></div><div className="sidebar-footnote">Local-first memory, under your control.</div></div></aside>
    <main className="main"><header className="topbar"><div className="breadcrumb"><Orbit size={16} /><span>{navItems.find((item) => item.id === page)?.label}</span></div><div className="topbar-actions"><span className={`top-status ${sample ? "sample" : status ? "online" : "offline"}`}><span className="status-light" />{sample ? "Sample data" : status ? "Local service" : "Offline"}</span><IconButton label="Open Rewind" onClick={() => void previewNotch("compose")}><RewindMark className="topbar-rewind" /></IconButton><IconButton label="Open settings" onClick={() => setPage("settings")}><Settings2 size={18} /></IconButton></div></header>
      {page === "today" && <HomeDashboard sample={sample} status={status} preferences={preferences} reminders={reminders} hits={memoryData?.results ?? []} busy={memoryBusy} error={memoryError} chatCount={chatCount} onNavigate={setPage} onSettings={openSettingsPage} onSearch={searchFromDashboard} onToggleCapture={() => void toggleCaptureFromDashboard()} onUpdatePreferences={updateSetting} onSetDropVisible={setDropVisible} onPreviewNotch={(mode) => void previewNotch(mode)} />}
      {page === "timeline" && <TimelinePage sample={sample} hits={memoryData?.results ?? []} busy={memoryBusy} error={memoryError} onRewind={() => setPage("memory")} />}
      <div hidden={page !== "ask"} className="chat-host"><AskChat sample={sample} active={page === "ask"} onSessionCount={setChatCount} /></div>
      {page === "memory" && <div className="page-content"><div className="page-heading"><span className="eyebrow">Your local archive</span><h1>Memory</h1><p>Find moments from your recent activity.</p></div><form className="search-bar" onSubmit={(event) => { event.preventDefault(); void runSearch(search); }}><Search size={20} /><input aria-label="Search memory" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a topic, person, or phrase" /><Button type="submit" disabled={memoryBusy}>Search</Button></form><div className="results-top"><span>{memoryData ? `${memoryData.results.length} ${memoryData.results.length === 1 ? "result" : "results"}` : "Recent memory"}</span><button className="text-link" onClick={() => { setSearch(""); void runSearch("", true); }}>Recent activity</button></div>{memoryError ? <div className="callout warning">{memoryError}</div> : memoryBusy ? <div className="loading-state">Searching…</div> : memoryData?.results.length ? <div className="memory-list">{memoryData.results.map((hit) => <MemoryCard key={hit.snapshot_id} hit={hit} />)}</div> : <EmptyState icon={<Search size={25} />} title="Nothing found yet" body={sample ? "Try a word from the sample workspace, such as review, Maya, or accessibility." : "The service may be offline, or this topic may not have been captured."} />}{memoryData && <div className="coverage-note"><CircleHelp size={16} /> Coverage: {memoryData.coverage.state}{memoryData.coverage.reason ? ` · ${memoryData.coverage.reason.replaceAll("_", " ")}` : ""}</div>}</div>}
      {page === "wiki" && <div className="page-content"><div className="page-heading"><span className="eyebrow">Connections and context</span><h1>People & things</h1><p>People and projects you have encountered.</p></div><div className="search-bar"><Search size={20} /><input aria-label="Search people and things" value={wikiQuery} onChange={(event) => setWikiQuery(event.target.value)} placeholder="Find a person, project, or place" /></div>{sample ? <div className="entity-grid">{[{ name: "Maya", type: "Person", body: "Mentioned the Thursday design review and onboarding copy.", ids: [101, 103] }, { name: "Ravi", type: "Person", body: "Expected to share a test plan.", ids: [103] }, { name: "Design review", type: "Project", body: "Moved to Thursday; accessibility pass remains open.", ids: [101] }].filter((entity) => `${entity.name} ${entity.type}`.toLowerCase().includes(wikiQuery.toLowerCase())).map((entity) => <article className="surface-card entity-card" key={entity.name}><span className="entity-icon"><UserRound size={22} /></span><span className="eyebrow">{entity.type}</span><h2>{entity.name}</h2><p>{entity.body}</p></article>)}</div> : <EmptyState icon={<BookOpen size={26} />} title="Entity wiki is not ready" body="The local service currently exposes source search. Entity extraction and evidence-linked pages are a later integration step." />}</div>}
      {page === "write" && <div className="page-content"><div className="page-heading"><span className="eyebrow">Thoughtful drafting</span><h1>Write with confidence</h1><p>Review a draft before it changes any text.</p></div><WritingSandbox initialText={voiceText} onOpenVoice={() => setShowVoice(true)} /></div>}
      {page === "reminders" && <RemindersPage reminders={reminders} setReminders={setReminders} notices={notices} />}
      {page === "settings" && <div className="settings-layout"><div className="settings-nav"><span className="eyebrow">Preferences</span><h1>Settings</h1>{settingsNav.map((item) => <button key={item.id} className={settingsPage === item.id ? "active" : ""} onClick={() => { setSettingsPage(item.id); setSettingsNotice(""); }}>{item.label}<ChevronRight size={15} /></button>)}</div><div className="settings-content"><span className="eyebrow">{settingsNav.find((item) => item.id === settingsPage)?.label}</span><h2>{settingsNav.find((item) => item.id === settingsPage)?.label}</h2>{settingsNotice && <div role="status" className="callout neutral">{settingsNotice}</div>}
        {settingsPage === "account" && <div className="settings-stack"><div className="surface-card"><h3>Workspace</h3><p>This independent build runs locally and has no account sign-in yet.</p><div className="connection-card"><span className={`status-light ${status ? "good" : ""}`} /><div><strong>{status ? "Local service connected" : "Local service offline"}</strong><small>{desktopRuntime() ? "Desktop app" : "Browser preview"}</small></div><Button kind="secondary" onClick={() => void refreshStatus()}>Retry</Button></div>{statusError && <small className="muted-text">{statusError}</small>}</div><div className="surface-card"><h3>Sample workspace</h3><Toggle checked={sample} onChange={(value) => updateSetting({ sampleMode: value })} label="Use invented sample data" description="Clearly marked examples for exploring the interface." /><Button kind="quiet" onClick={() => updateSetting({ onboardingComplete: false, captureSetupComplete: false })}>Replay onboarding</Button></div></div>}
        {settingsPage === "ai" && <div className="settings-stack">
          <div className="surface-card"><h3>Model provider</h3>
            <p>Choose where questions, rewrites and summaries are answered.</p>
            <label className="field-label" htmlFor="ai-provider">Provider</label>
            <select id="ai-provider" value={preferences.aiProvider} onChange={(event) => { updateSetting({ aiProvider: event.target.value as Preferences["aiProvider"] }); setLocalTestResult(""); }}>
              <option value="openrouter">OpenRouter (cloud)</option>
              <option value="local">Local model on this Mac</option>
            </select>
          </div>
          {preferences.aiProvider === "local" ? <>
            <div className="surface-card"><h3>Local model</h3>
              <p>Any server on this Mac that speaks the OpenAI chat API: <code>mlx_lm.server</code>, Ollama or LM Studio. Nothing leaves your computer.</p>
              <label className="field-label" htmlFor="local-endpoint">Server address</label>
              <input id="local-endpoint" value={preferences.localEndpoint} onChange={(event) => { updateSetting({ localEndpoint: event.target.value }); setLocalTestResult(""); }} placeholder="http://127.0.0.1:8080/v1" autoComplete="off" />
              <p className="fine-print">mlx_lm.server: http://127.0.0.1:8080/v1 · Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1. Only addresses on this Mac are accepted.</p>
              <label className="field-label" htmlFor="local-model">Model name</label>
              <input id="local-model" value={preferences.localModel} onChange={(event) => { updateSetting({ localModel: event.target.value.trim() }); setLocalTestResult(""); }} placeholder="mlx-community/Qwen3.5-2B-4bit" autoComplete="off" />
              <p className="fine-print">Use the name the server lists: the --model value for mlx_lm.server, or the tag from <code>ollama list</code>, such as qwen3:4b.</p>
              <div className="manage-actions"><Button disabled={!desktopRuntime() || localTesting} onClick={() => void runLocalTest()}>{localTesting ? "Testing…" : "Test connection"}</Button></div>
              {localTestResult && <p className="fine-print" role="status">{localTestResult}</p>}
            </div>
            <div className="callout neutral"><ShieldCheck size={18} /> With a local model, questions, captured excerpts and selected text stay on this Mac. Small models can be slower to follow instructions, so answers may be rougher than a cloud model's. Memory search and tool use still run locally.</div>
          </> : <>
            <div className="surface-card"><h3>OpenRouter</h3><p>Choose the model that answers your questions. Your API key is stored in a private local file on this Mac, without Keychain. It is not encrypted.</p><label className="field-label" htmlFor="openrouter-model">Model ID</label><input id="openrouter-model" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} placeholder="provider/model-name" autoComplete="off" /><label className="field-label" htmlFor="openrouter-fast-model">Autocomplete model (optional)</label><input id="openrouter-fast-model" value={preferences.fastModel} onChange={(event) => updateSetting({ fastModel: event.target.value.trim() })} placeholder="A faster model for double-tap autocomplete" autoComplete="off" /><label className="field-label" htmlFor="openrouter-key">OpenRouter API key</label><input id="openrouter-key" type="password" value={openrouterKey} onChange={(event) => setOpenrouterKey(event.target.value)} placeholder={hasOpenrouterKey ? "Key saved — enter a new key to replace it" : "Paste your OpenRouter API key"} autoComplete="off" /><p className="fine-print">{hasOpenrouterKey ? "A key is saved." : "No key saved yet."}</p><div className="manage-actions"><Button disabled={!desktopRuntime()} onClick={() => void saveModel()}>Save model settings</Button>{hasOpenrouterKey && <Button kind="secondary" onClick={() => void invoke("openrouter_delete_key").then(() => { setHasOpenrouterKey(false); setSettingsNotice("Local OpenRouter key removed."); }).catch(() => setSettingsNotice("Could not remove the local key."))}>Remove key</Button>}</div></div>
            <div className="callout neutral"><ShieldCheck size={18} /> When you ask a question, Rewind sends your question, recent conversation, and excerpts from matching and recent captured sources to OpenRouter and your selected model provider. Review their privacy and data policies before using it.</div>
          </>}
        </div>}
        {settingsPage === "capture" && <div className="settings-stack">
          <div className="callout neutral"><ShieldCheck size={18} /> macOS capture starts only after your choice and Accessibility permission. Normal browser windows can be read; private/incognito windows, credential apps, and protected fields are skipped.</div>
          <div className="surface-card"><h3>Capture</h3><Toggle checked={Boolean(status?.captureRequested)} disabled={!status} onChange={(value) => { if (value) void startCapture(); else void stopCapture(); }} label="Capture memory" description={status?.permission !== "granted" && status?.captureRequested ? "Accessibility permission needed." : "Read foreground app text and store it locally."} /><div className="status-details"><span>Service</span><strong>{status ? "Connected" : "Offline"}</strong><span>Accessibility permission</span><strong>{status?.permission || "Unknown"}</strong></div>{status?.captureRequested && <Button kind="secondary" disabled={status.permission !== "granted"} onClick={() => void togglePause()}>{status.capturePaused ? <Play size={16} /> : <Pause size={16} />}{status.capturePaused ? "Resume" : "Pause"}</Button>}</div>
          <div className="surface-card"><h3>Test mode</h3><Toggle checked={testMode} disabled={!status} onChange={(value) => void changeTestMode(value)} label="Evaluate against a separate archive" description="Every question you ask is answered from the eval archive instead of your real memory, and a play/pause button appears in the notch to record the current screen into it. Nothing recorded here touches your real memory." />{testMode && <div className="status-details"><span>Eval archive</span><strong>{status?.indexedCount ?? 0} captures</strong><span>Location</span><strong>{evalDir || "Unknown"}</strong><span>Logs</span><strong>captures.jsonl (cleaned text and chunks), queries.jsonl</strong></div>}{testMode && (confirmEvalReset ? <div style={{ display: "flex", gap: 8, marginTop: 12 }}><Button kind="secondary" onClick={() => void eraseEvalData()}>Erase eval archive</Button><Button kind="quiet" onClick={() => setConfirmEvalReset(false)}>Cancel</Button></div> : <Button kind="secondary" onClick={() => setConfirmEvalReset(true)}>Reset eval archive…</Button>)}</div>
          <div className="surface-card"><h3>Exclusions</h3><label className="field-label" htmlFor="excluded-apps">Excluded apps</label><textarea id="excluded-apps" value={preferences.excludedApps} onChange={(event) => updateSetting({ excludedApps: event.target.value })} placeholder="One bundle ID per line, e.g. com.example.app" /><label className="field-label" htmlFor="excluded-domains">Excluded domains</label><textarea id="excluded-domains" value={preferences.excludedDomains} onChange={(event) => updateSetting({ excludedDomains: event.target.value })} placeholder="One domain per line" /><p className="fine-print">Private/incognito windows are skipped because their state cannot be verified reliably. Add domains here to exclude specific browser sites.</p><Button kind="secondary" disabled={!status} onClick={() => void saveCaptureExclusions()}>Save exclusions</Button></div>
          <div className="surface-card"><h3>AI answers</h3><p>Configure OpenRouter under AI model. Captured text is sent only when you ask a question.</p><Button kind="secondary" onClick={() => setSettingsPage("ai")}>Open AI model settings</Button></div>
        </div>}
        {settingsPage === "notch" && <div className="settings-stack">
          <div className="callout neutral"><RewindMark className="settings-rewind" /> Rewind lives in the notch. Click the logo for a single rewind, or the chat bubble to browse every session.</div>
          <div className="surface-card"><h3>The drop</h3>
            <Toggle checked={!preferences.hideDrop} onChange={(visible) => { setDropVisible(visible); setSettingsNotice(visible ? "Rewind is visible on the notch." : "Rewind is hidden. You can bring it back here."); }} label="Show Rewind on the notch" description="Keeps a small rewind mark and chat button beside the camera. Chat and typing panels open below the notch." />
            <Toggle checked={preferences.rewindHotkey} onChange={(value) => { updateSetting({ rewindHotkey: value }); void configureRewindTrigger(preferences.rewindTrigger, value); }} label="Double-tap to rewind" description="Start a new rewind from any app without touching the notch." />
            <label className="field-label" htmlFor="rewind-trigger">Rewind key</label>
            <select id="rewind-trigger" value={preferences.rewindTrigger} onChange={(event) => { const value = event.target.value as RewindTrigger; updateSetting({ rewindTrigger: value }); void configureRewindTrigger(value, preferences.rewindHotkey); }}>
              <option value="rightOption">Right Option (⌥)</option>
              <option value="leftOption">Left Option (⌥)</option>
              <option value="fn">Globe / Fn (fn)</option>
              <option value="rightShift">Right Shift (⇧)</option>
              <option value="leftShift">Left Shift (⇧)</option>
              <option value="rightControl">Right Control (⌃)</option>
              <option value="leftControl">Left Control (⌃)</option>
              <option value="rightCommand">Right Command (⌘)</option>
              <option value="leftCommand">Left Command (⌘)</option>
            </select>
            {(preferences.rewindTrigger === "rightCommand" || preferences.rewindTrigger === "leftCommand") && <p className="fine-print">Double-tapping Command can also be the macOS Dictation shortcut. Check System Settings → Keyboard → Dictation → Shortcut so the two do not collide. Shortcuts such as ⌘C never count as taps.</p>}
            {preferences.rewindTrigger === "fn" && <p className="fine-print">Globe / Fn may be set to show emoji, change the input source or start dictation (System Settings → Keyboard → “Press 🌐 key to”). A double-tap runs that action as well.</p>}
            <p className="fine-print">Double-tap the selected key. The notch shows × 1 on the first tap, then × 2 opens a fresh single-entry rewind, or completes, rewrites or summarizes when you are typing or have text selected. macOS may ask for Input Monitoring or Accessibility permission. Current trigger: {triggerName(preferences.rewindTrigger)}.</p>
          </div>
          <div className="surface-card"><h3>Double-tap actions</h3>
            <p>What a double-tap does depends on where you are. Rewind reads the focused field only at the moment you tap, never while you type.</p>
            <Toggle checked={preferences.autocompleteOnTap} onChange={(value) => updateSetting({ autocompleteOnTap: value })} label="Autocomplete" description="Double-tap while typing and Rewind finishes your sentence in place, using who you are replying to. It never presses Return." />
            <label className="field-label" htmlFor="autocomplete-length">Autocomplete length</label>
            <select id="autocomplete-length" value={preferences.autocompleteLength} disabled={!preferences.autocompleteOnTap} onChange={(event) => updateSetting({ autocompleteLength: event.target.value as Preferences["autocompleteLength"] })}>
              <option value="phrase">A few words</option>
              <option value="sentence">To the end of the sentence</option>
              <option value="reply">A short reply</option>
            </select>
            <Toggle checked={preferences.summarizeOnTap} onChange={(value) => updateSetting({ summarizeOnTap: value })} label="Summarize a selection" description="Select text on a page or document, double-tap, and the summary opens in the notch chat." />
            <Toggle checked={preferences.rewriteOnTap} onChange={(value) => updateSetting({ rewriteOnTap: value })} label="Rewrite a selection in a text field" description="Shows a preview first. Rewind never replaces your text without a click. When off, selections in text fields are summarized." />
            <Toggle checked={preferences.showOverFullScreen} onChange={(value) => updateSetting({ showOverFullScreen: value })} label="Show the notch over full-screen apps" description="Keeps Rewind on the notch when another app is full screen." />
            <Toggle checked={preferences.allowPasteInsert} onChange={(value) => updateSetting({ allowPasteInsert: value })} label="Allow paste as a last resort" description="If typing into a field fails, paste instead. Your clipboard is restored right after." />
            <Toggle checked={preferences.assistInPrivateWindows} onChange={(value) => updateSetting({ assistInPrivateWindows: value })} label="Allow in private browser windows" description="Off by default. Text from private windows is sent to your AI provider only if this is on." />
            <p className="fine-print">Secure fields, password managers and apps you excluded are never read. Everything is redacted before it is sent to your AI provider, and text is never logged. Needs Accessibility access for Rewind Capture.</p>
          </div>
          <div className="surface-card"><h3>Try it</h3><p>Preview the single-entry rewind or the history drop without leaving this window.</p>
            <div className="manage-actions"><Button kind="secondary" onClick={() => void previewNotch("compose")}><RewindMark className="button-rewind" /> Single rewind</Button><Button kind="secondary" onClick={() => void previewNotch("history")}><MessageCircle size={15} /> Chat history</Button></div>
          </div>
          <div className="surface-card"><h3>How it works</h3>
            <div className="shortcut-row"><span>Rewind logo</span><kbd>Open a single input</kbd></div>
            <div className="shortcut-row"><span>Chat bubble</span><kbd>Browse rewind history</kbd></div>
            <div className="shortcut-row"><span>Settings in Chats</span><kbd>Open preferences</kbd></div>
            <div className="shortcut-row"><span>Double-tap {triggerName(preferences.rewindTrigger)}</span><kbd>Rewind from anywhere</kbd></div>
            <div className="shortcut-row"><span>Escape</span><kbd>Close the drop</kbd></div>
            <p className="fine-print">Preferences are shared by the dashboard and the notch window. Rewind searches local evidence; it does not capture screen content by itself.</p>
          </div>
        </div>}
        {settingsPage === "shortcuts" && <div className="settings-stack"><div className="surface-card"><h3>Keyboard</h3><p>Double-tap your chosen modifier key to open Rewind from any app. Change the key in Notch settings.</p><div className="shortcut-row"><span>New rewind</span><kbd>Double-tap {triggerName(preferences.rewindTrigger)}</kbd></div><div className="shortcut-row"><span>Submit a memory search</span><kbd>Return</kbd></div></div></div>}
        {settingsPage === "voice" && <div className="settings-stack"><div className="surface-card"><h3>Microphone</h3><Toggle checked={preferences.microphoneConsent} onChange={(value) => updateSetting({ microphoneConsent: value })} label="Allow microphone requests" description="The browser or OS still asks permission when you press Record." /><Button kind="secondary" onClick={() => setShowVoice(true)}><Mic size={16} /> Open voice scratchpad</Button></div><div className="callout neutral">Audio is not uploaded. Transcription and insertion are unavailable until an authenticated speech service and native target validation are connected.</div></div>}
        {settingsPage === "appearance" && <div className="settings-stack"><div className="surface-card"><h3>Display</h3><label className="field-label" htmlFor="text-scale">Text size: {preferences.textScale}%</label><input id="text-scale" type="range" min="85" max="130" step="5" value={preferences.textScale} onChange={(event) => updateSetting({ textScale: Number(event.target.value) })} /><Toggle checked={preferences.reduceMotion} onChange={(value) => updateSetting({ reduceMotion: value })} label="Reduce motion" description="Stops decorative animation and notch resizing transitions." /></div></div>}
        {settingsPage === "memory" && <div className="settings-stack"><div className="surface-card"><h3>Archive</h3><div className="status-details"><span>Indexed observations</span><strong>{status?.indexedCount ?? "Unknown"}</strong><span>Storage</span><strong>Local service</strong></div><label className="field-label" htmlFor="retention">Retention (coming soon)</label><select id="retention" disabled value={preferences.retentionDays} onChange={(event) => updateSetting({ retentionDays: Number(event.target.value) })}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select><p className="fine-print">Automatic deletion is not available yet. This control does not change or delete your archive.</p></div><div className="surface-card"><h3>Manage data</h3><p>Browse or delete your local memory. Export is not yet available.</p><div className="manage-actions"><Button kind="secondary" onClick={() => setPage("memory")}>Inspect memory <ArrowRight size={15} /></Button><Button kind="secondary" disabled={!status} onClick={() => setShowDelete(true)}><Trash2 size={15} /> Delete all memory</Button></div></div></div>}
        {settingsPage === "identity" && <div className="settings-stack"><div className="surface-card"><h3>About you</h3><p>Write a note about how you prefer to communicate. This stays in this shell and is not sent to an AI model.</p><label className="field-label" htmlFor="identity">My context</label><textarea id="identity" className="identity-field" value={preferences.identity} onChange={(event) => updateSetting({ identity: event.target.value })} placeholder="I prefer concise, warm writing…" /></div></div>}
        {settingsPage === "notifications" && <div className="settings-stack"><div className="surface-card"><h3>Proactive messages</h3><Toggle disabled checked={false} onChange={(value) => updateSetting({ proactive: value })} label="Allow evidence-backed nudges" description="Saved as a preference. Automatic nudge generation is not active in this build." /><p>Scheduled reminders you create appear in the app while it is open.</p><Button kind="secondary" onClick={() => setPage("reminders")}>Open reminders</Button></div></div>}
        {settingsPage === "connected" && <div className="settings-stack"><div className="surface-card"><h3>AI clients</h3><p>External AI clients can receive local memory only after a separate, explicit setup. No clients are connected from this UI.</p><Toggle checked={status ? preferences.mcpConsent : false} onChange={(value) => void updateMcpConsent(value)} disabled={!status} label="Allow MCP memory access" description="Effective daemon setting. Separate from capture and cloud inference; client registration still requires an explicit action." /><div className="callout neutral"><LockKeyhole size={16} /> The local MCP bridge is installed separately. Enabling this switch does not register or launch an AI client.</div></div></div>}
        {settingsPage === "diagnostics" && <div className="settings-stack"><div className="surface-card"><h3>Connection</h3><div className="status-details"><span>Runtime</span><strong>{desktopRuntime() ? "Tauri" : "Browser preview"}</strong><span>Service</span><strong>{status ? "Connected" : "Offline"}</strong><span>Search</span><strong>{status?.raw.retrieval_engine === "qdrant_edge_hybrid" ? "Semantic + keyword (Qdrant)" : "Unavailable"}</strong><span>Indexed chunks</span><strong>{String(status?.raw.indexed_chunks ?? "—")}</strong><span>Version</span><strong>{status?.version || "Unknown"}</strong></div><Button kind="secondary" onClick={() => void refreshStatus()}>Run connection check</Button>{statusError && <p className="fine-print">{statusError}</p>}</div><div className="surface-card"><h3>Privacy status</h3><p>Diagnostics shown here contain no memory text. The local daemon owns its own sanitized logs.</p></div></div>}
        {settingsPage === "updates" && <div className="settings-stack"><div className="surface-card"><h3>Build information</h3><p>Rewind desktop shell 0.1.0 · local development build</p><div className="callout neutral"><Moon size={16} /> Automatic signed updates are not configured for this build.</div></div><div className="surface-card"><h3>Application</h3><p>Rewind runs as a menu-bar-style notch app. The dashboard stays hidden until you open it from the notch.</p><Button kind="secondary" onClick={() => void quitApp()}>Quit Rewind</Button></div></div>}
      </div></div>}
    </main>
    {showDelete && <div className="modal-backdrop" role="presentation" onMouseDown={() => !deleteBusy && setShowDelete(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Delete all local memory" onMouseDown={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">Permanent deletion</span><h2>Delete local memory?</h2></div><IconButton label="Close deletion dialog" onClick={() => setShowDelete(false)}><X size={20} /></IconButton></div><p>This pauses capture and removes the local archive and its derived records. It also clears reminders and identity notes stored by this shell. Backups outside this app may remain.</p><label className="field-label" htmlFor="delete-phrase">Type DELETE ALL LOCAL MEMORY to confirm</label><input className="confirm-input" id="delete-phrase" value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} autoComplete="off" />{deleteError && <div className="callout warning" role="alert">{deleteError}</div>}<div className="modal-actions"><Button kind="quiet" onClick={() => setShowDelete(false)}>Cancel</Button><Button disabled={deletePhrase !== "DELETE ALL LOCAL MEMORY" || deleteBusy} onClick={() => void performDelete()}>{deleteBusy ? "Deleting…" : "Delete all local memory"}</Button></div></div></div>}
    {showVoice && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowVoice(false)}><div className="modal voice-modal" role="dialog" aria-modal="true" aria-label="Voice scratchpad" onMouseDown={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">Voice</span><h2>Speak, then review</h2></div><IconButton label="Close voice" onClick={() => setShowVoice(false)}><X size={20} /></IconButton></div><VoicePanel enabled={preferences.microphoneConsent} onTranscript={(value) => { setVoiceText(value); setShowVoice(false); setPage("write"); }} /></div></div>}
  </div>;
}
