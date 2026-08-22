import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { useBlackboard } from '../store/blackboard';
import { runPipeline } from '../orchestrator/runner';

const EXAMPLES = [
  'Build a todo list with create, toggle, and filter by status',
  'Create a simple counter with increment, decrement, and reset',
  'Implement email/password authentication with session validation',
  'Build a calculator with add, subtract, multiply, and divide',
];

export function RequirementInput() {
  const [text, setText] = useState(EXAMPLES[0]);
  const { run, startRun, reset } = useBlackboard();
  const isRunning = run?.status === 'running';

  const handleStart = () => {
    if (!text.trim()) return;
    startRun(text.trim());
    setTimeout(() => runPipeline(), 50);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <label className="block text-sm font-medium text-slate-300 mb-2">
        Software Requirement
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isRunning}
        rows={3}
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-mesh-500/50 focus:border-mesh-500 disabled:opacity-50 resize-none"
        placeholder="Describe the software you want to build..."
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={isRunning}
            onClick={() => setText(ex)}
            className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            {ex.slice(0, 40)}…
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleStart}
          disabled={isRunning || !text.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-mesh-600 hover:bg-mesh-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Play className="w-4 h-4" />
          {isRunning ? 'Pipeline Running…' : 'Start Pipeline'}
        </button>
        {run && (
          <button
            onClick={() => reset()}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-medium rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
