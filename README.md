# AgentMesh-X

Browser-native cooperative multi-agent software engineering pipeline with **local WebGPU inference**, aligned with **ai-agentic-workflows** reliability patterns.

## Agentic workflow controls

| Pattern | Implementation |
|--------|----------------|
| Independent agents | Fresh model call per stage; no shared chat history |
| Explicit artifacts | Versioned blackboard contracts |
| Tool boundaries | Deterministic sandbox / static scan separated from LLM |
| Observability | Structured telemetry events per stage/tool |
| Cost control | Token estimates + stage/debug/wall-clock budgets |
| Guardrails | Requirement sanitization, secret/unsafe-code scans |
| Failure modes | Bounded debug loop, gate blocks, budget stops |
| Human control | Stop button; local-only inference |
| Persistence | IndexedDB last-run restore |

## Token budgets (generative stages)

- Code / tests / debugger: **2048**
- Docs / acceptance / architecture: **1536**
- Intake / security / threat / adversarial: **1024**

## Quick start

```bash
npm install
npm run dev
```

1. Load model (Qwen2.5 0.5B, WebGPU preferred)
2. Enter requirement
3. Start Autonomous Pipeline
4. Monitor telemetry, blackboard, workspace, project report

## Project layout

```
src/
  agents/          # prompts, runtime, stage handlers
  lib/             # model, sandbox, telemetry, budgets, guardrails
  orchestrator/    # pipeline + gates
  store/           # blackboard
  components/      # monitoring UI
```

## CI

GitHub Actions: install + production build on `main` / PRs.

## License

MIT
