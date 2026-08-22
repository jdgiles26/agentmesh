import { useBlackboard } from '../store/blackboard';
import { buildProjectReport } from '../lib/projectReport';
import clsx from 'clsx';

export function ProjectReportPanel() {
  const { run } = useBlackboard();
  if (!run) return null;

  const report = buildProjectReport(run);
  const done = run.status === 'completed' || run.status === 'blocked' || run.status === 'failed';
  if (!done && run.status === 'running') return null;

  const statusColor: Record<string, string> = {
    PASS: 'text-emerald-400',
    FAIL: 'text-red-400',
    BLOCKED: 'text-amber-400',
    RUNNING: 'text-mesh-400',
    IDLE: 'text-slate-400',
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-200 mb-3">Project Report</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
        <Cell label="PROJECT STATUS">
          <span className={clsx('font-bold text-sm', statusColor[report.project_status])}>
            {report.project_status}
          </span>
        </Cell>
        <Cell label="REQUIREMENTS">{report.requirements.satisfied}</Cell>
        <Cell label="TESTS">
          Passed: {report.tests.passed} · Failed: {report.tests.failed}
        </Cell>
        <Cell label="SECURITY">
          C:{report.security.critical} H:{report.security.high} M:{report.security.medium} L:{report.security.low}
        </Cell>
        <Cell label="STATIC ANALYSIS">{report.static_analysis}</Cell>
        <Cell label="PERFORMANCE">{report.performance}</Cell>
        <Cell label="ACCESSIBILITY">{report.accessibility}</Cell>
        <Cell label="ARTIFACTS">{String(report.artifact_count)}</Cell>
        <Cell label="ROLLBACK">{report.rollback}</Cell>
      </div>

      {report.workspace_files.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase text-slate-500 mb-1">Changes</div>
          <div className="text-xs text-slate-300">{report.workspace_files.join(', ')}</div>
        </div>
      )}

      {report.unresolved_risks.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase text-slate-500 mb-1">Unresolved risks</div>
          <ul className="text-xs text-amber-200/80 list-disc list-inside">
            {report.unresolved_risks.slice(0, 5).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800">
        <div className="text-[10px] uppercase text-slate-500 mb-1">Final recommendation</div>
        <div className="text-sm text-slate-200">{report.final_recommendation}</div>
      </div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-950 rounded-lg px-3 py-2 border border-slate-800">
      <div className="text-[10px] uppercase text-slate-500 mb-0.5">{label}</div>
      <div className="text-slate-200">{children}</div>
    </div>
  );
}
