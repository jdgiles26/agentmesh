import { useBlackboard } from '../store/blackboard';
import { FileCode, Download } from 'lucide-react';
import clsx from 'clsx';
import JSZip from 'jszip';

export function WorkspacePanel() {
  const { run, selectedFilePath, selectFile } = useBlackboard();

  if (!run || run.workspace.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-sm text-slate-500">
        Generated source appears here after code generation / test generation stages.
      </div>
    );
  }

  const selected = run.workspace.find((f) => f.path === selectedFilePath) || run.workspace[0];

  const downloadZip = async () => {
    const zip = new JSZip();
    for (const f of run.workspace) zip.file(f.path, f.content);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentmesh-${run.run_id.slice(0, 8)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: 320 }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <FileCode className="w-4 h-4" />
          Workspace ({run.workspace.length} files)
        </h2>
        <button onClick={downloadZip} className="inline-flex items-center gap-1.5 text-xs text-mesh-400 hover:text-mesh-300">
          <Download className="w-3.5 h-3.5" />
          Download ZIP
        </button>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="w-48 border-r border-slate-800 overflow-y-auto shrink-0">
          {run.workspace.map((f) => (
            <button
              key={f.path}
              onClick={() => selectFile(f.path)}
              className={clsx(
                'w-full text-left px-3 py-1.5 text-xs truncate',
                selected?.path === f.path ? 'bg-mesh-950/50 text-mesh-300' : 'text-slate-400 hover:bg-slate-800/50'
              )}
            >
              {f.path}
            </button>
          ))}
        </div>
        <pre className="flex-1 p-3 text-[11px] text-slate-300 overflow-auto whitespace-pre font-mono leading-relaxed">
          {selected?.content || ''}
        </pre>
      </div>
    </div>
  );
}
