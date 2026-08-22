# AgentMesh-X

Browser-native cooperative multi-agent software engineering pipeline with **local WebGPU inference**.

## Final feature set

- WebGPU-first models via `@huggingface/transformers` (WASM fallback)
- **Higher token budgets** on generative stages (tests/code/debug up to 2048)
- Independent agent invocations (no shared chat history)
- Full stage pipeline with quality gates
- Deterministic in-browser test sandbox
- Bounded autonomous debug loop
- Project report (PASS / FAIL / BLOCKED) from evidence
- Workspace browser + ZIP export
- IndexedDB persistence of last completed run
- Stop control for in-flight pipelines

## Token budgets (v1.2)

| Stage class | max_new_tokens |
|-------------|----------------|
| Code / tests / debugger | 2048 |
| Docs / acceptance / architecture | 1536 |
| Intake / security / threat / adversarial | 1024 |
| Critic / tasks / strategy | 768 |
| Gate-style summaries | 256–512 |

## Quick start

```bash
npm install
npm run dev
```

1. Load a local model (Qwen2.5 0.5B recommended; WebGPU preferred)
2. Enter a software requirement
3. Start Autonomous Pipeline
4. Inspect blackboard, workspace, and project report

## Architecture

```
src/
  lib/modelEngine.ts       # WebGPU/WASM inference
  lib/testRunner.ts        # Sandbox tests
  lib/projectReport.ts     # Final machine-readable report
  lib/persistence.ts       # IndexedDB save/load
  agents/stagePrompts.ts   # Versioned prompts + token budgets
  agents/agentRuntime.ts   # Fresh independent calls
  agents/pipelineAgents.ts # Stage handlers
  orchestrator/runner.ts   # Gates + debug loop
```

## License

MIT
