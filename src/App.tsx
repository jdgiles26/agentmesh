import { Header } from './components/Header';
import { RequirementInput } from './components/RequirementInput';
import { PipelineVisualizer } from './components/PipelineVisualizer';
import { BlackboardPanel } from './components/BlackboardPanel';
import { ArtifactInspector } from './components/ArtifactInspector';
import { StatusBar } from './components/StatusBar';
import { useBlackboard } from './store/blackboard';

export default function App() {
  const { run } = useBlackboard();

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-slate-100">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        <RequirementInput />
        {run && <StatusBar />}
        <PipelineVisualizer />
        {run && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: 380 }}>
            <div className="lg:col-span-2">
              <BlackboardPanel />
            </div>
            <div className="lg:col-span-3">
              <ArtifactInspector />
            </div>
          </div>
        )}
        <footer className="text-center text-[11px] text-slate-600 pt-4 pb-8">
          AgentMesh-X — Independent agents · Artifact contracts · Evidence over consensus · Local-first
        </footer>
      </main>
    </div>
  );
}
