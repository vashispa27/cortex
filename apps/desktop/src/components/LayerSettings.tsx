import { ShieldCheck } from "lucide-react";
import { LAYERS } from "../lib/layers";
import { layerIsLocal } from "../lib/provider";
import type { Preferences } from "../lib/storage";

type Props = {
  preferences: Preferences;
  hasKey: boolean;
  onChange: (changes: Partial<Preferences>) => void;
};

const info = (id: string) => LAYERS.find((layer) => layer.id === id)!;

/** Answers may run in the cloud or on this Mac; every step below them always runs on the local model. */
export default function LayerSettings({ preferences, hasKey, onChange }: Props) {
  const answer = preferences.layers.answer;
  const local = layerIsLocal(preferences, "answer");
  const modelField = local ? "localModel" : "cloudModel";
  const fallback = local ? preferences.localModel.trim() : preferences.openrouterModel.trim();
  // The choice is stored as the global provider; the answer step follows it.
  const setRuns = (value: string) => onChange({ aiProvider: value === "local" ? "local" : "openrouter", layers: { ...preferences.layers, answer: { ...answer, provider: "default" } } });

  return <>
    <div className="surface-card layer-card">
      <h3>Answers</h3>
      <p>Writes the reply from what Cortex finds in your memory. It can run in the cloud (OpenRouter) or on the local model on this Mac.</p>
      <div className="layer-controls">
        <label>
          <span className="field-label">Runs</span>
          <select aria-label="Answers: where they run" disabled={preferences.localOnly} value={local ? "local" : "cloud"} onChange={(event) => setRuns(event.target.value)}>
            <option value="cloud">Cloud (OpenRouter)</option>
            <option value="local">This Mac (local model)</option>
          </select>
        </label>
        <label>
          <span className="field-label">Model</span>
          <input aria-label="Answers: model" value={answer[modelField]} onChange={(event) => onChange({ layers: { ...preferences.layers, answer: { ...answer, [modelField]: event.target.value.trim() } } })}
            placeholder={fallback ? `${fallback} (default)` : local ? "Default local model" : "Default OpenRouter model"} autoComplete="off" />
        </label>
      </div>
      {local
        ? <p className="layer-good"><ShieldCheck size={16} /> Nothing leaves this Mac{preferences.localOnly ? " (local only is on)" : ""}.</p>
        : <>
          <p className="fine-print">Sent to OpenRouter and the model provider you chose: {info("answer").sends}</p>
          {!hasKey && <p className="fine-print">No OpenRouter key is saved yet, so answers will fail until you add one below.</p>}
        </>}
    </div>

    <div className="surface-card layer-card">
      <h3>On this Mac</h3>
      <p>These steps always run on the local model below. Nothing they read leaves this Mac.</p>
      <div className="layer-row">
        <div className="layer-head"><strong>{info("followup").title}</strong></div>
        <small>Turns a short follow-up like “what about him?” into a full search question, using the last exchange.</small>
      </div>
      <div className="layer-row" data-off={!preferences.decideEnabled}>
        <div className="layer-head">
          <strong>{info("decide").title}</strong>
          <label className="layer-switch">
            <input className="switch-input" type="checkbox" checked={preferences.decideEnabled} onChange={(event) => onChange({ decideEnabled: event.target.checked })} aria-label="Use a model to understand reminders and memories" />
            <span aria-hidden="true" className={`switch ${preferences.decideEnabled ? "on" : ""}`} />
          </label>
        </div>
        <small>Reads messages that may set a reminder or save a fact. Off, or if the local model is not running, simple phrasings like “remind me tomorrow at 2pm to …” still work through a built-in parser; flexible ones do not.</small>
        <div className="layer-controls">
          <label className="layer-wide">
            <span className="field-label">Routing adapter</span>
            <input aria-label="Reminders and memories: routing adapter folder" value={preferences.routingAdapter} disabled={!preferences.decideEnabled} onChange={(event) => onChange({ routingAdapter: event.target.value.trim() })} placeholder="Full path of the fine-tuned adapter folder (optional)" autoComplete="off" spellCheck={false} />
          </label>
        </div>
        <small>The fine-tuned adapter is used for reminders and follow-up questions, so both run on one loaded model.</small>
      </div>
      <div className="layer-row" data-off={!preferences.contextEnabled}>
        <div className="layer-head">
          <strong>{info("context").title}</strong>
          <label className="layer-switch">
            <input className="switch-input" type="checkbox" checked={preferences.contextEnabled} onChange={(event) => onChange({ contextEnabled: event.target.checked })} aria-label="Generate context for new captures" />
            <span aria-hidden="true" className={`switch ${preferences.contextEnabled ? "on" : ""}`} />
          </label>
        </div>
        <small>Adds a short context to every new capture before it is indexed. It slows capture. Off by default; turning it on re-indexes your existing memory once.</small>
      </div>
    </div>
  </>;
}
