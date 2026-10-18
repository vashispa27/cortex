import type { MemoryHit, SearchData } from "./api";

const time = (hoursAgo: number) => Date.now() - hoursAgo * 60 * 60 * 1000;

export const sampleMemories: MemoryHit[] = [
  {
    snapshot_id: 101,
    observed_ms: time(1.2),
    app_id: "Example Mail",
    title: "Launch review",
    excerpt: "Maya suggested moving the design review to Thursday. The team still needs a final accessibility pass.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 102,
    observed_ms: time(3.5),
    app_id: "Example Docs",
    title: "Project notes",
    excerpt: "The prototype should make capture status obvious and let people pause memory from anywhere in the app.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 103,
    observed_ms: time(26),
    app_id: "Example Chat",
    title: "Planning conversation",
    excerpt: "Ravi will share the test plan. Maya is preparing copy for the onboarding screen.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 104,
    observed_ms: time(51),
    app_id: "Example Browser",
    title: "Accessibility checklist",
    excerpt: "Visible focus, keyboard access, reduced motion, and text scaling are required for the first desktop beta.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 105,
    observed_ms: time(5.2),
    app_id: "Example Mail",
    title: "Invoice follow-up",
    excerpt: "The Friday Gang split is still open. Priya asked everyone to settle the shared expense before the weekend.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 106,
    observed_ms: time(27),
    app_id: "Example Chat",
    title: "Standup notes",
    excerpt: "Capture reliability is the top priority this week. Search latency and empty results are the two items to watch.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 107,
    observed_ms: time(29.5),
    app_id: "Example Docs",
    title: "Copy review",
    excerpt: "The onboarding copy should explain what stays local before asking for any permission.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 108,
    observed_ms: time(53),
    app_id: "Example Browser",
    title: "Design references",
    excerpt: "A few references for a quieter settings page: generous spacing, restrained color, and one clear action per section.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 109,
    observed_ms: time(75),
    app_id: "Example Notes",
    title: "Interview prep",
    excerpt: "Questions to ask about local-first storage, accessibility support, and how capture handles sensitive fields.",
    evidence_available: true,
    truncated: false,
  },
  {
    snapshot_id: 110,
    observed_ms: time(78),
    app_id: "Example Calendar",
    title: "Weekly planning",
    excerpt: "Thursday afternoon is reserved for the design review. Friday morning is the only open block for the beta checklist.",
    evidence_available: true,
    truncated: false,
  },
];

export const sampleAppUsage: { appId: string; minutes: number }[] = [
  { appId: "Example Mail", minutes: 167 },
  { appId: "Example Docs", minutes: 68 },
  { appId: "Example Chat", minutes: 56 },
  { appId: "Example Browser", minutes: 38 },
  { appId: "Example Notes", minutes: 21 },
  { appId: "Example Calendar", minutes: 15 },
];

export const sampleActivity = {
  actions: 84,
  hours: 6.4,
  rewrites: 12,
  voiceNotes: 4,
  chats: 18,
  edits: 9,
  mcpCalls: 3,
};

export function demoSearch(query: string): SearchData {
  const stopwords = new Set(["a", "about", "and", "did", "find", "for", "in", "is", "me", "of", "say", "the", "to", "was", "what"]);
  const terms = query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term && !stopwords.has(term));
  const results = terms.length === 0
    ? sampleMemories
    : sampleMemories
      .map((item) => {
        const haystack = `${item.app_id} ${item.title} ${item.excerpt}`.toLowerCase();
        return { item, score: terms.filter((term) => haystack.includes(term)).length };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || b.item.observed_ms - a.item.observed_ms)
      .map(({ item }) => item);
  return {
    results,
    next_cursor: null,
    coverage: { state: "partial", reason: "synthetic_sample_only" },
  };
}
