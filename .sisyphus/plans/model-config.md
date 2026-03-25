# Per-Agent Model Configuration with Zod Validation

## TL;DR

> **Quick Summary**: Introduce a `ModelConfig` schema (`model`, `temperature`, `maxTokens`) and wire it into `OrchestratorConfig` so each agent persona can be independently configured without needing to instantiate a separate `LlmClient`. Add Zod validation of `OrchestratorConfig` at construction time and per-persona temperature defaults for reasoning-heavy agents.
>
> **Deliverables**:
> - `ModelConfigSchema` + `ModelConfig` type in `@splinty/core`
> - `OrchestratorConfig.models?: Partial<Record<AgentPersona, ModelConfig>>` field
> - `defaultModel` and `lightModel` accept `string | ModelConfig` (backward-compatible)
> - `PERSONA_TEMPERATURE_DEFAULTS` constant for reasoning vs lightweight agents
> - `OrchestratorConfigSchema` with Zod validation in `SprintOrchestrator` constructor
> - Full test coverage for fallback chain, temperature defaults, and backward compat
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (core schema) → Task 2 (orchestrator wiring + validation)

---

## Context

### Original Request
User asked: "is there a better way to handle the model types for these agents in Splinty similar to OpenCode configuration?"

### Interview Summary
**Key Discussions**:
- Current gaps: no per-persona model string override, `lightModel` hardcoded to `QA_ENGINEER` only, `temperature` hardcoded at 0.7 for all agents, no Zod validation of `OrchestratorConfig`
- Proposed: `ModelConfig` type, `models` map in `OrchestratorConfig`, string|ModelConfig union for `defaultModel`/`lightModel`, per-persona temperature defaults, Zod validation at construction
- Backward compat: callers passing `defaultModel: 'claude-3-5-sonnet-20241022'` (string) must continue to work with zero changes
- `clients: Partial<Record<AgentPersona, LlmClient>>` stays — client-level and model-level overrides are separate concerns

**Research Findings**:
- `AgentConfig.systemPrompt` is always a dead placeholder (`"${persona} system prompt"`) — agents build prompts internally; however Metis explicitly said NOT to remove it in this plan (separate housekeeping concern)
- `buildAgentConfigs` in `orchestrator.ts` already takes `model` and `lightModel` strings — the refactor is additive
- `packages/core/src/types.ts` exports `AgentConfigSchema` at line 79; `ModelConfigSchema` should be added nearby
- `packages/core/src/index.ts` uses `export * from './types'` — no manual barrel update needed for `ModelConfig`

### Metis Review
**Identified Gaps** (addressed):
- Must NOT remove `systemPrompt` from `AgentConfig` — out of scope for this plan
- Must NOT add per-persona `maxRetries` override — out of scope
- Must NOT modify `packages/cli/src/index.ts`
- `lightModel` backward compat: if `lightModel` is set and no `models[QA_ENGINEER]`, still use `lightModel` for QA
- `OrchestratorConfigSchema` must use `z.custom()` for non-serializable fields (`defaultClient`, `clients`, `sandbox`, `gitFactory`, etc.)
- Per-persona temperature defaults: `QA_ENGINEER → 0.2`, `ARCHITECTURE_PLANNER → 0.4`, `TECHNICAL_WRITER → 0.2`; all others default to `0.7`

---

## Work Objectives

### Core Objective
Add a typed, Zod-validated `ModelConfig` that allows per-agent model/temperature/maxTokens configuration via `OrchestratorConfig.models`, with a clean fallback chain and full backward compatibility.

### Concrete Deliverables
- `packages/core/src/types.ts` — `ModelConfigSchema`, `ModelConfig` type
- `packages/agents/src/orchestrator.ts` — `PERSONA_TEMPERATURE_DEFAULTS`, updated `OrchestratorConfig`, updated `buildAgentConfigs`, `OrchestratorConfigSchema`, validation in constructor
- `packages/core/src/types.test.ts` — tests for `ModelConfigSchema`
- `packages/agents/src/orchestrator.test.ts` — tests for fallback chain, temperature defaults, Zod validation, backward compat

### Definition of Done
- [ ] `bun test` passes with 0 failures across entire monorepo
- [ ] `bunx tsc --noEmit` passes in `packages/core`, `packages/agents`, `packages/cli`
- [ ] Passing `defaultModel: 'claude-3-5-sonnet-20241022'` (string) to `SprintOrchestrator` works identically to before
- [ ] `QA_ENGINEER` picks up `temperature: 0.2` by default (no explicit config needed)
- [ ] `models: { [AgentPersona.DEVELOPER]: { model: 'claude-3-opus-20240229', temperature: 0.5 } }` is resolved correctly

### Must Have
- `ModelConfig` Zod schema with `model: z.string()`, `temperature: z.number().min(0).max(1).optional()`, `maxTokens: z.number().int().positive().optional()`
- Fallback chain: `models[persona] → defaultModel → DEFAULT_MODEL` for model string; `models[persona].temperature → defaultModel.temperature → PERSONA_TEMPERATURE_DEFAULTS[persona] → 0.7` for temperature
- `OrchestratorConfigSchema` Zod schema (uses `z.custom()` for non-serializable fields)
- Validation call in `SprintOrchestrator` constructor throwing on invalid config
- Tests: valid config, invalid config (bad temperature), fallback chain all levels, per-persona temperature defaults, backward compat string `defaultModel`

### Must NOT Have (Guardrails)
- Do NOT remove `systemPrompt` from `AgentConfigSchema` — separate concern
- Do NOT add per-persona `maxRetries` override — out of scope
- Do NOT modify `packages/cli/src/index.ts`
- Do NOT change `BaseAgent.callLlm()`, `LlmRequest`, `LlmClient`, or provider clients
- Do NOT break existing `clients: Partial<Record<AgentPersona, LlmClient>>` — it stays as-is
- Do NOT use `any` or `@ts-ignore`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (`bun test`)
- **Automated tests**: Tests-after (additive tests alongside implementation)
- **Framework**: `bun test`

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/`.

- **Library/Module**: Use Bash — `bun test`, `bunx tsc --noEmit`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 1: ModelConfigSchema in @splinty/core [quick]

Wave 2 (After Wave 1):
└── Task 2: OrchestratorConfig wiring, Zod validation, tests [unspecified-high]

Wave FINAL (After Wave 2 — parallel):
├── Task F1: Plan compliance audit [oracle]
└── Task F2: Code quality + full test run [unspecified-high]

Critical Path: Task 1 → Task 2 → F1/F2
```

### Dependency Matrix
- **Task 1**: no deps → blocks Task 2
- **Task 2**: depends on Task 1 → blocks F1, F2
- **F1, F2**: depend on Task 2, run in parallel

### Agent Dispatch Summary
- **Wave 1**: Task 1 → `quick`
- **Wave 2**: Task 2 → `unspecified-high`
- **Final**: F1 → `oracle`, F2 → `unspecified-high`

---

## TODOs

- [ ] 1. Add `ModelConfigSchema` and `ModelConfig` type to `@splinty/core`

  **What to do**:
  - In `packages/core/src/types.ts`, add after `AgentConfigSchema` (around line 85):
    ```typescript
    export const ModelConfigSchema = z.object({
      model: z.string().min(1),
      temperature: z.number().min(0).max(1).optional(),
      maxTokens: z.number().int().positive().optional(),
    });
    export type ModelConfig = z.infer<typeof ModelConfigSchema>;
    ```
  - In `packages/core/src/types.test.ts`, add tests for `ModelConfigSchema`:
    - Valid: `{ model: 'claude-3-5-sonnet-20241022' }` parses correctly
    - Valid: `{ model: 'gpt-4o', temperature: 0.3, maxTokens: 2048 }` parses correctly
    - Invalid: `{ model: '' }` throws (empty string)
    - Invalid: `{ model: 'x', temperature: 1.5 }` throws (temperature out of range)
    - Invalid: `{ model: 'x', maxTokens: -1 }` throws (non-positive)

  **Must NOT do**:
  - Do not touch any file other than `types.ts` and `types.test.ts`
  - Do not remove or modify `AgentConfigSchema` or `AgentConfig`
  - Do not manually update `packages/core/src/index.ts` — `export * from './types'` already re-exports everything

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Additive schema addition to a single file with co-located tests — minimal surface area, no architectural decisions
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — no commit in this task

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/core/src/types.ts:79-85` — `AgentConfigSchema` definition: exact pattern to follow for `ModelConfigSchema`
  - `packages/core/src/types.test.ts` — existing test structure and `bun test` describe/it patterns to match

  **API/Type References**:
  - `packages/core/src/index.ts` — `export * from './types'` auto-exports `ModelConfigSchema` and `ModelConfig`; no changes needed

  **WHY Each Reference Matters**:
  - `AgentConfigSchema` is the direct neighbor in the file — insert `ModelConfigSchema` immediately after it for logical grouping
  - Existing test file shows the describe/it structure and import style to match exactly

  **Acceptance Criteria**:

  - [ ] `ModelConfigSchema` and `ModelConfig` present in `packages/core/src/types.ts`
  - [ ] 5 new tests added to `packages/core/src/types.test.ts` covering valid and invalid cases

  **QA Scenarios**:

  ```
  Scenario: ModelConfigSchema parses valid minimal config
    Tool: Bash
    Preconditions: Task 1 implementation complete
    Steps:
      1. Run: cd packages/core && bun test --grep "ModelConfigSchema"
      2. Assert: all ModelConfigSchema tests pass (0 failures)
    Expected Result: "X pass, 0 fail" output
    Evidence: .sisyphus/evidence/task-1-bun-test.txt

  Scenario: TypeScript accepts ModelConfig type
    Tool: Bash
    Preconditions: Task 1 implementation complete
    Steps:
      1. Run: cd packages/core && bunx tsc --noEmit
      2. Assert: exit code 0, no errors
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-1-tsc.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-1-bun-test.txt` — `bun test` output
  - [ ] `task-1-tsc.txt` — `tsc --noEmit` output

  **Commit**: YES
  - Message: `feat(core): add ModelConfig schema and type`
  - Files: `packages/core/src/types.ts`, `packages/core/src/types.test.ts`
  - Pre-commit: `cd packages/core && bun test`

- [ ] 2. Wire `ModelConfig` into `OrchestratorConfig`, update `buildAgentConfigs` fallback chain, add Zod validation

  **What to do**:
  - In `packages/agents/src/orchestrator.ts`:

    1. **Add `PERSONA_TEMPERATURE_DEFAULTS`** constant (after `DEFAULT_LIGHT_MODEL`):
       ```typescript
       const PERSONA_TEMPERATURE_DEFAULTS: Partial<Record<AgentPersona, number>> = {
         [AgentPersona.QA_ENGINEER]: 0.2,
         [AgentPersona.ARCHITECTURE_PLANNER]: 0.4,
         [AgentPersona.TECHNICAL_WRITER]: 0.2,
       };
       ```

    2. **Update `OrchestratorConfig`** — add `models` field and widen `defaultModel`/`lightModel`:
       ```typescript
       models?: Partial<Record<AgentPersona, ModelConfig>>;
       defaultModel?: string | ModelConfig;   // was: string
       lightModel?: string | ModelConfig;     // was: string
       ```
       Import `ModelConfig` from `@splinty/core`.

    3. **Add `OrchestratorConfigSchema`** (for Zod validation):
       ```typescript
       const OrchestratorConfigSchema = z.object({
         projectId: z.string().min(1),
         executionMode: z.enum(['story', 'planned-sprint']).optional(),
         workspaceBaseDir: z.string().optional(),
         defaultClient: z.custom<LlmClient>().optional(),
         clients: z.custom<Partial<Record<AgentPersona, LlmClient>>>().optional(),
         defaultModel: z.union([z.string().min(1), ModelConfigSchema]).optional(),
         lightModel: z.union([z.string().min(1), ModelConfigSchema]).optional(),
         models: z.record(z.nativeEnum(AgentPersona), ModelConfigSchema).partial().optional(),
         // remaining non-serializable fields use z.custom() or z.unknown().optional()
         gitFactory: z.custom<unknown>().optional(),
         createPullRequest: z.custom<unknown>().optional(),
         sandbox: z.custom<unknown>().optional(),
         sandboxConfig: z.custom<unknown>().optional(),
         pipeline: z.custom<unknown>().optional(),
         gates: z.custom<unknown>().optional(),
         humanGate: z.custom<unknown>().optional(),
         retention: z.custom<unknown>().optional(),
         serviceGuardrails: z.custom<unknown>().optional(),
       });
       ```

    4. **Add `resolveModelConfig` helper** (replaces `makeConfig` logic):
       ```typescript
       function resolveModelConfig(
         persona: AgentPersona,
         models: Partial<Record<AgentPersona, ModelConfig>> | undefined,
         defaultModel: string | ModelConfig | undefined,
       ): { model: string; temperature: number; maxTokens?: number } {
         const normalize = (m: string | ModelConfig | undefined): ModelConfig | undefined =>
           typeof m === 'string' ? { model: m } : m;
         const perPersona = models?.[persona];
         const base = normalize(defaultModel) ?? { model: DEFAULT_MODEL };
         const merged = { ...base, ...perPersona };
         const temperature =
           merged.temperature ??
           PERSONA_TEMPERATURE_DEFAULTS[persona] ??
           0.7;
         return { model: merged.model, temperature, maxTokens: merged.maxTokens };
       }
       ```

    5. **Update `buildAgentConfigs`** to use `resolveModelConfig`:
       ```typescript
       function buildAgentConfigs(
         models?: Partial<Record<AgentPersona, ModelConfig>>,
         defaultModel?: string | ModelConfig,
         lightModel?: string | ModelConfig,
       ): Record<AgentPersona, AgentConfig> {
         // lightModel backward compat: if set and no explicit models[QA_ENGINEER], use it for QA
         const effectiveModels = { ...models };
         if (lightModel && !effectiveModels[AgentPersona.QA_ENGINEER]) {
           const normalized = typeof lightModel === 'string' ? { model: lightModel } : lightModel;
           effectiveModels[AgentPersona.QA_ENGINEER] = normalized;
         }
         return Object.fromEntries(
           Object.values(AgentPersona).map((persona) => {
             const resolved = resolveModelConfig(persona, effectiveModels, defaultModel);
             return [persona, { ...makeConfig(persona, resolved.model), temperature: resolved.temperature, ...(resolved.maxTokens ? { maxTokens: resolved.maxTokens } : {}) }];
           })
         ) as Record<AgentPersona, AgentConfig>;
       }
       ```

    6. **Update `SprintOrchestrator` constructor** to call `OrchestratorConfigSchema.parse(config)` and throw on invalid config.

    7. **Update the two `buildAgentConfigs` call sites** in the orchestrator to pass `this.config.models`, `this.config.defaultModel`, `this.config.lightModel` instead of the old string-only args.

  - In `packages/agents/src/orchestrator.test.ts`, add a new `describe('model config')` block with tests:
    - Fallback chain: no config → `DEFAULT_MODEL` used for all agents
    - Fallback chain: `defaultModel: 'gpt-4o'` (string) → all agents use `'gpt-4o'`
    - Fallback chain: `defaultModel: { model: 'gpt-4o', temperature: 0.3 }` → all agents use `temperature: 0.3` unless overridden
    - Per-persona override: `models: { [QA_ENGINEER]: { model: 'gpt-4o-mini' } }` → only QA uses `'gpt-4o-mini'`
    - `lightModel` backward compat: `lightModel: 'claude-3-haiku-20240307'` → QA gets that model
    - Temperature defaults: `QA_ENGINEER → 0.2`, `ARCHITECTURE_PLANNER → 0.4`, others → `0.7`
    - Zod validation: `new SprintOrchestrator({ projectId: '' })` throws
    - Zod validation: `new SprintOrchestrator({ projectId: 'x', defaultModel: { model: 'x', temperature: 2 } })` throws

  - In `packages/agents/src/index.ts`, export `OrchestratorConfigSchema`.

  **Must NOT do**:
  - Do not remove `systemPrompt` from `AgentConfigSchema`
  - Do not add per-persona `maxRetries` override
  - Do not modify `packages/cli/src/index.ts`
  - Do not change `BaseAgent.callLlm()`, `LlmRequest`, `LlmClient`, or any provider client
  - Do not break `clients: Partial<Record<AgentPersona, LlmClient>>` — it stays unchanged

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step TypeScript refactor touching orchestrator internals, fallback chain logic, Zod schema, constructor validation, and tests — requires careful reasoning about backward compat
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — commits handled separately

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (solo, after Task 1)
  - **Blocks**: F1, F2
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/agents/src/orchestrator.ts:104-145` — full `OrchestratorConfig` interface to extend
  - `packages/agents/src/orchestrator.ts:326-374` — `makeConfig` and `buildAgentConfigs` to refactor
  - `packages/agents/src/orchestrator.ts:393-420` — `SprintOrchestrator` constructor where validation call goes
  - `packages/agents/src/orchestrator.ts:478-480` — first `buildAgentConfigs` call site to update
  - `packages/agents/src/orchestrator.ts:1122-1125` — second `buildAgentConfigs` call site to update
  - `packages/agents/src/orchestrator.test.ts` — existing describe/it test structure and mock patterns to follow

  **API/Type References**:
  - `packages/core/src/types.ts:ModelConfigSchema` (added in Task 1) — import this
  - `packages/core/src/types.ts:79` — `AgentConfigSchema` fields: `persona`, `model`, `systemPrompt`, `maxRetries`, `temperature`
  - `packages/agents/src/index.ts` — add `OrchestratorConfigSchema` export here

  **External References**:
  - Zod `z.union`, `z.custom`, `z.record`, `z.nativeEnum` — used for mixed string|object fields and non-serializable values

  **WHY Each Reference Matters**:
  - `OrchestratorConfig` lines 104-145: exact field list so nothing is accidentally omitted from `OrchestratorConfigSchema`
  - `buildAgentConfigs` lines 326-374: the function being replaced — understand its current shape before rewriting
  - Constructor lines 393-420: the exact insertion point for `OrchestratorConfigSchema.parse(config)`
  - Two call sites (478, 1122): both must be updated to pass new args or TypeScript will error

  **Acceptance Criteria**:

  - [ ] `OrchestratorConfig.models` field present and typed
  - [ ] `defaultModel` and `lightModel` accept both `string` and `ModelConfig`
  - [ ] `PERSONA_TEMPERATURE_DEFAULTS` constant defined
  - [ ] `resolveModelConfig` helper implements correct fallback chain
  - [ ] `OrchestratorConfigSchema` defined and exported from `packages/agents/src/index.ts`
  - [ ] `SprintOrchestrator` constructor calls `OrchestratorConfigSchema.parse(config)` and throws on invalid
  - [ ] All new tests in `orchestrator.test.ts` pass

  **QA Scenarios**:

  ```
  Scenario: Fallback chain — string defaultModel
    Tool: Bash
    Preconditions: Task 2 implementation complete
    Steps:
      1. Run: cd packages/agents && bun test --grep "model config"
      2. Assert: all "model config" describe block tests pass
    Expected Result: 0 failures in model config tests
    Evidence: .sisyphus/evidence/task-2-model-config-tests.txt

  Scenario: Full monorepo test suite still passes
    Tool: Bash
    Preconditions: Task 2 implementation complete
    Steps:
      1. Run from repo root: bun test
      2. Assert: exit code 0, ≥745 tests pass, 0 failures
    Expected Result: "X pass, 0 fail" — X ≥ 745
    Evidence: .sisyphus/evidence/task-2-full-bun-test.txt

  Scenario: TypeScript strict mode — no errors in any package
    Tool: Bash
    Preconditions: Task 2 implementation complete
    Steps:
      1. Run: cd packages/core && bunx tsc --noEmit
      2. Run: cd packages/agents && bunx tsc --noEmit
      3. Run: cd packages/cli && bunx tsc --noEmit
      4. Assert: all three exit with code 0
    Expected Result: No TypeScript errors across packages
    Evidence: .sisyphus/evidence/task-2-tsc-all.txt

  Scenario: Zod validation rejects invalid config
    Tool: Bash
    Preconditions: Task 2 implementation complete
    Steps:
      1. Run: cd packages/agents && bun test --grep "Zod validation"
      2. Assert: tests confirming SprintOrchestrator throws on empty projectId and bad temperature
    Expected Result: Validation tests pass
    Evidence: .sisyphus/evidence/task-2-zod-validation-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-2-model-config-tests.txt` — model config describe block output
  - [ ] `task-2-full-bun-test.txt` — full `bun test` output
  - [ ] `task-2-tsc-all.txt` — tsc output for all 3 packages
  - [ ] `task-2-zod-validation-tests.txt` — Zod validation test output

  **Commit**: YES
  - Message: `feat(agents): add per-agent model config with Zod validation`
  - Files: `packages/agents/src/orchestrator.ts`, `packages/agents/src/orchestrator.test.ts`, `packages/agents/src/index.ts`
  - Pre-commit: `bun test` (repo root)

---

## Final Verification Wave

> 2 review agents run in PARALLEL. Both must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read this plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality + Full Test Run** — `unspecified-high`
  Run `bun test` from repo root. Run `bunx tsc --noEmit` in `packages/core`, `packages/agents`, `packages/cli`. Review all changed files for `as any`, `@ts-ignore`, empty catches, console.log in production code, unused imports.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Task 1**: `feat(core): add ModelConfig schema and type`
  - Files: `packages/core/src/types.ts`, `packages/core/src/types.test.ts`
  - Pre-commit: `cd packages/core && bun test`

- **Task 2**: `feat(agents): add per-agent model config with Zod validation`
  - Files: `packages/agents/src/orchestrator.ts`, `packages/agents/src/orchestrator.test.ts`
  - Pre-commit: `bun test` (repo root)

---

## Success Criteria

### Verification Commands
```bash
bun test                                        # Expected: all pass, 0 failures
cd packages/core && bunx tsc --noEmit           # Expected: no errors
cd packages/agents && bunx tsc --noEmit         # Expected: no errors
cd packages/cli && bunx tsc --noEmit            # Expected: no errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (≥745, 0 failures)
- [ ] TypeScript strict mode: no errors across all 3 packages
