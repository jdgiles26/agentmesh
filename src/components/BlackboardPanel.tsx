import { useBlackboard } from '../store/blackboard';
import { FileJson, Clock } from 'lucide-react';
import clsx from 'clsx';

export function BlackboardPanel() {
  const { run, selectedArtifactId, selectArtifact } = useBlackboard();

  if (!run) return null;

  const artifacts = Object.values(run.artifacts).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 h-full flex flex-col min-h-[280px]">
      <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
        <FileJson className="w-4 h-4" />
        Blackboard ({artifacts.length} artifacts)
      </h2>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {artifacts.length === 0 && (
          <p className="text-xs text-slate-500">Artifacts appear as stages complete.</p>
        )}
        {artifacts.map((art) => (
          <button
            key={art.artifact_id}
            onClick={() => selectArtifact(art.artifact_id)}
            className={clsx(
              'w-full text-left p-2.5 rounded-lg border transition-colors',
              selectedArtifactId === art.artifact_id
                ? 'border-mesh-500 bg-mesh-950/30'
                : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-200 truncate">{art.stage}</span>
              <StatusBadge status={art.status} />
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(art.timestamp).toLocaleTimeString()}
              <span className="mx-1">·</span>
              conf {(art.confidence * 100).toFixed(0)}%
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-slate-700 text-slate-300',
    verified: 'bg-emerald-900/60 text-emerald-300',
    approved: 'bg-mesh-900/60 text-mesh-300',
    rejected: 'bg-red-900/60 text-red-300',
    blocked: 'bg-amber-900/60 text-amber-300',
  };
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', colors[status] || colors.draft)}>
      {status}
    </span>
  );
}
