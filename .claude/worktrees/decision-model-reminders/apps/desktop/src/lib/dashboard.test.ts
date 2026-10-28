import { describe, expect, it } from "vitest";
import type { MemoryHit } from "./api";
import { buildHeatmap, dayKey, formatMinutes, groupByApp, groupHitsByDay, recentDays, sampleHeatmap } from "./dashboard";

const hit = (id: number, appId: string, observed: Date): MemoryHit => ({
  snapshot_id: id,
  observed_ms: observed.getTime(),
  app_id: appId,
  title: `Source ${id}`,
  excerpt: "",
  evidence_available: true,
  truncated: false,
});

describe("dashboard aggregation", () => {
  it("groups sources by app and sorts by frequency", () => {
    const rows = [
      hit(1, "Example Mail", new Date(2026, 9, 18, 9)),
      hit(2, "Example Docs", new Date(2026, 9, 18, 10)),
      hit(3, "Example Mail", new Date(2026, 9, 18, 11)),
    ];
    expect(groupByApp(rows)).toEqual([
      { appId: "Example Mail", count: 2 },
      { appId: "Example Docs", count: 1 },
    ]);
  });

  it("groups sources into local calendar days", () => {
    const rows = [
      hit(1, "Example Mail", new Date(2026, 9, 18, 9)),
      hit(2, "Example Mail", new Date(2026, 9, 18, 23)),
      hit(3, "Example Docs", new Date(2026, 9, 17, 12)),
    ];
    const groups = groupHitsByDay(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].key).toBe(dayKey(new Date(2026, 9, 18)));
    expect(groups[0].count).toBe(2);
    expect(groups[1].count).toBe(1);
  });

  it("includes quiet days in the five-day glance", () => {
    const now = new Date(2026, 9, 18, 12);
    const rows = [hit(1, "Example Mail", new Date(2026, 9, 16, 9))];
    const days = recentDays(rows, 5, now);
    expect(days).toHaveLength(5);
    expect(days[0].label).toBe("Today");
    expect(days[0].count).toBe(0);
    expect(days[2].count).toBe(1);
    expect(days[4].label).toBe("Wednesday");
  });

  it("builds a bounded heatmap ending on the supplied day", () => {
    const now = new Date(2026, 9, 18, 12);
    const rows = [hit(1, "Example Mail", new Date(2026, 9, 18, 9))];
    const cells = buildHeatmap(rows, 2, now);
    expect(cells).toHaveLength(14);
    expect(cells[cells.length - 1].key).toBe(dayKey(now));
    expect(cells[cells.length - 1].count).toBe(1);
    expect(cells[cells.length - 1].level).toBe(1);
    expect(sampleHeatmap(2, now).every((cell) => cell.level >= 0 && cell.level <= 4)).toBe(true);
  });

  it("formats compact durations", () => {
    expect(formatMinutes(38)).toBe("38m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(167)).toBe("2h 47m");
  });
});
