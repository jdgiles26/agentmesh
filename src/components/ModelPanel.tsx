import { useEffect, useState } from 'react';
import { Cpu, Download, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import {
  loadModel,
  unloadModel,
  subscribeModelStatus,
  SUPPORTED_MODELS,
  type ModelStatus,
} from '../lib/modelEngine';

export function ModelPanel() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [selected, setSelected] = useState(SUPPORTED_MODELS[0].id);

  useEffect(() => subscribeModelStatus(setStatus), []);

  if (!status) return null;

  const handleLoad = async () => {
    try {
      await loadModel(selected);
    } catch {
      /* status.error set by engine */
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="w-4 h-4 text-mesh-400" />
        <h2 className="text-sm font-semibold text-slate-200">Local Model (WebGPU / WASM)</h2>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Inference runs entirely in your browser. Source code and requirements are not sent to a remote API.
        First load downloads model weights (cached afterwards).
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={status.loading || status.loaded}
          className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 disabled:opacity-50"
        >
          {SUPPORTED_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} ({m.size}){m.recommended ? ' — recommended' : ''}
            </option>
          ))}
        </select>

        {!status.loaded ? (
          <button
            onClick={handleLoad}
            disabled={status.loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-mesh-600 hover:bg-mesh-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg"
          >
            {status.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {status.loading ? 'Loading…' : 'Load Model'}
          </button>
        ) : (
          <button
            onClick={() => unloadModel()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg"
          >
            Unload
          </button>
        )}
      </div>

      {status.loading && (
        <div className="mb-2">
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-mesh-500 transition-all" style={{ width: `${status.progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 text-xs">
        {status.loaded && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />}
        {status.error && <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
        {!status.loaded && !status.error && !status.loading && (
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
        )}
        <div>
          <div className={status.error ? 'text-red-300' : 'text-slate-400'}>{status.statusText}</div>
          {status.error && <div className="text-red-400/80 mt-0.5">{status.error}</div>}
          <div className="text-slate-600 mt-1">
            WebGPU: {status.webgpuAvailable ? 'available' : 'not detected'} · Backend: {status.backend}
          </div>
        </div>
      </div>
    </div>
  );
}
