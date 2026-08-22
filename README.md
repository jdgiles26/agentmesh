# AgentMesh-X

Browser-native cooperative multi-agent software engineering pipeline with **real local WebGPU inference**.

## Capabilities

- **Local models** via `@huggingface/transformers` (WebGPU preferred, WASM fallback)
- **Independent agents** — each stage is a fresh model invocation with no shared chat history
- **Artifact blackboard** — structured, versioned contracts only
- **Autonomous code generation** — model writes source + tests as JSON artifacts
- **Deterministic sandbox** — unit tests actually execute in the browser
- **Bounded debug loop** — on test failure, Debugger agent patches and sandbox re-runs (max 3 rounds)
- **Quality gates** — blocked artifacts stop the pipeline
- **Downloadable workspace** — ZIP export of generated project

## Quick start

```bash
npm install
npm run dev
```

1. Open the app
2. Click **Load Model** (Qwen2.5 0.5B recommended; requires ~1GB download, then cached)
3. Prefer a browser with **WebGPU** (Chrome/Edge recent)
4. Enter a software requirement
5. Start the autonomous pipeline

## Model notes

| Model | Size | Notes |
|-------|------|-------|
| Qwen2.5 0.5B Instruct | ~1GB | Default, best quality/size for browser |
| SmolLM2 360M | ~700MB | Faster, weaker |
| Qwen2.5 1.5B | ~2GB | Higher quality if you have GPU memory |

Inference stays in-browser. Requirements and generated source are not sent to a remote API.

## Architecture

```
src/
  lib/modelEngine.ts      # WebGPU/WASM load + generate
  lib/testRunner.ts       # Restricted in-browser test runner
  lib/virtualFs.ts        # Workspace
  lib/jsonExtract.ts      # Robust JSON extraction from model output
  agents/stagePrompts.ts  # Versioned system prompts per stage
  agents/agentRuntime.ts  # Fresh independent invocations
  agents/pipelineAgents.ts# Stage handlers (LLM + deterministic tools)
  orchestrator/runner.ts  # Pipeline + gates + debug loop
```

## Honest limits

Small browser models will not match frontier cloud LLMs. Complex multi-file applications may fail gates or need multiple debug rounds. The **process** (isolation, artifacts, evidence, gates) is fully implemented; generation quality scales with the loaded model.

## License

MIT
