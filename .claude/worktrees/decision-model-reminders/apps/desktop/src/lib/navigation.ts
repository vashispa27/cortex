import type { Page } from "./types";
const pages: readonly Page[] = ["today", "timeline", "scheduled", "ask", "memories", "agents", "settings"];
/** Resolve deep links and saved locations from earlier workspace versions. */
export function resolvePage(value: string | null): Page {
  if (value === "reminders") return "scheduled";
  if (value === "memory" || value === "wiki") return "memories";
  if (value === "tasks") return "agents";
  if (value === "write") return "ask";
  return pages.includes(value as Page) ? value as Page : "today";
}
export function savePage(page: Page): void {
  localStorage.setItem("cortex.workspace.page.v1", page);
  const url = new URL(window.location.href);
  if (url.searchParams.get("page") !== page) { url.searchParams.set("page", page); url.searchParams.delete("tab"); url.searchParams.delete("query"); }
  window.history.replaceState(null, "", url);
}
