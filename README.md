# AgentMesh-X

**Browser-Native Cooperative Multi-Agent AI Software Engineering Pipeline**

AgentMesh-X transforms a natural-language software requirement into a tested, reviewed, security-checked, documented, and releasable software artifact through a sequence of independently instantiated AI agents.

It expands the classic Planner → Coder → Debugger → Reviewer pattern into a full engineering lifecycle with explicit requirements, architecture, threat modeling, testing, verification, adversarial review, observability, and release stages.

> The system behaves like an engineering organization rather than a single conversational coding assistant.
> An AI-generated answer is never assumed correct merely because another AI generated it.

## Core Principles

- **Independent Agent Principle**: Every stage uses a fresh, isolated model invocation. Agents receive only approved artifacts — never hidden reasoning, conversation history, or system prompts from previous agents.
- **Artifact is the Contract**: Communication happens exclusively through structured, versioned artifacts on a shared blackboard.
- **Evidence over Consensus**: Claims must be backed by tests, static analysis, sandbox results, or deterministic tools.
- **Local-First Preference**: Inference prefers Browser → WebGPU → Transformers.js → Local Model. Source code and secrets stay in the browser unless remote inference is explicitly authorized.
- **Bounded Everything**: Retries, context, and scope are strictly limited. No infinite repair loops.

## Architecture Overview

```
Request → Requirements → Validation → Acceptance Criteria → Architecture
    → Threat Model → Test Strategy → Task DAG
    → (per task: Tests → Code → Static Analysis → Sandbox → Debug → Regression)
    → Integration → Security → Performance → Accessibility
    → Adversarial Review → Independent Review → Traceability
    → Documentation → Release Candidate → (Human Gate) → Canary → Release
```

## Getting Started

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Tech Stack

- React 18 + TypeScript
- Vite
- Zustand (blackboard state)
- Tailwind CSS
- Designed for future WebGPU + Transformers.js local inference

## Project Structure

```
src/
  ├── types/          # Artifact schemas & stage definitions
  ├── store/          # Blackboard (Zustand)
  ├── agents/         # Stage agent implementations (mocked + extensible)
  ├── components/     # UI: Pipeline, Blackboard, Artifact Viewer, etc.
  ├── orchestrator/   # Pipeline runner & quality gates
  └── App.tsx
```

## Status

This is a functional foundation implementing:

- Full stage definitions matching the AgentMesh-X specification
- Structured artifact model with epistemic labels
- Blackboard architecture
- Pipeline visualization and stage progression
- Quality gates
- Mock agents that produce realistic artifacts
- Extensible design for real local/remote model backends

## License

MIT
