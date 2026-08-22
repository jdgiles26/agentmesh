# AgentMesh-X

**Browser-Native Cooperative Multi-Agent AI Software Engineering Pipeline**

Real working implementation of the AgentMesh-X specification.

## What actually works

| Capability | Status |
|---|---|
| 22-stage pipeline with quality gates | ✅ |
| Artifact blackboard (structured, versioned) | ✅ |
| Independent stage isolation (no shared chat history) | ✅ |
| Deterministic code generation (domain templates) | ✅ |
| Virtual workspace + file browser | ✅ |
| **In-browser unit test execution** | ✅ |
| Static analysis (basic) | ✅ |
| Security scan of generated code | ✅ |
| Regression re-run of tests | ✅ |
| Final review based on evidence only | ✅ |
| Download generated project as ZIP | ✅ |
| LLM / WebGPU local inference | 🔜 Pluggable (not bundled) |

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173

Try requirements like:

- `Build a todo list with create, toggle, and filter by status`
- `Create a simple counter with increment, decrement, and reset`
- `Implement email/password authentication with session validation`
- `Build a calculator with add, subtract, multiply, and divide`

The pipeline will:

1. Normalize requirements
2. Produce acceptance criteria
3. Generate real TypeScript source + tests
4. **Execute the tests in the browser sandbox**
5. Run security / integration / regression checks
6. Emit a release candidate when gates pass

## Architecture

```
src/
  agents/realAgents.ts   # Stage agents (artifact in → artifact out)
  lib/
    codeGenerator.ts     # Deterministic project generator
    testRunner.ts        # In-browser expect-based test runner
    virtualFs.ts         # Workspace filesystem
  orchestrator/runner.ts # Pipeline + gates
  store/blackboard.ts    # Zustand blackboard
  components/            # UI
```

## Design notes

- Agents never share conversation history — only artifacts.
- Sandbox execution results are authoritative evidence.
- Code generation is template-based (reproducible). Swap `codeGenerator.ts` / agent backends for LLM or Transformers.js later.
- Quality gates can **block** the pipeline (e.g. failing tests, high severity security findings).

## License

MIT
