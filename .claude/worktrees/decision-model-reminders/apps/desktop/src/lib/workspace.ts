import { localRequest } from './api';

export type TaskStatus = 'inbox' | 'running' | 'blocked' | 'parked' | 'done' | 'archived';
export type SharedTask = {
  id: string; title: string; objective: string; project: string; parent_id: string | null;
  status: TaskStatus; priority: 'low' | 'normal' | 'high' | 'urgent'; revision: number;
  created_ms: number; updated_ms: number; handoff: string; next_action: string; blockers: string;
  artifacts: { name: string; location: string }[];
  origin?: { harness: string; session_id: string } | null;
  owner: { harness: string; session_id: string } | null; lease_until_ms: number | null; stale?: boolean;
};
export type PermanentMemory = {
  id: string; content: string; project: string; source: string;
  confidence: 'user_provided' | 'source_supported' | 'inferred'; task_id: string | null;
  status: 'active' | 'archived'; revision: number; created_ms: number; updated_ms: number;
};
export type TaskPack = {
  task: SharedTask; sessions: { session_id: string; harness: string; records: number; first_sequence: number; last_sequence: number }[];
  follow_ups: SharedTask[]; context_notice: string;
};
export type WorkspacePage<T> = { items: T[]; total: number; next_offset: number | null };
export const workspaceRequest = <T>(operation: string, body: unknown = {}): Promise<T> => localRequest<T>('POST', `/v1/workspace/${operation}`, body);

export type DesktopClaim = { taskId: string; token: string; sessionId: string };
const claimKey = 'cortex.desktop.claims.v1';
export function desktopSession(): string {
  const key = 'cortex.desktop.workspace-session.v1';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `desktop-${crypto.randomUUID()}`;
  sessionStorage.setItem(key, id);
  return id;
}
export function readDesktopClaims(): Record<string, DesktopClaim> {
  try { return JSON.parse(sessionStorage.getItem(claimKey) || '{}'); } catch { return {}; }
}
export function saveDesktopClaim(claim: DesktopClaim): void {
  sessionStorage.setItem(claimKey, JSON.stringify({ ...readDesktopClaims(), [claim.taskId]: claim }));
}
export function clearDesktopClaim(taskId: string): void {
  const claims = readDesktopClaims(); delete claims[taskId];
  sessionStorage.setItem(claimKey, JSON.stringify(claims));
}
export function ownsDesktopTask(task: SharedTask): boolean {
  const claim = readDesktopClaims()[task.id];
  return Boolean(claim?.token && task.owner?.harness === 'cortex' && task.owner?.session_id === claim.sessionId);
}
export function downloadWorkspaceFile(name: string, content: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Small JSONL batches preserve whole records and stable sequence numbers on retries. */
export function transcriptBatches(jsonl: string): { start_sequence: number; jsonl: string }[] {
  const lines = jsonl.split('\n').filter(line => line.trim()).flatMap((line, index) => {
    let value: unknown;
    try { value = JSON.parse(line); } catch { throw new Error(`Invalid JSON at record ${index + 1}`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Record ${index + 1} must be an object`);
    const raw = JSON.stringify(value);
    if (new TextEncoder().encode(raw).length <= 27_000) return [raw];
    const chars = Array.from(raw), parts: string[] = [];
    for (let i=0;i<chars.length;i+=3500) parts.push(chars.slice(i,i+3500).join(''));
    return parts.map((text, part) => JSON.stringify({ _cortex_transcript_fragment: { source_record: index, part, total: parts.length, encoding: 'json' }, text }));
  });
  const batches: { start_sequence: number; jsonl: string }[] = [];
  let selected: string[] = [], bytes = 0, start = 0;
  lines.forEach((line, index) => {
    const size = new TextEncoder().encode(line).length + 1;
    if (size > 28_000) throw new Error(`Record ${index + 1} exceeds the 28KB record limit`);
    if (bytes + size > 28_000 || selected.length === 200) {
      batches.push({ start_sequence: start, jsonl: selected.join('\n') }); selected = []; bytes = 0; start = index;
    }
    selected.push(line); bytes += size;
  });
  if (selected.length) batches.push({ start_sequence: start, jsonl: selected.join('\n') });
  return batches;
}
