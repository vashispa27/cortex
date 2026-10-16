import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowLeft, ArrowRight, Bell, BookOpen, Check, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Copy, Database, ExternalLink, FileText, Orbit, Keyboard,
  LockKeyhole, MessageCircle, Mic, Moon, Pause, Play, Plus, Search, Settings2,
  ShieldCheck, Sparkles, Square, Trash2, UserRound, Volume2, WandSparkles, X,
} from "lucide-react";
import {
  deleteAllMemory, desktopRuntime, getServiceSettings, getSnapshot, getStatus, pauseCapture, patchSettings, recentMemory, requestCapturePermission,
  searchMemory, type MemoryHit, type SearchData, type ServiceStatus,
} from "./lib/api";
import { demoSearch, sampleMemories } from "./lib/demo";
import {
  dueOccurrence, loadPreferences, loadReminders, savePreferences,
  saveReminders, type Preferences, type Reminder,
} from "./lib/storage";
import { canApplyDraft, classifyWriting, draftSample, type WritingOperation } from "./lib/writing";
import mark from "./assets/open-memory-mark.svg";

type Page = "today" | "ask" | "memory" | "wiki" | "write" | "reminders" | "settings";
type SettingsPage = "account" | "capture" | "shortcuts" | "voice" | "appearance" | "memory" | "identity" | "notifications" | "connected" | "diagnostics" | "updates";
type ChatMessage = { role: "user" | "assistant"; body: string; hits?: MemoryHit[] };

const nav: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "today", label: "Today", icon: Activity },
  { id: "ask", label: "Ask Open Memory", icon: MessageCircle },
  { id: "memory", label: "Memory", icon: Database },
  { id: "wiki", label: "People & things", icon: BookOpen },
  { id: "write", label: "Write", icon: WandSparkles },
  { id: "reminders", label: "Reminders", icon: Bell },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const settingsNav: { id: SettingsPage; label: string }[] = [
  { id: "account", label: "Account" }, { id: "capture", label: "Capture & privacy" },
  { id: "shortcuts", label: "Shortcuts" }, { id: "voice", label: "Voice" },
  { id: "appearance", label: "Appearance" }, { id: "memory", label: "Memory" },
  { id: "identity", label: "Identity" }, { id: "notifications", label: "Notifications" },
  { id: "connected", label: "Connected AI apps" }, { id: "diagnostics", label: "Diagnostics" },
  { id: "updates", label: "Updates" },
];

function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
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

function EvidenceCard({ hit, onInspect }: { hit: MemoryHit; onInspect?: (hit: MemoryHit) => void }) {
  return <article className="evidence-card">
    <div className="evidence-meta"><span className="app-mark">{hit.app_id.slice(0, 1).toUpperCase()}</span><span>{hit.app_id}</span><span className="dot-separator">·</span><time>{formatTime(hit.observed_ms)}</time></div>
    <h3>{hit.title || "Untitled window"}</h3>
    <p>{hit.excerpt || "No text excerpt available."}</p>
    {hit.truncated && <small className="muted-text">Stored excerpt was truncated.</small>}
    {onInspect && hit.evidence_available && <button type="button" className="text-link" onClick={() => onInspect(hit)}>View source <ArrowRight size={14} /></button>}
  </article>;
}

function Onboarding({ preferences, setPreferences, onDone, status }: { preferences: Preferences; setPreferences: (value: Preferences) => void; onDone: () => void; status: ServiceStatus | null }) {
  const [step, setStep] = useState(0);
  const [sampleText, setSampleText] = useState("Please make this message sound warm and concise.");
  const steps = ["Welcome", "Privacy", "Connection", "Try writing", "Ready"];
  return <div className="onboarding-wrap"><div className="onboarding-card">
    <div className="onboarding-top"><span className="brand-inline"><img className="brand-icon" src={mark} alt="" /> open memory</span><span className="step-count">{step + 1} / {steps.length}</span></div>
    <div className="steps" aria-label="Onboarding progress">{steps.map((label, index) => <span key={label} className={index <= step ? "active" : ""} title={label} />)}</div>
    {step === 0 && <div className="onboarding-body"><span className="eyebrow">A quieter way to remember</span><h1>Your work has a story.<br /><em>Keep the useful parts.</em></h1><p>Open Memory is a desktop memory assistant. It can find what you saw, help draft text, and keep reminders close by.</p><div className="feature-grid"><span><Search size={18} /> Find the moment</span><span><WandSparkles size={18} /> Shape a draft</span><span><ShieldCheck size={18} /> Stay in control</span></div><div className="callout neutral">This build starts with capture off. The sample workspace contains invented data only.</div></div>}
    {step === 1 && <div className="onboarding-body"><span className="eyebrow">Your boundaries</span><h1>Memory is a choice.</h1><p>When enabled, the native service may read permitted foreground accessibility text and keep a local memory. Protected fields and excluded contexts should be skipped by the capture layer.</p><div className="privacy-tiles"><div><LockKeyhole size={20} /><strong>Local archive</strong><span>Memory stays on this device unless you explicitly use a connected service.</span></div><div><Pause size={20} /><strong>Pause anytime</strong><span>Capture consent, cloud inference, microphone use, and AI client access are separate choices.</span></div></div><Toggle checked={preferences.captureConsent} onChange={(value) => setPreferences({ ...preferences, captureConsent: value })} label="I understand the capture boundary" description="This records your choice in this shell; capture remains off until the native service can apply it." /></div>}
    {step === 2 && <div className="onboarding-body"><span className="eyebrow">Local connection</span><h1>{status ? "Service connected." : "Start with a sample."}</h1><p>{status ? "The local service is reachable. Background capture is still off unless the service reports it as enabled." : "The local memory service is not connected. You can explore with synthetic data, or finish setup and connect the service later."}</p><div className="connection-card"><span className={`status-light ${status ? "good" : ""}`} /><div><strong>{status ? "Local service online" : "Local service offline"}</strong><small>{desktopRuntime() ? "Desktop runtime" : "Browser preview"} · {status?.version ? `Version ${status.version}` : "No account needed for sample mode"}</small></div></div><Toggle checked={preferences.sampleMode} onChange={(value) => setPreferences({ ...preferences, sampleMode: value })} label="Explore sample workspace" description="Uses four invented observations. They are never added to your real memory." /></div>}
    {step === 3 && <div className="onboarding-body"><span className="eyebrow">A safe first draft</span><h1>Try it here.</h1><p>Type or select text in this tutorial field. The Write area lets you generate a local sample draft and apply it only if this field is unchanged.</p><textarea className="tutorial-field" value={sampleText} onChange={(event) => setSampleText(event.target.value)} aria-label="Tutorial writing field" /><div className="callout neutral"><Keyboard size={17} /> Global shortcuts and cross-app insertion need a validated native adapter. The tutorial changes only this field.</div></div>}
    {step === 4 && <div className="onboarding-body"><span className="eyebrow">All set</span><h1>A little less to hold in your head.</h1><p>Ask about recent work, browse evidence, try a draft, or schedule a reminder. The status badge always shows whether you are viewing sample data or the local service.</p><div className="ready-list"><span><Check size={18} /> Sample data: {preferences.sampleMode ? "on" : "off"}</span><span><Check size={18} /> Capture: off by default</span><span><Check size={18} /> Microphone: off by default</span></div></div>}
    <div className="onboarding-footer"><Button kind="quiet" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</Button><Button onClick={() => step === 4 ? onDone() : setStep(step + 1)}>{step === 4 ? "Open workspace" : "Continue"} <ArrowRight size={16} /></Button></div>
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
  const [page, setPage] = useState<Page>("today");
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("capture");
  const [search, setSearch] = useState("");
  const [memoryData, setMemoryData] = useState<SearchData | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [selectedEvidence, setSelectedEvidence] = useState<{ hit: MemoryHit; text: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [reminders, setRemindersState] = useState(loadReminders);
  const [notices, setNotices] = useState<string[]>([]);
  const [showVoice, setShowVoice] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [voiceText, setVoiceText] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
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
  useEffect(() => { void refreshStatus(); const interval = window.setInterval(refreshStatus, 30_000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { document.documentElement.style.fontSize = `${preferences.textScale}%`; document.documentElement.dataset.reduceMotion = String(preferences.reduceMotion); }, [preferences.textScale, preferences.reduceMotion]);
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
  useEffect(() => { if (page === "memory" && !memoryData) void runSearch("", true); }, [page, sample]);
  const inspectEvidence = async (hit: MemoryHit) => {
    if (sample) { setSelectedEvidence({ hit, text: hit.excerpt }); return; }
    try {
      const result = await getSnapshot(hit.snapshot_id);
      const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const rows = Array.isArray(data.results) ? data.results : Array.isArray(data.snapshots) ? data.snapshots : [];
      const first = rows[0] as Record<string, unknown> | undefined;
      setSelectedEvidence({ hit, text: String(first?.body ?? first?.text ?? first?.content ?? hit.excerpt) });
    } catch (error) { setSelectedEvidence({ hit, text: `Source unavailable: ${error instanceof Error ? error.message : String(error)}` }); }
  };
  const submitChat = async (event: FormEvent) => {
    event.preventDefault();
    const question = chatInput.trim(); if (!question || chatBusy) return;
    setMessages((current) => [...current, { role: "user", body: question }]); setChatInput(""); setChatBusy(true);
    try {
      const found = sample ? demoSearch(question) : await searchMemory(question, 5);
      const body = found.results.length
        ? sample
          ? `In the sample workspace, I found ${found.results.length} relevant ${found.results.length === 1 ? "source" : "sources"}. Open the evidence below to see the exact text.`
          : `I found ${found.results.length} local ${found.results.length === 1 ? "source" : "sources"}. This build does not have a grounded answer generator yet; inspect the source text below. Coverage may be partial.`
        : "I found no matching evidence in the available memory. This does not mean the event did not happen; capture may have been off, paused, or excluded.";
      setMessages((current) => [...current, { role: "assistant", body, hits: found.results }]);
    } catch (error) { setMessages((current) => [...current, { role: "assistant", body: `I could not search local memory: ${error instanceof Error ? error.message : String(error)}` }]); }
    finally { setChatBusy(false); }
  };

  const updateSetting = (changes: Partial<Preferences>) => {
    setPreferences({ ...preferences, ...changes }); setSettingsNotice("");
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
    if (!status || !preferences.captureConsent) return;
    try {
      if (status.permission !== "granted") {
        const permission = await requestCapturePermission();
        if (permission !== "granted") {
          setSettingsNotice("Grant Accessibility access to the Open Memory capture helper in macOS System Settings, then return and press Start capture.");
          await refreshStatus();
          return;
        }
      }
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
  const performDelete = async () => {
    if (deletePhrase !== "DELETE ALL LOCAL MEMORY" || !status) return;
    setDeleteBusy(true); setDeleteError("");
    try {
      const receipt = await deleteAllMemory();
      setReminders([]);
      setPreferences({ ...preferences, identity: "" });
      setMemoryData(null);
      setMessages([]);
      setSelectedEvidence(null);
      setShowDelete(false);
      setDeletePhrase("");
      setSettingsNotice(`Deleted ${receipt.deleted_snapshots} local source records. Memory epoch ${receipt.memory_epoch}; capture paused. Shell reminders and identity note were also cleared.`);
      await refreshStatus();
    } catch (error) { setDeleteError(error instanceof Error ? error.message : String(error)); }
    finally { setDeleteBusy(false); }
  };

  if (!preferences.onboardingComplete) return <Onboarding preferences={preferences} setPreferences={setPreferences} status={status} onDone={() => setPreferences({ ...preferences, onboardingComplete: true })} />;

  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-top"><button className="brand" onClick={() => setPage("today")} aria-label="Open Memory home"><img className="brand-icon" src={mark} alt="" /><span>open memory<span className="brand-dot">.</span></span></button><span className="edition">LOCAL PREVIEW</span></div><nav aria-label="Main navigation">{nav.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} onClick={() => setPage(id)}><Icon size={18} /><span>{label}</span>{id === "reminders" && notices.length > 0 && <span className="nav-count">{notices.length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="capture-card"><div className="capture-line"><span className={`status-light ${sample ? "sample" : status?.captureEnabled && !status.capturePaused ? "good" : ""}`} /><strong>{sample ? "Sample workspace" : status?.captureEnabled ? status.capturePaused ? "Capture paused" : "Capture on" : "Capture off"}</strong></div><p>{sample ? "Invented activity only" : status ? "Local service connected" : "Local service offline"}</p><button onClick={() => { setPage("settings"); setSettingsPage("capture"); }}>Manage privacy <ChevronRight size={14} /></button></div><div className="sidebar-footnote">Local-first memory, under your control.</div></div></aside>
    <main className="main"><header className="topbar"><div className="breadcrumb"><Orbit size={16} /><span>{nav.find((item) => item.id === page)?.label}</span></div><div className="topbar-actions"><span className={`top-status ${sample ? "sample" : status ? "online" : "offline"}`}><span className="status-light" />{sample ? "Sample data" : status ? "Local service" : "Offline"}</span><IconButton label="Open settings" onClick={() => setPage("settings")}><Settings2 size={18} /></IconButton></div></header>
      {page === "today" && <div className="page-content dashboard"><div className="welcome"><span className="eyebrow">Your space</span><h1>Good to see you<span className="accent">.</span></h1><p>{sample ? "Explore a small, invented workspace to see how memory could help." : status ? "Your local memory is ready when you are." : "Connect the local service or turn on sample mode to explore."}</p></div><div className="dashboard-grid"><button className="hero-action" onClick={() => setPage("ask")}><div className="hero-action-icon"><MessageCircle size={25} /></div><span>Ask your memory</span><h2>What was that thing<br />I saw earlier?</h2><span className="action-arrow"><ArrowRight size={20} /></span></button><div className="today-side"><button className="quick-card" onClick={() => setPage("write")}><WandSparkles size={22} /><strong>Help me write</strong><span>Make a draft and keep control of every edit.</span><ArrowRight size={17} /></button><button className="quick-card" onClick={() => setPage("reminders")}><Bell size={22} /><strong>Set a reminder</strong><span>Keep a small promise from slipping away.</span><ArrowRight size={17} /></button></div></div><div className="section-top recent-heading"><div><span className="eyebrow">A glance back</span><h2>Recent moments</h2></div><button className="text-link" onClick={() => setPage("memory")}>See memory <ArrowRight size={16} /></button></div>{sample ? <div className="moment-grid">{sampleMemories.slice(0, 3).map((hit) => <EvidenceCard hit={hit} key={hit.snapshot_id} onInspect={inspectEvidence} />)}</div> : <EmptyState icon={<Database size={25} />} title={status ? "No recent moments loaded" : "The local service is offline"} body={status ? "Open Memory to inspect recent local observations." : "Run the local service or enable sample mode under Settings → Account."} action={<Button kind="secondary" onClick={() => setPage("memory")}>Open memory</Button>} />}</div>}
      {page === "ask" && <div className="chat-page"><div className="chat-heading"><span className="eyebrow">Ask with evidence</span><h1>What’s on your mind?</h1><p>Search what was visible in permitted apps. Every source stays inspectable.</p></div><div className="chat-scroll">{messages.length === 0 ? <div className="chat-empty"><span className="chat-illustration"><Orbit size={36} /></span><h2>Start with a question.</h2><p>Try “What did Maya say about the review?” or “Find the accessibility checklist.”</p><div className="suggestions">{["What did Maya say about the review?", "Find the accessibility checklist", "What was in the project notes?"].map((prompt) => <button key={prompt} onClick={() => setChatInput(prompt)}>{prompt} <ArrowRight size={14} /></button>)}</div></div> : <div className="messages">{messages.map((message, index) => <div key={index} className={`message ${message.role}`}><div className="message-avatar">{message.role === "assistant" ? <Orbit size={17} /> : <UserRound size={17} />}</div><div className="message-content"><p>{message.body}</p>{message.hits && message.hits.length > 0 && <details className="sources" open><summary>Sources ({message.hits.length}) <ChevronDown size={15} /></summary><div className="source-list">{message.hits.map((hit) => <EvidenceCard key={hit.snapshot_id} hit={hit} onInspect={inspectEvidence} />)}</div></details>}</div></div>)}{chatBusy && <div className="message assistant"><div className="message-avatar"><Orbit size={17} /></div><div className="message-content">Searching local memory…</div></div>}</div>}</div><form className="chat-composer" onSubmit={submitChat}><div className="composer-box"><input aria-label="Ask Open Memory" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ask about something you saw…" /><button disabled={!chatInput.trim() || chatBusy} type="submit" aria-label="Send question"><ArrowRight size={19} /></button></div><small>{sample ? "Answers use invented sample evidence." : "Search results may be incomplete when capture was off or excluded."}</small></form></div>}
      {page === "memory" && <div className="page-content"><div className="page-heading"><span className="eyebrow">Your local archive</span><h1>Memory</h1><p>Search visible text with its source and time. Missing results are not proof an event did not happen.</p></div><form className="search-bar" onSubmit={(event) => { event.preventDefault(); void runSearch(search); }}><Search size={20} /><input aria-label="Search memory" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a topic, person, or phrase" /><Button type="submit" disabled={memoryBusy}>Search</Button></form><div className="results-top"><span>{memoryData ? `${memoryData.results.length} ${memoryData.results.length === 1 ? "result" : "results"}` : "Recent memory"}</span><button className="text-link" onClick={() => { setSearch(""); void runSearch("", true); }}>Recent activity</button></div>{memoryError ? <div className="callout warning">{memoryError}</div> : memoryBusy ? <div className="loading-state">Searching…</div> : memoryData?.results.length ? <div className="memory-list">{memoryData.results.map((hit) => <EvidenceCard key={hit.snapshot_id} hit={hit} onInspect={inspectEvidence} />)}</div> : <EmptyState icon={<Search size={25} />} title="Nothing found yet" body={sample ? "Try a word from the sample workspace, such as review, Maya, or accessibility." : "The service may be offline, or this topic may not have been captured."} />}{memoryData && <div className="coverage-note"><CircleHelp size={16} /> Coverage: {memoryData.coverage.state}{memoryData.coverage.reason ? ` · ${memoryData.coverage.reason.replaceAll("_", " ")}` : ""}</div>}</div>}
      {page === "wiki" && <div className="page-content"><div className="page-heading"><span className="eyebrow">Connections and context</span><h1>People & things</h1><p>Entity pages show facts only when they can link back to evidence.</p></div><div className="search-bar"><Search size={20} /><input aria-label="Search people and things" value={wikiQuery} onChange={(event) => setWikiQuery(event.target.value)} placeholder="Find a person, project, or place" /></div>{sample ? <div className="entity-grid">{[{ name: "Maya", type: "Person", body: "Mentioned the Thursday design review and onboarding copy.", ids: [101, 103] }, { name: "Ravi", type: "Person", body: "Expected to share a test plan.", ids: [103] }, { name: "Design review", type: "Project", body: "Moved to Thursday; accessibility pass remains open.", ids: [101] }].filter((entity) => `${entity.name} ${entity.type}`.toLowerCase().includes(wikiQuery.toLowerCase())).map((entity) => <article className="surface-card entity-card" key={entity.name}><span className="entity-icon"><UserRound size={22} /></span><span className="eyebrow">{entity.type}</span><h2>{entity.name}</h2><p>{entity.body}</p><details><summary>Evidence ({entity.ids.length})</summary>{entity.ids.map((id) => { const hit = sampleMemories.find((row) => row.snapshot_id === id)!; return <button className="text-link" key={id} onClick={() => inspectEvidence(hit)}>{hit.title} <ExternalLink size={13} /></button>; })}</details></article>)}</div> : <EmptyState icon={<BookOpen size={26} />} title="Entity wiki is not ready" body="The local service currently exposes source search. Entity extraction and evidence-linked pages are a later integration step." />}</div>}
      {page === "write" && <div className="page-content"><div className="page-heading"><span className="eyebrow">Thoughtful drafting</span><h1>Write with confidence</h1><p>Review a draft before it changes any text.</p></div><WritingSandbox initialText={voiceText} onOpenVoice={() => setShowVoice(true)} /></div>}
      {page === "reminders" && <RemindersPage reminders={reminders} setReminders={setReminders} notices={notices} />}
      {page === "settings" && <div className="settings-layout"><div className="settings-nav"><span className="eyebrow">Preferences</span><h1>Settings</h1>{settingsNav.map((item) => <button key={item.id} className={settingsPage === item.id ? "active" : ""} onClick={() => { setSettingsPage(item.id); setSettingsNotice(""); }}>{item.label}<ChevronRight size={15} /></button>)}</div><div className="settings-content"><span className="eyebrow">{settingsNav.find((item) => item.id === settingsPage)?.label}</span><h2>{settingsNav.find((item) => item.id === settingsPage)?.label}</h2>{settingsNotice && <div role="status" className="callout neutral">{settingsNotice}</div>}
        {settingsPage === "account" && <div className="settings-stack"><div className="surface-card"><h3>Workspace</h3><p>This independent build runs locally and has no account sign-in yet.</p><div className="connection-card"><span className={`status-light ${status ? "good" : ""}`} /><div><strong>{status ? "Local service connected" : "Local service offline"}</strong><small>{desktopRuntime() ? "Desktop app" : "Browser preview"}</small></div><Button kind="secondary" onClick={() => void refreshStatus()}>Retry</Button></div>{statusError && <small className="muted-text">{statusError}</small>}</div><div className="surface-card"><h3>Sample workspace</h3><Toggle checked={sample} onChange={(value) => updateSetting({ sampleMode: value })} label="Use invented sample data" description="Clearly marked examples for exploring the interface." /><Button kind="quiet" onClick={() => updateSetting({ onboardingComplete: false })}>Replay onboarding</Button></div></div>}
        {settingsPage === "capture" && <div className="settings-stack">
          <div className="callout neutral"><ShieldCheck size={18} /> macOS capture starts only after your choice and Accessibility permission. Known browsers and credential apps are skipped in this version.</div>
          <div className="surface-card"><h3>Current state</h3><div className="status-details"><span>Service</span><strong>{status ? "Connected" : "Offline"}</strong><span>Capture</span><strong>{status?.captureRequested ? status.permission !== "granted" ? "Permission needed" : status.capturePaused ? "Paused" : "On" : "Off"}</strong><span>Accessibility permission</span><strong>{status?.permission || "Unknown"}</strong></div><div className="manage-actions"><Button disabled={!status || !preferences.captureConsent || Boolean(status.captureRequested)} onClick={() => void startCapture()}><Play size={16} /> Start capture</Button><Button kind="secondary" disabled={!status || !status.captureRequested || status.permission !== "granted"} onClick={() => void togglePause()}>{status?.capturePaused ? <Play size={16} /> : <Pause size={16} />}{status?.capturePaused ? "Resume" : "Pause"}</Button><Button kind="secondary" disabled={!status || !status.captureRequested} onClick={() => void stopCapture()}><Square size={16} /> Stop capture</Button></div></div>
          <div className="surface-card"><h3>Consent & exclusions</h3><Toggle checked={preferences.captureConsent} onChange={(value) => { if (!value && status?.captureRequested) void stopCapture().then((stopped) => { if (stopped) updateSetting({ captureConsent: false }); }); else updateSetting({ captureConsent: value }); }} label="I consent to local macOS capture" description="You must also press Start capture. Turning this off stops capture." /><label className="field-label" htmlFor="excluded-apps">Excluded apps</label><textarea id="excluded-apps" value={preferences.excludedApps} onChange={(event) => updateSetting({ excludedApps: event.target.value })} placeholder="One bundle ID per line, e.g. com.example.app" /><label className="field-label" htmlFor="excluded-domains">Excluded domains</label><textarea id="excluded-domains" value={preferences.excludedDomains} onChange={(event) => updateSetting({ excludedDomains: event.target.value })} placeholder="One domain per line" /><p className="fine-print">Press Save exclusions to apply these lists to the local service. Browser capture is currently skipped entirely.</p><Button kind="secondary" disabled={!status} onClick={() => void saveCaptureExclusions()}>Save exclusions</Button></div>
          <div className="surface-card"><h3>Background processing</h3><Toggle checked={preferences.backgroundInference} onChange={(value) => updateSetting({ backgroundInference: value })} label="Background cloud inference consent" description="A separate consent flag. No cloud inference route is connected in this build." /></div>
        </div>}
        {settingsPage === "shortcuts" && <div className="settings-stack"><div className="surface-card"><h3>Keyboard</h3><p>Global key recognition needs native platform hooks and target validation. The writing sandbox is available now by opening Write.</p><div className="shortcut-row"><span>Open this app</span><kbd>Use your OS launcher</kbd></div><div className="shortcut-row"><span>Submit a memory search</span><kbd>Return</kbd></div></div></div>}
        {settingsPage === "voice" && <div className="settings-stack"><div className="surface-card"><h3>Microphone</h3><Toggle checked={preferences.microphoneConsent} onChange={(value) => updateSetting({ microphoneConsent: value })} label="Allow microphone requests" description="The browser or OS still asks permission when you press Record." /><Button kind="secondary" onClick={() => setShowVoice(true)}><Mic size={16} /> Open voice scratchpad</Button></div><div className="callout neutral">Audio is not uploaded. Transcription and insertion are unavailable until an authenticated speech service and native target validation are connected.</div></div>}
        {settingsPage === "appearance" && <div className="settings-stack"><div className="surface-card"><h3>Display</h3><label className="field-label" htmlFor="text-scale">Text size: {preferences.textScale}%</label><input id="text-scale" type="range" min="85" max="130" step="5" value={preferences.textScale} onChange={(event) => updateSetting({ textScale: Number(event.target.value) })} /><Toggle checked={preferences.reduceMotion} onChange={(value) => updateSetting({ reduceMotion: value })} label="Reduce motion" description="Stops decorative animation." /><label className="field-label" htmlFor="edge-placement">Preferred edge</label><select id="edge-placement" value={preferences.edge} onChange={(event) => updateSetting({ edge: event.target.value as "left" | "right" })}><option value="right">Right</option><option value="left">Left</option></select><p className="fine-print">Edge placement and hover opening will apply to a future native edge panel.</p><Toggle checked={preferences.hoverOpen} onChange={(value) => updateSetting({ hoverOpen: value })} label="Open panel on hover" disabled description="Requires a native edge handle." /></div></div>}
        {settingsPage === "memory" && <div className="settings-stack"><div className="surface-card"><h3>Archive</h3><div className="status-details"><span>Indexed observations</span><strong>{status?.indexedCount ?? "Unknown"}</strong><span>Storage</span><strong>Local service</strong></div><label className="field-label" htmlFor="retention">Preferred retention</label><select id="retention" value={preferences.retentionDays} onChange={(event) => updateSetting({ retentionDays: Number(event.target.value) })}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select><p className="fine-print">Retention is a shell preference until the daemon supports policy updates.</p></div><div className="surface-card"><h3>Manage data</h3><p>Inspect source evidence or delete the local archive. Export is not yet available.</p><div className="manage-actions"><Button kind="secondary" onClick={() => setPage("memory")}>Inspect memory <ArrowRight size={15} /></Button><Button kind="secondary" disabled={!status} onClick={() => setShowDelete(true)}><Trash2 size={15} /> Delete all memory</Button></div></div></div>}
        {settingsPage === "identity" && <div className="settings-stack"><div className="surface-card"><h3>About you</h3><p>Write a note about how you prefer to communicate. This stays in this shell and is not sent to an AI model.</p><label className="field-label" htmlFor="identity">My context</label><textarea id="identity" className="identity-field" value={preferences.identity} onChange={(event) => updateSetting({ identity: event.target.value })} placeholder="I prefer concise, warm writing…" /></div></div>}
        {settingsPage === "notifications" && <div className="settings-stack"><div className="surface-card"><h3>Proactive messages</h3><Toggle checked={preferences.proactive} onChange={(value) => updateSetting({ proactive: value })} label="Allow evidence-backed nudges" description="Saved as a preference. Automatic nudge generation is not active in this build." /><p>Scheduled reminders you create appear in the app while it is open.</p><Button kind="secondary" onClick={() => setPage("reminders")}>Open reminders</Button></div></div>}
        {settingsPage === "connected" && <div className="settings-stack"><div className="surface-card"><h3>AI clients</h3><p>External AI clients can receive local memory only after a separate, explicit setup. No clients are connected from this UI.</p><Toggle checked={status ? preferences.mcpConsent : false} onChange={(value) => void updateMcpConsent(value)} disabled={!status} label="Allow MCP memory access" description="Effective daemon setting. Separate from capture and cloud inference; client registration still requires an explicit action." /><div className="callout neutral"><LockKeyhole size={16} /> The local MCP bridge is installed separately. Enabling this switch does not register or launch an AI client.</div></div></div>}
        {settingsPage === "diagnostics" && <div className="settings-stack"><div className="surface-card"><h3>Connection</h3><div className="status-details"><span>Runtime</span><strong>{desktopRuntime() ? "Tauri" : "Browser preview"}</strong><span>Service</span><strong>{status ? "Connected" : "Offline"}</strong><span>Version</span><strong>{status?.version || "Unknown"}</strong></div><Button kind="secondary" onClick={() => void refreshStatus()}>Run connection check</Button>{statusError && <p className="fine-print">{statusError}</p>}</div><div className="surface-card"><h3>Privacy status</h3><p>Diagnostics shown here contain no memory text. The local daemon owns its own sanitized logs.</p></div></div>}
        {settingsPage === "updates" && <div className="settings-stack"><div className="surface-card"><h3>Build information</h3><p>Desktop shell 0.1.0 · local development build</p><div className="callout neutral"><Moon size={16} /> Automatic signed updates are not configured for this build.</div></div></div>}
      </div></div>}
    </main>
    {selectedEvidence && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedEvidence(null)}><div className="modal" role="dialog" aria-modal="true" aria-label="Source evidence" onMouseDown={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">Stored evidence</span><h2>{selectedEvidence.hit.title}</h2></div><IconButton label="Close evidence" onClick={() => setSelectedEvidence(null)}><X size={20} /></IconButton></div><div className="evidence-meta"><span>{selectedEvidence.hit.app_id}</span><span>·</span><time>{formatTime(selectedEvidence.hit.observed_ms)}</time></div><div className="source-text">{selectedEvidence.text}</div><p className="fine-print">Visible text is a partial observation, not a complete record of what happened.</p></div></div>}
    {showDelete && <div className="modal-backdrop" role="presentation" onMouseDown={() => !deleteBusy && setShowDelete(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Delete all local memory" onMouseDown={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">Permanent deletion</span><h2>Delete local memory?</h2></div><IconButton label="Close deletion dialog" onClick={() => setShowDelete(false)}><X size={20} /></IconButton></div><p>This pauses capture and removes the local archive and its derived records. It also clears reminders and identity notes stored by this shell. Backups outside this app may remain.</p><label className="field-label" htmlFor="delete-phrase">Type DELETE ALL LOCAL MEMORY to confirm</label><input className="confirm-input" id="delete-phrase" value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} autoComplete="off" />{deleteError && <div className="callout warning" role="alert">{deleteError}</div>}<div className="modal-actions"><Button kind="quiet" onClick={() => setShowDelete(false)}>Cancel</Button><Button disabled={deletePhrase !== "DELETE ALL LOCAL MEMORY" || deleteBusy} onClick={() => void performDelete()}>{deleteBusy ? "Deleting…" : "Delete all local memory"}</Button></div></div></div>}
    {showVoice && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowVoice(false)}><div className="modal voice-modal" role="dialog" aria-modal="true" aria-label="Voice scratchpad" onMouseDown={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">Voice</span><h2>Speak, then review</h2></div><IconButton label="Close voice" onClick={() => setShowVoice(false)}><X size={20} /></IconButton></div><VoicePanel enabled={preferences.microphoneConsent} onTranscript={(value) => { setVoiceText(value); setShowVoice(false); setPage("write"); }} /></div></div>}
  </div>;
}
