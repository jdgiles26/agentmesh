import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle } from 'lucide-react';
import { STAGES } from '../types/stages';
import { useBlackboard } from '../store/blackboard';
import { getStageProgress } from '../orchestrator/runner';
import clsx from 'clsx';

export function PipelineVisualizer() {
  const { run, selectedStageId, selectStage } = useBlackboard();

  if (!run) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
        Start a pipeline to see stage progress
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-slate-300 mb-3">Pipeline Stages</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {STAGES.map((stage, idx) => {
          const progress = getStageProgress(stage.id);
          const isSelected = selectedStageId === stage.id;

          return (
            <button
              key={stage.id}
              onClick={() => selectStage(stage.id)}
              className={clsx(
                'text-left p-3 rounded-lg border transition-all',
                isSelected
                  ? 'border-mesh-500 bg-mesh-950/40'
                  : 'border-slate-800 bg-slate-950/40 hover:border-slate-700',
                progress === 'running' && 'ring-1 ring-mesh-500/40'
              )}
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">
                  {progress === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  {progress === 'running' && <Loader2 className="w-4 h-4 text-mesh-400 animate-spin" />}
                  {progress === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                  {progress === 'blocked' && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  {progress === 'pending' && <Circle className="w-4 h-4 text-slate-600" />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">
                    {idx + 1}. {stage.name}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">{stage.agent}</div>
                  {stage.gate && (
                    <div className="text-[10px] text-amber-500/80 mt-0.5">{stage.gate}</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
