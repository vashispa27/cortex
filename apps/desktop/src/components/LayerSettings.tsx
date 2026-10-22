import { ShieldCheck } from "lucide-react";
import { LAYERS, whereEachStepRuns } from "../lib/layers";
import { layerIsLocal } from "../lib/provider";
import type { LayerId, LayerProvider, Preferences } from "../lib/storage";

type Props = {
  preferences: Preferences;
  hasKey: boolean;
  onChange: (changes: Partial<Preferences>) => void;
};

/** One row per model-backed step: where it runs and which model it uses. */
export default function LayerSettings({ preferences, hasKey, onChange }: Props) {
  const setLayer = (id: LayerId, changes: Partial<Preferences["layers"][LayerId]>) =>
    onChange({ layers: { ...preferences.layers, [id]: { ...preferences.layers[id], ...changes } } });
  const defaultName = preferences.aiProvider === "local" ? "This Mac" : "Cloud";
  const summary = whereEachStepRuns(preferences);
  const cloudSteps = summary.filter((row) => row.where === "cloud");

  return <>
    <div className="surface-card layer-card">
      <h3>Where each step runs</h3>
      <p>Choose, for every step that uses a model, whether it runs in the cloud (OpenRouter) or on the local model on this Mac. Each can use its own model.</p>
      {LAYERS.map((info) => {
        const choice = preferences.layers[info.id];
        const local = layerIsLocal(preferences, info.id);
        const isContext = info.id === "context";
        const off = isContext && !preferences.contextEnabled;
        const modelField = local ? "localModel" : "cloudModel";
        const fallback = local ? preferences.localModel.trim() : preferences.openrouterModel.trim();
        const placeholder = isContext && !local ? "anthropic/claude-haiku-4.5 (default)" : fallback ? `${fallback} (default)` : local ? "Default local model" : "Default OpenRouter model";
        return <div className="layer-row" key={info.id} data-off={off}>
          <div className="layer-head">
            <strong>{info.title}</strong>
            {isContext && <label className="layer-switch">
              <input className="switch-input" type="checkbox" checked={preferences.contextEnabled} onChange={(event) => onChange({ contextEnabled: event.target.checked })} aria-label="Generate context for new captures" />
              <span aria-hidden="true" className={`switch ${preferences.contextEnabled ? "on" : ""}`} />
            </label>}
          </div>
          <small>{info.sends}{isContext && " Off by default. Turning it on re-indexes your existing memory once."}</small>
          <div className="layer-controls">
            <label>
              <span className="field-label">Runs</span>
              <select aria-label={`${info.title}: where it runs`} disabled={preferences.localOnly} value={preferences.localOnly ? "local" : choice.provider}
                onChange={(event) => setLayer(info.id, { provider: event.target.value as LayerProvider })}>
                {!isContext && <option value="default">Default ({defaultName})</option>}
                <option value="cloud">Cloud (OpenRouter)</option>
                <option value="local">This Mac (local model)</option>
              </select>
            </label>
            <label>
              <span className="field-label">Model</span>
              <input aria-label={`${info.title}: model`} value={choice[modelField]} disabled={off} onChange={(event) => setLayer(info.id, { [modelField]: event.target.value.trim() })} placeholder={placeholder} autoComplete="off" />
            </label>
          </div>
        </div>;
      })}
    </div>

    <div className="surface-card layer-card">
      <h3>What leaves this Mac</h3>
      {cloudSteps.length === 0
        ? <p className="layer-good"><ShieldCheck size={16} /> Nothing. Every step runs on this Mac{preferences.localOnly ? " (local only is on)" : ""}.</p>
        : <>
          <p>These steps send text to OpenRouter and the model provider you chose:</p>
          <ul className="layer-leaves">
            {cloudSteps.map((row) => <li key={row.id}><strong>{row.title}</strong>{row.model ? ` · ${row.model}` : ""}<small>{row.sends}</small></li>)}
          </ul>
          {!hasKey && <p className="fine-print">No OpenRouter key is saved yet, so these steps will fail until you add one below.</p>}
        </>}
      {summary.some((row) => row.where === "local") && <p className="fine-print">On this Mac: {summary.filter((row) => row.where === "local").map((row) => row.title).join(", ")}.</p>}
      {summary.some((row) => row.where === "off") && <p className="fine-print">Off: {summary.filter((row) => row.where === "off").map((row) => row.title).join(", ")}.</p>}
    </div>
  </>;
}
