# AgentMesh-X

Browser-native multi-agent software engineering pipeline with **local WebGPU inference**.

## Performance profile (optimized)

| Optimization | Effect |
|---|---|
| WebGPU `q4f16` → `fp16` → WASM `q4` fallback | Faster load & tokens/sec |
| Deterministic stages (sandbox, regression, static, integration, perf, a11y) | **No LLM** — near-instant |
| Context pruning (≤8 artifacts, truncated fields) | Lower TTFT, less VRAM |
| Serialized generate queue | Stable WebGPU throughput |
| Tighter max tokens per stage | Less generation time |
| UI yield between stages | Responsive progress |
| Debug loop max 2 | Bounded recovery cost |

## Quick start

```bash
npm install
npm run dev
```

1. **Load Model** (Qwen2.5 0.5B recommended)
2. Prefer Chrome/Edge with WebGPU
3. Enter requirement → **Start Autonomous Pipeline**

## Architecture

- `modelEngine.ts` — WebGPU/WASM load, quantized dtypes, generate queue
- `agentRuntime.ts` — independent calls + context pruning
- `pipelineAgents.ts` — LLM only where needed; tools for evidence
- `runner.ts` — gates, debug loop, UI yields

## License

MIT
