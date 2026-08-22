import { useBlackboard } from '../store/blackboard';

export function ArtifactInspector() {
  const { run, selectedArtifactId } = useBlackboard();

  if (!run || !selectedArtifactId) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm h-full flex items-center justify-center min-h-[200px]">
        Select an artifact to inspect
      </div>
    );
  }

  const art = run.artifacts[selectedArtifactId];
  if (!art) return null;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 h-full overflow-y-auto">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white">{art.stage}</h2>
        <p className="text-xs text-slate-400 mt-0.5">Created by {art.created_by}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
        <Meta label="Status" value={art.status} />
        <Meta label="Confidence" value={`${(art.confidence * 100).toFixed(0)}%`} />
        <Meta label="Version" value={art.version} />
        <Meta label="ID" value={art.artifact_id.slice(0, 8) + '…'} />
      </div>

      <Section title="Content">
        <pre className="text-[11px] text-slate-300 bg-slate-950 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(art.content, null, 2)}
        </pre>
      </Section>

      {art.assumptions.length > 0 && (
        <Section title="Assumptions">
          <ul className="text-xs text-amber-200/80 list-disc list-inside space-y-1">
            {art.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Section>
      )}

      {art.unknowns.length > 0 && (
        <Section title="Unknowns">
          <ul className="text-xs text-red-200/80 list-disc list-inside space-y-1">
            {art.unknowns.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Section>
      )}

      {art.verification.length > 0 && (
        <Section title="Verification">
          <ul className="text-xs text-emerald-200/80 list-disc list-inside space-y-1">
            {art.verification.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-950 rounded px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-slate-200 font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{title}</h3>
      {children}
    </div>
  );
}
