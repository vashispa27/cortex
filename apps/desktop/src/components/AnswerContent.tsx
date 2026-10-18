import ReactMarkdown from "react-markdown";
import { invoke, isTauri } from "@tauri-apps/api/core";

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
