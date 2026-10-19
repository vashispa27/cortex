import ReactMarkdown from "react-markdown";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { AnswerSource } from "../lib/types";

// Older answers and some models may still include internal reference numbers.
export function cleanAnswer(text: string): string {
  return text.replace(/\s*\[(?:\d+\s*,\s*)*\d+\](?!\()/g, "");
}

export function AnswerContent({ text }: { text: string }) {
  return <div className="answer-content"><ReactMarkdown components={{
    a: ({ href, children }) => <a href={href} onClick={(event) => {
      if (isTauri() && href && /^https?:\/\//i.test(href)) {
        event.preventDefault();
        void invoke("open_external_link", { url: href });
      }
    }} target="_blank" rel="noreferrer noopener">{children}</a>,
  }}>{cleanAnswer(text)}</ReactMarkdown></div>;
}

const SOURCE_LABELS: Partial<Record<AnswerSource, string>> = { general: "General knowledge", mixed: "Your activity + general knowledge", selection: "Summary of selection" };

/** Marks answers that did not come purely from the user's captured activity. */
export function AnswerSourceLabel({ source }: { source?: AnswerSource }) {
  const label = source && SOURCE_LABELS[source];
  return label ? <small className="answer-source" data-source={source}>{label}</small> : null;
}
