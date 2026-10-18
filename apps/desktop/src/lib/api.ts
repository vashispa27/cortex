import { invoke, isTauri } from "@tauri-apps/api/core";

export type Coverage = { state: "complete" | "partial" | "none"; reason?: string };
export type MemoryHit = {
  snapshot_id: number;
  observed_ms: number;
  app_id: string;
  title: string;
  excerpt: string;
  evidence_available: boolean;
  truncated: boolean;
};
export type SearchData = { results: MemoryHit[]; next_cursor: string | null; coverage: Coverage };
export type ServiceStatus = {
  connected: boolean;
  captureEnabled: boolean;
  captureRequested: boolean;
  capturePaused: boolean;
  permission: string;
  indexedCount: number | null;
  version: string | null;
  raw: Record<string, unknown>;
};
export type ServiceSettings = { version: number; capture_paused: boolean; capture_enabled: boolean; mcp_enabled: boolean; excluded_apps: string[]; excluded_domains: string[] };

type Envelope<T> = { request_id?: string; data: T };

export class LocalApiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "LocalApiError";
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function request<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  if (!isTauri()) {
    throw new LocalApiError("The local service is available in the desktop app. Use sample mode in this browser preview.", "DESKTOP_ONLY");
  }
  try {
    const response = await invoke<Envelope<T> | T>("daemon_request", {
      method,
      path,
      body: body ?? null,
    });
    const payload = object(response);
    if ("data" in payload) return payload.data as T;
    return response as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new LocalApiError(message, message.includes("not running") ? "OFFLINE" : "REQUEST_FAILED");
  }
}

export function desktopRuntime(): boolean {
  return isTauri();
}

export async function getStatus(): Promise<ServiceStatus> {
  const raw = object(await request<unknown>("GET", "/v1/status"));
  const capture = object(raw.capture);
  const permissions = object(raw.permissions);
  const indexing = object(raw.indexing);
  return {
    connected: true,
    captureEnabled: Boolean(capture.enabled ?? raw.capture_enabled),
    captureRequested: false,
    capturePaused: Boolean(capture.paused ?? raw.capture_paused),
    permission: text(permissions.accessibility ?? raw.permission_state ?? raw.permission ?? "unknown"),
    indexedCount: number(indexing.snapshot_count ?? raw.snapshot_count),
    version: text(raw.version) || null,
    raw,
  };
}

export type RetrievalData = {
  results: MemoryHit[];
  sources: { id: number; text: string }[];
  abstained: boolean;
  retrieval: { engine: "qdrant_edge_hybrid"; dense: boolean; bm25: boolean; fusion: string; candidates: number };
};

export async function retrieveMemory(query: string): Promise<RetrievalData> {
  const data = await request<RetrievalData>("POST", "/v1/memory/retrieve", { query });
  if (data.retrieval?.engine !== "qdrant_edge_hybrid" || !data.retrieval.dense || !data.retrieval.bm25) {
    throw new LocalApiError("The semantic memory engine is unavailable. Restart Rewind.", "WRONG_ENGINE");
  }
  return data;
}

export async function searchMemory(query: string, limit = 20): Promise<SearchData> {
  const raw = object(await request<unknown>("POST", "/v1/memory/search", { query, limit }));
  const results = Array.isArray(raw.results) ? raw.results : [];
  const coverage = object(raw.coverage);
  return {
    results: results.map((item) => {
      const row = object(item);
      return {
        snapshot_id: number(row.snapshot_id) ?? 0,
        observed_ms: number(row.observed_ms) ?? (Number.isFinite(Date.parse(text(row.observed_at))) ? Date.parse(text(row.observed_at)) : Date.now()),
        app_id: text(row.app_id ?? row.app),
        title: text(row.title),
        excerpt: text(row.excerpt),
        evidence_available: Boolean(row.evidence_available),
        truncated: Boolean(row.truncated),
      } satisfies MemoryHit;
    }),
    next_cursor: text(raw.next_cursor) || null,
    coverage: {
      state: coverage.state === "complete" || coverage.state === "partial" ? coverage.state : "none",
      reason: text(coverage.reason) || undefined,
    },
  };
}

export async function recentMemory(limit = 20): Promise<SearchData> {
  const raw = object(await request<unknown>("GET", `/v1/memory/recent?limit=${Math.min(50, Math.max(1, limit))}`));
  const rows = Array.isArray(raw.results) ? raw.results : Array.isArray(raw.snapshots) ? raw.snapshots : [];
  return {
    results: rows.map((item) => {
      const row = object(item);
      return {
        snapshot_id: number(row.snapshot_id ?? row.id) ?? 0,
        observed_ms: number(row.observed_ms) ?? Date.now(),
        app_id: text(row.app_id),
        title: text(row.title),
        excerpt: text(row.excerpt ?? row.text),
        evidence_available: true,
        truncated: Boolean(row.truncated),
      } satisfies MemoryHit;
    }),
    next_cursor: null,
    coverage: { state: "partial", reason: "recent_window_only" },
  };
}

export async function getSnapshot(id: number): Promise<unknown> {
  return request<unknown>("POST", "/v1/memory/snapshots", { ids: [id] });
}

export async function getServiceSettings(): Promise<ServiceSettings> {
  const raw = object(await request<unknown>("GET", "/v1/settings"));
  return {
    version: number(raw.version) ?? 0,
    capture_paused: Boolean(raw.capture_paused),
    capture_enabled: Boolean(raw.capture_enabled),
    mcp_enabled: Boolean(raw.mcp_enabled),
    excluded_apps: Array.isArray(raw.excluded_apps) ? raw.excluded_apps.filter((item): item is string => typeof item === "string") : [],
    excluded_domains: Array.isArray(raw.excluded_domains) ? raw.excluded_domains.filter((item): item is string => typeof item === "string") : [],
  };
}

export async function patchSettings(changes: Partial<Pick<ServiceSettings, "capture_paused" | "capture_enabled" | "mcp_enabled" | "excluded_apps" | "excluded_domains">>): Promise<ServiceSettings> {
  const current = await getServiceSettings();
  const raw = object(await request<unknown>("PATCH", "/v1/settings", { expected_version: current.version, ...changes }));
  return {
    version: number(raw.version) ?? current.version + 1,
    capture_paused: Boolean(raw.capture_paused ?? changes.capture_paused ?? current.capture_paused),
    capture_enabled: Boolean(raw.capture_enabled ?? changes.capture_enabled ?? current.capture_enabled),
    mcp_enabled: Boolean(raw.mcp_enabled ?? changes.mcp_enabled ?? current.mcp_enabled),
    excluded_apps: Array.isArray(raw.excluded_apps) ? raw.excluded_apps : changes.excluded_apps ?? current.excluded_apps,
    excluded_domains: Array.isArray(raw.excluded_domains) ? raw.excluded_domains : changes.excluded_domains ?? current.excluded_domains,
  };
}

export async function requestCapturePermission(): Promise<"granted" | "not_granted"> {
  const raw = object(await request<unknown>("POST", "/v1/capture/request-permission"));
  return raw.permission_state === "granted" ? "granted" : "not_granted";
}

export async function pauseCapture(paused: boolean): Promise<ServiceSettings> {
  return patchSettings({ capture_paused: paused });
}

export type DeletionReceipt = { scope: string; deleted_snapshots: number; memory_epoch: number; capture_paused: boolean };

export async function deleteAllMemory(): Promise<DeletionReceipt> {
  const raw = object(await request<unknown>("POST", "/v1/privacy/delete", {
    scope: "all",
    confirmation: "DELETE ALL LOCAL MEMORY",
  }));
  return {
    scope: text(raw.scope),
    deleted_snapshots: number(raw.deleted_snapshots) ?? 0,
    memory_epoch: number(raw.memory_epoch) ?? 0,
    capture_paused: Boolean(raw.capture_paused),
  };
}
