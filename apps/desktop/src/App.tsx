import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowRight, Bell, Bot, Check, ChevronRight,
  Clock3, Database, Orbit, House,
  LockKeyhole, MessageCircle, Moon, Pause, Play, Settings2,
  ShieldCheck, Trash2, X,
} from "lucide-react";
import {
  deleteAllMemory, desktopRuntime, getServiceSettings, getStatus, pauseCapture, patchSettings, recentMemory, requestCapturePermission, resetEvalData,
  searchMemory, type SearchData, type ServiceStatus,
} from "./lib/api";
import { demoSearch } from "./lib/demo";
import { loadPreferences, savePreferences, type Preferences, type CortexTrigger } from "./lib/storage";
import { testConnection, validLocalEndpoint } from "./lib/provider";
import { engineChanges, engineSettingsFor } from "./lib/layers";
import LayerSettings from "./components/LayerSettings";
import { configureNotchDisplay, configureCortexTrigger, configureTestMode, openMain, previewNotch, quitApp, setNotchVisible } from "./lib/notch";
import { saveSessions, triggerName } from "./lib/cortex";
import type { Page, SettingsPage } from "./lib/types";
import { HomeDashboard, TimelinePage } from "./Dashboard";
import CortexMark from "./components/CortexMark";
import { WorkspaceBoundary } from "./components/WorkspaceBoundary";
import AskChat from "./components/AskChat";
const ScheduledTasksPage = lazy(() => import("./components/ScheduledTasksPage"));
const MemoriesPage = lazy(() => import("./components/MemoriesPage").then(module => ({ default: module.MemoriesPage })));
const AgentsPage = lazy(() => import("./components/AgentsPage"));
const AgentSpacePage = lazy(() => import("./components/AgentSpacePage"));
import { resolvePage, savePage } from "./lib/navigation";
import { scheduleService, type Schedule } from "./lib/schedules";
const McpSetup = lazy(() => import("./components/McpSetup"));

const navGroups: { label: string; items: { id: Page; label: string; icon: typeof House }[] }[] = [
  { label: "Overview", items: [
    { id: "today", label: "Home", icon: House },
    { id: "timeline", label: "Timeline", icon: Clock3 },
  ] },
  { label: "Workspace", items: [
    { id: "scheduled", label: "Reminders", icon: Bell },
    { id: "ask", label: "Ask Cortex", icon: MessageCircle },
    { id: "memories", label: "Memories", icon: Database },
    { id: "jobs", label: "Agents", icon: Bot },
    { id: "agents", label: "Agent Space", icon: Check },
  ] },
  { label: "System", items: [
    { id: "settings", label: "Settings", icon: Settings2 },
  ] },
];
const navItems = navGroups.flatMap((group) => group.items);

const settingsNav: { id: SettingsPage; label: string }[] = [
  { id: "account", label: "Account" }, { id: "ai", label: "AI model" }, { id: "capture", label: "Capture & privacy" },
  { id: "notch", label: "Cortex & notch" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "appearance", label: "Appearance" }, { id: "memory", label: "Memory" },
  { id: "identity", label: "Identity" }, { id: "notifications", label: "Notifications" },
  { id: "connected", label: "Connected AI apps" }, { id: "diagnostics", label: "Diagnostics" },
  { id: "updates", label: "Updates" },
];

function initialPage(): Page {
  return resolvePage(new URLSearchParams(window.location.search).get("page") ?? localStorage.getItem("cortex.workspace.page.v1"));
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
      setError(`Could not connect to Cortex: ${err instanceof Error ? err.message : String(err)}. Try again.`);
    }
  };
  return <div className="onboarding-wrap"><div className="onboarding-card">
    <div className="onboarding-top"><span className="brand-inline"><CortexMark className="brand-icon" /> Cortex</span></div>
    <div className="onboarding-body"><span className="eyebrow">Welcome to Cortex</span><h1>Let Cortex remember<br /><em>what you see.</em></h1>
      <p>Allow Accessibility access so Cortex can read text in the foreground app and save it locally. Normal browser windows can be read; private/incognito windows, credential apps and protected fields are skipped. You can pause or stop capture anytime.</p>
      <div className="callout neutral"><ShieldCheck size={18} /> When you ask a question, relevant saved text is sent to your chosen OpenRouter model.</div>
      {waiting && <div className="callout neutral">Waiting for Accessibility permission. Enable <strong>Cortex</strong> in macOS System Settings; capture will start automatically.</div>}
      {waiting && <div className="manage-actions"><Button kind="secondary" onClick={() => void invoke("open_accessibility_settings")}>Open Accessibility settings</Button><Button kind="secondary" onClick={() => void invoke("reveal_cortex_app")}>Show Cortex in Finder</Button></div>}
      {error && <p role="alert">{error}</p>}
    </div>
    <div className="onboarding-footer"><Button kind="quiet" onClick={() => onDone(false)}>Not now</Button><Button disabled={waiting} onClick={() => void begin()}>{waiting ? "Waiting for permission…" : "Allow & start"} <ArrowRight size={16} /></Button></div>
  </div></div>;
}

export default function App() {
  const mainRef = useRef<HTMLElement>(null);
  const [preferences, setPreferencesState] = useState(loadPreferences);
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [page, setPage] = useState<Page>(initialPage);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("capture");
  const [memoryData, setMemoryData] = useState<SearchData | null>(null);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [memoryError, setMemoryError] = useState("");
  const [chatCount, setChatCount] = useState(0);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [evalDir, setEvalDir] = useState("");
  const [confirmEvalReset, setConfirmEvalReset] = useState(false);
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [hasOpenrouterKey, setHasOpenrouterKey] = useState(false);
  const [localTesting, setLocalTesting] = useState(false);
  const [localTestResult, setLocalTestResult] = useState("");
  const [modelDraft, setModelDraft] = useState(() => loadPreferences().openrouterModel);
  const sample = preferences.sampleMode;

  const setPreferences = (value: Preferences) => { setPreferencesState(value); savePreferences(value); };
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
  useEffect(() => { void configureCortexTrigger(preferences.cortexTrigger, preferences.cortexHotkey); }, [preferences.cortexTrigger, preferences.cortexHotkey]);
  useEffect(() => {
    void configureNotchDisplay(preferences.showOverFullScreen);
  }, [preferences.showOverFullScreen]);
  useEffect(() => { savePage(page); mainRef.current?.scrollTo(0, 0); }, [page]);
  useEffect(() => {
    const restore = () => setPage(resolvePage(new URLSearchParams(window.location.search).get("page")));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    let disposed = false;
    const load = () => void scheduleService.list({ limit: 100 }).then(result => { if (!disposed) setSchedules(result.items); }).catch(() => {});
    load(); const timer = window.setInterval(load, 15000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!desktopRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<string>("navigate", (event) => {
      const target = event.payload;
      if (target === "ask") window.dispatchEvent(new Event("cortex:handoff"));
      if (target === "jobs") window.dispatchEvent(new Event("cortex:agent-draft"));
      if (target === "settings") setSettingsPage("notch");
      setPage(resolvePage(target));
    }).then((off) => {
      if (disposed) off();
      else unlisten = off;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);
  const runSearch = async (query: string, recent = false) => {
    setMemoryBusy(true); setMemoryError("");
    try { setMemoryData(sample ? demoSearch(recent ? "" : query) : recent ? await recentMemory() : await searchMemory(query)); }
    catch (error) { setMemoryError(error instanceof Error ? error.message : String(error)); setMemoryData(null); }
    finally { setMemoryBusy(false); }
  };
  useEffect(() => { if ((page === "today" || page === "timeline") && !memoryData) void runSearch("", true); }, [page, sample]);
  const updateSetting = (changes: Partial<Preferences>) => {
    setPreferences({ ...preferences, ...changes }); setSettingsNotice("");
  };
  // Contextual indexing runs inside the engine, so it gets its slice of these choices pushed to it.
  useEffect(() => {
    if (!desktopRuntime() || !status || preferences.sampleMode) return;
    const desired = engineSettingsFor(preferences);
    const timer = window.setTimeout(async () => {
      try {
        const changes = engineChanges(desired, await getServiceSettings());
        // A half-typed address is not sent; the engine refuses anything but this Mac.
        if (changes.local_endpoint !== undefined && changes.local_endpoint !== "" && !validLocalEndpoint(changes.local_endpoint)) delete changes.local_endpoint;
        if (!Object.keys(changes).length) return;
        const next = await patchSettings(changes);
        if (next.reindex) setSettingsNotice("Contextual indexing is on. Cortex is re-indexing your memory once; search may be slow for a minute.");
      } catch (error) { setSettingsNotice(`Could not apply the contextual indexing settings: ${error instanceof Error ? error.message : String(error)}`); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [status !== null, preferences.sampleMode, preferences.localOnly, preferences.contextEnabled, preferences.layers.context, preferences.aiProvider, preferences.localEndpoint, preferences.localModel]);
  const runLocalTest = async () => {
    // The connection test is about the local server itself, whichever steps use it.
    const target = { model: preferences.localModel.trim(), endpoint: preferences.localEndpoint.trim() || null, local: true };
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
    if (deletePhrase !== "DELETE CAPTURED ACTIVITY" || !status) return;
    setDeleteBusy(true); setDeleteError("");
    try {
      const receipt = await deleteAllMemory();
      setPreferences({ ...preferences, identity: "" });
      setMemoryData(null);
      saveSessions([]);
      setShowDelete(false);
      setDeletePhrase("");
      setSettingsNotice(`Deleted ${receipt.deleted_snapshots} local source records. Memory epoch ${receipt.memory_epoch}; capture paused. The identity note was also cleared.`);
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
    setPage("memories");
    window.history.replaceState(null, "", `?page=memories&tab=recent&query=${encodeURIComponent(query)}`);
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
    <aside className="sidebar"><div className="sidebar-top"><button className="brand" onClick={() => setPage("today")} aria-label="Cortex home"><CortexMark className="brand-icon" /><span>Cortex<span className="brand-dot">.</span></span></button><span className="edition">LOCAL PREVIEW</span></div><nav aria-label="Main navigation">{navGroups.map((group) => <div className="nav-group" key={group.label}><span className="nav-group-label">{group.label}</span>{group.items.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${page === id ? "active" : ""}`} aria-current={page === id ? "page" : undefined} title={label} onClick={() => setPage(id)}><Icon size={18} /><span>{label}</span></button>)}</div>)}</nav><div className="sidebar-bottom"><div className="capture-card"><div className="capture-line"><span className={`status-light ${sample ? "sample" : status?.captureEnabled && !status.capturePaused ? "good" : ""}`} /><strong>{sample ? "Sample workspace" : status?.captureEnabled ? status.capturePaused ? "Capture paused" : "Capture on" : "Capture off"}</strong></div><p>{sample ? "Invented activity only" : status ? "Local service connected" : "Local service offline"}</p><button onClick={() => openSettingsPage("capture")}>Manage privacy <ChevronRight size={14} /></button></div><div className="sidebar-footnote">Local-first memory, under your control.</div></div></aside>
    <main ref={mainRef} className="main"><header className="topbar"><div className="breadcrumb"><Orbit size={16} /><span>{navItems.find((item) => item.id === page)?.label}</span></div><div className="topbar-actions"><span className={`top-status ${sample ? "sample" : status ? "online" : "offline"}`}><span className="status-light" />{sample ? "Sample data" : status ? "Local service" : "Offline"}</span><IconButton label="Open Cortex" onClick={() => void previewNotch("compose")}><CortexMark className="topbar-cortex" /></IconButton><IconButton label="Open settings" onClick={() => setPage("settings")}><Settings2 size={18} /></IconButton></div></header>
      {page === "today" && <HomeDashboard sample={sample} status={status} preferences={preferences} schedules={schedules} hits={memoryData?.results ?? []} busy={memoryBusy} error={memoryError} chatCount={chatCount} onNavigate={setPage} onSettings={openSettingsPage} onSearch={searchFromDashboard} onToggleCapture={() => void toggleCaptureFromDashboard()} onUpdatePreferences={updateSetting} onSetDropVisible={setDropVisible} onPreviewNotch={(mode) => void previewNotch(mode)} />}
      {page === "timeline" && <TimelinePage sample={sample} hits={memoryData?.results ?? []} busy={memoryBusy} error={memoryError} onCortex={() => setPage("memories")} />}
      <WorkspaceBoundary key={page}><Suspense fallback={<div className="loading-state" role="status">Opening workspace…</div>}>
        {page === "scheduled" && <ScheduledTasksPage />}
        {page === "memories" && <MemoriesPage />}
        {page === "jobs" && <AgentsPage />}
        {page === "agents" && <AgentSpacePage onConnect={() => openSettingsPage("connected")} />}
      </Suspense></WorkspaceBoundary>
      <div hidden={page !== "ask"} className="chat-host"><AskChat sample={sample} active={page === "ask"} onSessionCount={setChatCount} /></div>
      {page === "settings" && <div className="settings-layout"><div className="settings-nav"><span className="eyebrow">Preferences</span><h1>Settings</h1>{settingsNav.map((item) => <button key={item.id} className={settingsPage === item.id ? "active" : ""} onClick={() => { setSettingsPage(item.id); setSettingsNotice(""); }}>{item.label}<ChevronRight size={15} /></button>)}</div><div className="settings-content"><span className="eyebrow">{settingsNav.find((item) => item.id === settingsPage)?.label}</span><h2>{settingsNav.find((item) => item.id === settingsPage)?.label}</h2>{settingsNotice && <div role="status" className="callout neutral">{settingsNotice}</div>}
        {settingsPage === "account" && <div className="settings-stack"><div className="surface-card"><h3>Workspace</h3><p>This independent build runs locally and has no account sign-in yet.</p><div className="connection-card"><span className={`status-light ${status ? "good" : ""}`} /><div><strong>{status ? "Local service connected" : "Local service offline"}</strong><small>{desktopRuntime() ? "Desktop app" : "Browser preview"}</small></div><Button kind="secondary" onClick={() => void refreshStatus()}>Retry</Button></div>{statusError && <small className="muted-text">{statusError}</small>}</div><div className="surface-card"><h3>Sample workspace</h3><Toggle checked={sample} onChange={(value) => updateSetting({ sampleMode: value })} label="Use invented sample data" description="Clearly marked examples for exploring the interface." /><Button kind="quiet" onClick={() => updateSetting({ onboardingComplete: false, captureSetupComplete: false })}>Replay onboarding</Button></div></div>}
        {settingsPage === "ai" && <div className="settings-stack">
          <div className="surface-card"><h3>Privacy</h3>
            <Toggle checked={preferences.localOnly} onChange={(value) => { updateSetting({ localOnly: value }); setLocalTestResult(""); }} label="Local only: never use the cloud" description="Answers also run on the local model on this Mac, so nothing you capture or ask is sent to OpenRouter. Answers may be rougher than a cloud model's." />
          </div>
          <LayerSettings preferences={preferences} hasKey={hasOpenrouterKey} onChange={updateSetting} />
          <div className="surface-card"><h3>Local model</h3>
              <p>Any server on this Mac that speaks the OpenAI chat API: <code>mlx_lm.server</code>, Ollama or LM Studio. Used by follow-up questions, reminders and contextual indexing, and by answers when they run on this Mac.</p>
              <label className="field-label" htmlFor="local-endpoint">Server address</label>
              <input id="local-endpoint" value={preferences.localEndpoint} onChange={(event) => { updateSetting({ localEndpoint: event.target.value }); setLocalTestResult(""); }} placeholder="http://127.0.0.1:8080/v1" autoComplete="off" />
              <p className="fine-print">mlx_lm.server: http://127.0.0.1:8080/v1 · Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1. Only addresses on this Mac are accepted.</p>
              <label className="field-label" htmlFor="local-model">Model name</label>
              <input id="local-model" value={preferences.localModel} onChange={(event) => { updateSetting({ localModel: event.target.value.trim() }); setLocalTestResult(""); }} placeholder="mlx-community/Qwen3.5-2B-4bit" autoComplete="off" />
              <p className="fine-print">Use the name the server lists: the --model value for mlx_lm.server, or the tag from <code>ollama list</code>, such as qwen3:4b.</p>
              <div className="manage-actions"><Button disabled={!desktopRuntime() || localTesting} onClick={() => void runLocalTest()}>{localTesting ? "Testing…" : "Test connection"}</Button></div>
              {localTestResult && <p className="fine-print" role="status">{localTestResult}</p>}
            </div>
          <div className="surface-card"><h3>OpenRouter</h3><p>The OpenRouter model for answers when they run in the cloud. Your API key is stored in a private local file on this Mac, without Keychain. It is not encrypted.</p><label className="field-label" htmlFor="openrouter-model">Model ID</label><input id="openrouter-model" value={modelDraft} onChange={(event) => setModelDraft(event.target.value)} placeholder="provider/model-name" autoComplete="off" /><label className="field-label" htmlFor="openrouter-key">OpenRouter API key</label><input id="openrouter-key" type="password" value={openrouterKey} onChange={(event) => setOpenrouterKey(event.target.value)} placeholder={hasOpenrouterKey ? "Key saved — enter a new key to replace it" : "Paste your OpenRouter API key"} autoComplete="off" /><p className="fine-print">{hasOpenrouterKey ? "A key is saved." : "No key saved yet."}</p><div className="manage-actions"><Button disabled={!desktopRuntime()} onClick={() => void saveModel()}>Save model settings</Button>{hasOpenrouterKey && <Button kind="secondary" onClick={() => void invoke("openrouter_delete_key").then(() => { setHasOpenrouterKey(false); setSettingsNotice("Local OpenRouter key removed."); }).catch(() => setSettingsNotice("Could not remove the local key."))}>Remove key</Button>}</div></div>
          <div className="callout neutral"><ShieldCheck size={18} /> Answers in the cloud send the text listed under Answers to OpenRouter and the model provider you chose. Review their privacy and data policies before using it. Everything else, including memory search and tool use, stays on this Mac.</div>
        </div>}
        {settingsPage === "capture" && <div className="settings-stack">
          <div className="callout neutral"><ShieldCheck size={18} /> macOS capture starts only after your choice and Accessibility permission. Normal browser windows can be read; private/incognito windows, credential apps, and protected fields are skipped.</div>
          <div className="surface-card"><h3>Capture</h3><Toggle checked={Boolean(status?.captureRequested)} disabled={!status} onChange={(value) => { if (value) void startCapture(); else void stopCapture(); }} label="Capture memory" description={status?.permission !== "granted" && status?.captureRequested ? "Accessibility permission needed." : "Read foreground app text and store it locally."} /><div className="status-details"><span>Service</span><strong>{status ? "Connected" : "Offline"}</strong><span>Accessibility permission</span><strong>{status?.permission || "Unknown"}</strong></div>{status?.captureRequested && <Button kind="secondary" disabled={status.permission !== "granted"} onClick={() => void togglePause()}>{status.capturePaused ? <Play size={16} /> : <Pause size={16} />}{status.capturePaused ? "Resume" : "Pause"}</Button>}</div>
          <div className="surface-card"><h3>Test mode</h3><Toggle checked={testMode} disabled={!status} onChange={(value) => void changeTestMode(value)} label="Evaluate against a separate archive" description="Every question you ask is answered from the eval archive instead of your real memory, and a play/pause button appears in the notch to record the current screen into it. Nothing recorded here touches your real memory." />{testMode && <div className="status-details"><span>Eval archive</span><strong>{status?.indexedCount ?? 0} captures</strong><span>Location</span><strong>{evalDir || "Unknown"}</strong><span>Logs</span><strong>captures.jsonl (cleaned text and chunks), queries.jsonl</strong></div>}{testMode && (confirmEvalReset ? <div style={{ display: "flex", gap: 8, marginTop: 12 }}><Button kind="secondary" onClick={() => void eraseEvalData()}>Erase eval archive</Button><Button kind="quiet" onClick={() => setConfirmEvalReset(false)}>Cancel</Button></div> : <Button kind="secondary" onClick={() => setConfirmEvalReset(true)}>Reset eval archive…</Button>)}</div>
          <div className="surface-card"><h3>Exclusions</h3><label className="field-label" htmlFor="excluded-apps">Excluded apps</label><textarea id="excluded-apps" value={preferences.excludedApps} onChange={(event) => updateSetting({ excludedApps: event.target.value })} placeholder="One bundle ID per line, e.g. com.example.app" /><label className="field-label" htmlFor="excluded-domains">Excluded domains</label><textarea id="excluded-domains" value={preferences.excludedDomains} onChange={(event) => updateSetting({ excludedDomains: event.target.value })} placeholder="One domain per line" /><p className="fine-print">Private/incognito windows are skipped because their state cannot be verified reliably. Add domains here to exclude specific browser sites.</p><Button kind="secondary" disabled={!status} onClick={() => void saveCaptureExclusions()}>Save exclusions</Button></div>
          <div className="surface-card"><h3>AI answers</h3><p>Configure OpenRouter under AI model. Captured text is sent only when you ask a question.</p><Button kind="secondary" onClick={() => setSettingsPage("ai")}>Open AI model settings</Button></div>
        </div>}
        {settingsPage === "notch" && <div className="settings-stack">
          <div className="callout neutral"><CortexMark className="settings-cortex" /> Cortex lives in the notch. Click the logo for a quick question, or the chat bubble to browse every session.</div>
          <div className="surface-card"><h3>The drop</h3>
            <Toggle checked={!preferences.hideDrop} onChange={(visible) => { setDropVisible(visible); setSettingsNotice(visible ? "Cortex is visible on the notch." : "Cortex is hidden. You can bring it back here."); }} label="Show Cortex on the notch" description="Keeps a small cortex mark and chat button beside the camera. Chat and typing panels open below the notch." />
            <Toggle checked={preferences.cortexHotkey} onChange={(value) => { updateSetting({ cortexHotkey: value }); void configureCortexTrigger(preferences.cortexTrigger, value); }} label="Double-tap to cortex" description="Start a new chat from any app without touching the notch." />
            <label className="field-label" htmlFor="cortex-trigger">Cortex key</label>
            <select id="cortex-trigger" value={preferences.cortexTrigger} onChange={(event) => { const value = event.target.value as CortexTrigger; updateSetting({ cortexTrigger: value }); void configureCortexTrigger(value, preferences.cortexHotkey); }}>
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
            {(preferences.cortexTrigger === "rightCommand" || preferences.cortexTrigger === "leftCommand") && <p className="fine-print">Double-tapping Command can also be the macOS Dictation shortcut. Check System Settings → Keyboard → Dictation → Shortcut so the two do not collide. Shortcuts such as ⌘C never count as taps.</p>}
            {preferences.cortexTrigger === "fn" && <p className="fine-print">Globe / Fn may be set to show emoji, change the input source or start dictation (System Settings → Keyboard → “Press 🌐 key to”). A double-tap runs that action as well.</p>}
            <p className="fine-print">Double-tap the selected key. The notch shows × 1 on the first tap, then × 2 opens a fresh single-entry prompt. macOS may ask for Input Monitoring or Accessibility permission. Current trigger: {triggerName(preferences.cortexTrigger)}.</p>
          </div>
          <div className="surface-card"><h3>Display</h3><Toggle checked={preferences.showOverFullScreen} onChange={(value) => updateSetting({ showOverFullScreen: value })} label="Show the notch over full-screen apps" description="Keeps Cortex visible on connected displays, including full-screen apps." /></div>
          <div className="surface-card"><h3>Try it</h3><p>Preview the single-entry prompt or the history drop without leaving this window.</p>
            <div className="manage-actions"><Button kind="secondary" onClick={() => void previewNotch("compose")}><CortexMark className="button-cortex" /> Quick ask</Button><Button kind="secondary" onClick={() => void previewNotch("history")}><MessageCircle size={15} /> Chat history</Button></div>
          </div>
          <div className="surface-card"><h3>How it works</h3>
            <div className="shortcut-row"><span>Cortex logo</span><kbd>Open a single input</kbd></div>
            <div className="shortcut-row"><span>Chat bubble</span><kbd>Browse chat history</kbd></div>
            <div className="shortcut-row"><span>Settings in Chats</span><kbd>Open preferences</kbd></div>
            <div className="shortcut-row"><span>Double-tap {triggerName(preferences.cortexTrigger)}</span><kbd>Cortex from anywhere</kbd></div>
            <div className="shortcut-row"><span>Escape</span><kbd>Close the drop</kbd></div>
            <p className="fine-print">Preferences are shared by the dashboard and the notch window. Cortex searches local evidence; it does not capture screen content by itself.</p>
          </div>
        </div>}
        {settingsPage === "shortcuts" && <div className="settings-stack"><div className="surface-card"><h3>Keyboard</h3><p>Double-tap your chosen modifier key to open Cortex from any app. Change the key in Notch settings.</p><div className="shortcut-row"><span>New cortex</span><kbd>Double-tap {triggerName(preferences.cortexTrigger)}</kbd></div><div className="shortcut-row"><span>Submit a memory search</span><kbd>Return</kbd></div></div></div>}
        {settingsPage === "appearance" && <div className="settings-stack"><div className="surface-card"><h3>Display</h3><label className="field-label" htmlFor="text-scale">Text size: {preferences.textScale}%</label><input id="text-scale" type="range" min="85" max="130" step="5" value={preferences.textScale} onChange={(event) => updateSetting({ textScale: Number(event.target.value) })} /><Toggle checked={preferences.reduceMotion} onChange={(value) => updateSetting({ reduceMotion: value })} label="Reduce motion" description="Stops decorative animation and notch resizing transitions." /></div></div>}
        {settingsPage === "memory" && <div className="settings-stack"><div className="surface-card"><h3>Archive</h3><div className="status-details"><span>Indexed observations</span><strong>{status?.indexedCount ?? "Unknown"}</strong><span>Storage</span><strong>Local service</strong></div><label className="field-label" htmlFor="retention">Retention (coming soon)</label><select id="retention" disabled value={preferences.retentionDays} onChange={(event) => updateSetting({ retentionDays: Number(event.target.value) })}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select><p className="fine-print">Automatic deletion is not available yet. This control does not change or delete your archive.</p></div><div className="surface-card"><h3>Manage data</h3><p>Browse or delete captured activity. Permanent facts are managed in Memories; tasks and imported transcripts are in Agent Space.</p><div className="manage-actions"><Button kind="secondary" onClick={() => setPage("memories")}>Inspect memory <ArrowRight size={15} /></Button><Button kind="secondary" disabled={!status} onClick={() => setShowDelete(true)}><Trash2 size={15} /> Delete captured activity</Button></div></div></div>}
        {settingsPage === "identity" && <div className="settings-stack"><div className="surface-card"><h3>About you</h3><p>Write a note about how you prefer to communicate. This stays in this shell and is not sent to an AI model.</p><label className="field-label" htmlFor="identity">My context</label><textarea id="identity" className="identity-field" value={preferences.identity} onChange={(event) => updateSetting({ identity: event.target.value })} placeholder="I prefer concise, warm writing…" /></div></div>}
        {settingsPage === "notifications" && <div className="settings-stack"><div className="surface-card"><h3>Proactive messages</h3><Toggle disabled checked={false} onChange={(value) => updateSetting({ proactive: value })} label="Allow evidence-backed nudges" description="Saved as a preference. Automatic nudge generation is not active in this build." /><p>Scheduled reminders run in the local service and appear in Reminders.</p><Button kind="secondary" onClick={() => setPage("scheduled")}>Open reminders</Button></div></div>}
        {settingsPage === "connected" && <div className="settings-stack"><div className="surface-card"><h3>AI clients</h3><p>Connect your harnesses to share tasks, handoffs, and saved memories. Connected clients can search captured activity and create or edit tasks, import selected transcripts, and save or archive permanent memories.</p><Toggle checked={status ? preferences.mcpConsent : false} onChange={(value) => void updateMcpConsent(value)} disabled={!status} label="Allow Cortex MCP access" description="Applies to every connected local client. Separate from screen capture and Cortex's model settings." /><div className="callout neutral"><LockKeyhole size={16} /> Register the Cortex MCP bridge in each harness. This switch controls access; it does not launch a client.</div><Button kind="secondary" onClick={() => setPage("agents")}>Open Agent Space <ArrowRight size={15}/></Button></div></div>}
        {settingsPage === "connected" && <Suspense fallback={<div className="loading-state">Loading connection details…</div>}><McpSetup /></Suspense>}
        {settingsPage === "diagnostics" && <div className="settings-stack"><div className="surface-card"><h3>Connection</h3><div className="status-details"><span>Runtime</span><strong>{desktopRuntime() ? "Tauri" : "Browser preview"}</strong><span>Service</span><strong>{status ? "Connected" : "Offline"}</strong><span>Search</span><strong>{status?.raw.retrieval_engine === "qdrant_edge_hybrid" ? "Semantic + keyword (Qdrant)" : "Unavailable"}</strong><span>Indexed chunks</span><strong>{String(status?.raw.indexed_chunks ?? "—")}</strong><span>Version</span><strong>{status?.version || "Unknown"}</strong></div><Button kind="secondary" onClick={() => void refreshStatus()}>Run connection check</Button>{statusError && <p className="fine-print">{statusError}</p>}</div><div className="surface-card"><h3>Privacy status</h3><p>Diagnostics shown here contain no memory text. The local daemon owns its own sanitized logs.</p></div></div>}
        {settingsPage === "updates" && <div className="settings-stack"><div className="surface-card"><h3>Build information</h3><p>Cortex desktop shell 0.1.0 · local development build</p><div className="callout neutral"><Moon size={16} /> Automatic signed updates are not configured for this build.</div></div><div className="surface-card"><h3>Application</h3><p>Cortex runs as a menu-bar-style notch app. The dashboard stays hidden until you open it from the notch.</p><Button kind="secondary" onClick={() => void quitApp()}>Quit Cortex</Button></div></div>}
      </div></div>}
    </main>
    {showDelete && <div className="modal-backdrop" role="presentation" onMouseDown={() => !deleteBusy && setShowDelete(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="Delete captured activity" onMouseDown={(event) => event.stopPropagation()}><div className="modal-top"><div><span className="eyebrow">Permanent deletion</span><h2>Delete captured activity?</h2></div><IconButton label="Close deletion dialog" onClick={() => setShowDelete(false)}><X size={20} /></IconButton></div><p>This pauses capture and removes the local archive and its derived records. It also clears the identity note stored by this shell. Schedules, permanent facts, tasks and imported transcripts are managed separately in their workspace pages. Backups outside this app may remain.</p><label className="field-label" htmlFor="delete-phrase">Type DELETE CAPTURED ACTIVITY to confirm</label><input className="confirm-input" id="delete-phrase" value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} autoComplete="off" />{deleteError && <div className="callout warning" role="alert">{deleteError}</div>}<div className="modal-actions"><Button kind="quiet" onClick={() => setShowDelete(false)}>Cancel</Button><Button disabled={deletePhrase !== "DELETE CAPTURED ACTIVITY" || deleteBusy} onClick={() => void performDelete()}>{deleteBusy ? "Deleting…" : "Delete captured activity"}</Button></div></div></div>}
  </div>;
}
