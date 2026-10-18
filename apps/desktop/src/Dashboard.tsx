import { useMemo } from "react";
import {
  ArrowRight, ArrowUpRight, Bell, Clock3, Mail,
  Plus, Search, Sparkles,
} from "lucide-react";
import type { MemoryHit, ServiceStatus } from "./lib/api";
import {
  buildHeatmap, formatMinutes, groupByApp, groupHitsByDay, recentDays, sampleHeatmap,
} from "./lib/dashboard";
import { sampleActivity, sampleAppUsage, sampleMemories } from "./lib/demo";
import type { NotchMode } from "./lib/notch";
import type { Page, SettingsPage } from "./lib/types";
import type { Preferences, Reminder } from "./lib/storage";
import RewindMark from "./components/RewindMark";
import "./dashboard.css";

type AppRow = { appId: string; count: number; minutes: number | null };

type TodoItem = {
  id: string;
  title: string;
  detail: string;
  source: string;
  when: number;
  hit?: MemoryHit;
  reminder?: boolean;
};

type HomeDashboardProps = {
  sample: boolean;
  status: ServiceStatus | null;
  preferences: Preferences;
  reminders: Reminder[];
  hits: MemoryHit[];
  busy: boolean;
  error: string;
  chatCount: number;
  onNavigate: (page: Page) => void;
  onSettings: (page: SettingsPage) => void;
  onSearch: (query: string) => void;
  onToggleCapture: () => void;
  onUpdatePreferences: (changes: Partial<Preferences>) => void;
  onSetDropVisible: (visible: boolean) => void;
  onPreviewNotch: (mode: NotchMode) => void;
};

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

function relative(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function appName(appId: string): string {
  const parts = appId.split(".");
  const name = parts.length > 1 ? parts[parts.length - (parts[parts.length - 1].toLowerCase() === "desktop" ? 2 : 1)] : appId;
  return name ? name[0].toUpperCase() + name.slice(1) : "App";
}

function initials(appId: string): string {
  return appId.replace(/^Example\s+/i, "").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function ControlToggle({ label, description, checked, disabled = false, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className={`quick-control ${disabled ? "muted" : ""}`}>
    <span><strong>{label}</strong><small>{description}</small></span>
    <input className="switch-input" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span aria-hidden="true" className={`switch ${checked ? "on" : ""}`} />
  </label>;
}

function QuickLink({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return <button type="button" className="quick-control quick-link" onClick={onClick}>
    <span><strong>{label}</strong><small>{detail}</small></span>
    <ArrowUpRight size={15} />
  </button>;
}

export function HomeDashboard(props: HomeDashboardProps) {
  const { sample, status, preferences, reminders, hits, busy, error, chatCount } = props;
  const apps = useMemo<AppRow[]>(() => {
    if (sample) return sampleAppUsage.map((app) => ({ appId: app.appId, minutes: app.minutes, count: 0 }));
    return groupByApp(hits).map((app) => ({ appId: app.appId, minutes: null, count: app.count }));
  }, [hits, sample]);
  const heatmap = useMemo(() => sample ? sampleHeatmap() : buildHeatmap(hits), [hits, sample]);
  const days = useMemo(() => recentDays(hits, 5), [hits]);
  const activeApps = groupByApp(hits).length;
  const stats = sample
    ? [
      { value: String(sampleActivity.actions), label: "Actions" },
      { value: `${sampleActivity.hours}h`, label: "Hours worked" },
      { value: String(sampleActivity.chats), label: "Chats" },
      { value: String(apps.length), label: "Apps" },
    ]
    : [
      { value: String(hits.length), label: "Actions" },
      { value: String(activeApps), label: "Apps" },
      { value: String(chatCount), label: "Chats" },
      { value: String(reminders.length), label: "Reminders" },
    ];
  const chips = sample
    ? [`${sampleActivity.rewrites} rewrites`, `${sampleActivity.voiceNotes} voice notes`, `${sampleActivity.edits} edits`, `${sampleActivity.mcpCalls} MCP calls`]
    : [`${groupHitsByDay(hits).length} active days`, `${reminders.length} reminders`, status?.capturePaused ? "capture paused" : status ? "capture ready" : "service offline"];
  const appMax = Math.max(1, ...apps.map((app) => app.minutes ?? app.count));
  const captureOn = Boolean(status?.captureRequested && !status.capturePaused);
  const sampleTodos: TodoItem[] = [
    {
      id: "sample-todo-review",
      title: "Follow up on the Thursday design review",
      detail: "Maya suggested moving the review. The final accessibility pass is still open.",
      source: "Example Mail",
      when: sampleMemories[0].observed_ms,
      hit: sampleMemories[0],
    },
    {
      id: "sample-todo-expense",
      title: "Settle the Friday Gang split",
      detail: "Priya asked everyone to close the shared expense before the weekend.",
      source: "Example Mail",
      when: sampleMemories[4].observed_ms,
      hit: sampleMemories[4],
    },
  ];
  const todos: TodoItem[] = sample
    ? sampleTodos
    : reminders.slice(0, 3).map((reminder) => ({
      id: reminder.id,
      title: reminder.text,
      detail: reminder.repeat === "daily" ? "Repeats every day while the app is open." : "One-time reminder scheduled in this workspace.",
      source: "Reminder",
      when: Date.parse(reminder.at) || Date.now(),
      reminder: true,
    }));

  return <div className="dash-page">
    <header className="dash-welcome">
      <div>
        <span className="eyebrow">Home</span>
        <h1>Welcome back<span className="accent">.</span></h1>
        <p>Your memory at a glance. {sample ? "You are exploring an invented sample workspace." : status ? "Your memory stays on this Mac." : "Connect the local service or turn on sample mode to explore."}</p>
      </div>
      <div className="dash-welcome-actions">
        <span className={`dash-live ${sample ? "sample" : status ? "online" : "offline"}`}><span className="status-light" />{sample ? "Sample data" : status ? "Local service" : "Offline"}</span>
        <button type="button" className="button button-secondary dash-preview" onClick={() => props.onPreviewNotch("compose")}><RewindMark className="dash-button-rewind" /> Open Rewind</button>
      </div>
    </header>

    <div className="dash-grid">
      <section className="dash-card dash-activity">
        <div className="dash-card-head">
          <div><span className="eyebrow">Activity</span><h2>Your week in motion</h2></div>
          <span className="dash-chip">{busy ? "Updating…" : "Recent"}</span>
        </div>
        <div className="dash-stat-grid">{stats.map((stat) => <div className="dash-stat" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
        <div className="activity-chips">{chips.map((chip) => <span className="activity-chip" key={chip}>{chip}</span>)}</div>
        <div className="heatmap-wrap">
          <div className="heatmap" role="img" aria-label="Activity over the last fourteen weeks">
            {heatmap.map((cell) => <span key={cell.key} data-level={cell.level} title={`${shortDate.format(cell.date)}: ${cell.count} ${cell.count === 1 ? "source" : "sources"}`} />)}
          </div>
          <div className="heatmap-foot"><span>Last 14 weeks</span><span className="heatmap-legend">Less <i data-level="0" /><i data-level="2" /><i data-level="4" /> More</span></div>
        </div>
        {error && <p className="dash-fine">{error}</p>}
      </section>

      <section className="dash-card dash-apps">
        <div className="dash-card-head">
          <div><span className="eyebrow">Apps</span><h2>Top context</h2></div>
          <span className="dash-chip">{sample ? "Sample" : "Recent"}</span>
        </div>
        <div className="app-list">
          {apps.length ? apps.slice(0, 6).map((app, index) => <button type="button" className="app-row" key={app.appId} onClick={() => props.onSearch(app.appId)} title={`Search memory for ${app.appId}`}>
            <span className="app-rank">{index + 1}</span>
            <span className="app-logo">{initials(appName(app.appId))}</span>
            <span className="app-info"><strong>{appName(app.appId)}</strong><span className="app-bar"><i style={{ width: `${Math.max(8, ((app.minutes ?? app.count) / appMax) * 100)}%` }} /></span></span>
            <span className="app-duration">{app.minutes !== null ? formatMinutes(app.minutes) : `${app.count} src`}</span>
          </button>) : <p className="dash-empty">No app activity yet. Start capture or explore sample mode.</p>}
        </div>
        <button type="button" className="text-link dash-link" onClick={() => props.onNavigate("memory")}>Browse memory <ArrowRight size={14} /></button>
      </section>

      <section className="dash-card dash-timeline">
        <div className="dash-card-head">
          <div><span className="eyebrow">Timeline</span><h2>Where you have been</h2></div>
        </div>
        <div className="timeline-days">
          {days.map((day) => <button type="button" className={`timeline-day ${day.count === 0 ? "quiet" : ""}`} key={day.key} onClick={() => props.onNavigate("timeline")} title={`${day.label}: ${day.count} sources`}>
            <span className="timeline-day-copy"><strong>{day.label}</strong><small>{shortDate.format(day.date)}</small></span>
            <span className="timeline-day-count">{day.count || "–"}</span>
          </button>)}
        </div>
        <button type="button" className="text-link" onClick={() => props.onNavigate("timeline")}>Open timeline <ArrowRight size={14} /></button>
      </section>

      <section className="dash-card dash-todo">
        <div className="dash-card-head">
          <div><span className="eyebrow">To do</span><h2>Small things, kept close</h2></div>
          <button type="button" className="text-link" onClick={() => props.onNavigate("reminders")}><Plus size={14} /> Add</button>
        </div>
        <div className="todo-list">
          {todos.length ? todos.map((todo) => <div className="todo-row" key={todo.id}>
            <span className="todo-icon">{todo.hit ? <Mail size={17} /> : <Bell size={17} />}</span>
            <div>
              <strong>{todo.title}</strong>
              <p>{todo.detail}</p>
              <div className="todo-meta"><span className="todo-source">{todo.source}</span><span>{relative(todo.when)}</span></div>
            </div>
            <button type="button" className="todo-open" onClick={() => props.onNavigate("reminders")}>Open <ArrowUpRight size={12} /></button>
          </div>) : <div className="dash-empty"><Sparkles size={18} /><span>No loose ends right now.</span><button type="button" className="text-link" onClick={() => props.onNavigate("reminders")}>Add a reminder</button></div>}
        </div>
      </section>

      <section className="dash-card dash-controls">
        <div className="dash-card-head">
          <div><span className="eyebrow">Quick controls</span><h2>Keep it yours</h2></div>
          <span className="dash-chip">{preferences.hideDrop ? "Drop hidden" : "Drop ready"}</span>
        </div>
        <div className="quick-controls">
          <ControlToggle checked={captureOn} disabled={!status} onChange={() => props.onToggleCapture()} label="Capture memory" description={status?.captureRequested ? "Stored locally, under your control." : "Turn on capture to remember what you see."} />
          <ControlToggle checked={preferences.microphoneConsent} onChange={(value) => props.onUpdatePreferences({ microphoneConsent: value })} label="Voice dictation" description="Allow microphone requests in this build." />
          <ControlToggle checked={preferences.hideDrop} onChange={(value) => props.onSetDropVisible(!value)} label="Hide the drop" description="Tuck the notch away until you reach for it." />
          <QuickLink label="Rewind key" detail="Double-tap Option, Fn, Shift, or Control." onClick={() => props.onSettings("notch")} />
          <QuickLink label="Privacy & retention" detail="Review what is stored and for how long." onClick={() => props.onSettings("memory")} />
          <QuickLink label="Notch behavior" detail="Choose how the drop opens and what it shows." onClick={() => props.onSettings("notch")} />
        </div>
      </section>
    </div>
  </div>;
}

type TimelinePageProps = {
  sample: boolean;
  hits: MemoryHit[];
  busy: boolean;
  error: string;
  onOpenMemory: () => void;
};

export function TimelinePage({ sample, hits, busy, error, onOpenMemory }: TimelinePageProps) {
  const groups = useMemo(() => groupHitsByDay(hits), [hits]);
  return <div className="page-content timeline-page">
    <div className="page-heading timeline-heading">
      <span className="eyebrow">A trail of context</span>
      <h1>Timeline</h1>
      <p>Your recent activity, grouped by day.</p>
    </div>
    {sample && <div className="callout neutral timeline-note"><Sparkles size={16} /> These days are invented sample data. Your real timeline stays on this Mac.</div>}
    {error && <div className="callout warning">{error}</div>}
    {busy && !groups.length && <div className="loading-state">Loading recent memory…</div>}
    {!busy && !groups.length && <div className="empty-state timeline-empty"><span className="empty-icon"><Clock3 size={24} /></span><h3>Nothing on the timeline yet</h3><p>Start capture, or open the sample workspace to see how a day of context is organized.</p><button type="button" className="button button-secondary" onClick={onOpenMemory}>Open memory</button></div>}
    {groups.length > 0 && <div className="timeline-rail">
      {groups.map((group) => <section className="timeline-group" key={group.key}>
        <header className="timeline-date">
          <span className="eyebrow">{group.label}</span>
          <h2>{shortDate.format(group.date)}</h2>
          <small>{group.count} {group.count === 1 ? "source" : "sources"}</small>
        </header>
        <div className="timeline-items">
          {group.hits.map((hit) => <div className="timeline-item" key={hit.snapshot_id}>
            <time>{new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(hit.observed_ms)}</time>
            <span className="timeline-item-mark">{initials(appName(hit.app_id))}</span>
            <div><strong>{hit.title || "Activity"}</strong></div>
          </div>)}
        </div>
      </section>)}
    </div>}
    
    <div className="timeline-tools"><button type="button" className="button button-secondary" onClick={onOpenMemory}><Search size={15} /> Search memory</button></div>
  </div>;
}
