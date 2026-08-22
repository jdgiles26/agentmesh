import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { subscribeTelemetry, type TelemetryEvent } from '../lib/telemetry';
import { useBlackboard } from '../store/blackboard';
import clsx from 'clsx';

export function TelemetryPanel() {
  const { run } = useBlackboard();
  const [events, setEvents] = useState<TelemetryEvent[]>([]);

  useEffect(() => subscribeTelemetry(setEvents), []);

  if (!run) return null;

  const mine = events.filter((e) => e.run_id === run.run_id).slice(-40).reverse();
  const tokensIn = mine.reduce((s, e) => s + (e.tokens_in_est || 0), 0);
  const tokensOut = mine.reduce((s, e) => s + (e.tokens_out_est || 0), 0);
  const errors = mine.filter((e) => e.level === 'error').length;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Activity className="w-4 h-4 text-mesh-400" />
          Agent Telemetry
        </h2>
        <div className="text-[10px] text-slate-500">
          ~{tokensIn + tokensOut} tok · {errors} err · {mine.length} events
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[10px]">
        {mine.length === 0 && <div className="text-slate-600">No events yet.</div>}
        {mine.map((e) => (
          <div
            key={e.id}
            className={clsx(
              'flex gap-2 px-2 py-1 rounded',
              e.level === 'error' && 'bg-red-950/40 text-red-300',
              e.level === 'warn' && 'bg-amber-950/30 text-amber-200',
              e.level === 'info' && 'text-slate-400'
            )}
          >
            <span className="text-slate-600 shrink-0">{new Date(e.ts).toLocaleTimeString()}</span>
            <span className="text-slate-500 shrink-0">{e.stage_id || '-'}</span>
            <span className="truncate">{e.event}</span>
            {e.duration_ms != null && <span className="ml-auto text-slate-600">{e.duration_ms}ms</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
