# oh-my-splinty — Splinty as an OpenCode Plugin

## TL;DR

> **Quick Summary**: Convert the Splinty AI-powered SCRUM sprint pipeline (~23K LOC monorepo) into a native OpenCode plugin called "oh-my-splinty". The plugin reimplements Splinty's 12-agent pipeline as subagent dispatches via `client.session.prompt()`, with 7 plugin tools (4 sprint entry-point tools + 3 utility tools), optional `.opencode/commands/*.md` files for user-friendly `/sprint-*` invocation, file-based story loading, simplified architecture enforcement, and session-based state management.
>
> **Deliverables**:
> - New project at `/mnt/c/Users/jgron/Repos/oh-my-splinty/`
> - OpenCode plugin entry point exporting `Plugin` type
> - 4 sprint command tools: `sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run` (invoked as `/sprint_idea` etc. in OpenCode)
> - 3 utility tools: `splinty_load_stories`, `splinty_enforce_architecture`, `splinty_pipeline_status`
> - 8 agent prompt modules (ported from Splinty, adapted for OpenCode)
> - Story file parser (YAML/JSON/MD)
> - Architecture enforcer (simplified, deterministic)
> - Pipeline orchestrator with handoff management
> - Unit tests with bun test
> - Test fixtures (sample stories in YAML/JSON/MD)
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 5 waves
> **Critical Path**: Scaffold → Spike/PoC → Types+Parser+Handoff → Agents → Orchestrator+Commands → Integration

---

## Context

### Original Request
Convert the existing Splinty project into an OpenCode plugin called "oh-my-splinty". Full native rewrite, not a thin wrapper. The plugin should provide hierarchical commands for entering the pipeline at different stages (idea, design, develop, full run).

### Interview Summary
**Key Discussions**:
- **Agent mapping**: All 12 Splinty agents mapped as subagent calls via `client.session.prompt()` — though v1 implements 8 core agents (specialist agents deferred)
- **Architecture enforcement**: Included in v1 as a core differentiator — simplified deterministic rules
- **Tool naming**: Tool IDs use underscores — `sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`. Optional `.opencode/commands/*.md` files provide `/sprint-*` invocation UX
- **Git automation**: OpenCode handles all git — plugin focuses on code generation only
- **Story sources**: File-based only (YAML/JSON/MD) for v1
- **State management**: Session-based — no custom ledger/checkpoint system
- **Docker sandbox**: Deferred to v2
- **Prompt strategy**: Port existing Splinty agent prompts, adapting for OpenCode interaction model
- **Tests**: Unit tests with bun test, mocked client calls

**Research Findings**:
- OpenCode Plugin API: `tool`, `event`, `chat.message`, `tool.execute`, `permission.ask` hooks
- Subagent dispatch via `client.session.prompt()` with `system` prompt and `parts` for context
- oh-my-opencode demonstrates large-scale plugin orchestration patterns
- Splinty's key portable modules: types/schemas (Zod), HandoffManager, StoryStateMachine, ArchitectureEnforcer, ProjectContextBuilder, FileStoryConnector, 12 agent implementations

### Metis Review
**Identified Gaps** (addressed):
- **Session isolation**: One session per agent with handoff serialization (not shared session) — prevents context overflow
- **No Docker/sandbox code**: Must be completely removed, not stubbed
- **Specialist agents deferred**: MigrationEngineer, InfrastructureEngineer, IntegrationTestEngineer, SoundEngineer are v2
- **No checkpoint/resume**: Pipeline runs atomically — completes or fails
- **No plan revision**: Architecture enforcement is one-pass only in v1
- **Tool output size limit**: Max 8000 chars per tool output — use file artifacts for larger outputs
- **Tool idempotency**: All plugin tools must be safe to retry
- **API validation spike needed**: Must validate `session.prompt()` with system prompt injection before full implementation
- **Context budget per agent**: Define max tokens in prompt and output

---

## Work Objectives

### Core Objective
Create a production-ready OpenCode plugin that reimplements Splinty's SCRUM sprint pipeline, allowing users to run AI-powered development workflows through 7 plugin tools (4 sprint entry-point tools + 3 utility tools) that orchestrate 8 specialized agents via `client.session.prompt()`.

### Concrete Deliverables
- `/mnt/c/Users/jgron/Repos/oh-my-splinty/` — Complete project directory
- `src/index.ts` — Plugin entry point exporting `Plugin` type from `@opencode-ai/plugin`, registers all 7 tools
- `src/agents/*.ts` — 8 agent prompt modules
- `src/commands/*.ts` — 4 sprint tool implementation files (`sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`) — these export tool definition objects imported by `src/index.ts`
- `src/core/*.ts` — Types, schemas, handoff, state machine, story parser, enforcer, project context builder
- `.opencode/commands/*.md` — 4 markdown files (`sprint-idea.md`, `sprint-design.md`, `sprint-develop.md`, `sprint-run.md`) that provide user-friendly `/sprint-idea` etc. invocation in OpenCode
- `test/**/*.test.ts` — Unit tests
- `test/fixtures/` — Sample stories in YAML/JSON/MD
- `package.json` — With `@opencode-ai/plugin`, `@opencode-ai/sdk`, `zod`, `js-yaml` dependencies

### Naming Convention (Canonical Mapping)

> **CRITICAL**: Plugins register **tools** (via `tool: {}` in the plugin return object).
> Slash commands (`/command-name`) are a SEPARATE OpenCode feature via `.opencode/commands/*.md` files.
> This project uses BOTH: tools are the engine, commands are the UX.

| Component | Canonical ID | How Created | How Invoked |
|-----------|-------------|-------------|-------------|
| Plugin tool | `sprint_idea` (underscore) | Registered in `src/index.ts` via plugin `tool: {}` | Agent/LLM calls the tool by ID |
| Plugin tool | `sprint_design` (underscore) | Registered in `src/index.ts` via plugin `tool: {}` | Agent/LLM calls the tool by ID |
| Plugin tool | `sprint_develop` (underscore) | Registered in `src/index.ts` via plugin `tool: {}` | Agent/LLM calls the tool by ID |
| Plugin tool | `sprint_run` (underscore) | Registered in `src/index.ts` via plugin `tool: {}` | Agent/LLM calls the tool by ID |
| Plugin tool | `splinty_load_stories` (underscore) | Registered in `src/index.ts` via plugin `tool: {}` | Agent/LLM calls the tool by ID |
| Plugin tool | `splinty_enforce_architecture` (underscore) | Registered in `src/index.ts` via plugin `tool: {}` | Agent/LLM calls the tool by ID |
| Plugin tool | `splinty_pipeline_status` (underscore) | Registered in `src/index.ts` via plugin `tool: {}` | Agent/LLM calls the tool by ID |
| Command file | `sprint-idea.md` (hyphen) | Created at `.opencode/commands/sprint-idea.md` | User types `/sprint-idea` in OpenCode |
| Command file | `sprint-design.md` (hyphen) | Created at `.opencode/commands/sprint-design.md` | User types `/sprint-design` in OpenCode |
| Command file | `sprint-develop.md` (hyphen) | Created at `.opencode/commands/sprint-develop.md` | User types `/sprint-develop` in OpenCode |
| Command file | `sprint-run.md` (hyphen) | Created at `.opencode/commands/sprint-run.md` | User types `/sprint-run` in OpenCode |
| Source file | `sprint-idea.ts` (hyphen) | TypeScript file at `src/commands/sprint-idea.ts` | Imported by `src/index.ts` |
| Source file | `sprint-design.ts` (hyphen) | TypeScript file at `src/commands/sprint-design.ts` | Imported by `src/index.ts` |
| Source file | `sprint-develop.ts` (hyphen) | TypeScript file at `src/commands/sprint-develop.ts` | Imported by `src/index.ts` |
| Source file | `sprint-run.ts` (hyphen) | TypeScript file at `src/commands/sprint-run.ts` | Imported by `src/index.ts` |

**Rule**: Underscores for tool IDs (OpenCode convention). Hyphens for file names (TypeScript/markdown convention).

### Definition of Done
- [ ] `bun test` passes with 0 failures
- [ ] `bun run build` succeeds (TypeScript compiles cleanly)
- [ ] Plugin loads in OpenCode without errors
- [ ] `sprint_run` tool successfully orchestrates a multi-agent pipeline on a test story
- [ ] Architecture enforcer catches known violations in test fixtures

### Must Have
- All 4 sprint command tools functional (`sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`)
- 3 utility tools registered (`splinty_load_stories`, `splinty_enforce_architecture`, `splinty_pipeline_status`)
- 8 core agent prompts ported and adapted
- File-based story loading (YAML, JSON, Markdown)
- Handoff serialization between agents (one session per agent)
- Architecture enforcement (dependency boundaries, file ownership)
- Story state machine tracking pipeline progress
- Unit tests for all core modules
- Error handling for agent failures (graceful skip/halt)
- Project context building for developer agent

### Must NOT Have (Guardrails)
- **NO Docker/sandbox code** — not stubs, not interfaces, not TODOs, nothing
- **NO direct LLM API calls** — all AI reasoning via `client.session.prompt()`
- **NO git automation** — no branch creation, commits, or PR management
- **NO Jira/GitHub integrations** — file-based stories only
- **NO checkpoint/resume** — pipeline runs are atomic
- **NO plan revision or drift scoring** — enforcement is one-pass
- **NO telemetry/metrics** — no custom cost tracking
- **NO custom UI/TUI** — all output through tool return strings
- **NO `llm-client.ts` porting** — removed entirely
- **NO CLI porting** — OpenCode replaces CLI
- **NO specialist agents** — MigrationEngineer, InfrastructureEngineer, IntegrationTestEngineer, SoundEngineer are v2
- **NO project memory persistence** — no `project-memory.ts` porting
- **NO service guard** — no multi-service orchestration
- **NO `fs` imports** — use BunShell (`$`) or OpenCode tools for file I/O

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (new project — will set up)
- **Automated tests**: YES (tests-after — unit tests with mocked client)
- **Framework**: bun test
- **Test setup**: Included in scaffold task (Wave 1)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Plugin loading**: Use Bash — verify plugin exports correct shape
- **Tool registration**: Use Bash — verify tools are callable
- **Agent dispatch**: Use Bash — mock client, verify prompt assembly
- **Story parsing**: Use Bash — parse fixtures, assert output
- **Architecture enforcement**: Use Bash — run against violation fixtures, assert results

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — project foundation):
├── Task 1: Project scaffold + build config [quick]
├── Task 2: Spike — validate OpenCode session.prompt() API [deep]
└── Task 3: Test fixtures (sample stories YAML/JSON/MD) [quick]

Wave 2 (After Wave 1 — core infrastructure, MAX PARALLEL):
├── Task 4: Types + Zod schemas (port from @splinty/core) [quick]
├── Task 5: Story file parser (port from @splinty/integrations) [unspecified-high]
├── Task 6: Handoff manager + serialization [quick]
├── Task 7: Story state machine [quick]
└── Task 8: Architecture plan types (port from @splinty/core) [quick]

Wave 3 (After Wave 2 — agents + enforcer, MAX PARALLEL):
├── Task 9: Agent base module + prompt template system [unspecified-high]
├── Task 10: BusinessOwner agent prompt [quick]
├── Task 11: ProductOwner agent prompt [quick]
├── Task 12: ArchitecturePlanner agent prompt [unspecified-high]
├── Task 13: Architect agent prompt [quick]
├── Task 14: Developer agent prompt [unspecified-high]
├── Task 15: QA Engineer agent prompt [quick]
├── Task 16: Technical Writer agent prompt [quick]
├── Task 17: Architecture Enforcer (deterministic) [deep]
└── Task 18: Project context builder [unspecified-high]

Wave 4 (After Wave 3 — orchestrator + commands):
├── Task 19: Pipeline orchestrator [deep]
├── Task 20: Plugin entry point + tool registration [unspecified-high]
└── Task 21: Sprint tool implementations (sprint_idea, sprint_design, sprint_develop, sprint_run) + .opencode/commands/*.md [unspecified-high]

Wave 5 (After Wave 4 — integration + verification):
├── Task 22: Integration test — full pipeline [deep]
└── Task 23: Build verification + plugin load test [quick]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 4 → Task 9 → Task 19 → Task 22 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 10 (Wave 3)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2-8, 9-18, 19-23 |
| 2 | 1 | 9, 19, 20 (must validate API assumptions first) |
| 3 | — | 5, 22 |
| 4 | 1 | 5-18 |
| 5 | 3, 4 | 19-22 |
| 6 | 4 | 9, 19 |
| 7 | 4 | 19 |
| 8 | 4 | 12, 17 |
| 9 | 2, 4, 6 | 10-16, 19 |
| 10 | 9 | 19 |
| 11 | 9 | 19 |
| 12 | 8, 9 | 19 |
| 13 | 9 | 19 |
| 14 | 9 | 19 |
| 15 | 9 | 19 |
| 16 | 9 | 19 |
| 17 | 4, 8 | 19 |
| 18 | 4 | 14, 19 |
| 19 | 5-7, 9-18 | 21, 22 |
| 20 | 2, 19 | 21, 22 |
| 21 | 19, 20 | 22 |
| 22 | 3, 19-21 | F1-F4 |
| 23 | 1, 20 | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `deep`, T3 → `quick`
- **Wave 2**: 5 tasks — T4 → `quick`, T5 → `unspecified-high`, T6 → `quick`, T7 → `quick`, T8 → `quick`
- **Wave 3**: 10 tasks — T9 → `unspecified-high`, T10-11 → `quick`, T12 → `unspecified-high`, T13 → `quick`, T14 → `unspecified-high`, T15-16 → `quick`, T17 → `deep`, T18 → `unspecified-high`
- **Wave 4**: 3 tasks — T19 → `deep`, T20 → `unspecified-high`, T21 → `unspecified-high`
- **Wave 5**: 2 tasks — T22 → `deep`, T23 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Project Scaffold + Build Config

  **What to do**:
  - Create project directory at `/mnt/c/Users/jgron/Repos/oh-my-splinty/`
  - Initialize with `bun init`
  - Create `package.json` with name "oh-my-splinty", dependencies: `@opencode-ai/plugin`, `@opencode-ai/sdk`, `zod`, `js-yaml`
  - Dev dependencies: `@types/js-yaml`, `typescript`
  - Create `tsconfig.json` targeting ESNext with strict mode, module resolution "bundler"
  - Create minimal `src/index.ts` that exports a valid Plugin (empty hooks — just compiles)
  - Create `test/` directory with a placeholder test
  - Add npm scripts: `build` (tsc), `test` (bun test)
  - Verify `bun run build` and `bun test` both pass

  **Must NOT do**:
  - Do NOT add Docker-related dependencies
  - Do NOT import `fs` anywhere
  - Do NOT add Anthropic/OpenAI SDKs as dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple project scaffolding with known config files
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: No UI involved
    - `playwright`: No browser testing needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2-8, 9-18, 19-23
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/cli/src/index.ts` in `/mnt/c/Users/jgron/Repos/splinty/` — Reference for project structure understanding (NOT to copy CLI code)

  **API/Type References**:
  - OpenCode Plugin type: `import type { Plugin } from "@opencode-ai/plugin"` — Plugin interface to implement

  **External References**:
  - OpenCode plugin guide: `https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a` — Plugin structure and config
  - OpenCode plugin dev: `https://gist.github.com/rstacruz/946d02757525c9a0f49b25e316fbe715` — Plugin development patterns

  **WHY Each Reference Matters**:
  - Plugin guide shows the exact export shape needed (`Plugin` type returning hooks object)
  - Plugin dev reference shows how to configure `opencode.json` for local plugin development

  **Acceptance Criteria**:
  - [ ] `bun run build` → exits 0 with no TypeScript errors
  - [ ] `bun test` → exits 0 (placeholder test passes)
  - [ ] `src/index.ts` exports a valid Plugin function signature
  - [ ] `package.json` has correct dependencies listed
  - [ ] No `fs` imports anywhere in the project

  **QA Scenarios**:

  ```
  Scenario: Build compiles cleanly
    Tool: Bash
    Preconditions: Project scaffolded at /mnt/c/Users/jgron/Repos/oh-my-splinty/
    Steps:
      1. Run `bun run build` in project directory
      2. Check exit code is 0
      3. Verify no `.ts` errors in output
    Expected Result: Exit code 0, no errors in stdout/stderr
    Failure Indicators: Non-zero exit code, "error TS" in output
    Evidence: .sisyphus/evidence/task-1-build-clean.txt

  Scenario: Plugin export shape is valid
    Tool: Bash
    Preconditions: Build passes
    Steps:
      1. Run `bun -e "const m = require('./src/index.ts'); console.log(typeof m.default || typeof m.OhMySplinty)"` in project directory
      2. Assert output is "function"
    Expected Result: Output contains "function"
    Failure Indicators: Output is "undefined" or throws error
    Evidence: .sisyphus/evidence/task-1-plugin-export.txt
  ```

  **Commit**: YES
  - Message: `chore(init): scaffold oh-my-splinty project`
  - Files: `package.json`, `tsconfig.json`, `src/index.ts`, `test/`
  - Pre-commit: `bun run build && bun test`

- [ ] 2. Spike — Validate OpenCode session.prompt() API Assumptions

  **What to do**:
  - Create a minimal spike plugin at `spike/` within the project
  - The spike MUST validate these critical API assumptions before any real implementation:
    1. **System prompt injection**: Call `client.session.prompt()` with `body.system` set to a custom system prompt. Verify the AI response follows the custom system prompt instructions.
    2. **Tool availability in SDK sessions**: Register a custom tool in the plugin. Create a new session via `client.session.create()`. Call `client.session.prompt()` on that session. Verify the custom tool is available and callable.
    3. **Session isolation**: Create two sessions. Send different context to each. Verify no cross-contamination.
    4. **Prompt blocking behavior**: Verify `client.session.prompt()` blocks until the full response completes (including all tool calls)
  - Document findings in `spike/FINDINGS.md`
  - If any assumption FAILS, document the workaround and update the architectural approach
  - This spike is CRITICAL — if system prompt injection doesn't work, the entire agent dispatch model needs redesign

  **Must NOT do**:
  - Do NOT write production code — spike only
  - Do NOT make direct LLM API calls
  - Do NOT import `fs`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful API exploration and validation of undocumented behavior
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser needed for API spike

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 9, 19, 20 (agent dispatch model depends on spike findings)
  - **Blocked By**: Task 1 (needs project scaffold to exist)

  **References**:

  **API/Type References**:
  - OpenCode SDK client: `@opencode-ai/sdk` — `client.session.create()`, `client.session.prompt()`, `client.session.list()`
  - `SessionPromptData` type — `body.system`, `body.agent`, `body.tools`, `body.parts` fields

  **External References**:
  - OpenCode plugin guide: `https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a` — Plugin tool registration pattern
  - AgentSkills plugin reference: `https://agentskills.so/skills/igorwarzocha-opencode-workflows-create-opencode-plugin` — Real plugin examples

  **WHY Each Reference Matters**:
  - SDK types show exact `session.prompt()` signature and what fields are available
  - Plugin guide shows how tools are registered and become available

  **Acceptance Criteria**:
  - [ ] `spike/FINDINGS.md` exists with documented results for all 4 assumptions
  - [ ] Each assumption marked CONFIRMED or FAILED with evidence
  - [ ] If any assumption FAILED, a workaround is documented

  **QA Scenarios**:

  ```
  Scenario: Spike findings document exists and is complete
    Tool: Bash
    Preconditions: Spike has been executed against a running OpenCode instance
    Steps:
      1. Read spike/FINDINGS.md
      2. Verify it contains sections for: System Prompt Injection, Tool Availability, Session Isolation, Blocking Behavior
      3. Verify each section has a CONFIRMED/FAILED verdict
    Expected Result: All 4 sections present with verdicts
    Failure Indicators: Missing sections, no verdicts, or file doesn't exist
    Evidence: .sisyphus/evidence/task-2-spike-findings.txt

  Scenario: System prompt injection works
    Tool: Bash
    Preconditions: OpenCode running with plugin loaded
    Steps:
      1. Plugin creates session with system prompt "You are a calculator. Only respond with numbers."
      2. Sends prompt "What is 2+2?"
      3. Verify response is "4" or contains only a number
    Expected Result: Response follows custom system prompt instructions
    Failure Indicators: Response ignores system prompt, uses default agent behavior
    Evidence: .sisyphus/evidence/task-2-system-prompt.txt
  ```

  **Commit**: YES
  - Message: `spike(api): validate OpenCode session.prompt() with system prompts`
  - Files: `spike/`, `spike/FINDINGS.md`
  - Pre-commit: none (spike, not production code)

- [ ] 3. Test Fixtures — Sample Stories in YAML/JSON/MD

  **What to do**:
  - Create `test/fixtures/` directory
  - Create `test/fixtures/stories.yaml` — 3 sample stories with dependencies, acceptance criteria, varying complexity
  - Create `test/fixtures/stories.json` — Same 3 stories in JSON format
  - Create `test/fixtures/stories.md` — Same 3 stories in Markdown format (using `## Story: <title>` heading pattern)
  - Create `test/fixtures/single-story.yaml` — A single simple story (for unit tests)
  - Create `test/fixtures/invalid-story.yaml` — Malformed YAML for error handling tests
  - Create `test/fixtures/violation-code/` — Sample TypeScript files with known architecture violations (cross-boundary imports, wrong file ownership) for enforcer tests
  - Stories should be realistic but small — an "auth" module with login, register, and password reset stories

  **Must NOT do**:
  - Do NOT create real application code — only test fixtures
  - Do NOT use Splinty-specific features in fixtures (no service definitions, no sandbox configs)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating static test data files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 5 (parser tests), 22 (integration tests)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/docs/backlog.yaml` — Splinty's example backlog format (YAML story structure with id, title, description, acceptanceCriteria, dependsOn)
  - `/mnt/c/Users/jgron/Repos/splinty/packages/integrations/src/file.ts:40-60` — Markdown parsing format: `## Story: <title>`, `### Acceptance Criteria`, `- <criterion>`, `Depends On: id1, id2`

  **API/Type References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/types.ts:47-62` — `StorySchema` showing required fields: id, title, description, acceptanceCriteria, state, source, dependsOn

  **WHY Each Reference Matters**:
  - `backlog.yaml` shows the real-world YAML story format users will create
  - `file.ts` markdown parser shows the exact heading patterns that must be supported
  - `StorySchema` defines the validated output shape — fixtures must be parseable into this

  **Acceptance Criteria**:
  - [ ] `test/fixtures/stories.yaml` exists with 3 stories, including `dependsOn` relationships
  - [ ] `test/fixtures/stories.json` has identical stories in JSON
  - [ ] `test/fixtures/stories.md` has identical stories in Markdown
  - [ ] `test/fixtures/single-story.yaml` has one simple story
  - [ ] `test/fixtures/invalid-story.yaml` has malformed data
  - [ ] `test/fixtures/violation-code/` contains files with import boundary violations

  **QA Scenarios**:

  ```
  Scenario: YAML fixture is valid YAML
    Tool: Bash
    Preconditions: Fixtures created
    Steps:
      1. Run `bun -e "import yaml from 'js-yaml'; const fs = await Bun.file('test/fixtures/stories.yaml').text(); console.log(JSON.stringify(yaml.load(fs)))"` in project directory
      2. Verify output is valid JSON array with 3 items
    Expected Result: JSON array with 3 objects, each having id, title, description, acceptanceCriteria
    Failure Indicators: YAML parse error, wrong number of items
    Evidence: .sisyphus/evidence/task-3-yaml-fixture.txt

  Scenario: Stories have dependency relationships
    Tool: Bash
    Preconditions: Fixtures created
    Steps:
      1. Parse stories.yaml
      2. Verify at least one story has `dependsOn` array with non-empty values
    Expected Result: At least one story has dependsOn referencing another story's id
    Failure Indicators: No dependsOn fields, or dependsOn references non-existent ids
    Evidence: .sisyphus/evidence/task-3-dependencies.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `test(fixtures): add sample stories in YAML/JSON/MD formats`
  - Files: `test/fixtures/`
  - Pre-commit: none (static data files)

- [ ] 4. Types + Zod Schemas (Port from @splinty/core)

  **What to do**:
  - Create `src/core/types.ts` — Port essential types and Zod schemas from Splinty:
    - `StoryState` enum (RAW, EPIC, USER_STORY, REFINED, SPRINT_READY, IN_PROGRESS, IN_REVIEW, DONE — remove PR_OPEN, MERGED since git is handled by OpenCode)
    - `AgentPersona` enum (8 core agents only: BUSINESS_OWNER, PRODUCT_OWNER, ARCHITECT, DEVELOPER, QA_ENGINEER, TECHNICAL_WRITER, ARCHITECTURE_PLANNER, ORCHESTRATOR — NO specialist agents)
    - `StorySchema` — Same as Splinty but remove `source`/`sourceId` (always FILE), simplify `workspacePath`
    - `HandoffDocumentSchema` — Keep as-is, it's the inter-agent protocol
    - `AgentConfigSchema` — Simplify: remove `model` field (OpenCode manages models), keep persona, systemPrompt, maxRetries
    - `PipelineStep` and `PipelineConfig` interfaces — Keep for configurable pipeline
  - Create `src/core/index.ts` barrel export
  - Do NOT port: StoryMetrics, AppBuilderResult, ExecutionMetrics, AggregateSandboxTelemetry, SprintTelemetry, ServiceDefinition, ServiceGuardrails, ModelConfig
  - Write unit tests in `test/core/types.test.ts` — Verify Zod schema validation (valid + invalid inputs)

  **Must NOT do**:
  - Do NOT port sandbox-related types
  - Do NOT port telemetry types
  - Do NOT port service/multi-service types
  - Do NOT include `model` in AgentConfigSchema — OpenCode handles model selection

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward type porting with Zod schemas — well-defined source to copy from
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: Tasks 5-18 (all modules depend on types)
  - **Blocked By**: Task 1 (project must exist)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/types.ts:1-62` — Source StorySchema, HandoffDocumentSchema with all fields
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/types.ts:79-85` — AgentConfigSchema to simplify
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/types.ts:192-208` — StoryContext, PipelineStep, PipelineConfig interfaces to keep

  **API/Type References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/types.ts:11-43` — StoryState and AgentPersona enums — copy but filter to 8 agents

  **WHY Each Reference Matters**:
  - `types.ts:1-62` is the exact Zod schema to port — preserves validation rules
  - `types.ts:79-85` shows what AgentConfig looks like — simplify by removing `model` field
  - `types.ts:192-208` shows pipeline config interfaces — keep these unchanged for orchestrator

  **Acceptance Criteria**:
  - [ ] `src/core/types.ts` exists with StoryState (8 states), AgentPersona (8 agents), StorySchema, HandoffDocumentSchema, AgentConfigSchema
  - [ ] `bun test test/core/types.test.ts` → PASS
  - [ ] Zod schemas validate correct data and reject invalid data
  - [ ] No telemetry, sandbox, service, or specialist agent types present

  **QA Scenarios**:

  ```
  Scenario: StorySchema validates a correct story
    Tool: Bash
    Preconditions: types.ts exists
    Steps:
      1. Run bun test that parses a valid story object through StorySchema
      2. Assert parse succeeds without throwing
      3. Assert parsed output has all required fields
    Expected Result: StorySchema.parse({...validStory}) returns successfully
    Failure Indicators: ZodError thrown, missing fields
    Evidence: .sisyphus/evidence/task-4-schema-valid.txt

  Scenario: StorySchema rejects invalid data
    Tool: Bash
    Preconditions: types.ts exists
    Steps:
      1. Run bun test that attempts StorySchema.parse({}) (empty object)
      2. Assert ZodError is thrown
      3. Run bun test that attempts StorySchema.parse({id: ""}) (empty id)
      4. Assert ZodError is thrown
    Expected Result: Both invalid inputs produce ZodError
    Failure Indicators: Parse succeeds when it should fail
    Evidence: .sisyphus/evidence/task-4-schema-invalid.txt
  ```

  **Commit**: YES (groups with Tasks 5-8)
  - Message: `feat(core): add types and Zod schemas`
  - Files: `src/core/types.ts`, `src/core/index.ts`, `test/core/types.test.ts`
  - Pre-commit: `bun test`

- [ ] 5. Story File Parser (Port from @splinty/integrations)

  **What to do**:
  - Create `src/core/story-parser.ts` — Port file-based story loading from Splinty's `file.ts`:
    - `parseYamlStories(content: string): Story[]` — YAML array of story objects
    - `parseJsonStories(content: string): Story[]` — JSON array of story objects
    - `parseMarkdownStories(content: string): Story[]` — Markdown with `## Story: <title>` headings
    - `loadStoriesFromFile(filePath: string): Promise<Story[]>` — Auto-detect format by extension, parse, validate through StorySchema, assign defaults (state=RAW, generated id if missing)
    - `ParseError` custom error class
  - Use BunShell (`$`) or `Bun.file()` for file reading — NO `import * as fs from 'fs'`
  - Validate all parsed stories through StorySchema from Task 4
  - Handle edge cases: empty file, no stories found, malformed YAML/JSON
  - Write unit tests using fixtures from Task 3

  **Must NOT do**:
  - Do NOT import `fs` — use Bun's native file API
  - Do NOT support Jira or GitHub sources
  - Do NOT write story files (read-only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Non-trivial parsing logic with 3 formats and edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7, 8)
  - **Blocks**: Tasks 19 (orchestrator needs story loading), 22 (integration tests)
  - **Blocked By**: Tasks 3 (fixtures), 4 (types)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/integrations/src/file.ts:1-192` — FULL file to port. Contains `parseMarkdownStories()`, `loadStoriesFromFile()`, `ParseError`. Port the logic but replace `fs` with Bun APIs.
  - `/mnt/c/Users/jgron/Repos/splinty/packages/integrations/src/file.ts:40-60` — Markdown parsing logic: heading regex `/^##\s+(?:Story:\s+)?(.+)/i`, AC regex `/^###\s+(Acceptance Criteria|AC)/i`, depends-on regex
  - `/mnt/c/Users/jgron/Repos/splinty/packages/integrations/src/file.ts:62-100` — YAML/JSON parsing with `js-yaml` library

  **API/Type References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/types.ts:47-62` — StorySchema for validation of parsed output

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/integrations/src/file.test.ts` — Existing tests to adapt

  **WHY Each Reference Matters**:
  - `file.ts` is the exact code to port — the parsing logic, regex patterns, and error handling
  - `file.test.ts` shows what edge cases the original tests cover — adapt for oh-my-splinty

  **Acceptance Criteria**:
  - [ ] `src/core/story-parser.ts` exports `loadStoriesFromFile`, `parseYamlStories`, `parseJsonStories`, `parseMarkdownStories`
  - [ ] `bun test test/core/story-parser.test.ts` → PASS
  - [ ] YAML fixture parses to 3 Story objects with correct fields
  - [ ] JSON fixture parses to identical Story objects
  - [ ] MD fixture parses to identical Story objects
  - [ ] Invalid fixture throws ParseError
  - [ ] No `import * as fs` in the file

  **QA Scenarios**:

  ```
  Scenario: Parse YAML stories file
    Tool: Bash
    Preconditions: story-parser.ts and fixtures exist
    Steps:
      1. Run bun test that calls loadStoriesFromFile("test/fixtures/stories.yaml")
      2. Assert returns array of 3 Story objects
      3. Assert each has id, title, description, acceptanceCriteria
      4. Assert at least one has dependsOn with valid reference
    Expected Result: 3 valid Story objects returned
    Failure Indicators: ParseError thrown, wrong count, missing fields
    Evidence: .sisyphus/evidence/task-5-yaml-parse.txt

  Scenario: Invalid YAML throws ParseError
    Tool: Bash
    Preconditions: invalid-story.yaml fixture exists
    Steps:
      1. Run bun test that calls loadStoriesFromFile("test/fixtures/invalid-story.yaml")
      2. Assert ParseError is thrown
      3. Assert error message contains file path
    Expected Result: ParseError with descriptive message
    Failure Indicators: No error thrown, generic Error instead of ParseError
    Evidence: .sisyphus/evidence/task-5-invalid-parse.txt
  ```

  **Commit**: YES (groups with Tasks 4, 6-8)
  - Message: `feat(core): add story file parser (YAML/JSON/MD)`
  - Files: `src/core/story-parser.ts`, `test/core/story-parser.test.ts`
  - Pre-commit: `bun test`

- [ ] 6. Handoff Manager + Serialization

  **What to do**:
  - Create `src/core/handoff.ts` — Port HandoffManager from Splinty:
    - `create()` — Build a HandoffDocument, validate via Zod
    - `serialize(handoff: HandoffDocument): string` — JSON stringify for passing between sessions
    - `deserialize(json: string): HandoffDocument` — Parse + validate
    - `summarize(handoff: HandoffDocument): string` — Compact text summary for context-constrained situations (max 2000 chars)
  - Remove file-based save/load (no workspace persistence in v1 — handoffs live in memory during pipeline run)
  - Ensure round-trip fidelity: `deserialize(serialize(handoff))` === original
  - Write unit tests

  **Must NOT do**:
  - Do NOT persist handoffs to disk (session-based state only)
  - Do NOT import `fs`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small module with well-defined input/output — direct port with simplification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7, 8)
  - **Blocks**: Tasks 9 (agent base needs handoff), 19 (orchestrator chains handoffs)
  - **Blocked By**: Task 4 (HandoffDocumentSchema)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/handoff.ts:1-127` — FULL file to port. Contains `create()`, `save()`, `load()`, `summarize()`. Keep `create()` and `summarize()`, remove `save()`/`load()` (no file persistence), add `serialize()`/`deserialize()`.

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/handoff.test.ts` — Existing tests to adapt

  **WHY Each Reference Matters**:
  - `handoff.ts` has the exact create + summarize logic; we port those and replace file I/O with JSON serialization

  **Acceptance Criteria**:
  - [ ] `src/core/handoff.ts` exports `HandoffManager` with `create`, `serialize`, `deserialize`, `summarize`
  - [ ] Round-trip: `deserialize(serialize(handoff))` deep-equals original
  - [ ] `summarize()` output ≤ 2000 characters
  - [ ] Invalid JSON in `deserialize()` throws ZodError
  - [ ] `bun test test/core/handoff.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: Handoff round-trip serialization
    Tool: Bash
    Preconditions: handoff.ts and types exist
    Steps:
      1. Create a HandoffDocument via manager.create()
      2. Serialize to JSON string
      3. Deserialize back to HandoffDocument
      4. Deep-compare original and deserialized
    Expected Result: Objects are deeply equal
    Failure Indicators: Fields differ after round-trip, ZodError on deserialize
    Evidence: .sisyphus/evidence/task-6-roundtrip.txt

  Scenario: Summarize produces compact output
    Tool: Bash
    Preconditions: handoff.ts exists
    Steps:
      1. Create a HandoffDocument with large stateOfWorld (10+ entries)
      2. Call summarize()
      3. Assert output length ≤ 2000 characters
      4. Assert output contains fromAgent, toAgent, nextGoal
    Expected Result: String ≤ 2000 chars with key info preserved
    Failure Indicators: Output > 2000 chars, missing key fields
    Evidence: .sisyphus/evidence/task-6-summarize.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 7, 8)
  - Message: `feat(core): add handoff manager with serialization`
  - Files: `src/core/handoff.ts`, `test/core/handoff.test.ts`
  - Pre-commit: `bun test`

- [ ] 7. Story State Machine

  **What to do**:
  - Create `src/core/story-state-machine.ts` — Port from Splinty:
    - `TRANSITIONS` map — Define valid state transitions (simplified: remove PR_OPEN→MERGED since git is OpenCode's job)
    - `RESPONSIBLE_AGENT` map — Map each state to the agent persona that handles it
    - `StoryStateMachine` class with:
      - `canTransition(from, to): boolean`
      - `getNextStates(current): StoryState[]`
      - `getResponsibleAgent(state): AgentPersona`
      - `transition(story, nextState): Story` (validates + returns updated story)
    - `InvalidStateTransitionError` custom error
  - Write unit tests for all transitions and edge cases

  **Must NOT do**:
  - Do NOT include PR_OPEN or MERGED states (git handled by OpenCode)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Direct port of small state machine (~80 LOC)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 8)
  - **Blocks**: Task 19 (orchestrator uses state machine)
  - **Blocked By**: Task 4 (StoryState, AgentPersona enums)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/story-state-machine.ts:1-82` — FULL file to port. Contains TRANSITIONS map, RESPONSIBLE_AGENT map, StoryStateMachine class. Remove PR_OPEN/MERGED states.

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/story-state-machine.test.ts` — Existing tests to adapt

  **WHY Each Reference Matters**:
  - `story-state-machine.ts` is a direct port (82 LOC) — only change is removing git-related states

  **Acceptance Criteria**:
  - [ ] `src/core/story-state-machine.ts` exports `StoryStateMachine` and `InvalidStateTransitionError`
  - [ ] `canTransition(RAW, EPIC)` returns `true`
  - [ ] `canTransition(RAW, DONE)` returns `false`
  - [ ] `transition()` throws `InvalidStateTransitionError` for invalid transitions
  - [ ] No PR_OPEN or MERGED states in TRANSITIONS map
  - [ ] `bun test test/core/story-state-machine.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: Valid state transitions work
    Tool: Bash
    Preconditions: story-state-machine.ts exists
    Steps:
      1. Create StoryStateMachine instance
      2. Assert canTransition(RAW, EPIC) === true
      3. Assert canTransition(EPIC, USER_STORY) === true
      4. Assert canTransition(IN_REVIEW, DONE) === true
      5. Assert canTransition(IN_REVIEW, IN_PROGRESS) === true (rework)
    Expected Result: All valid transitions return true
    Failure Indicators: False returned for valid transition
    Evidence: .sisyphus/evidence/task-7-valid-transitions.txt

  Scenario: Invalid transitions throw error
    Tool: Bash
    Preconditions: story-state-machine.ts exists
    Steps:
      1. Call transition(story, DONE) when story is in RAW state
      2. Assert InvalidStateTransitionError is thrown
    Expected Result: InvalidStateTransitionError with message containing "RAW" and "DONE"
    Failure Indicators: No error thrown, generic Error
    Evidence: .sisyphus/evidence/task-7-invalid-transition.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 6, 8)
  - Message: `feat(core): add story state machine`
  - Files: `src/core/story-state-machine.ts`, `test/core/story-state-machine.test.ts`
  - Pre-commit: `bun test`

- [ ] 8. Architecture Plan Types (Port from @splinty/core)

  **What to do**:
  - Create `src/core/architecture-plan.ts` — Port architecture plan schemas from Splinty:
    - `ModuleDefinitionSchema` — Module boundaries with owned files, allowed dependencies
    - `ArchitectureConstraintSchema` — Boundary rules (import constraints, file ownership)
    - `ArchitecturePlanSchema` — Full plan with modules, constraints, execution order
    - `ImplementationTaskSchema` — Task decomposition types (from `task-decomposition.ts`)
    - `SprintTaskPlanSchema` — Sprint-level task plan
    - `TaskGroupSchema`, `TaskScheduleSchema` — For parallel execution groups
  - Keep ALL schemas needed by ArchitectureEnforcer (Task 17) and ArchitecturePlanner agent (Task 12)
  - Remove: `IntegrationPhaseSchema` (no integration sandbox in v1), `DecompositionGuardrailsSchema` (simplify)
  - Write unit tests

  **Must NOT do**:
  - Do NOT port integration-related task types
  - Do NOT port DecompositionGuardrails (hardcode reasonable defaults)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema porting — well-defined source with clear inclusion/exclusion criteria
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 7)
  - **Blocks**: Tasks 12 (ArchitecturePlanner agent), 17 (ArchitectureEnforcer)
  - **Blocked By**: Task 4 (core types)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/architecture-plan.ts` — FULL file containing ModuleDefinitionSchema, ArchitectureConstraintSchema, ArchitecturePlanSchema and their Zod definitions
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/task-decomposition.ts:1-74` — ImplementationTaskSchema, TaskGroupSchema, TaskScheduleSchema, SprintTaskPlanSchema

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/architecture-plan.test.ts` — Existing tests to adapt

  **WHY Each Reference Matters**:
  - `architecture-plan.ts` defines the module boundary model that the enforcer validates against
  - `task-decomposition.ts` defines the implementation task structure that agents produce and consume

  **Acceptance Criteria**:
  - [ ] `src/core/architecture-plan.ts` exports all schemas needed by enforcer and planner
  - [ ] ModuleDefinitionSchema validates module with ownedFiles, allowedDependencies
  - [ ] ArchitecturePlanSchema validates full plan with modules, constraints
  - [ ] ImplementationTaskSchema validates task with targetFiles, ownedFiles, dependencies
  - [ ] `bun test test/core/architecture-plan.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: Architecture plan schema validates correctly
    Tool: Bash
    Preconditions: architecture-plan.ts exists
    Steps:
      1. Create a valid ArchitecturePlan object with 2 modules and 1 constraint
      2. Parse through ArchitecturePlanSchema
      3. Assert parse succeeds
    Expected Result: Valid plan parses without error
    Failure Indicators: ZodError on valid input
    Evidence: .sisyphus/evidence/task-8-plan-schema.txt
  ```

  **Commit**: YES (groups with Tasks 4, 5, 6, 7)
  - Message: `feat(core): add architecture plan and task decomposition types`
  - Files: `src/core/architecture-plan.ts`, `test/core/architecture-plan.test.ts`
  - Pre-commit: `bun test`

- [ ] 9. Agent Base Module + Prompt Template System

  **What to do**:
  - Create `src/agents/base-agent.ts` — Define the agent dispatch abstraction for OpenCode:
    - `AgentDefinition` interface: `{ persona: AgentPersona, systemPrompt: string, buildUserMessage: (handoff: HandoffDocument | null, story: Story, context?: string) => string }`
    - `dispatchAgent(client, agentDef, handoff, story, context?)` async function:
      1. Creates a new session via `client.session.create()`
      2. Assembles `system` prompt from `agentDef.systemPrompt`
      3. Builds user message via `agentDef.buildUserMessage()`
      4. Calls `client.session.prompt()` with `body.system` and `body.parts` (TextPartInput)
      5. Extracts response text
      6. Returns response string
    - Error handling: Wrap in try/catch, log agent persona + error, return structured error
    - Retry logic: Up to 3 attempts with exponential backoff (1s, 2s, 4s) — same pattern as Splinty's BaseAgent
    - `AgentCallError` custom error class
  - Create `src/agents/index.ts` barrel export
  - The dispatch approach MUST align with spike findings (Task 2). If spike reveals that `body.system` doesn't work as expected, adapt the approach per spike/FINDINGS.md recommendations.
  - Write unit tests with mocked client

  **Must NOT do**:
  - Do NOT import Anthropic/OpenAI SDKs
  - Do NOT make direct HTTP calls to LLM providers
  - Do NOT import `fs`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Core architectural module — needs careful design of the dispatch abstraction
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 start (must complete before agent implementations T10-16)
  - **Blocks**: Tasks 10-16 (all agent implementations), 19 (orchestrator)
  - **Blocked By**: Tasks 2 (spike findings), 4 (types), 6 (handoff)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/base-agent.ts:1-172` — FULL file. Port the retry logic (lines 77-113) and error handling. Replace `this.llmClient.complete()` with `client.session.prompt()`.
  - `spike/FINDINGS.md` — Must read this FIRST to understand how `session.prompt()` actually works

  **API/Type References**:
  - `@opencode-ai/sdk` — `client.session.create()`, `client.session.prompt()` signatures
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/base-agent.ts:17-28` — `AgentCallError` class to port

  **WHY Each Reference Matters**:
  - `base-agent.ts` has proven retry logic with exponential backoff — port this pattern
  - Spike findings determine whether `body.system` works — this is the #1 design input

  **Acceptance Criteria**:
  - [ ] `src/agents/base-agent.ts` exports `AgentDefinition`, `dispatchAgent`, `AgentCallError`
  - [ ] `dispatchAgent` creates a new session, sends system prompt + user message, returns response
  - [ ] Retry logic: 3 attempts with exponential backoff
  - [ ] Throws `AgentCallError` after all retries exhausted
  - [ ] `bun test test/agents/base-agent.test.ts` → PASS (with mocked client)

  **QA Scenarios**:

  ```
  Scenario: Agent dispatch calls session.prompt with correct shape
    Tool: Bash
    Preconditions: base-agent.ts exists, client is mocked
    Steps:
      1. Create mock client with session.create() and session.prompt() stubs
      2. Call dispatchAgent with a test AgentDefinition
      3. Assert session.create() was called once
      4. Assert session.prompt() was called with body.system containing the agent's systemPrompt
    Expected Result: session.prompt called with correct system prompt and user message parts
    Failure Indicators: session.prompt not called, wrong body shape
    Evidence: .sisyphus/evidence/task-9-dispatch-shape.txt

  Scenario: Retry on failure with backoff
    Tool: Bash
    Preconditions: base-agent.ts exists
    Steps:
      1. Mock client.session.prompt() to fail twice then succeed on third call
      2. Call dispatchAgent
      3. Assert 3 calls were made to session.prompt()
      4. Assert final result is the success response
    Expected Result: Third attempt succeeds, result returned
    Failure Indicators: Throws after first failure, no retries
    Evidence: .sisyphus/evidence/task-9-retry.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): add agent dispatch abstraction with retry logic`
  - Files: `src/agents/base-agent.ts`, `src/agents/index.ts`, `test/agents/base-agent.test.ts`
  - Pre-commit: `bun test`

- [ ] 10. BusinessOwner Agent Prompt

  **What to do**:
  - Create `src/agents/business-owner.ts` — Port the BusinessOwner agent:
    - Export an `AgentDefinition` (from Task 9) with:
      - `persona: AgentPersona.BUSINESS_OWNER`
      - `systemPrompt`: Port from Splinty's `business-owner.ts` — adapting references from "Splinty CLI" to "OpenCode plugin context"
      - `buildUserMessage(handoff, story)`: Construct the user message with story details and any prior handoff context
    - The BusinessOwner refines raw ideas into well-scoped epics with clear business value, acceptance criteria, and domain classification
  - Write unit test: verify `buildUserMessage` produces expected format given a story + handoff

  **Must NOT do**:
  - Do NOT include LLM client code — just define the prompt template
  - Do NOT hardcode model names

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single agent prompt definition — straightforward porting
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11-16 after Task 9 completes)
  - **Blocks**: Task 19 (orchestrator needs all agents)
  - **Blocked By**: Task 9 (AgentDefinition interface)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/business-owner.ts` — FULL file. Port the system prompt and user message assembly logic. Replace `callLlm()` with just defining the prompt template.

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/business-owner.test.ts` — Existing tests for output structure

  **WHY Each Reference Matters**:
  - `business-owner.ts` contains the carefully crafted system prompt for epic refinement — port it exactly

  **Acceptance Criteria**:
  - [ ] `src/agents/business-owner.ts` exports a `businessOwnerAgent: AgentDefinition`
  - [ ] `systemPrompt` contains instructions for refining ideas into epics
  - [ ] `buildUserMessage` includes story title, description, and acceptance criteria
  - [ ] `bun test test/agents/business-owner.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: User message includes story details
    Tool: Bash
    Steps:
      1. Call buildUserMessage(null, testStory) with a story that has title "Auth login" and description "User authentication"
      2. Assert returned string contains "Auth login"
      3. Assert returned string contains "User authentication"
    Expected Result: User message contains story title and description
    Failure Indicators: Missing story details in message
    Evidence: .sisyphus/evidence/task-10-user-message.txt
  ```

  **Commit**: YES (groups with Tasks 11-16)
  - Message: `feat(agents): port business-owner agent prompt`
  - Files: `src/agents/business-owner.ts`, `test/agents/business-owner.test.ts`
  - Pre-commit: `bun test`

- [ ] 11. ProductOwner Agent Prompt

  **What to do**:
  - Create `src/agents/product-owner.ts` — Port the ProductOwner agent:
    - Export `productOwnerAgent: AgentDefinition`
    - System prompt: Break epics into actionable user stories with Gherkin acceptance criteria
    - User message builder: Include handoff from BusinessOwner with epic details
  - Write unit test

  **Must NOT do**:
  - Do NOT include LLM client code

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single agent prompt — same pattern as Task 10
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 12-16)
  - **Blocks**: Task 19
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/product-owner.ts` — FULL file to port

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/product-owner.test.ts`

  **WHY Each Reference Matters**:
  - Contains the Gherkin AC generation prompt — critical for story quality

  **Acceptance Criteria**:
  - [ ] `src/agents/product-owner.ts` exports `productOwnerAgent: AgentDefinition`
  - [ ] System prompt includes Gherkin acceptance criteria instructions
  - [ ] `bun test test/agents/product-owner.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: User message includes handoff context
    Tool: Bash
    Steps:
      1. Create a handoff from BUSINESS_OWNER with stateOfWorld entries
      2. Call buildUserMessage(handoff, story)
      3. Assert message contains handoff.nextGoal and epic details
    Expected Result: Handoff context present in user message
    Failure Indicators: Handoff ignored, only story shown
    Evidence: .sisyphus/evidence/task-11-handoff-context.txt
  ```

  **Commit**: YES (groups with Tasks 10, 12-16)
  - Message: `feat(agents): port product-owner agent prompt`
  - Files: `src/agents/product-owner.ts`, `test/agents/product-owner.test.ts`
  - Pre-commit: `bun test`

- [ ] 12. ArchitecturePlanner Agent Prompt

  **What to do**:
  - Create `src/agents/architecture-planner.ts` — Port the ArchitecturePlanner agent:
    - Export `architecturePlannerAgent: AgentDefinition`
    - System prompt: Generate architecture plans with module definitions, constraints, execution order
    - This is the most complex agent prompt — it produces structured output (ArchitecturePlan) that downstream agents consume
    - User message builder: Include all stories to plan across, any existing project context
    - The output MUST be parseable as an ArchitecturePlan (include JSON output format instructions in the system prompt)
  - Write unit test verifying prompt includes required output format instructions

  **Must NOT do**:
  - Do NOT include plan revision logic (v2)
  - Do NOT include 3-pass architecture (PassA/B/C) — single pass only in v1

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Most complex agent prompt with structured output requirements
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10-11, 13-16)
  - **Blocks**: Task 19
  - **Blocked By**: Tasks 8 (architecture plan types), 9 (agent base)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/architecture-planner.ts` — FULL file to port. Pay special attention to: system prompt structure, JSON output format instructions, module definition generation, constraint creation.

  **API/Type References**:
  - `src/core/architecture-plan.ts` (from Task 8) — ArchitecturePlanSchema that the output must conform to

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/architecture-planner.test.ts`

  **WHY Each Reference Matters**:
  - ArchitecturePlanner prompt is the most critical — it defines the entire project structure downstream agents follow

  **Acceptance Criteria**:
  - [ ] `src/agents/architecture-planner.ts` exports `architecturePlannerAgent: AgentDefinition`
  - [ ] System prompt includes JSON output format matching ArchitecturePlanSchema
  - [ ] System prompt instructs to define modules, constraints, execution order
  - [ ] `bun test test/agents/architecture-planner.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: System prompt includes JSON format specification
    Tool: Bash
    Steps:
      1. Read architecturePlannerAgent.systemPrompt
      2. Assert it contains "modules" and "constraints" in JSON format instructions
      3. Assert it specifies the expected output structure
    Expected Result: Prompt includes structured output format
    Failure Indicators: No JSON format instructions, vague output requirements
    Evidence: .sisyphus/evidence/task-12-format-spec.txt
  ```

  **Commit**: YES (groups with Tasks 10-11, 13-16)
  - Message: `feat(agents): port architecture-planner agent prompt`
  - Files: `src/agents/architecture-planner.ts`, `test/agents/architecture-planner.test.ts`
  - Pre-commit: `bun test`

- [ ] 13. Architect Agent Prompt

  **What to do**:
  - Create `src/agents/architect.ts` — Port the Architect agent:
    - Export `architectAgent: AgentDefinition`
    - System prompt: Produce technical designs and implementation plans for individual stories, within the boundaries set by the ArchitecturePlanner's global plan
    - User message builder: Include handoff from ArchitecturePlanner with module assignments, story details, any project context
  - Write unit test

  **Must NOT do**:
  - Do NOT include sandbox execution references in the prompt

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 19
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/architect.ts` — FULL file to port
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/architect.test.ts`

  **WHY Each Reference Matters**:
  - Architect prompt bridges global planning and per-story implementation — must correctly reference module boundaries

  **Acceptance Criteria**:
  - [ ] `src/agents/architect.ts` exports `architectAgent: AgentDefinition`
  - [ ] System prompt references module boundaries and constraints
  - [ ] `bun test test/agents/architect.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: User message includes architecture plan context
    Tool: Bash
    Steps:
      1. Create handoff from ARCHITECTURE_PLANNER with plan summary in stateOfWorld
      2. Call buildUserMessage(handoff, story)
      3. Assert message references the architecture plan
    Expected Result: User message contains architecture context from handoff
    Failure Indicators: Architecture plan context missing
    Evidence: .sisyphus/evidence/task-13-arch-context.txt
  ```

  **Commit**: YES (groups with Tasks 10-12, 14-16)
  - Message: `feat(agents): port architect agent prompt`
  - Files: `src/agents/architect.ts`, `test/agents/architect.test.ts`
  - Pre-commit: `bun test`

- [ ] 14. Developer Agent Prompt

  **What to do**:
  - Create `src/agents/developer.ts` — Port the Developer agent:
    - Export `developerAgent: AgentDefinition`
    - System prompt: Write code following the technical design from the Architect. Generate file contents as code blocks. Follow module ownership boundaries.
    - **CRITICAL CHANGE from Splinty**: The original Developer agent uses Docker sandbox for compilation/testing. In oh-my-splinty, the Developer agent generates code that OpenCode's built-in tools will write to files. Remove ALL sandbox references from the prompt.
    - User message builder: Include handoff with technical design, task assignments (module, targetFiles, ownedFiles), project context (relevant existing files)
    - Include instructions for respecting file ownership boundaries
  - Write unit test

  **Must NOT do**:
  - Do NOT reference Docker, sandbox, compilation, or test execution in the prompt
  - Do NOT include diff-patch format — use plain code blocks (OpenCode handles file writing)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Most modified agent — significant prompt rewrite needed to remove sandbox references
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 19
  - **Blocked By**: Tasks 9, 18 (project context for prompt enrichment)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/developer.ts` — Port system prompt but REMOVE all sandbox/Docker/diff-patch references
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/task-decomposition.ts:14-28` — ImplementationTask shape that developer receives as task context

  **WHY Each Reference Matters**:
  - Developer prompt needs heavy modification — must identify and remove sandbox patterns while preserving code generation quality

  **Acceptance Criteria**:
  - [ ] `src/agents/developer.ts` exports `developerAgent: AgentDefinition`
  - [ ] System prompt does NOT contain "docker", "sandbox", "container", "diff", "patch"
  - [ ] System prompt instructs code generation as code blocks
  - [ ] User message includes task's targetFiles, ownedFiles, module, acceptance criteria
  - [ ] `bun test test/agents/developer.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: System prompt is sandbox-free
    Tool: Bash
    Steps:
      1. Read developerAgent.systemPrompt
      2. Search for forbidden terms: "docker", "sandbox", "container", "diff --", "patch"
      3. Assert none found (case-insensitive)
    Expected Result: Zero matches for forbidden terms
    Failure Indicators: Any forbidden term present
    Evidence: .sisyphus/evidence/task-14-sandbox-free.txt

  Scenario: User message includes task context
    Tool: Bash
    Steps:
      1. Create handoff from ARCHITECT with technical design
      2. Create story with task assignments (targetFiles, ownedFiles, module)
      3. Call buildUserMessage(handoff, story, projectContext)
      4. Assert message contains targetFiles and module name
    Expected Result: Task context included in user message
    Failure Indicators: Missing task assignments
    Evidence: .sisyphus/evidence/task-14-task-context.txt
  ```

  **Commit**: YES (groups with Tasks 10-13, 15-16)
  - Message: `feat(agents): port developer agent prompt (sandbox-free)`
  - Files: `src/agents/developer.ts`, `test/agents/developer.test.ts`
  - Pre-commit: `bun test`

- [ ] 15. QA Engineer Agent Prompt

  **What to do**:
  - Create `src/agents/qa-engineer.ts` — Port the QA Engineer agent:
    - Export `qaEngineerAgent: AgentDefinition`
    - System prompt: Review code output from Developer against acceptance criteria. Produce a verdict: PASS, FAIL, or BLOCKED. If FAIL, provide specific feedback for rework.
    - **CRITICAL CHANGE**: Original QA runs tests in Docker sandbox. In oh-my-splinty, QA reviews code output textually (no execution). The prompt should instruct the QA agent to evaluate code quality, correctness, and AC compliance through code review.
    - User message builder: Include Developer's code output, original story AC, architecture constraints
  - Write unit test

  **Must NOT do**:
  - Do NOT reference test execution, Docker, or sandbox in the prompt
  - QA does code review only — no running tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 19
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/qa-engineer.ts` — Port prompt, remove sandbox execution references
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/qa-engineer.test.ts`

  **WHY Each Reference Matters**:
  - QA prompt needs adaptation from "run tests in sandbox" to "review code for correctness"

  **Acceptance Criteria**:
  - [ ] `src/agents/qa-engineer.ts` exports `qaEngineerAgent: AgentDefinition`
  - [ ] System prompt instructs code review against acceptance criteria
  - [ ] System prompt specifies PASS/FAIL/BLOCKED verdict format
  - [ ] No sandbox/Docker references
  - [ ] `bun test test/agents/qa-engineer.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: QA prompt specifies verdict format
    Tool: Bash
    Steps:
      1. Read qaEngineerAgent.systemPrompt
      2. Assert it contains "PASS", "FAIL", "BLOCKED" as verdict options
    Expected Result: All 3 verdicts mentioned in prompt
    Failure Indicators: Missing verdict options
    Evidence: .sisyphus/evidence/task-15-verdict-format.txt
  ```

  **Commit**: YES (groups with Tasks 10-14, 16)
  - Message: `feat(agents): port qa-engineer agent prompt (code review)`
  - Files: `src/agents/qa-engineer.ts`, `test/agents/qa-engineer.test.ts`
  - Pre-commit: `bun test`

- [ ] 16. Technical Writer Agent Prompt

  **What to do**:
  - Create `src/agents/technical-writer.ts` — Port the TechnicalWriter agent:
    - Export `technicalWriterAgent: AgentDefinition`
    - System prompt: Generate documentation based on code changes. Update READMEs, add JSDoc/inline comments, create API docs.
    - User message builder: Include handoff with code output summary, story details, existing project docs
  - Write unit test

  **Must NOT do**:
  - Do NOT reference Docker or sandbox

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 19
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/technical-writer.ts` — FULL file to port
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/technical-writer.test.ts`

  **WHY Each Reference Matters**:
  - Technical writer prompt is the simplest to port — minimal modifications needed

  **Acceptance Criteria**:
  - [ ] `src/agents/technical-writer.ts` exports `technicalWriterAgent: AgentDefinition`
  - [ ] System prompt instructs documentation generation
  - [ ] `bun test test/agents/technical-writer.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: User message includes code output
    Tool: Bash
    Steps:
      1. Create handoff from QA_ENGINEER with code review results
      2. Call buildUserMessage(handoff, story)
      3. Assert message contains handoff context
    Expected Result: Code output context present
    Failure Indicators: Missing handoff content
    Evidence: .sisyphus/evidence/task-16-code-context.txt
  ```

  **Commit**: YES (groups with Tasks 10-15)
  - Message: `feat(agents): port technical-writer agent prompt`
  - Files: `src/agents/technical-writer.ts`, `test/agents/technical-writer.test.ts`
  - Pre-commit: `bun test`

- [ ] 17. Architecture Enforcer (Deterministic)

  **What to do**:
  - Create `src/core/architecture-enforcer.ts` — Port the ArchitectureEnforcer as a DETERMINISTIC module (no LLM):
    - `ArchitectureEnforcer` class with:
      - `enforce(plan: ArchitecturePlan, task: ImplementationTask, codeOutput: string): EnforcementReport`
      - Validates 4 rules:
        1. **File ownership**: Files modified match task's `ownedFiles` — flag any file touched that isn't owned
        2. **Import boundaries**: Imports in generated code respect module's `allowedDependencies` — flag cross-boundary imports
        3. **Required exports**: Check that expected outputs (from task's `expectedOutputs`) are present in code
        4. **Disallowed patterns**: Check for patterns forbidden by architecture constraints
      - Returns `EnforcementReport` with violations, metrics, status (pass/fail/warn)
    - Enforcement schemas from Splinty: `ArchitectureViolationSchema`, `ComplianceMetricsSchema`, `EnforcementReportSchema`
    - This is PURE STATIC ANALYSIS — parse code text, check patterns, no LLM
  - Use regex/string matching for import analysis (not AST — keep it simple for v1)
  - Write thorough unit tests against violation fixtures from Task 3

  **Must NOT do**:
  - Do NOT use LLM for enforcement — deterministic rules only
  - Do NOT include module locking (concurrency control) — no concurrent execution in v1
  - Do NOT include telemetry events
  - Do NOT import `fs` — receive code as strings

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 590 LOC of complex rule logic requiring careful porting and testing
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (independent of agents, parallel with T9-16)
  - **Blocks**: Task 19 (orchestrator runs enforcement after Developer)
  - **Blocked By**: Tasks 4 (types), 8 (architecture plan types)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/architecture-enforcer.ts:1-590` — FULL file to port. Key methods:
    - Lines 1-52: Enforcement schemas (ArchitectureViolationSchema, EnforcementReportSchema)
    - The `enforce()` method: validates file ownership, import boundaries, required exports
    - The `checkImportBoundaries()` method: regex-based import checking
    - The `checkFileOwnership()` method: validates files against task.ownedFiles

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/architecture-enforcer.test.ts` — Port test cases

  **WHY Each Reference Matters**:
  - The enforcer is the core differentiator — must port the rule logic faithfully
  - Tests show exactly what violations are expected for various inputs — critical for correctness

  **Acceptance Criteria**:
  - [ ] `src/core/architecture-enforcer.ts` exports `ArchitectureEnforcer` class
  - [ ] `enforce()` returns `EnforcementReport` with status pass/fail/warn
  - [ ] File ownership violations detected correctly
  - [ ] Import boundary violations detected correctly (regex-based)
  - [ ] Required export presence checked
  - [ ] No LLM calls in enforcer
  - [ ] `bun test test/core/architecture-enforcer.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: Detect import boundary violation
    Tool: Bash
    Preconditions: enforcer and violation-code fixtures exist
    Steps:
      1. Create ArchitecturePlan with module "auth" that allows imports only from "utils"
      2. Create task owned by "auth" module
      3. Provide code that imports from "payments" module
      4. Run enforce()
      5. Assert report.status === "fail"
      6. Assert report.violations has entry with constraintId containing "import"
    Expected Result: Violation detected for cross-boundary import
    Failure Indicators: Report shows "pass", no violations found
    Evidence: .sisyphus/evidence/task-17-import-violation.txt

  Scenario: Pass enforcement with clean code
    Tool: Bash
    Steps:
      1. Create plan with module "auth" allowing imports from "utils"
      2. Create task owned by "auth"
      3. Provide code that only imports from "utils"
      4. Run enforce()
      5. Assert report.status === "pass"
      6. Assert report.violations is empty
    Expected Result: Report shows pass with 0 violations
    Failure Indicators: False positives, unexpected violations
    Evidence: .sisyphus/evidence/task-17-clean-pass.txt
  ```

  **Commit**: YES
  - Message: `feat(enforcer): port architecture enforcer with simplified rules`
  - Files: `src/core/architecture-enforcer.ts`, `test/core/architecture-enforcer.test.ts`
  - Pre-commit: `bun test`

- [ ] 18. Project Context Builder

  **What to do**:
  - Create `src/core/project-context.ts` — Simplified context builder for enriching Developer agent prompts:
    - `ProjectContextBuilder` class:
      - `build(directory: string, targetFiles: string[]): Promise<string>` — Given a directory and list of target files, read relevant project files and assemble a context string
      - Uses BunShell (`$`) to read files from the project directory
      - Start from `targetFiles`, read those files' contents
      - Simple heuristic: also read files imported by target files (one level of transitive deps via regex import matching)
      - Cap at 20 files and 8000 chars total (from Splinty's constants)
    - Return format: `"## Project Context\n### {filePath}\n\`\`\`\n{content}\n\`\`\`\n"` for each file
  - This is a SIMPLIFIED version of Splinty's import graph expansion — v1 uses regex, not AST

  **Must NOT do**:
  - Do NOT import `fs` — use BunShell or Bun.file()
  - Do NOT build full import graph (simplified one-level expansion only)
  - Do NOT persist context (session-based)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: File I/O with heuristic expansion — needs careful BunShell usage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (parallel with agents)
  - **Blocks**: Tasks 14 (developer needs context), 19 (orchestrator uses context)
  - **Blocked By**: Task 4 (types)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/project-context.ts:1-80` — Port the context assembly logic. Keep `MAX_RELEVANT_FILES=20` and `MAX_RELEVANT_CHARS=8000`. Replace WorkspaceManager/ImportGraphBuilder with simple BunShell file reading.
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/import-graph.ts` — Reference for import regex patterns (lines 1-50) but DO NOT port the full graph builder — use simplified regex extraction

  **WHY Each Reference Matters**:
  - `project-context.ts` shows the file selection and capping strategy to follow
  - `import-graph.ts` shows the import regex patterns for one-level dependency expansion

  **Acceptance Criteria**:
  - [ ] `src/core/project-context.ts` exports `ProjectContextBuilder`
  - [ ] `build()` reads target files and assembles formatted context
  - [ ] Output capped at 20 files and 8000 chars
  - [ ] One-level import expansion via regex
  - [ ] No `import * as fs` — uses Bun APIs
  - [ ] `bun test test/core/project-context.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: Build context for target files
    Tool: Bash
    Preconditions: Test directory with sample .ts files
    Steps:
      1. Create temp directory with 3 .ts files (a.ts imports b.ts, b.ts imports c.ts)
      2. Call build(tempDir, ["a.ts"])
      3. Assert result contains content of a.ts and b.ts (one level expansion)
      4. Assert result does NOT contain c.ts (only one level)
    Expected Result: a.ts and b.ts content included, c.ts excluded
    Failure Indicators: c.ts included (too deep), b.ts missing (no expansion)
    Evidence: .sisyphus/evidence/task-18-context-expansion.txt

  Scenario: Cap at MAX_RELEVANT_CHARS
    Tool: Bash
    Steps:
      1. Create directory with 30 large .ts files
      2. Call build(dir, [allFiles])
      3. Assert output length ≤ 8000 chars
    Expected Result: Output capped at limit
    Failure Indicators: Output exceeds 8000 chars
    Evidence: .sisyphus/evidence/task-18-cap.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add project context builder`
  - Files: `src/core/project-context.ts`, `test/core/project-context.test.ts`
  - Pre-commit: `bun test`

- [ ] 19. Pipeline Orchestrator

  **What to do**:
  - Create `src/orchestrator.ts` — The core pipeline engine, massively simplified from Splinty's 1766 LOC orchestrator:
    - `PipelineOrchestrator` class:
      - Constructor takes `client` (from plugin context) and `directory` (project root)
      - `runPipeline(stories: Story[], options: PipelineOptions): Promise<PipelineResult>`
      - `PipelineOptions` includes: `startStage` (which agent to start from), `architecturePlan` (optional, for mid-pipeline entry)
    - **Agent chaining sequence** (full pipeline):
      1. `BUSINESS_OWNER` — refine raw idea into epic
      2. `PRODUCT_OWNER` — break epic into user stories
      3. `ARCHITECTURE_PLANNER` — create global architecture plan
      4. `ARCHITECT` — technical design per story
      5. `DEVELOPER` — code generation
      6. Architecture enforcement (deterministic, not an agent)
      7. `QA_ENGINEER` — code review
      8. `TECHNICAL_WRITER` — documentation
    - **One session per agent**: For each agent call, create a NEW session via `client.session.prompt()` with:
      - `body.system` set to the agent's system prompt
      - User message containing: previous handoff document + story context
      - Receive response, parse it, create handoff for next agent
    - **Handoff flow**: After each agent completes, use `HandoffManager.createHandoff()` to serialize the output, then pass it as user message context to the next agent
    - **State tracking**: Use `StoryStateMachine` to transition each story through states (PENDING → IN_PROGRESS → each agent stage → DONE/BLOCKED)
    - **Enforcement gate**: After DEVELOPER, run `ArchitectureEnforcer.enforce()` on the code output. If violations found, mark in pipeline result (no retry loop in v1)
    - **Error handling**: If any agent call throws, catch the error, mark story as BLOCKED with the error message, and skip remaining agents for that story
    - **Entry point support**: `startStage` parameter allows skipping early agents — e.g., `sprint_develop` tool starts at DEVELOPER
    - **Project context**: Before calling DEVELOPER agent, use `ProjectContextBuilder.build()` to assemble relevant file context from the project directory
  - Write unit tests with mocked `client.session.prompt()`:
    - Test full pipeline with 1 story (all agents called in order)
    - Test mid-pipeline entry (startStage = 'DEVELOPER')
    - Test error handling (agent throws → story BLOCKED)
    - Test enforcement integration (violations detected → included in result)

  **Must NOT do**:
  - Do NOT include Docker sandbox execution
  - Do NOT include plan revision / drift scoring
  - Do NOT include checkpoint/resume logic
  - Do NOT include telemetry or metrics tracking
  - Do NOT include concurrent story processing (sequential only in v1)
  - Do NOT include retry loops for enforcement failures (one-pass only)
  - Do NOT import `fs`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core engine with complex agent chaining, state management, error handling — most architecturally significant module
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (must start before Tasks 20-21)
  - **Blocks**: Tasks 20, 21, 22
  - **Blocked By**: Tasks 5 (story parser), 6 (handoff), 7 (state machine), 9-16 (all agents), 17 (enforcer), 18 (context builder)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/orchestrator.ts:1-100` — Import structure and class skeleton. Note what to KEEP (agent sequence, handoff flow, error handling) vs what to DROP (Docker, ledger, checkpoint, telemetry, plan revision, workspace management, service guards)
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/orchestrator.ts:200-350` — The `processStory()` method shows the agent chaining pattern: call agent → get result → create handoff → pass to next. PORT this pattern but replace `agent.call(client, ...)` with `client.session.prompt()`
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/orchestrator.ts:1400-1500` — Enforcement integration: after Developer, run enforcer, check violations, decide whether to proceed. PORT the enforcement gate but WITHOUT the retry loop (one-pass only in v1)

  **API/Type References**:
  - `src/core/types.ts` (from Task 4) — Story, HandoffDocument, PipelineResult types
  - `src/core/handoff.ts` (from Task 6) — HandoffManager for creating/serializing handoffs
  - `src/core/story-state-machine.ts` (from Task 7) — StoryStateMachine for state transitions
  - `src/agents/index.ts` (from Tasks 9-16) — All agent definitions with systemPrompt and buildUserMessage
  - `src/core/architecture-enforcer.ts` (from Task 17) — ArchitectureEnforcer.enforce()
  - `src/core/project-context.ts` (from Task 18) — ProjectContextBuilder.build()

  **External References**:
  - OpenCode SDK `client.session.prompt()` — validated in Task 2 spike

  **WHY Each Reference Matters**:
  - Orchestrator.ts `processStory()` shows the exact agent sequence and handoff pattern to replicate
  - The enforcement integration section shows how to gate on violations
  - All core module interfaces (Tasks 4-18) are consumed here — orchestrator is the integration point

  **Acceptance Criteria**:
  - [ ] `src/orchestrator.ts` exports `PipelineOrchestrator` class
  - [ ] `runPipeline()` calls agents in correct sequence via `client.session.prompt()`
  - [ ] Each agent gets its own session with system prompt from AgentDefinition
  - [ ] Handoff documents serialized between agent calls
  - [ ] StoryStateMachine transitions tracked through pipeline
  - [ ] Architecture enforcement runs after Developer agent
  - [ ] Errors caught → story marked BLOCKED → remaining agents skipped
  - [ ] `startStage` parameter skips early agents correctly
  - [ ] `bun test test/orchestrator.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: Full pipeline executes all agents in order
    Tool: Bash
    Preconditions: Mocked client.session.prompt() returns valid responses for each agent
    Steps:
      1. Create PipelineOrchestrator with mocked client
      2. Call runPipeline([sampleStory], { startStage: 'BUSINESS_OWNER' })
      3. Assert client.session.prompt() was called 7 times (7 agent stages)
      4. Assert calls were made in order: BO → PO → AP → ARCH → DEV → QA → TW
      5. Assert result.stories[0].state === 'DONE'
    Expected Result: All 7 agents called sequentially, story completes
    Failure Indicators: Wrong call count, wrong order, story not DONE
    Evidence: .sisyphus/evidence/task-19-full-pipeline.txt

  Scenario: Mid-pipeline entry skips early agents
    Tool: Bash
    Steps:
      1. Call runPipeline([story], { startStage: 'DEVELOPER' })
      2. Assert client.session.prompt() was called 3 times (DEV, QA, TW)
      3. Assert no calls for BO, PO, AP, ARCH
    Expected Result: Only Developer, QA, TechnicalWriter called
    Failure Indicators: Early agents called, wrong count
    Evidence: .sisyphus/evidence/task-19-mid-entry.txt

  Scenario: Agent error blocks story gracefully
    Tool: Bash
    Steps:
      1. Mock client.session.prompt() to throw on ARCHITECT call
      2. Call runPipeline([story], { startStage: 'BUSINESS_OWNER' })
      3. Assert story state === 'BLOCKED'
      4. Assert result includes error message
      5. Assert no calls after ARCHITECT (DEV, QA, TW skipped)
    Expected Result: Story blocked, error captured, pipeline stops for that story
    Failure Indicators: Unhandled exception, pipeline continues after error
    Evidence: .sisyphus/evidence/task-19-error-blocking.txt
  ```

  **Commit**: YES
  - Message: `feat(orchestrator): pipeline orchestrator with agent chaining and enforcement gate`
  - Files: `src/orchestrator.ts`, `test/orchestrator.test.ts`
  - Pre-commit: `bun test`

- [ ] 20. Plugin Entry Point + Tool Registration

  **What to do**:
  - **NOTE: Task 20 and Task 21 work together.** Task 20 creates the plugin entry point (`src/index.ts`) that wires up all 7 tools. Task 21 creates the 4 sprint tool implementation files (`src/commands/*.ts`) that Task 20 imports. The 3 utility tools are defined inline in Task 20. Together they produce exactly 7 registered plugin tools.
  - Update `src/index.ts` (created in Task 1 as minimal stub) to be the full plugin entry point:
    - Export `OhMySplinty: Plugin` from `@opencode-ai/plugin`
    - Plugin function receives `{ client, project, $, directory, worktree }`
    - Register **7 tools** total: 4 sprint tools (implemented in Task 21's `src/commands/*.ts`, imported here) + 3 utility tools (implemented inline here):
    - **Sprint tools** (imported from `src/commands/index.ts` — implementation details in Task 21):
      1. **`sprint_idea`**: Full pipeline from raw idea
      2. **`sprint_design`**: Pipeline from Architect stage
      3. **`sprint_develop`**: Pipeline from Developer stage
      4. **`sprint_run`**: Full pipeline from backlog file
    - **Utility tools** (defined inline in this file):
      5. **`splinty_load_stories`**: Load and validate stories from a file
         - Args: `{ filePath: z.string() }`
         - Parses the file, validates stories, returns story summaries
      6. **`splinty_enforce_architecture`**: Run architecture enforcement on code
         - Args: `{ planPath: z.string(), code: z.string(), taskModule: z.string(), ownedFiles: z.array(z.string()) }`
         - Runs ArchitectureEnforcer against provided code
         - Returns enforcement report as formatted string
      7. **`splinty_pipeline_status`**: Get current pipeline status
         - Args: `{}`
         - Returns current state of any running/completed pipeline
    - **Naming convention**: OpenCode plugin tool IDs use underscores. The 7 canonical tool IDs are: `sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`, `splinty_load_stories`, `splinty_enforce_architecture`, `splinty_pipeline_status`. Optional `.opencode/commands/*.md` files (created in Task 21) provide user-friendly `/sprint-idea` etc. invocation
    - All tool execute functions are `async` and return strings
    - Tool outputs capped at 8000 chars — truncate with `[truncated]` marker if over
  - Write unit test verifying plugin exports correct shape

  **Must NOT do**:
  - Do NOT add event hooks, chat.message hooks, or permission hooks (tools only in v1)
  - Do NOT import `fs`
  - Do NOT register tools beyond the 7 defined (4 sprint tools from Task 21 + 3 utility tools inline) — the plugin TOTAL is exactly 7
  - Do NOT include CLI argument parsing
  - Do NOT create `.opencode/commands/*.md` files here (that's Task 21)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Plugin wiring with Zod schemas and tool registration requires careful API usage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Task 19)
  - **Blocks**: Tasks 21, 22, 23
  - **Blocked By**: Tasks 2 (API spike validates session.prompt), 19 (orchestrator must exist)

  **References**:

  **Pattern References**:
  - `src/index.ts` (from Task 1) — Current stub to expand
  - See Task 2 spike results for validated `client.session.prompt()` patterns

  **API/Type References**:
  - `@opencode-ai/plugin` Plugin type — `async ({ client, project, $, directory, worktree }) => ({ tool: {...} })`
  - `src/core/types.ts` (from Task 4) — Story, PipelineResult types for tool args/returns
  - `src/orchestrator.ts` (from Task 19) — PipelineOrchestrator to invoke from tools

  **External References**:
  - OpenCode plugin guide: `https://gist.github.com/johnlindquist/0adf1032b4e84942f3e1050aba3c5e4a` — Tool registration pattern with Zod schemas
  - AgentSkills plugin dev reference: `https://agentskills.so/skills/igorwarzocha-opencode-workflows-create-opencode-plugin` — Tool shape examples

  **WHY Each Reference Matters**:
  - Plugin guide shows exact tool registration shape that OpenCode expects
  - Task 1 stub provides the starting point to expand
  - Task 2 spike proves which API patterns work

  **Acceptance Criteria**:
  - [ ] `src/index.ts` exports `OhMySplinty` of type `Plugin`
  - [ ] Plugin registers exactly 7 tools: `sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`, `splinty_load_stories`, `splinty_enforce_architecture`, `splinty_pipeline_status`
  - [ ] Each tool has a Zod schema for args and a description string
  - [ ] Each tool's execute function is async and returns a string
  - [ ] Tool outputs respect 8000 char limit
  - [ ] `bun test test/plugin-load.test.ts` → PASS

  **QA Scenarios**:

  ```
  Scenario: Plugin exports valid tool shape
    Tool: Bash
    Steps:
      1. Import OhMySplinty from src/index.ts
      2. Call it with mocked client/project/$/directory/worktree
      3. Assert result has `tool` property
      4. Assert tool has keys: sprint_idea, sprint_design, sprint_develop, sprint_run, splinty_load_stories, splinty_enforce_architecture, splinty_pipeline_status
      5. Assert each tool has `description`, `args`, `execute` properties
    Expected Result: All 7 tools registered with correct shape
    Failure Indicators: Missing tools, wrong property names, non-function execute
    Evidence: .sisyphus/evidence/task-20-plugin-shape.txt

  Scenario: Tool output respects size limit
    Tool: Bash
    Steps:
      1. Create a mock scenario where pipeline result exceeds 8000 chars
      2. Call sprint_run tool execute with the mock data
      3. Assert output.length <= 8000
      4. Assert output ends with "[truncated]" if it was cut
    Expected Result: Output capped at 8000 chars
    Failure Indicators: Output exceeds limit
    Evidence: .sisyphus/evidence/task-20-output-cap.txt
  ```

  **Commit**: YES
  - Message: `feat(plugin): entry point with 7 tool registrations`
  - Files: `src/index.ts`, `test/plugin-load.test.ts`
  - Pre-commit: `bun test`

- [ ] 21. Sprint Tool Implementations — 4 `sprint_*` Tool Definitions + `.opencode/commands/` Files

  **What to do**:
  - **Naming convention**: Tool IDs use underscores (`sprint_idea`). These are registered as OpenCode plugin tools. Additionally, create `.opencode/commands/*.md` markdown files that provide user-friendly `/sprint-idea` (etc.) invocation. The canonical registered tool names are: `sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`.
  - Create `src/commands/sprint-idea.ts`:
    - Registers tool `sprint_idea` — full pipeline from raw idea
    - Args: `{ idea: z.string().describe("Raw product idea or feature concept") }`
    - Creates a synthetic story from the idea text (title = first sentence, description = full text)
    - Calls `PipelineOrchestrator.runPipeline([story], { startStage: 'BUSINESS_OWNER' })`
    - Returns formatted pipeline result
  - Create `src/commands/sprint-design.ts`:
    - Registers tool `sprint_design` — start from user stories at Architect stage
    - Args: `{ filePath: z.string().describe("Path to story file (YAML/JSON/MD)") }`
    - Loads stories from file via StoryParser
    - Calls `runPipeline(stories, { startStage: 'ARCHITECT' })`
  - Create `src/commands/sprint-develop.ts`:
    - Registers tool `sprint_develop` — start at Developer from technical design
    - Args: `{ filePath: z.string().describe("Path to story file with technical design") }`
    - Loads stories, calls `runPipeline(stories, { startStage: 'DEVELOPER' })`
  - Create `src/commands/sprint-run.ts`:
    - Registers tool `sprint_run` — full pipeline from backlog file
    - Args: `{ filePath: z.string().describe("Path to backlog file"), format?: z.enum(["yaml","json","markdown"]) }`
    - Loads all stories from file, resolves dependencies (topological sort), runs full pipeline
  - Create `src/commands/index.ts` — barrel export for all commands
  - Each command module exports a tool definition object (description, args, execute)
  - The plugin entry point (Task 20) imports and registers these tools
  - Write unit tests for each command's argument validation and orchestrator invocation
  - Create `.opencode/commands/` markdown files for OpenCode slash command UX (these are NOT plugin tools — they are OpenCode's native command system that can reference tools):
    - `.opencode/commands/sprint-idea.md` — describes what `sprint_idea` does, triggers the tool
    - `.opencode/commands/sprint-design.md` — describes what `sprint_design` does, triggers the tool
    - `.opencode/commands/sprint-develop.md` — describes what `sprint_develop` does, triggers the tool
    - `.opencode/commands/sprint-run.md` — describes what `sprint_run` does, triggers the tool
    - Each file is a short markdown instruction that OpenCode renders as a `/sprint-idea` (etc.) command

  **Must NOT do**:
  - Do NOT register tools here — tool registration is Task 20's job. Task 21 creates implementation files that Task 20 imports
  - Do NOT add interactive prompts or CLI behavior
  - Do NOT implement concurrent story execution (sequential only)
  - Do NOT add git branch/commit/PR creation
  - Do NOT import `fs`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 4 command modules with Zod schemas, orchestrator integration, and barrel exports
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (after Tasks 19, 20)
  - **Blocks**: Tasks 22, 23
  - **Blocked By**: Tasks 19 (orchestrator), 20 (plugin entry point)

  **References**:

  **Pattern References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/cli/src/index.ts:100-300` — CLI command definitions for `run`, `init`, `status`. Shows how commands map to orchestrator calls. PORT the argument structure but NOT the CLI framework (Commander.js) — use Zod tool schemas instead
  - `/mnt/c/Users/jgron/Repos/splinty/packages/integrations/src/file.ts` — FileStoryConnector shows how different file formats are loaded. This is consumed by the `sprint_run` tool
  - `/mnt/c/Users/jgron/Repos/splinty/packages/core/src/story-dependencies.ts` — `topologicalSortStories()` for dependency resolution in `sprint_run`

  **API/Type References**:
  - `src/orchestrator.ts` (from Task 19) — PipelineOrchestrator.runPipeline() signature
  - `src/core/story-parser.ts` (from Task 5) — StoryParser for loading story files
  - `src/core/types.ts` (from Task 4) — Story type, PipelineResult type

  **WHY Each Reference Matters**:
  - CLI `index.ts` shows the mapping between user intent and orchestrator calls — same mapping, different UI (tool vs CLI)
  - Story dependencies need topological sort for `sprint_run` to process in correct order

  **Acceptance Criteria**:
  - [ ] `src/commands/sprint-idea.ts` — creates story from text, starts at BUSINESS_OWNER
  - [ ] `src/commands/sprint-design.ts` — loads file, starts at ARCHITECT
  - [ ] `src/commands/sprint-develop.ts` — loads file, starts at DEVELOPER
  - [ ] `src/commands/sprint-run.ts` — loads file, resolves deps, runs full pipeline
  - [ ] `src/commands/index.ts` — barrel exports all 4 commands
  - [ ] `.opencode/commands/sprint-idea.md` — exists, references `sprint_idea` tool
  - [ ] `.opencode/commands/sprint-design.md` — exists, references `sprint_design` tool
  - [ ] `.opencode/commands/sprint-develop.md` — exists, references `sprint_develop` tool
  - [ ] `.opencode/commands/sprint-run.md` — exists, references `sprint_run` tool
  - [ ] All commands have Zod schemas for args
  - [ ] `bun test test/commands/` → PASS

  **QA Scenarios**:

  ```
  Scenario: sprint-idea creates story from raw text
    Tool: Bash
    Steps:
      1. Call sprint_idea.execute({ idea: "Build a user authentication system with JWT" })
      2. Assert orchestrator.runPipeline was called with startStage 'BUSINESS_OWNER'
      3. Assert the story passed has title derived from the idea text
    Expected Result: Story created from idea, pipeline starts at BO
    Failure Indicators: Wrong startStage, no story created
    Evidence: .sisyphus/evidence/task-21-sprint-idea.txt

  Scenario: sprint-run resolves dependencies
    Tool: Bash
    Steps:
      1. Create a fixture file with 3 stories where story-3 depends on story-1
      2. Call sprint_run.execute({ filePath: fixture })
      3. Assert stories are processed in dependency order (story-1 before story-3)
    Expected Result: Dependency order respected
    Failure Indicators: story-3 processed before story-1
    Evidence: .sisyphus/evidence/task-21-sprint-run-deps.txt

  Scenario: sprint-develop starts at DEVELOPER
    Tool: Bash
    Steps:
      1. Call sprint_develop.execute({ filePath: fixture })
      2. Assert orchestrator.runPipeline was called with startStage 'DEVELOPER'
      3. Assert no calls to BO, PO, AP, ARCH agents
    Expected Result: Pipeline starts at Developer stage
    Failure Indicators: Early agents invoked
    Evidence: .sisyphus/evidence/task-21-sprint-develop.txt
  ```

  **Commit**: YES
  - Message: `feat(commands): implement 4 sprint_* tool definitions + .opencode/commands`
  - Files: `src/commands/*.ts`, `.opencode/commands/*.md`, `test/commands/*.test.ts`
  - Pre-commit: `bun test`

- [ ] 22. Integration Test — Full Pipeline

  **What to do**:
  - Create `test/integration/pipeline.test.ts` — End-to-end integration test:
    - Uses test fixtures from Task 3 (YAML story file with 2-3 stories)
    - Mocks `client.session.prompt()` to return realistic agent responses
    - Tests the COMPLETE flow: load stories → parse → orchestrate → all agents → enforcement → result
    - Verify:
      1. Stories loaded correctly from fixture file
      2. Each agent called in correct order with correct system prompt
      3. Handoffs serialized correctly between agents
      4. State machine transitions tracked (PENDING → stages → DONE)
      5. Architecture enforcement runs after Developer
      6. Final PipelineResult contains all story outcomes
    - Test edge cases:
      1. Story with no acceptance criteria (should still process)
      2. Empty story file (should return empty result, no error)
      3. Agent returns malformed response (should mark story BLOCKED)
  - This test exercises the integration between ALL modules from Tasks 4-21

  **Must NOT do**:
  - Do NOT make real LLM calls — all responses mocked
  - Do NOT test Docker/sandbox features (don't exist)
  - Do NOT import `fs`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex integration test spanning all modules — must understand full pipeline flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5 (after all implementation)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 3 (fixtures), 19 (orchestrator), 20 (plugin), 21 (commands)

  **References**:

  **Pattern References**:
  - `test/fixtures/` (from Task 3) — Sample YAML/JSON/MD stories to load
  - All modules from Tasks 4-21 — this test integrates everything

  **Test References**:
  - `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/orchestrator.test.ts` — Shows how Splinty tests the orchestrator with mocked LLM responses. PORT the test structure but adapt for `client.session.prompt()` mocking

  **WHY Each Reference Matters**:
  - Splinty's orchestrator test shows patterns for mocking agent responses and verifying call sequences

  **Acceptance Criteria**:
  - [ ] `test/integration/pipeline.test.ts` exists
  - [ ] Full pipeline test passes with mocked client
  - [ ] Agent call order verified
  - [ ] Handoff serialization verified
  - [ ] State transitions verified
  - [ ] Edge cases tested (empty file, malformed response)
  - [ ] `bun test test/integration/` → PASS

  **QA Scenarios**:

  ```
  Scenario: Full integration test passes
    Tool: Bash
    Steps:
      1. Run bun test test/integration/pipeline.test.ts
      2. Assert all test cases pass
      3. Assert test output shows coverage of: story loading, agent calls, handoffs, state, enforcement
    Expected Result: All integration tests green
    Failure Indicators: Any test failure, missing test cases
    Evidence: .sisyphus/evidence/task-22-integration.txt

  Scenario: Edge case — empty story file
    Tool: Bash
    Steps:
      1. Verify the integration test includes a case for empty story file
      2. Assert it returns empty result without errors
    Expected Result: Empty file handled gracefully
    Failure Indicators: Exception thrown on empty file
    Evidence: .sisyphus/evidence/task-22-empty-file.txt
  ```

  **Commit**: YES
  - Message: `test(integration): full pipeline integration tests with mocked client`
  - Files: `test/integration/pipeline.test.ts`
  - Pre-commit: `bun test`

- [ ] 23. Build Verification + Plugin Load Test

  **What to do**:
  - Create `test/plugin-load.test.ts` (or extend from Task 20):
    - Import the plugin and verify it can be instantiated
    - Verify TypeScript compilation: `bun run build` produces no errors
    - Verify all public exports are accessible
    - Verify plugin shape matches what OpenCode expects
  - Run full verification:
    - `bun run build` → 0 errors, 0 warnings
    - `bun test` → all tests pass
    - Check no `import * as fs from 'fs'` in any source file
    - Check no Docker/sandbox references in any source file
    - Verify package.json has correct dependencies and scripts

  **Must NOT do**:
  - Do NOT add unnecessary build steps
  - Do NOT modify source files — this is verification only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification task — run commands and check outputs
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (parallel with Task 22)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: Tasks 1 (scaffold), 20 (plugin entry point)

  **References**:

  **Pattern References**:
  - `package.json` — Scripts section for build/test commands
  - `tsconfig.json` — Compiler options

  **WHY Each Reference Matters**:
  - Build verification catches type errors that unit tests miss
  - Plugin load test validates the contract with OpenCode

  **Acceptance Criteria**:
  - [ ] `bun run build` → 0 errors
  - [ ] `bun test` → all tests pass (0 failures)
  - [ ] No `import * as fs` in any `src/` file (grep verification)
  - [ ] No "docker" or "sandbox" in any `src/` file (grep verification)
  - [ ] Plugin exports correct type

  **QA Scenarios**:

  ```
  Scenario: Clean build with no type errors
    Tool: Bash
    Steps:
      1. Run bun run build
      2. Assert exit code 0
      3. Assert no "error TS" in output
    Expected Result: Build succeeds cleanly
    Failure Indicators: Non-zero exit code, TypeScript errors
    Evidence: .sisyphus/evidence/task-23-build.txt

  Scenario: No forbidden imports in source
    Tool: Bash
    Steps:
      1. Run: grep -r "import \* as fs" src/ || echo "CLEAN"
      2. Run: grep -ri "docker\|sandbox" src/ || echo "CLEAN"
      3. Assert both return "CLEAN"
    Expected Result: No forbidden patterns found
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-23-forbidden.txt
  ```

  **Commit**: YES
  - Message: `chore(verify): build verification and plugin load test`
  - Files: `test/plugin-load.test.ts`
  - Pre-commit: `bun test && bun run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run build` + `bun test`. Review all files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports, `import * as fs from 'fs'` (FORBIDDEN). Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Load plugin into OpenCode. Execute each sprint tool (`sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`) with test fixtures. Verify: tool registration, agent dispatch, handoff flow, error handling. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Tools [7/7 registered] | Sprint Tools [4/4 pass] | Pipeline [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual implementation. Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT Have" compliance: no Docker code, no fs imports, no LLM client, no CLI code, no specialist agents. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Guardrails [N/N clean] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Scope | Message | Files | Pre-commit |
|--------|-------|---------|-------|------------|
| 1 | scaffold | `chore(init): scaffold oh-my-splinty project` | package.json, tsconfig.json, src/index.ts | `bun run build` |
| 2 | spike | `spike(api): validate OpenCode session.prompt() with system prompts` | spike/, test/ | `bun test` |
| 3 | core | `feat(core): add types, schemas, story parser, handoff, state machine` | src/core/, test/ | `bun test` |
| 4 | enforcer | `feat(enforcer): port architecture enforcer with simplified rules` | src/core/architecture-enforcer.ts, test/ | `bun test` |
| 5 | agents | `feat(agents): port 8 agent prompt modules` | src/agents/, test/ | `bun test` |
| 6 | orchestrator | `feat(orchestrator): pipeline orchestrator with handoff chaining` | src/orchestrator.ts, test/ | `bun test` |
| 7 | plugin | `feat(plugin): entry point, tool registration, sprint commands` | src/index.ts, src/commands/, test/ | `bun test && bun run build` |
| 8 | integration | `test(e2e): integration tests for full pipeline` | test/integration/, test/fixtures/ | `bun test` |

---

## Success Criteria

### Verification Commands
```bash
bun run build          # Expected: TypeScript compiles cleanly, 0 errors
bun test               # Expected: All tests pass, 0 failures
bun test --coverage    # Expected: Coverage report generated
```

### Final Checklist
- [ ] All 4 sprint command tools registered (`sprint_idea`, `sprint_design`, `sprint_develop`, `sprint_run`)
- [ ] All 3 utility tools registered (`splinty_load_stories`, `splinty_enforce_architecture`, `splinty_pipeline_status`)
- [ ] All 8 agent prompts ported and unit tested
- [ ] Story parser handles YAML, JSON, and Markdown
- [ ] Handoff serialization round-trips correctly
- [ ] Architecture enforcer catches test violations
- [ ] Pipeline orchestrator chains agents with handoff passing
- [ ] No Docker/sandbox code anywhere in the project
- [ ] No direct LLM API calls — all through session.prompt()
- [ ] No `import * as fs from 'fs'` — all file I/O through BunShell
- [ ] `bun test` green, `bun run build` clean
