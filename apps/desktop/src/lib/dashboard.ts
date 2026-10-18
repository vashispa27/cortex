import type { MemoryHit } from "./api";

export type AppUsage = { appId: string; count: number };

export type DayBucket = {
  key: string;
  date: Date;
  label: string;
  count: number;
  hits: MemoryHit[];
};

export type HeatCell = {
  key: string;
  date: Date;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
};

const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const shortWeekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const mediumDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dayLabel(date: Date, now = new Date()): string {
  const today = startOfDay(now).getTime();
  const value = startOfDay(date).getTime();
  const difference = Math.round((today - value) / 86_400_000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  if (difference > 1 && difference < 7) return weekday.format(date);
  return mediumDate.format(date);
}

export function dayDetail(date: Date, now = new Date()): string {
  const difference = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (difference > 1 && difference < 7) return mediumDate.format(date);
  return shortWeekday.format(date);
}

export function groupByApp(hits: MemoryHit[]): AppUsage[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    const appId = hit.app_id.trim() || "Unknown";
    counts.set(appId, (counts.get(appId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([appId, count]) => ({ appId, count }))
    .sort((left, right) => right.count - left.count || left.appId.localeCompare(right.appId));
}

export function groupHitsByDay(hits: MemoryHit[]): DayBucket[] {
  const groups = new Map<string, MemoryHit[]>();
  for (const hit of hits) {
    const key = dayKey(new Date(hit.observed_ms));
    const group = groups.get(key);
    if (group) group.push(hit);
    else groups.set(key, [hit]);
  }
  return [...groups.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([key, dayHits]) => {
      const date = startOfDay(new Date(dayHits[0].observed_ms));
      return { key, date, label: dayLabel(date), count: dayHits.length, hits: dayHits };
    });
}

export function recentDays(hits: MemoryHit[], days = 5, now = new Date()): DayBucket[] {
  const groups = new Map(groupHitsByDay(hits).map((group) => [group.key, group]));
  return Array.from({ length: days }, (_, index) => {
    const date = startOfDay(now);
    date.setDate(date.getDate() - index);
    const key = dayKey(date);
    const group = groups.get(key);
    return {
      key,
      date,
      label: dayLabel(date, now),
      count: group?.count ?? 0,
      hits: group?.hits ?? [],
    };
  });
}

export function buildHeatmap(hits: MemoryHit[], weeks = 14, now = new Date()): HeatCell[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    const key = dayKey(new Date(hit.observed_ms));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const cells: HeatCell[] = [];
  const end = startOfDay(now);
  for (let offset = weeks * 7 - 1; offset >= 0; offset--) {
    const date = new Date(end);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    const count = counts.get(key) ?? 0;
    const level: HeatCell["level"] = count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4;
    cells.push({ key, date, count, level });
  }
  return cells;
}

export function sampleHeatmap(weeks = 14, now = new Date()): HeatCell[] {
  return buildHeatmap([], weeks, now).map((cell, index) => {
    const seed = (cell.date.getDate() * 13 + (cell.date.getMonth() + 1) * 7 + index * 3) % 11;
    const level: HeatCell["level"] = seed < 4 ? 0 : seed < 7 ? 1 : seed < 9 ? 2 : seed < 10 ? 3 : 4;
    return { ...cell, count: level, level };
  });
}

export function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}
