export type WritingOperation = "selection" | "answer" | "instruction" | "draft";

export function classifyWriting(text: string, selectionStart: number, selectionEnd: number): WritingOperation {
  if (selectionEnd > selectionStart) return "selection";
  if (text.trimStart().startsWith("/g")) return "answer";
  if (text.trim()) return "instruction";
  return "draft";
}

export function draftSample(text: string, operation: WritingOperation, tone: string): string {
  const source = operation === "answer" ? text.replace(/^\s*\/g\s*/, "") : text.trim();
  if (operation === "draft") return "Thanks for the update. I’ll review this and get back to you soon.";
  if (operation === "answer") return `Sample mode cannot verify an answer to “${source}”. Ask memory for cited evidence.`;
  if (/short|concise|brief/i.test(tone)) return source.replace(/\b(very|really|quite)\s+/gi, "").replace(/\s+/g, " ");
  if (/friendly|warm/i.test(tone)) return `Hi! ${source.charAt(0).toLowerCase()}${source.slice(1)} Thanks!`;
  if (/formal|professional/i.test(tone)) return `Hello,\n\n${source.charAt(0).toUpperCase()}${source.slice(1)}\n\nBest regards`;
  return source;
}

export function canApplyDraft(originalText: string, currentText: string, originalStart: number, originalEnd: number, currentStart: number, currentEnd: number): boolean {
  return originalText === currentText && originalStart === currentStart && originalEnd === currentEnd;
}
