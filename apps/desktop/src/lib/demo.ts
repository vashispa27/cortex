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
];

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
