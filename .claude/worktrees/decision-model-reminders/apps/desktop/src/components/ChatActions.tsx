import type { ChatAction } from "../lib/intent";
import "./chat-actions.css";

/** Undo / Confirm / Cancel buttons under an assistant message. Shared by Ask Cortex and the notch. */
export default function ChatActions({ actions, disabled, onRun }: { actions: ChatAction[]; disabled: boolean; onRun: (action: ChatAction) => void }) {
  return <div className="chat-actions" role="group" aria-label="Actions for this message">
    {actions.map((action, index) => <button key={index} type="button" disabled={disabled} data-kind={action.kind} onClick={() => onRun(action)}>{action.label}</button>)}
  </div>;
}
