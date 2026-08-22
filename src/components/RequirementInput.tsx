import { useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { useBlackboard } from '../store/blackboard';
import { runPipeline } from '../orchestrator/runner';
import { isModelReady } from '../lib/modelEngine';

export function RequirementInput() {
  const [text, setText] = useState(
    'Build a pure TypeScript module that manages a todo list: createTodo(title), toggleTodo(todo), filterTodos(todos, filter) where filter is all|active|completed. Reject empty titles.'
  );
  const { run, startRun, reset } = useBlackboard();
  const isRunning = run?.status === 'running';

  const handleStart = () => {
    if (!text.trim()) return;
    if (!isModelReady()) {
      alert('Load a local model first (WebGPU preferred).');
      return;
    }
    startRun(text.trim());
    setTimeout(() => runPipeline(), 50);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <label className="block text-sm font-medium text-slate-300 mb-2">Software Requirement</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isRunning}
        rows={4}
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-mesh-500/50 focus:border-mesh-500 disabled:opacity-50 resize-none"
        placeholder="Describe the software to build autonomously…"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={handleStart}
          disabled={isRunning || !text.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-mesh-600 hover:bg-mesh-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Play className="w-4 h-4" />
          {isRunning ? 'Autonomous Pipeline Running…' : 'Start Autonomous Pipeline'}
        </button>
        {run && (
          <button
            onClick={() => reset()}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-medium rounded-lg"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-600">
        Each stage invokes the local model independently. Tests execute in a restricted browser sandbox. No remote LLM calls.
      </p>
    </div>
  );
}
