import { useEffect } from 'react';
import { Header } from './components/Header';
import { ModelPanel } from './components/ModelPanel';
import { RequirementInput } from './components/RequirementInput';
import { PipelineVisualizer } from './components/PipelineVisualizer';
import { BlackboardPanel } from './components/BlackboardPanel';
import { ArtifactInspector } from './components/ArtifactInspector';
import { WorkspacePanel } from './components/WorkspacePanel';
import { StatusBar } from './components/StatusBar';
import { ProjectReportPanel } from './components/ProjectReportPanel';
import { useBlackboard } from './store/blackboard';
import { loadRun } from './lib/persistence';

export default function App() {
  const { run, hydrate } = useBlackboard();

  useEffect(() => {
    void loadRun().then((saved) => {
      if (saved && saved.status !== 'running') {
        hydrate(saved);
      }
    });
  }, [hydrate]);

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-100">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <ModelPanel />
        <RequirementInput />
        {run && <StatusBar />}
        <PipelineVisualizer />
        {run && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2">
                <BlackboardPanel />
              </div>
              <div className="lg:col-span-3">
                <ArtifactInspector />
              </div>
            </div>
            <WorkspacePanel />
            <ProjectReportPanel />
          </>
        )}
        <footer className="text-center text-[11px] text-slate-600 pt-4 pb-8">
          AgentMesh-X v1.2 — WebGPU local inference · Independent agents · Artifact contracts · Deterministic
          sandbox · Project report
        </footer>
      </main>
    </div>
  );
}
