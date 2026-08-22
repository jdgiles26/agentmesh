import { Network, Shield, Cpu } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-mesh-500 to-mesh-700 flex items-center justify-center">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">AgentMesh-X</h1>
            <p className="text-xs text-slate-400">Browser-Native Multi-Agent Pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            Artifact-driven
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-mesh-400" />
            Local-first ready
          </span>
        </div>
      </div>
    </header>
  );
}
