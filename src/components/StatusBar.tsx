import { useBlackboard } from '../store/blackboard';
import { STAGES } from '../types/stages';
import clsx from 'clsx';

export function StatusBar() {
  const { run } = useBlackboard();
  if (!run) return null;

  const statusColors: Record<string, string> = {
    idle: 'text-slate-400',
    running: 'text-mesh-400',
    paused: 'text-amber-400',
    blocked: 'text-amber-400',
    completed: 'text-emerald-400',
    failed: 'text-red-400',
  };

  const completed = run.stage_history.filter((h) => h.status === 'completed').length;
  const total = STAGES.filter((s) => s.id !== 'debugger').length;
  const totalMs = run.stage_history.reduce((s, h) => s + (h.duration_ms || 0), 0);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4 text-xs">
      <div>
        <span className="text-slate-500">Status: </span>
        <span className={clsx('font-semibold uppercase', statusColors[run.status])}>{run.status}</span>
      </div>
      <div>
        <span className="text-slate-500">Progress: </span>
        <span className="text-slate-200">
          {completed} / {total} stages
        </span>
      </div>
      <div>
        <span className="text-slate-500">Time: </span>
        <span className="text-slate-200">{(totalMs / 1000).toFixed(1)}s</span>
      </div>
      <div className="flex-1 min-w-[120px]">
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-mesh-500 transition-all duration-500"
            style={{ width: `${Math.min(100, (completed / total) * 100)}%` }}
          />
        </div>
      </div>
      {run.errors.length > 0 && (
        <div className="text-red-400">
          {run.errors.length} error{run.errors.length > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
