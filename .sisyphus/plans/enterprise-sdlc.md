# Enterprise SDLC Platform — Splinty Transformation

## TL;DR

> **Quick Summary**: Transform Splinty from a CLI-only AI sprint execution engine into a full enterprise SDLC platform. Introduces database persistence (Postgres via Drizzle), REST API, authentication/RBAC, Epic/Roadmap hierarchy, sprint auto-planning with velocity tracking, cross-project learning, audit trail, webhook/event system, SSE streaming, and a web UI — all while preserving the existing 12-agent pipeline untouched.
>
> **Deliverables**:
> - `packages/db` — Drizzle ORM + Postgres schema + migrations + repository implementations
> - `packages/api` — Bun.serve REST API with JWT auth, RBAC, SSE streaming
> - `packages/web` — Web UI (React + Vite) for sprint dashboards, burndown charts, project management
> - `packages/core` — StorageAdapter abstraction layer (preserving existing fs-based behavior + new DB backend)
> - Enhanced `packages/cli` — CLI wrapping the API client
> - Enhanced `packages/integrations` — Jira bidirectional sync, webhook outbound system
> - Epic/Roadmap types, sprint auto-planning, velocity tracking, audit trail, RBAC
> - CI/CD pipeline (GitHub Actions)
> - Jira integration final QA (Task 5 carryover)
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 8 waves
> **Critical Path**: Jira QA → StorageAdapter → DB Schema → API Layer → Auth/RBAC → Epic Types → Sprint Planning → Web UI → Final Verification

---

## Context

### Original Request
"I want Splinty to be a powerful SDLC tool for delivering enterprise applications where the epics and user stories are provided as a roadmap for the app being developed by Splinty."

### Interview Summary
**Key Discussions**:
- Splinty is ~80-85% production-ready as a sprint execution engine (12 agents, Docker sandbox, architecture enforcement, project memory, 745+ tests)
- The gap is the SDLC management layer above execution — no epic hierarchy, no sprint auto-planning, no velocity tracking, no enterprise operations
- User wants FULL PLATFORM: web UI, multi-tenant, team features, REST API + CLI, RBAC, audit trail
- YAML spec format stays flexible — no rigid schema enforcement
- Jira integration Task 5 (final QA) included as first task

**Research Findings**:
- Enterprise SDLC tools (Jira, Linear, Azure DevOps) provide: epic→story→task hierarchy, velocity-based sprint planning, roadmap visualization, release management, RBAC, audit, webhooks — all gaps for Splinty
- AI dev platforms (Devin, SWE-Agent, OpenHands) show plan→think→act loops, tool calling, context gathering — Splinty already has these
- 91 filesystem calls in `packages/core/src/` and 64 in `packages/agents/src/` — StorageAdapter abstraction is critical foundation
- oh-my-splinty plan (`.sisyphus/plans/oh-my-splinty.md`) is a separate concern — converts Splinty to OpenCode plugin, does not conflict with enterprise platform

### Metis Review
**Identified Gaps** (addressed):
- **No database at all** — Pure filesystem persistence. Must introduce StorageAdapter before any features
- **Stub agent assumption was WRONG** — MigrationEngineer, InfrastructureEngineer, IntegrationTestEngineer are all fully implemented (152 lines each). Removed from plan
- **oh-my-splinty tension** — Separate concern, not conflicting. Enterprise plan wraps execution engine; plugin plan reimplements it for OpenCode
- **Concurrent sprint execution** — Must design for this from the start. Sprint runs use Docker + LLM calls heavily
- **CLI must continue working** — CLI is the regression canary and test harness throughout all waves

---

## Work Objectives

### Core Objective
Transform Splinty from a CLI-only sprint execution tool into a full enterprise SDLC platform with database persistence, REST API, web UI, multi-tenant team support, and enterprise operations (RBAC, audit, webhooks).

### Concrete Deliverables
- Postgres database with Drizzle ORM and all persistence migrated from filesystem
- REST API (Bun.serve) with JWT auth, RBAC middleware, SSE streaming
- Web UI (React + Vite) with sprint dashboards, burndown charts, project management
- Epic → Story → Task hierarchy with roadmap import
- Sprint auto-planning with velocity tracking and capacity-based selection
- Cross-project metrics aggregation
- Audit trail (append-only log)
- Webhook/event outbound system
- CI/CD pipeline (GitHub Actions)
- Jira bidirectional sync verified end-to-end

### Definition of Done
- [ ] `bun test` passes across ALL packages (existing + new)
- [ ] `tsc --noEmit` clean across entire repo
- [ ] API health check returns 200 at `/api/health`
- [ ] Web UI loads and displays sprint dashboard
- [ ] CLI `splinty run` works against API backend (not just filesystem)
- [ ] Jira write-back verified with mock tests
- [ ] All evidence captured in `.sisyphus/evidence/`

### Must Have
- StorageAdapter abstraction preserving existing filesystem behavior
- Postgres persistence for all core entities
- REST API with JWT auth and RBAC (4 roles: admin, member, viewer, service-account)
- Epic → Story relationship in type system
- Velocity tracking from historical sprint data
- Sprint auto-planning (suggest sprint contents based on priority + velocity + dependencies)
- Append-only audit log
- Webhook outbound on story/sprint state changes
- SSE streaming for sprint execution progress
- Web UI with sprint dashboard and burndown chart
- CI/CD pipeline running tests on push
- CLI backwards compatibility (existing commands still work)

### Must NOT Have (Guardrails)
- **No agent pipeline modifications** — Do NOT touch packages/agents/src/*.ts agent logic (BusinessOwner, ProductOwner, Architect, Developer, QA, etc.)
- **No GraphQL** — REST only
- **No SSO/SAML in Wave 1** — JWT with email/password only
- **No Kubernetes manifests** — Docker Compose for local dev, single-server for deployment
- **No billing/payment** — Not a SaaS billing concern
- **No custom agent marketplace** — No plugin system for the platform itself
- **No mobile app**
- **No schema-per-tenant multi-tenancy** — Row-level `org_id` column only
- **No AI-generated spec validation** — YAML stays flexible, validated only on import via existing StorySchema
- **No SQLite** — Postgres from day 1 (avoid migration trap)
- **No dynamic RBAC policies** — 4 hard-coded roles with static permission matrix
- **No real-time WebSocket** — SSE for streaming, no bidirectional communication
- **No UI before API is stable** — API must be testable with curl before any frontend work

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test, 745+ tests)
- **Automated tests**: YES (Tests-after — add tests for all new code)
- **Framework**: bun test (existing)
- **Regression**: `bun test packages/core && bun test packages/agents && bun test packages/cli && bun test packages/integrations` must pass after EVERY wave

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API endpoints**: Bash (curl) — Send requests, assert status + response fields
- **Database**: Bash (bun run) — Run queries, verify schema, test constraints
- **Web UI**: Playwright — Navigate, interact, assert DOM, screenshot
- **CLI**: interactive_bash (tmux) — Run command, validate output
- **Library/Module**: Bash (bun test) — Run test suites, assert pass counts

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — Jira QA + Foundation):
├── Task 1: Jira integration final QA [deep]
├── Task 2: StorageAdapter interface in packages/core [deep]
├── Task 3: New package scaffolding (packages/db, packages/api, packages/web) [quick]

Wave 2 (After Wave 1 — Database + Repository):
├── Task 4: Drizzle ORM setup + Postgres schema [unspecified-high]
├── Task 5: Repository implementations (StoryRepo, ProjectRepo, etc.) [deep]
├── Task 6: Filesystem adapter (wraps existing fs calls behind StorageAdapter) [deep]
├── Task 7: Epic and Roadmap types in packages/core [quick]

Wave 3 (After Wave 2 — API Layer):
├── Task 8: Bun.serve API scaffold + health check + error handling [unspecified-high]
├── Task 9: JWT auth + user registration/login [unspecified-high]
├── Task 10: RBAC middleware (4 roles) [quick]
├── Task 11: Sprint execution telemetry tables + velocity tracking [unspecified-high]

Wave 4 (After Wave 3 — Core SDLC Features):
├── Task 12: Epic/Story/Task API endpoints (CRUD) [unspecified-high]
├── Task 13: Roadmap import endpoint (YAML → Epics + Stories) [unspecified-high]
├── Task 14: Sprint auto-planning (velocity + priority + dependencies) [deep]
├── Task 15: Audit trail (append-only log table + middleware) [quick]
├── Task 16: Webhook outbound system (story/sprint state change events) [unspecified-high]

Wave 5 (After Wave 4 — Enterprise Operations):
├── Task 17: Multi-tenant org model (org_id on all entities) [unspecified-high]
├── Task 18: SSE streaming for sprint execution progress [unspecified-high]
├── Task 19: CLI refactor to use API client [deep]
├── Task 20: Cross-project metrics aggregation [unspecified-high]

Wave 6 (After Wave 5 — Web UI):
├── Task 21: React + Vite scaffold + auth pages [visual-engineering]
├── Task 22: Project dashboard + epic/story list [visual-engineering]
├── Task 23: Sprint execution viewer with SSE [visual-engineering]
├── Task 24: Burndown + velocity charts [visual-engineering]

Wave 7 (After Wave 6 — CI/CD + Polish):
├── Task 25: GitHub Actions CI pipeline [quick]
├── Task 26: Docker Compose for local dev (Postgres + API + Web) [quick]
├── Task 27: Security scanning agent integration [deep]
├── Task 28: Executive reporting endpoint [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real QA — Playwright + curl (unspecified-high)
├── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T2 → T5 → T8 → T9 → T12 → T14 → T19 → T21 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 4 (Waves 4, 5, 6)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | — | 1 |
| 2 | — | 5, 6 | 1 |
| 3 | — | 4, 7, 8 | 1 |
| 4 | 3 | 5, 11 | 2 |
| 5 | 2, 4 | 8, 12 | 2 |
| 6 | 2 | 19 | 2 |
| 7 | 3 | 12, 13, 14 | 2 |
| 8 | 3, 5 | 9, 12 | 3 |
| 9 | 8 | 10, 12 | 3 |
| 10 | 9 | 12, 17 | 3 |
| 11 | 4 | 14, 24 | 3 |
| 12 | 7, 9, 10 | 13, 17, 22 | 4 |
| 13 | 7, 12 | 14 | 4 |
| 14 | 11, 13 | 24 | 4 |
| 15 | 8 | 17 | 4 |
| 16 | 8, 5 | 18 | 4 |
| 17 | 10, 12, 15 | 20, 22 | 5 |
| 18 | 16 | 23 | 5 |
| 19 | 6, 8, 9 | — | 5 |
| 20 | 11, 17 | 28 | 5 |
| 21 | 9 | 22, 23, 24 | 6 |
| 22 | 12, 17, 21 | — | 6 |
| 23 | 18, 21 | — | 6 |
| 24 | 11, 14, 21 | — | 6 |
| 25 | 3 | — | 7 |
| 26 | 4, 8 | — | 7 |
| 27 | 8, 5 | — | 7 |
| 28 | 20 | — | 7 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `deep`, T2 → `deep`, T3 → `quick`
- **Wave 2**: 4 tasks — T4 → `unspecified-high`, T5 → `deep`, T6 → `deep`, T7 → `quick`
- **Wave 3**: 4 tasks — T8 → `unspecified-high`, T9 → `unspecified-high`, T10 → `quick`, T11 → `unspecified-high`
- **Wave 4**: 5 tasks — T12 → `unspecified-high`, T13 → `unspecified-high`, T14 → `deep`, T15 → `quick`, T16 → `unspecified-high`
- **Wave 5**: 4 tasks — T17 → `unspecified-high`, T18 → `unspecified-high`, T19 → `deep`, T20 → `unspecified-high`
- **Wave 6**: 4 tasks — T21-T24 → `visual-engineering`
- **Wave 7**: 4 tasks — T25 → `quick`, T26 → `quick`, T27 → `deep`, T28 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

### Wave 1 — Foundation (Start Immediately)

- [ ] 1. Jira Integration Final QA (Task 5 Carryover)

  **What to do**:
  - Run full test suite across ALL packages: `bun test packages/integrations && bun test packages/agents && bun test packages/core && bun test packages/cli`
  - Run `tsc --noEmit` across the entire repo to verify type-safety
  - Run integration smoke tests: verify `cmdCreateStory` command exists and parses args, verify `writeBackStory` function is exported and callable
  - Grep for forbidden patterns: `as any`, `@ts-ignore`, `console.log` in production code (not test files), empty catch blocks
  - Verify all Jira-related exports from `packages/integrations/src/index.ts` resolve correctly
  - Capture all evidence to `.sisyphus/evidence/task-1-*`

  **Must NOT do**:
  - Do NOT modify any source code — this is a QA-only task
  - Do NOT add new tests — only run existing ones
  - Do NOT change Jira connector behavior

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires thorough multi-package verification with careful evidence gathering across 4 packages
  - **Skills**: []
    - No special skills needed — pure CLI verification
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Nothing
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/integrations/src/jira.ts` — Full JiraConnector class with `createIssue`, `addAdfComment`, `createBugIssue`, `getFieldMetadata`, rate-limit retry logic
  - `packages/integrations/src/jira.test.ts` — 65 tests covering all Jira methods
  - `packages/cli/src/index.ts` — `writeBackStory` function (~line 50-120), `cmdCreateStory` command, `cmdRun` wiring with `JIRA_WRITEBACK_ENABLED`
  - `packages/agents/src/orchestrator.ts` — `writeBackStory?` callback in OrchestratorConfig, wired in `runStory()` and `runPlannedSprint()`

  **API/Type References**:
  - `packages/integrations/src/index.ts` — Barrel exports for `JiraConnector`, `RateLimitError`, `buildStoryDescription`, `buildBugDescription`, `buildQaResultComment`, ADF types
  - `packages/agents/src/orchestrator.test.ts` — Tests for writeBackStory hook

  **WHY Each Reference Matters**:
  - `jira.ts` — Verify all new methods are properly typed and tested
  - `jira.test.ts` — 65 tests are the authoritative spec for what was built; cross-reference coverage against all methods in `jira.ts`
  - `orchestrator.ts` — Verify writeBackStory callback is wired in both `runStory()` and `runPlannedSprint()`

  **Acceptance Criteria**:
  - [ ] `bun test packages/integrations` → PASS (65+ tests, 0 failures)
  - [ ] `bun test packages/agents` → PASS (42+ tests, 0 failures)
  - [ ] `bun test packages/core` → PASS (all tests, 0 failures)
  - [ ] `bun test packages/cli` → PASS (all tests, 0 failures)
  - [ ] `tsc --noEmit` → 0 errors across entire repo

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full test suite passes across all packages
    Tool: Bash
    Preconditions: Repository is in current state with Jira Tasks 1-4 implemented
    Steps:
      1. Run `bun test packages/integrations` — capture stdout
      2. Run `bun test packages/agents` — capture stdout
      3. Run `bun test packages/core` — capture stdout
      4. Run `bun test packages/cli` — capture stdout
      5. Assert each output contains "0 fail" and no "FAIL" lines
    Expected Result: All 4 package test suites pass with 0 failures
    Failure Indicators: Any line containing "FAIL", non-zero exit code, or "0 pass"
    Evidence: .sisyphus/evidence/task-1-test-suite.txt

  Scenario: TypeScript type-check clean across repo
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `npx tsc --noEmit` from repo root
      2. Assert exit code 0 and no error output
    Expected Result: Exit code 0, empty stderr
    Failure Indicators: Any line containing "error TS", non-zero exit code
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: No forbidden patterns in production code
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `grep -rn "as any" packages/integrations/src/jira.ts packages/cli/src/index.ts packages/agents/src/orchestrator.ts` — assert 0 matches
      2. Run `grep -rn "@ts-ignore" packages/integrations/src/jira.ts packages/cli/src/index.ts packages/agents/src/orchestrator.ts` — assert 0 matches
      3. Run `grep -rn "catch.*{}" packages/integrations/src/jira.ts packages/cli/src/index.ts` — assert 0 empty catches
    Expected Result: No matches found for any forbidden pattern
    Failure Indicators: Any grep returning matches
    Evidence: .sisyphus/evidence/task-1-forbidden-patterns.txt
  ```

  **Commit**: NO (QA-only, no code changes)

---

- [ ] 2. StorageAdapter Interface in packages/core

  **What to do**:
  - Define a `StorageAdapter` interface in `packages/core/src/storage-adapter.ts` that abstracts ALL filesystem operations currently used across `packages/core/src/`:
    - `readFile(path: string): Promise<string>`
    - `writeFile(path: string, content: string): Promise<void>`
    - `exists(path: string): Promise<boolean>`
    - `mkdir(path: string, options?: { recursive?: boolean }): Promise<void>`
    - `readDir(path: string): Promise<string[]>`
    - `rm(path: string, options?: { recursive?: boolean }): Promise<void>`
    - `stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number; mtimeMs: number }>`
    - `glob(pattern: string, cwd: string): Promise<string[]>`
  - Define Zod schemas for the interface methods' options where appropriate
  - Export from `packages/core/src/index.ts`
  - Add comprehensive tests in `packages/core/src/storage-adapter.test.ts` — test the interface contract (not implementation, which comes in Tasks 5 and 6)
  - Document each method with JSDoc explaining the filesystem operation it replaces

  **Must NOT do**:
  - Do NOT refactor existing code to use the adapter yet — that's Task 6
  - Do NOT implement the Postgres adapter — that's Task 5
  - Do NOT touch any agent code in `packages/agents/`
  - Do NOT add any npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires careful analysis of 91+ filesystem calls across core to design a comprehensive interface that covers all use cases
  - **Skills**: []
    - No special skills needed — pure TypeScript interface design
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/core/src/workspace.ts` — 25+ fs calls: `fs.mkdirSync`, `fs.writeFileSync`, `fs.readFileSync`, `fs.existsSync`, `fs.readdirSync`, `fs.statSync`, `fs.rmSync`. This is the HEAVIEST consumer. Study every method
  - `packages/core/src/ledger.ts` — 7 fs calls: `fs.mkdirSync`, `fs.writeFileSync`, `fs.readFileSync`, `fs.existsSync`. Uses `init()`, `getSnapshot()`, `updateStory()` pattern
  - `packages/core/src/handoff.ts` — 6 fs calls: read/write handoff documents as JSON files
  - `packages/core/src/telemetry-retention.ts` — 6 fs calls: read/write/delete telemetry JSON files with retention policies
  - `packages/core/src/resume.ts` — 3 fs calls: save/load resume checkpoints
  - `packages/core/src/sprint-state.ts` — 3 fs calls: save/load sprint state and checkpoints
  - `packages/core/src/architecture-plan.ts` — 1 fs call: read architecture plan files

  **API/Type References**:
  - `packages/core/src/types.ts` — `WorkspaceState` schema (line 93-99) — the adapter must support all operations WorkspaceManager uses
  - `packages/core/src/index.ts` — Current barrel exports — new adapter must be added here

  **WHY Each Reference Matters**:
  - `workspace.ts` — Must study ALL 25+ fs call patterns to ensure adapter covers every operation (read, write, mkdir, exists, readdir, stat, rm, glob)
  - `ledger.ts`, `handoff.ts`, etc. — Each uses a slightly different subset of fs operations; adapter must be a superset
  - `types.ts` — WorkspaceState drives path conventions; adapter must be compatible

  **Acceptance Criteria**:
  - [ ] File created: `packages/core/src/storage-adapter.ts`
  - [ ] Interface exported from `packages/core/src/index.ts`
  - [ ] `bun test packages/core/src/storage-adapter.test.ts` → PASS
  - [ ] `tsc --noEmit` → 0 errors
  - [ ] Interface covers ALL fs operations found in workspace.ts, ledger.ts, handoff.ts, telemetry-retention.ts, resume.ts, sprint-state.ts, architecture-plan.ts

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: StorageAdapter interface is importable and type-correct
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `bun -e "import { StorageAdapter } from './packages/core/src/storage-adapter'; console.log(typeof StorageAdapter)"`
      2. Assert output is not an error
      3. Run `tsc --noEmit` from repo root
      4. Assert exit code 0
    Expected Result: Interface exports cleanly, no type errors
    Failure Indicators: Import error, tsc errors mentioning storage-adapter
    Evidence: .sisyphus/evidence/task-2-interface-import.txt

  Scenario: All fs operations in core are covered by the interface
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `grep -rn "fs\.\(readFileSync\|writeFileSync\|existsSync\|mkdirSync\|readdirSync\|statSync\|rmSync\|unlinkSync\)" packages/core/src/*.ts` — capture all fs calls
      2. For each unique fs method found, verify a corresponding method exists in StorageAdapter interface by reading `packages/core/src/storage-adapter.ts`
      3. Assert every fs method has a corresponding adapter method
    Expected Result: 100% coverage — every fs.* call in core has a corresponding adapter method
    Failure Indicators: Any fs.* method without a corresponding adapter method
    Evidence: .sisyphus/evidence/task-2-fs-coverage.txt

  Scenario: Tests pass for interface contract
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `bun test packages/core/src/storage-adapter.test.ts`
      2. Assert all tests pass, 0 failures
    Expected Result: All contract tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-2-tests.txt
  ```

  **Commit**: YES
  - Message: `refactor(core): introduce StorageAdapter interface for filesystem abstraction`
  - Files: `packages/core/src/storage-adapter.ts`, `packages/core/src/storage-adapter.test.ts`, `packages/core/src/index.ts`
  - Pre-commit: `bun test packages/core && tsc --noEmit`

---

- [ ] 3. New Package Scaffolding (packages/db, packages/api, packages/web)

  **What to do**:
  - Create `packages/db/` with:
    - `package.json` (name: `@splinty/db`, deps: `drizzle-orm`, `drizzle-kit`, `postgres` (pg driver for drizzle), `@splinty/core` as workspace dep)
    - `tsconfig.json` extending root config
    - `src/index.ts` — empty barrel export
    - `drizzle.config.ts` — Drizzle Kit config pointing to `src/schema/` for migration generation
  - Create `packages/api/` with:
    - `package.json` (name: `@splinty/api`, deps: `@splinty/core`, `@splinty/db`, `@splinty/integrations`, `jose` for JWT)
    - `tsconfig.json` extending root config
    - `src/index.ts` — empty barrel with placeholder `// Bun.serve entry point`
    - `src/routes/` directory with empty `health.ts`
  - Create `packages/web/` with:
    - Scaffold via `bun create vite packages/web --template react-ts` OR manual setup
    - `package.json` (name: `@splinty/web`, deps: `react`, `react-dom`, `react-router-dom`)
    - `vite.config.ts` with proxy to API on port 3000
    - `src/App.tsx` — minimal "Splinty" placeholder
    - `src/main.tsx` — React entry point
  - Install all new dependencies via `bun install` from repo root
  - Verify monorepo workspace resolution: all 3 new packages visible in `bun install` output

  **Must NOT do**:
  - Do NOT implement any business logic — scaffolding only
  - Do NOT add database schemas — that's Task 4
  - Do NOT add API routes — that's Task 8
  - Do NOT build the web UI — that's Tasks 21-24
  - Do NOT add SQLite — Postgres only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward scaffolding with known patterns — package.json, tsconfig, empty barrel exports
  - **Skills**: []
    - No special skills needed
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction
    - `frontend-ui-ux`: No UI design yet

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 7, 8
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/core/package.json` — Follow existing package naming convention (`@splinty/core` pattern if used, or plain `splinty-core`)
  - `packages/integrations/package.json` — Follow dependency declaration pattern for workspace cross-references
  - `package.json` (root) — `"workspaces": ["packages/*"]` — new packages auto-discovered
  - `tsconfig.json` (root) — Base TypeScript config to extend

  **External References**:
  - Drizzle ORM docs: https://orm.drizzle.team/docs/get-started-postgresql — Setup for Postgres with `postgres` driver
  - Vite React template: `bun create vite --template react-ts`

  **WHY Each Reference Matters**:
  - Existing package.json files — Must match naming convention, dependency patterns, and script patterns exactly
  - Root tsconfig — New packages must extend it for consistent compiler options
  - Root package.json workspaces — Verify new packages are auto-discovered

  **Acceptance Criteria**:
  - [ ] Directory exists: `packages/db/src/`
  - [ ] Directory exists: `packages/api/src/routes/`
  - [ ] Directory exists: `packages/web/src/`
  - [ ] `bun install` succeeds from repo root
  - [ ] `tsc --noEmit` passes (no type errors from new packages)
  - [ ] Each package's `src/index.ts` is importable

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All 3 packages are recognized by Bun workspace
    Tool: Bash
    Preconditions: Scaffolding complete, bun install run
    Steps:
      1. Run `ls packages/db/package.json packages/api/package.json packages/web/package.json` — assert all exist
      2. Run `bun install` from repo root — assert exit code 0
      3. Run `bun -e "require('./packages/db/src/index.ts')"` — assert no error
      4. Run `bun -e "require('./packages/api/src/index.ts')"` — assert no error
    Expected Result: All packages exist, install succeeds, imports resolve
    Failure Indicators: Missing package.json, bun install failure, import errors
    Evidence: .sisyphus/evidence/task-3-workspace.txt

  Scenario: TypeScript compilation clean with new packages
    Tool: Bash
    Preconditions: All packages scaffolded
    Steps:
      1. Run `tsc --noEmit` from repo root
      2. Assert exit code 0 and no errors from packages/db, packages/api, or packages/web
    Expected Result: Zero type errors
    Failure Indicators: Any tsc error mentioning new packages
    Evidence: .sisyphus/evidence/task-3-typecheck.txt

  Scenario: Drizzle config file is valid
    Tool: Bash
    Preconditions: packages/db scaffolded
    Steps:
      1. Read `packages/db/drizzle.config.ts` — assert it references `src/schema/` as schema directory
      2. Assert `drizzle-orm` and `drizzle-kit` are in `packages/db/package.json` dependencies
    Expected Result: Config references correct schema path, deps are declared
    Failure Indicators: Missing config, wrong schema path, missing dependencies
    Evidence: .sisyphus/evidence/task-3-drizzle-config.txt
  ```

  **Commit**: YES
  - Message: `chore: scaffold packages/db, packages/api, packages/web`
  - Files: `packages/db/**`, `packages/api/**`, `packages/web/**`
  - Pre-commit: `bun install && tsc --noEmit`

### Wave 2 — Database + Repository + Types (After Wave 1)

- [ ] 4. Drizzle ORM Setup + Postgres Schema

  **What to do**:
  - Install `drizzle-orm`, `drizzle-kit`, and `postgres` (the pg driver) in `packages/db`
  - Create schema files in `packages/db/src/schema/`:
    - `organizations.ts` — `organizations` table: `id` (uuid PK), `name`, `slug` (unique), `created_at`, `updated_at`
    - `users.ts` — `users` table: `id` (uuid PK), `org_id` (FK → organizations), `email` (unique per org), `password_hash`, `name`, `role` (enum: admin/member/viewer/service-account), `created_at`, `updated_at`
    - `projects.ts` — `projects` table: `id` (uuid PK), `org_id` (FK), `name`, `description`, `spec_yaml` (text, stores the raw YAML spec), `created_at`, `updated_at`
    - `epics.ts` — `epics` table: `id` (uuid PK), `project_id` (FK), `org_id` (FK), `title`, `description`, `status` (enum: draft/active/completed), `sort_order`, `created_at`, `updated_at`
    - `stories.ts` — `stories` table: mirrors existing `StorySchema` fields + `epic_id` (FK → epics, nullable), `org_id` (FK), `project_id` (FK), `assigned_to` (FK → users, nullable), `story_points` (int, nullable), `sprint_id` (FK → sprints, nullable)
    - `sprints.ts` — `sprints` table: `id` (uuid PK), `project_id` (FK), `org_id` (FK), `name`, `goal`, `status` (enum: planning/active/completed/cancelled), `started_at`, `completed_at`, `velocity` (int, nullable), `created_at`
    - `sprint_telemetry.ts` — `sprint_telemetry` table: mirrors existing `SprintTelemetrySchema` fields + `sprint_id` (FK), `org_id` (FK)
    - `audit_log.ts` — `audit_log` table: `id` (uuid PK), `org_id` (FK), `user_id` (FK), `action` (string), `entity_type` (string), `entity_id` (string), `diff` (jsonb), `created_at` — APPEND ONLY (no update/delete)
    - `webhooks.ts` — `webhooks` table: `id` (uuid PK), `org_id` (FK), `url`, `secret`, `events` (text array), `active` (boolean), `created_at`
  - Create `packages/db/src/schema/index.ts` — barrel export all tables
  - Create `packages/db/src/db.ts` — Drizzle client factory: `createDb(connectionString: string)` returning typed Drizzle instance
  - Generate initial migration via `bunx drizzle-kit generate`
  - Add tests in `packages/db/src/schema/schema.test.ts` verifying schema structure (table names, column types, FK relationships) using drizzle's `getTableName` and introspection

  **Must NOT do**:
  - Do NOT use SQLite — Postgres only
  - Do NOT create schema-per-tenant — use `org_id` column on every table
  - Do NOT add dynamic RBAC tables — roles are a static enum in the users table
  - Do NOT touch `packages/core/src/types.ts` — Epic types are Task 7

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Database schema design requires careful FK relationships, index strategy, and enum handling across 9+ tables
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7)
  - **Blocks**: Tasks 5, 11
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `packages/core/src/types.ts:47-62` — `StorySchema` — stories table must include ALL these fields: id, title, description, acceptanceCriteria, state, source, sourceId, storyPoints, domain, tags, dependsOn, workspacePath, createdAt, updatedAt
  - `packages/core/src/types.ts:165-176` — `SprintTelemetrySchema` — sprint_telemetry table mirrors these fields
  - `packages/core/src/types.ts:10-22` — `StoryState` enum — use as Postgres enum for story status
  - `packages/core/src/types.ts:24-28` — `StorySource` enum — use as Postgres enum

  **API/Type References**:
  - `packages/db/drizzle.config.ts` — Created in Task 3, must point to `src/schema/`

  **External References**:
  - Drizzle ORM Postgres setup: https://orm.drizzle.team/docs/get-started-postgresql
  - Drizzle schema declaration: https://orm.drizzle.team/docs/sql-schema-declaration

  **WHY Each Reference Matters**:
  - `types.ts StorySchema` — The stories table MUST be a superset of this schema. Every field in StorySchema must have a column
  - `types.ts SprintTelemetrySchema` — sprint_telemetry mirrors this for DB persistence of execution data
  - `types.ts enums` — Must use identical enum values so conversion between Zod types and DB rows is lossless

  **Acceptance Criteria**:
  - [ ] Schema files created: `packages/db/src/schema/*.ts` (9 tables)
  - [ ] Barrel export: `packages/db/src/schema/index.ts` exports all tables
  - [ ] DB client: `packages/db/src/db.ts` exports `createDb`
  - [ ] Migration generated: `packages/db/drizzle/` contains migration SQL
  - [ ] `tsc --noEmit` → 0 errors
  - [ ] `bun test packages/db` → PASS

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Schema files compile and export correctly
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `tsc --noEmit` from repo root — assert 0 errors
      2. Run `bun -e "import * as schema from './packages/db/src/schema'; console.log(Object.keys(schema).join(', '))"` — assert output includes organizations, users, projects, epics, stories, sprints, sprintTelemetry, auditLog, webhooks
    Expected Result: All 9 table schemas export cleanly
    Failure Indicators: Missing table names in output, import errors
    Evidence: .sisyphus/evidence/task-4-schema-exports.txt

  Scenario: stories table is a superset of StorySchema
    Tool: Bash
    Preconditions: Schema files exist
    Steps:
      1. Read `packages/db/src/schema/stories.ts`
      2. Verify columns exist for: id, title, description, acceptance_criteria, state, source, source_id, story_points, domain, tags, depends_on, workspace_path, created_at, updated_at, epic_id, org_id, project_id, assigned_to, sprint_id
      3. Assert all StorySchema fields have corresponding columns
    Expected Result: All 12 StorySchema fields + 5 new fields present as columns
    Failure Indicators: Missing column for any StorySchema field
    Evidence: .sisyphus/evidence/task-4-story-columns.txt

  Scenario: Audit log table is append-only by design
    Tool: Bash
    Preconditions: Schema exists
    Steps:
      1. Read `packages/db/src/schema/audit_log.ts`
      2. Assert table has no `updated_at` column
      3. Assert table has `created_at` with `.defaultNow()`
    Expected Result: Audit log has created_at but no updated_at — confirming append-only design
    Failure Indicators: updated_at column present
    Evidence: .sisyphus/evidence/task-4-audit-append-only.txt
  ```

  **Commit**: YES
  - Message: `feat(db): Drizzle ORM schema with 9 tables and initial migration`
  - Files: `packages/db/src/schema/*.ts`, `packages/db/src/db.ts`, `packages/db/drizzle/**`
  - Pre-commit: `tsc --noEmit && bun test packages/db`

---

- [ ] 5. Repository Implementations (StoryRepo, ProjectRepo, etc.)

  **What to do**:
  - Create repository classes in `packages/db/src/repositories/`:
    - `organization.repo.ts` — `OrganizationRepository` implementing StorageAdapter-compatible CRUD: `create`, `findById`, `findBySlug`, `update`, `list`
    - `user.repo.ts` — `UserRepository`: `create`, `findById`, `findByEmail`, `update`, `listByOrg`
    - `project.repo.ts` — `ProjectRepository`: `create`, `findById`, `update`, `listByOrg`, `delete`
    - `epic.repo.ts` — `EpicRepository`: `create`, `findById`, `update`, `listByProject`, `reorder`, `delete`
    - `story.repo.ts` — `StoryRepository`: `create`, `findById`, `update`, `listByProject`, `listByEpic`, `listBySprint`, `updateState`, `findBySourceId`
    - `sprint.repo.ts` — `SprintRepository`: `create`, `findById`, `update`, `listByProject`, `getActive`, `complete`
    - `audit.repo.ts` — `AuditRepository`: `append` (only), `listByEntity`, `listByOrg` (paginated)
    - `webhook.repo.ts` — `WebhookRepository`: `create`, `findById`, `update`, `listByOrg`, `listByEvent`, `delete`
  - Each repository takes a Drizzle db instance in constructor
  - Each method returns typed results using Zod schemas from `packages/core` where applicable (Story, SprintTelemetry) or new Zod schemas for DB-only types
  - Create `packages/db/src/repositories/index.ts` — barrel export
  - Add tests for each repository using an in-memory or test database pattern (mock the drizzle db instance)
  - Ensure all queries include `org_id` filtering for multi-tenant safety

  **Must NOT do**:
  - Do NOT implement StorageAdapter — that's Task 6
  - Do NOT touch packages/core or packages/agents
  - Do NOT implement pagination with cursors — simple offset/limit is fine for now
  - Do NOT add caching — repositories are direct DB access

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 8 repository classes with typed queries, multi-tenant filtering, and test coverage requires careful attention
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6, 7) — but depends on Tasks 2 and 4 completing
  - **Blocks**: Tasks 8, 12
  - **Blocked By**: Tasks 2, 4

  **References**:

  **Pattern References**:
  - `packages/db/src/schema/*.ts` — Created in Task 4. Repository methods must match column names and types exactly
  - `packages/core/src/types.ts:47-62` — `StorySchema` — `StoryRepository` must return objects compatible with this schema
  - `packages/core/src/workspace.ts` — Study `WorkspaceManager` method patterns (create, read, list, delete) — repositories should follow similar naming

  **API/Type References**:
  - `packages/core/src/types.ts:180` — `Story` type — repository `findById` return type
  - `packages/core/src/types.ts:10-22` — `StoryState` — used in `updateState` method
  - `packages/core/src/storage-adapter.ts` — Created in Task 2. Repositories may implement parts of this interface

  **WHY Each Reference Matters**:
  - `schema/*.ts` — Repository methods are typed wrappers around Drizzle queries; column names MUST match
  - `types.ts Story` — Repository must return objects that can be cast/validated against the existing Story type
  - `WorkspaceManager` — Naming convention guide for method names (create, get, list patterns)

  **Acceptance Criteria**:
  - [ ] 8 repository files in `packages/db/src/repositories/`
  - [ ] Barrel export in `packages/db/src/repositories/index.ts`
  - [ ] All repositories include `org_id` filtering
  - [ ] `bun test packages/db` → PASS (all repository tests)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All 8 repositories export and instantiate
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `bun -e "import * as repos from './packages/db/src/repositories'; console.log(Object.keys(repos).join(', '))"` — assert output includes OrganizationRepository, UserRepository, ProjectRepository, EpicRepository, StoryRepository, SprintRepository, AuditRepository, WebhookRepository
    Expected Result: All 8 repository classes export cleanly
    Failure Indicators: Missing repository in output
    Evidence: .sisyphus/evidence/task-5-repo-exports.txt

  Scenario: StoryRepository returns Story-compatible objects
    Tool: Bash
    Preconditions: Tests written
    Steps:
      1. Run `bun test packages/db/src/repositories/story.repo.test.ts`
      2. Assert tests verify that `findById` returns object with all StorySchema fields
    Expected Result: Tests pass, Story type compatibility verified
    Failure Indicators: Test failure, type mismatch
    Evidence: .sisyphus/evidence/task-5-story-repo-tests.txt

  Scenario: AuditRepository has no update or delete methods
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Read `packages/db/src/repositories/audit.repo.ts`
      2. Assert class has `append` method
      3. Assert class does NOT have `update` or `delete` methods
    Expected Result: Only `append`, `listByEntity`, `listByOrg` methods exist — no mutation
    Failure Indicators: `update` or `delete` method found
    Evidence: .sisyphus/evidence/task-5-audit-append-only.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `feat(db): repository implementations for all entities`
  - Files: `packages/db/src/repositories/*.ts`
  - Pre-commit: `bun test packages/db && tsc --noEmit`

---

- [ ] 6. Filesystem Adapter (Wraps Existing fs Calls Behind StorageAdapter)

  **What to do**:
  - Create `packages/core/src/fs-storage-adapter.ts` — `FilesystemStorageAdapter` class implementing `StorageAdapter` interface from Task 2
  - Implementation wraps Node.js `fs` module synchronous calls (matching existing behavior):
    - `readFile` → `fs.readFileSync` (wrap in Promise for async interface)
    - `writeFile` → `fs.writeFileSync` (with `mkdirSync` for parent dirs)
    - `exists` → `fs.existsSync`
    - `mkdir` → `fs.mkdirSync`
    - `readDir` → `fs.readdirSync`
    - `rm` → `fs.rmSync`
    - `stat` → `fs.statSync`
    - `glob` → existing glob pattern (or `fs.readdirSync` recursive)
  - Refactor `WorkspaceManager` to accept a `StorageAdapter` in constructor (default to `FilesystemStorageAdapter`)
  - Refactor `LedgerManager` to accept a `StorageAdapter` in constructor (default to `FilesystemStorageAdapter`)
  - Refactor `HandoffManager` (in `handoff.ts`) to accept a `StorageAdapter` (default to `FilesystemStorageAdapter`)
  - Refactor `TelemetryRetentionManager` to accept a `StorageAdapter` (default to `FilesystemStorageAdapter`)
  - Refactor `ResumeManager` (in `resume.ts`) to accept a `StorageAdapter` (default to `FilesystemStorageAdapter`)
  - Refactor `SprintStateManager` (in `sprint-state.ts`) to accept a `StorageAdapter` (default to `FilesystemStorageAdapter`)
  - **CRITICAL**: Default to FilesystemStorageAdapter so ALL existing behavior remains identical. No calling code needs to change unless it wants to inject a different adapter.
  - Run ALL existing tests to verify zero regression
  - Export `FilesystemStorageAdapter` from `packages/core/src/index.ts`

  **Must NOT do**:
  - Do NOT change the public API of any manager class — only add optional `adapter` parameter to constructors
  - Do NOT modify any agent code in `packages/agents/`
  - Do NOT implement a Postgres adapter here — that's done via repositories in Task 5
  - Do NOT break any existing tests — this is a pure refactor with default-compatible behavior

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Refactoring 91+ fs calls across 6 files with zero regression requires extreme care and thorough testing
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7) — depends on Task 2
  - **Blocks**: Task 19
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `packages/core/src/workspace.ts:1-2` — `import * as fs from 'fs'` — all 25+ fs calls to replace with adapter calls
  - `packages/core/src/ledger.ts:1-2` — `import * as fs from 'fs'` — 7 fs calls to replace
  - `packages/core/src/handoff.ts` — 6 fs calls to replace
  - `packages/core/src/telemetry-retention.ts` — 6 fs calls to replace
  - `packages/core/src/resume.ts` — 3 fs calls to replace
  - `packages/core/src/sprint-state.ts` — 3 fs calls to replace
  - `packages/core/src/architecture-plan.ts` — 1 fs call to replace

  **API/Type References**:
  - `packages/core/src/storage-adapter.ts` — Created in Task 2. `FilesystemStorageAdapter` MUST implement this interface exactly

  **Test References**:
  - `packages/core/src/workspace.test.ts` — Existing workspace tests MUST pass without modification
  - `packages/core/src/ledger.test.ts` — Existing ledger tests MUST pass
  - ALL `packages/core/src/*.test.ts` — Every existing test must pass unchanged

  **WHY Each Reference Matters**:
  - Each `.ts` file with `import * as fs from 'fs'` — These are the exact files being refactored. Every `fs.*` call must be replaced with `this.adapter.*`
  - `storage-adapter.ts` — The interface contract that FilesystemStorageAdapter implements
  - Test files — Zero regression is the primary acceptance criterion

  **Acceptance Criteria**:
  - [ ] `packages/core/src/fs-storage-adapter.ts` created and exported
  - [ ] WorkspaceManager, LedgerManager, HandoffManager, TelemetryRetentionManager, ResumeManager, SprintStateManager all accept optional `StorageAdapter` parameter
  - [ ] All default to `FilesystemStorageAdapter`
  - [ ] `bun test packages/core` → ALL existing tests PASS (zero regression)
  - [ ] `bun test packages/agents` → ALL existing tests PASS (zero regression)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Zero regression — all existing core tests pass
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. Run `bun test packages/core` — capture full output
      2. Assert 0 failures, same or higher pass count as before
      3. Run `bun test packages/agents` — capture full output
      4. Assert 0 failures (agents depend on core, must still work)
    Expected Result: Identical test results as before refactoring
    Failure Indicators: Any test failure, pass count drop
    Evidence: .sisyphus/evidence/task-6-regression.txt

  Scenario: FilesystemStorageAdapter implements StorageAdapter interface
    Tool: Bash
    Preconditions: Both files exist
    Steps:
      1. Run `tsc --noEmit` — assert no type errors
      2. Run `bun -e "import { FilesystemStorageAdapter, StorageAdapter } from './packages/core/src'; const a: StorageAdapter = new FilesystemStorageAdapter(); console.log('OK')"` — assert "OK"
    Expected Result: Adapter is type-compatible with interface
    Failure Indicators: Type error on assignment
    Evidence: .sisyphus/evidence/task-6-adapter-type.txt

  Scenario: No direct fs imports remain in refactored files
    Tool: Bash
    Preconditions: Refactoring complete
    Steps:
      1. For each refactored file (workspace.ts, ledger.ts, handoff.ts, telemetry-retention.ts, resume.ts, sprint-state.ts): grep for `import.*from 'fs'` — assert 0 matches
      2. Grep for `fs.readFileSync`, `fs.writeFileSync`, etc. — assert 0 matches in refactored files
    Expected Result: No direct fs imports in any refactored manager class
    Failure Indicators: Any `fs.` call remaining in refactored files (architecture-plan.ts is the only exception if it wasn't refactored)
    Evidence: .sisyphus/evidence/task-6-no-direct-fs.txt
  ```

  **Commit**: YES
  - Message: `refactor(core): migrate all managers to StorageAdapter with FilesystemStorageAdapter default`
  - Files: `packages/core/src/fs-storage-adapter.ts`, `packages/core/src/workspace.ts`, `packages/core/src/ledger.ts`, `packages/core/src/handoff.ts`, `packages/core/src/telemetry-retention.ts`, `packages/core/src/resume.ts`, `packages/core/src/sprint-state.ts`, `packages/core/src/index.ts`
  - Pre-commit: `bun test packages/core && bun test packages/agents && tsc --noEmit`

---

- [ ] 7. Epic and Roadmap Types in packages/core

  **What to do**:
  - Add new Zod schemas and types to `packages/core/src/types.ts`:
    - `EpicStatusSchema` — enum: `DRAFT`, `ACTIVE`, `COMPLETED`
    - `EpicSchema` — `id`, `title`, `description`, `status` (EpicStatus), `projectId`, `sortOrder`, `storyIds` (string array), `createdAt`, `updatedAt`
    - `RoadmapItemSchema` — `epicId`, `title`, `startDate` (optional), `targetDate` (optional), `progress` (number 0-100, computed)
    - `RoadmapSchema` — `projectId`, `items` (array of RoadmapItem), `importedAt`
  - Update `StorySchema` to add optional `epicId: z.string().optional()` field
  - Add inferred TypeScript types: `Epic`, `EpicStatus`, `RoadmapItem`, `Roadmap`
  - Export all new types from `packages/core/src/index.ts`
  - Add tests in `packages/core/src/types.test.ts` (extend existing test file):
    - Validate EpicSchema with valid/invalid data
    - Validate RoadmapSchema
    - Validate StorySchema still works with and without epicId

  **Must NOT do**:
  - Do NOT formalize the YAML spec format — keep it flexible per user decision
  - Do NOT add story refinement AI workflow — out of scope
  - Do NOT modify any agent code
  - Do NOT add Epic persistence — that's in the DB schema (Task 4)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding Zod schemas and types to an existing file is straightforward — follows established patterns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6)
  - **Blocks**: Tasks 12, 13, 14
  - **Blocked By**: Task 3 (needs core package to build clean with new packages present)

  **References**:

  **Pattern References**:
  - `packages/core/src/types.ts:47-62` — `StorySchema` — follow identical Zod schema pattern (z.object with z.string(), z.nativeEnum(), z.array(), etc.)
  - `packages/core/src/types.ts:10-22` — `StoryState` enum pattern — follow for EpicStatus enum
  - `packages/core/src/types.ts:178-190` — Type inference pattern: `export type Story = z.infer<typeof StorySchema>` — follow for Epic, Roadmap types
  - `packages/core/src/types.test.ts` — Existing type tests — extend with new schema tests

  **WHY Each Reference Matters**:
  - `StorySchema` — Epic schema must follow identical patterns for consistency (z.string().min(1) for ids, z.string().datetime() for timestamps)
  - `StoryState enum` — EpicStatus must use the same `z.nativeEnum` pattern
  - `types.test.ts` — Must extend existing tests, not create a separate test file

  **Acceptance Criteria**:
  - [ ] `EpicSchema`, `RoadmapSchema`, `RoadmapItemSchema` defined in `packages/core/src/types.ts`
  - [ ] `Epic`, `Roadmap`, `RoadmapItem` types exported from `packages/core/src/index.ts`
  - [ ] `StorySchema` updated with optional `epicId` field
  - [ ] Existing Story tests still pass
  - [ ] New Epic/Roadmap tests pass
  - [ ] `tsc --noEmit` → 0 errors
  - [ ] `bun test packages/core` → PASS

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Epic and Roadmap types are importable
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `bun -e "import { EpicSchema, RoadmapSchema, Epic, Roadmap } from './packages/core/src'; console.log('EpicSchema:', typeof EpicSchema.parse); console.log('RoadmapSchema:', typeof RoadmapSchema.parse)"`
      2. Assert output shows both as "function"
    Expected Result: Both schemas and types export cleanly
    Failure Indicators: Import error, undefined
    Evidence: .sisyphus/evidence/task-7-type-exports.txt

  Scenario: StorySchema backward compatible with optional epicId
    Tool: Bash
    Preconditions: StorySchema updated
    Steps:
      1. Run `bun -e "import { StorySchema } from './packages/core/src'; const result = StorySchema.safeParse({ id: 'S1', title: 'Test', description: '', acceptanceCriteria: [], state: 'RAW', source: 'FILE', workspacePath: '/tmp', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' }); console.log(result.success)"`
      2. Assert output is `true` — story without epicId still valid
      3. Run same with `epicId: 'E1'` added — assert also `true`
    Expected Result: StorySchema validates with and without epicId
    Failure Indicators: safeParse returns false for story without epicId
    Evidence: .sisyphus/evidence/task-7-story-compat.txt

  Scenario: All core tests still pass after type additions
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run `bun test packages/core`
      2. Assert 0 failures
    Expected Result: Zero regression
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-core-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add Epic and Roadmap types with StorySchema epicId field`
  - Files: `packages/core/src/types.ts`, `packages/core/src/types.test.ts`, `packages/core/src/index.ts`
  - Pre-commit: `bun test packages/core && tsc --noEmit`

### Wave 3 — API Layer (After Wave 2)

- [ ] 8. Bun.serve API Scaffold + Health Check + Error Handling

  **What to do**:
  - Create `packages/api/src/server.ts` — Bun.serve HTTP server:
    - Router pattern: simple path-based routing (no framework — use `new URL(req.url).pathname` + method matching)
    - Global error handler returning `{ error: string, code: string }` JSON with appropriate HTTP status
    - Request ID middleware (generate uuid per request, attach to response headers as `X-Request-Id`)
    - JSON body parser helper: `parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T>` — validates with Zod, throws 400 on invalid
    - CORS middleware: configurable origins, methods, headers
    - Request logging: method, path, status, duration (console.log for now)
  - Create `packages/api/src/routes/health.ts` — `GET /api/health` → `{ status: "ok", version: "0.1.0", uptime: process.uptime() }`
  - Create `packages/api/src/middleware/` directory with:
    - `error-handler.ts` — catches errors, maps known errors to status codes (400, 401, 403, 404, 500)
    - `cors.ts` — CORS preflight + headers
    - `request-id.ts` — UUID generation per request
  - Create `packages/api/src/utils/` directory with:
    - `response.ts` — helper: `json(data, status?)`, `error(message, status, code?)`
  - Update `packages/api/src/index.ts` — entry point that creates DB connection and starts server on `PORT` env var (default 3000)
  - Add start script to `packages/api/package.json`: `"start": "bun src/index.ts"`, `"dev": "bun --watch src/index.ts"`
  - Add tests: `packages/api/src/routes/health.test.ts`, `packages/api/src/middleware/error-handler.test.ts`

  **Must NOT do**:
  - Do NOT use Express, Hono, Elysia, or any HTTP framework — Bun.serve native only
  - Do NOT add auth yet — that's Task 9
  - Do NOT add business logic routes — that's Tasks 12-16
  - Do NOT add GraphQL

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API scaffold requires routing, middleware chain, error handling, and test setup — moderate complexity
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser needed for API testing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 11) — but Tasks 9, 10 depend on this completing
  - **Blocks**: Tasks 9, 12
  - **Blocked By**: Tasks 3, 5

  **References**:

  **Pattern References**:
  - `packages/cli/src/index.ts` — CLI entry point pattern. API entry point should follow similar structure (parse env, init dependencies, start)
  - `packages/core/src/types.ts` — Zod validation pattern. Use same approach for request body validation

  **External References**:
  - Bun.serve docs: https://bun.sh/docs/api/http — native HTTP server API
  - Bun.serve routing patterns: `new URL(req.url).pathname` matching

  **WHY Each Reference Matters**:
  - `cli/index.ts` — Entry point patterns: how env vars are read, how dependencies are initialized
  - `types.ts` Zod — Request validation should use identical Zod patterns as core types

  **Acceptance Criteria**:
  - [ ] `packages/api/src/server.ts` — Bun.serve with router, error handler, CORS
  - [ ] `GET /api/health` returns `{ status: "ok" }` with 200
  - [ ] Invalid routes return 404 with `{ error: "Not Found", code: "NOT_FOUND" }`
  - [ ] Malformed JSON body returns 400
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Health endpoint responds correctly
    Tool: Bash
    Preconditions: API server started with `bun packages/api/src/index.ts &`
    Steps:
      1. Start server: `bun packages/api/src/index.ts &` — wait 2s
      2. Run `curl -s http://localhost:3000/api/health`
      3. Assert response contains `"status":"ok"`
      4. Assert HTTP status is 200
      5. Kill server process
    Expected Result: `{"status":"ok","version":"0.1.0","uptime":...}` with 200
    Failure Indicators: Connection refused, non-200 status, missing "ok"
    Evidence: .sisyphus/evidence/task-8-health.txt

  Scenario: 404 for unknown routes
    Tool: Bash
    Preconditions: API server running
    Steps:
      1. Run `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/nonexistent`
      2. Assert status is 404
      3. Run `curl -s http://localhost:3000/api/nonexistent` — assert body contains `"error"`
    Expected Result: 404 with error JSON body
    Failure Indicators: 200 status, no error body
    Evidence: .sisyphus/evidence/task-8-404.txt

  Scenario: CORS headers present
    Tool: Bash
    Preconditions: API server running
    Steps:
      1. Run `curl -s -I -X OPTIONS http://localhost:3000/api/health`
      2. Assert `Access-Control-Allow-Origin` header present
      3. Assert `Access-Control-Allow-Methods` header present
    Expected Result: CORS preflight headers returned
    Failure Indicators: Missing CORS headers
    Evidence: .sisyphus/evidence/task-8-cors.txt
  ```

  **Commit**: YES
  - Message: `feat(api): Bun.serve API scaffold with health check, error handling, CORS`
  - Files: `packages/api/src/**`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 9. JWT Auth + User Registration/Login

  **What to do**:
  - Install `jose` library in `packages/api` for JWT signing/verification (no jsonwebtoken — jose is faster and works natively in Bun)
  - Create `packages/api/src/auth/`:
    - `jwt.ts` — `signToken(userId, orgId, role): Promise<string>`, `verifyToken(token): Promise<TokenPayload>` using `jose.SignJWT` / `jose.jwtVerify`. Token payload: `{ sub: userId, org: orgId, role: string, iat, exp }`. Token expiry: 24h by default. JWT secret from `JWT_SECRET` env var
    - `password.ts` — `hashPassword(plain): Promise<string>`, `verifyPassword(plain, hash): Promise<boolean>` using Bun.password.hash (argon2) and Bun.password.verify
    - `middleware.ts` — `authMiddleware(req): Promise<AuthContext>` — extracts Bearer token from Authorization header, verifies, returns `{ userId, orgId, role }`. Throws 401 on missing/invalid token
  - Create `packages/api/src/routes/auth.ts`:
    - `POST /api/auth/register` — body: `{ email, password, name, orgName? }`. Creates org (if orgName provided) or adds to existing. Hashes password, creates user, returns JWT. Validation: email format, password min 8 chars
    - `POST /api/auth/login` — body: `{ email, password }`. Verifies credentials, returns JWT
    - `GET /api/auth/me` — requires auth. Returns current user profile (id, email, name, role, org)
  - Wire auth routes into the server router
  - Add tests: `packages/api/src/auth/jwt.test.ts`, `packages/api/src/auth/password.test.ts`, `packages/api/src/routes/auth.test.ts`

  **Must NOT do**:
  - Do NOT add SSO/SAML/OAuth — JWT with email/password only
  - Do NOT add refresh tokens — simple 24h expiry
  - Do NOT add email verification or password reset — not in scope
  - Do NOT use jsonwebtoken — use `jose` library

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Auth requires careful security handling (password hashing, JWT signing, token validation, error handling)
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 8
  - **Blocks**: Tasks 10, 12
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `packages/api/src/server.ts` — Created in Task 8. Add auth routes to the router
  - `packages/api/src/utils/response.ts` — Created in Task 8. Use `json()` and `error()` helpers
  - `packages/api/src/middleware/error-handler.ts` — Created in Task 8. Auth errors should integrate with this

  **API/Type References**:
  - `packages/db/src/repositories/user.repo.ts` — Created in Task 5. Use `UserRepository.create()`, `findByEmail()`
  - `packages/db/src/repositories/organization.repo.ts` — Created in Task 5. Use for org creation during registration
  - `packages/db/src/schema/users.ts` — Created in Task 4. User table schema defines available fields

  **External References**:
  - jose JWT library: https://github.com/panva/jose — `SignJWT`, `jwtVerify`
  - Bun.password: https://bun.sh/docs/api/hashing — native argon2 hashing

  **WHY Each Reference Matters**:
  - `server.ts` — Routes must plug into existing router pattern
  - `user.repo.ts` — Auth endpoints use repository for user lookup/creation
  - jose docs — JWT signing patterns specific to this library

  **Acceptance Criteria**:
  - [ ] `POST /api/auth/register` creates user and returns JWT
  - [ ] `POST /api/auth/login` returns JWT for valid credentials
  - [ ] `GET /api/auth/me` returns user profile when authenticated
  - [ ] Invalid/missing token returns 401
  - [ ] Password stored as argon2 hash (not plaintext)
  - [ ] `bun test packages/api` → PASS (auth tests)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Register, login, and access protected endpoint
    Tool: Bash
    Preconditions: API server running with Postgres available
    Steps:
      1. Run `curl -s -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"test@test.com","password":"Test1234!","name":"Test User","orgName":"TestOrg"}'`
      2. Assert response status 201, body contains `"token"` field
      3. Extract token from response
      4. Run `curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"test@test.com","password":"Test1234!"}'`
      5. Assert response status 200, body contains `"token"` field
      6. Run `curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN"`
      7. Assert response contains `"email":"test@test.com"` and `"name":"Test User"`
    Expected Result: Full auth flow works: register → login → access protected route
    Failure Indicators: Non-201/200 status, missing token, 401 on /me
    Evidence: .sisyphus/evidence/task-9-auth-flow.txt

  Scenario: Invalid credentials return 401
    Tool: Bash
    Preconditions: API server running, user registered
    Steps:
      1. Run `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"test@test.com","password":"wrong"}'`
      2. Assert status is 401
      3. Run `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/me`
      4. Assert status is 401 (no token)
    Expected Result: 401 for wrong password and missing token
    Failure Indicators: 200 with wrong password, 200 without token
    Evidence: .sisyphus/evidence/task-9-auth-failure.txt

  Scenario: Weak password rejected
    Tool: Bash
    Preconditions: API server running
    Steps:
      1. Run `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"test2@test.com","password":"123","name":"Weak"}'`
      2. Assert status is 400
    Expected Result: 400 for password under 8 chars
    Failure Indicators: 201 with weak password
    Evidence: .sisyphus/evidence/task-9-weak-password.txt
  ```

  **Commit**: YES
  - Message: `feat(api): JWT authentication with registration and login`
  - Files: `packages/api/src/auth/**`, `packages/api/src/routes/auth.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 10. RBAC Middleware (4 Roles)

  **What to do**:
  - Create `packages/api/src/auth/rbac.ts`:
    - Define `Role` enum: `ADMIN`, `MEMBER`, `VIEWER`, `SERVICE_ACCOUNT`
    - Define static permission matrix as a const object:
      ```
      ADMIN: all permissions
      MEMBER: CRUD on stories/epics/sprints, read projects, trigger sprint execution
      VIEWER: read-only on everything
      SERVICE_ACCOUNT: API-only, CRUD on stories/sprints, trigger execution, no user management
      ```
    - Define `Permission` enum covering all actions: `PROJECT_READ`, `PROJECT_WRITE`, `EPIC_READ`, `EPIC_WRITE`, `STORY_READ`, `STORY_WRITE`, `SPRINT_READ`, `SPRINT_WRITE`, `SPRINT_EXECUTE`, `USER_MANAGE`, `ORG_MANAGE`, `AUDIT_READ`, `WEBHOOK_MANAGE`
    - `requirePermission(...permissions: Permission[])` middleware factory — checks if the authenticated user's role has ALL required permissions. Returns 403 if not
    - `requireRole(...roles: Role[])` middleware factory — simpler check for specific roles
  - Integrate with `authMiddleware` from Task 9 — auth context now includes role
  - Add tests: `packages/api/src/auth/rbac.test.ts` — test each role against each permission

  **Must NOT do**:
  - Do NOT implement dynamic RBAC — roles and permissions are static/hardcoded
  - Do NOT add per-resource permissions — role-based only
  - Do NOT store permissions in the database — they're code-only constants

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Static permission matrix with middleware wrapper — straightforward enum + object + function
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential after Task 9
  - **Blocks**: Tasks 12, 17
  - **Blocked By**: Task 9

  **References**:

  **Pattern References**:
  - `packages/api/src/auth/middleware.ts` — Created in Task 9. RBAC middleware chains after auth middleware
  - `packages/api/src/middleware/error-handler.ts` — Created in Task 8. 403 errors should use same error format

  **API/Type References**:
  - `packages/db/src/schema/users.ts` — Created in Task 4. Role enum in DB must match RBAC Role enum exactly

  **WHY Each Reference Matters**:
  - `auth/middleware.ts` — RBAC depends on AuthContext (userId, orgId, role) set by auth middleware
  - `users.ts schema` — DB role column values must be identical to RBAC Role enum values

  **Acceptance Criteria**:
  - [ ] `Role` and `Permission` enums defined
  - [ ] Static permission matrix covers all 4 roles × 13 permissions
  - [ ] `requirePermission()` middleware returns 403 for unauthorized access
  - [ ] `requireRole()` middleware returns 403 for wrong role
  - [ ] `bun test packages/api/src/auth/rbac.test.ts` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Admin has all permissions, Viewer is read-only
    Tool: Bash
    Preconditions: RBAC module complete
    Steps:
      1. Run `bun test packages/api/src/auth/rbac.test.ts`
      2. Verify test cases cover: ADMIN can PROJECT_WRITE, VIEWER cannot PROJECT_WRITE, VIEWER can PROJECT_READ, SERVICE_ACCOUNT cannot USER_MANAGE
    Expected Result: All role/permission combinations tested correctly
    Failure Indicators: Test failures, missing permission checks
    Evidence: .sisyphus/evidence/task-10-rbac-tests.txt

  Scenario: 403 returned for insufficient permissions (integration)
    Tool: Bash
    Preconditions: API server running, viewer user created
    Steps:
      1. Register a user, then manually set role to VIEWER in DB (or create with viewer role)
      2. Login as viewer, get token
      3. Attempt `POST /api/epics` (requires EPIC_WRITE) with viewer token
      4. Assert 403 response with `"code":"FORBIDDEN"`
    Expected Result: 403 Forbidden for viewer attempting write
    Failure Indicators: 200/201 for viewer write operation
    Evidence: .sisyphus/evidence/task-10-rbac-403.txt
  ```

  **Commit**: YES (groups with Task 9)
  - Message: `feat(api): RBAC middleware with 4 roles and static permission matrix`
  - Files: `packages/api/src/auth/rbac.ts`, `packages/api/src/auth/rbac.test.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 11. Sprint Execution Telemetry Tables + Velocity Tracking

  **What to do**:
  - Add to `packages/db/src/schema/`:
    - `story_metrics.ts` — `story_metrics` table: mirrors `StoryMetricsSchema` from core/types.ts. Fields: `id`, `story_id` (FK), `sprint_id` (FK), `org_id` (FK), `total_duration_ms`, `llm_calls`, `total_tokens_input`, `total_tokens_output`, `sandbox_runs`, `rework_cycles`, `revision_contributions`, `cost_estimate_usd`, `agent_durations_ms` (jsonb), `trace_id`, `created_at`
    - `velocity_snapshots.ts` — `velocity_snapshots` table: `id`, `project_id` (FK), `org_id` (FK), `sprint_id` (FK), `completed_points`, `planned_points`, `completed_stories`, `planned_stories`, `sprint_duration_ms`, `created_at`
  - Create `packages/db/src/repositories/`:
    - `story-metrics.repo.ts` — `StoryMetricsRepository`: `save(metrics)`, `findBySprint(sprintId)`, `findByStory(storyId)`
    - `velocity.repo.ts` — `VelocityRepository`: `snapshot(sprintId, data)`, `getByProject(projectId, limit)`, `getAverageVelocity(projectId, lastN)` — computes average completed_points over last N sprints
  - Update `packages/db/src/schema/index.ts` to export new tables
  - Update `packages/db/src/repositories/index.ts` to export new repositories
  - Add tests for both repositories

  **Must NOT do**:
  - Do NOT modify the orchestrator or agents — telemetry is stored post-execution via API
  - Do NOT add predictive sprint planning yet — that's Task 14
  - Do NOT add burndown calculation — that's Task 24

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Telemetry schema must precisely match existing Zod types; velocity computation requires careful SQL
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9, 10) — depends only on Task 4
  - **Blocks**: Tasks 14, 24
  - **Blocked By**: Task 4

  **References**:

  **Pattern References**:
  - `packages/core/src/types.ts:112-127` — `StoryMetricsSchema` — story_metrics table MUST mirror these fields exactly
  - `packages/core/src/types.ts:165-176` — `SprintTelemetrySchema` — sprint_telemetry table (from Task 4) references these
  - `packages/db/src/schema/*.ts` — Created in Task 4. Follow same schema definition patterns

  **API/Type References**:
  - `packages/core/src/types.ts:186` — `StoryMetrics` type — repository must return compatible objects

  **WHY Each Reference Matters**:
  - `StoryMetricsSchema` — DB columns must be 1:1 with Zod schema fields for lossless conversion
  - Existing schema patterns — Consistency in column naming, FK patterns, timestamp handling

  **Acceptance Criteria**:
  - [ ] `story_metrics` and `velocity_snapshots` tables defined
  - [ ] Repositories created with all specified methods
  - [ ] `getAverageVelocity` computes rolling average correctly
  - [ ] `bun test packages/db` → PASS (new tests)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Velocity rolling average computation
    Tool: Bash
    Preconditions: Velocity repository tests exist
    Steps:
      1. Run `bun test packages/db/src/repositories/velocity.repo.test.ts`
      2. Verify test case: 3 sprints with completed_points [10, 20, 30] → average = 20
      3. Verify test case: empty project → average = 0
    Expected Result: Rolling average computed correctly for populated and empty cases
    Failure Indicators: Wrong average value, error on empty project
    Evidence: .sisyphus/evidence/task-11-velocity.txt

  Scenario: StoryMetrics columns match core StoryMetricsSchema
    Tool: Bash
    Preconditions: Schema defined
    Steps:
      1. Read `packages/db/src/schema/story_metrics.ts`
      2. Read `packages/core/src/types.ts` lines 112-127
      3. Assert every field in StoryMetricsSchema has a corresponding column
    Expected Result: 1:1 field mapping between Zod schema and DB columns
    Failure Indicators: Missing column for any StoryMetricsSchema field
    Evidence: .sisyphus/evidence/task-11-schema-match.txt
  ```

  **Commit**: YES
  - Message: `feat(db): sprint telemetry tables and velocity tracking repository`
  - Files: `packages/db/src/schema/story_metrics.ts`, `packages/db/src/schema/velocity_snapshots.ts`, `packages/db/src/repositories/story-metrics.repo.ts`, `packages/db/src/repositories/velocity.repo.ts`
  - Pre-commit: `bun test packages/db && tsc --noEmit`

### Wave 4 — Core SDLC Features (After Wave 3)

- [ ] 12. Epic/Story/Task API Endpoints (CRUD)

  **What to do**:
  - Create `packages/api/src/routes/projects.ts`:
    - `GET /api/projects` — list projects for current org (requires PROJECT_READ)
    - `POST /api/projects` — create project (requires PROJECT_WRITE), body: `{ name, description, specYaml? }`
    - `GET /api/projects/:projectId` — get project details (requires PROJECT_READ)
    - `PUT /api/projects/:projectId` — update project (requires PROJECT_WRITE)
    - `DELETE /api/projects/:projectId` — delete project (requires PROJECT_WRITE, ADMIN only)
  - Create `packages/api/src/routes/epics.ts`:
    - `GET /api/projects/:projectId/epics` — list epics (requires EPIC_READ)
    - `POST /api/projects/:projectId/epics` — create epic (requires EPIC_WRITE), body: `{ title, description, status? }`
    - `GET /api/epics/:epicId` — get epic with stories (requires EPIC_READ)
    - `PUT /api/epics/:epicId` — update epic (requires EPIC_WRITE)
    - `PUT /api/epics/:epicId/reorder` — reorder epic position (requires EPIC_WRITE), body: `{ sortOrder }`
    - `DELETE /api/epics/:epicId` — delete epic (requires EPIC_WRITE, reassign stories to no-epic)
  - Create `packages/api/src/routes/stories.ts`:
    - `GET /api/projects/:projectId/stories` — list stories, filterable by epicId, state, sprintId (requires STORY_READ)
    - `POST /api/projects/:projectId/stories` — create story (requires STORY_WRITE), body mirrors StorySchema fields
    - `GET /api/stories/:storyId` — get story detail (requires STORY_READ)
    - `PUT /api/stories/:storyId` — update story (requires STORY_WRITE)
    - `PATCH /api/stories/:storyId/state` — transition story state (requires STORY_WRITE), body: `{ state }`, validates via story-state-machine
    - `DELETE /api/stories/:storyId` — delete story (requires STORY_WRITE)
  - All endpoints scoped to `org_id` from auth context — no cross-org data leaks
  - All mutations log to audit trail (via AuditRepository)
  - Request body validation with Zod schemas
  - Wire all routes into server router

  **Must NOT do**:
  - Do NOT add sprint endpoints — that's separate (they already exist via sprint repo, but sprint-specific routes come through sprint auto-planning in Task 14)
  - Do NOT add batch operations — single-entity CRUD only
  - Do NOT add search/filter by text — simple field filtering only
  - Do NOT touch agent code

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 15+ endpoints across 3 resource types with auth, validation, audit logging, and org scoping
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser — API only

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 13, 14, 15, 16)
  - **Blocks**: Tasks 13, 17, 22
  - **Blocked By**: Tasks 7, 9, 10

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/auth.ts` — Created in Task 9. Follow same route structure: export handler function, use `parseBody`, `json()`, `error()` helpers
  - `packages/api/src/auth/rbac.ts` — Created in Task 10. Use `requirePermission(Permission.EPIC_WRITE)` on mutating endpoints
  - `packages/core/src/story-state-machine.ts` — Story state transitions. Use for `PATCH /stories/:storyId/state` validation

  **API/Type References**:
  - `packages/core/src/types.ts:47-62` — `StorySchema` — request/response shape for story endpoints
  - `packages/core/src/types.ts` — `EpicSchema` (from Task 7) — request/response shape for epic endpoints
  - `packages/db/src/repositories/story.repo.ts` — Created in Task 5. Use for all story DB operations
  - `packages/db/src/repositories/epic.repo.ts` — Created in Task 5. Use for all epic DB operations
  - `packages/db/src/repositories/project.repo.ts` — Created in Task 5. Use for project DB operations
  - `packages/db/src/repositories/audit.repo.ts` — Created in Task 5. Call `append()` on every mutation

  **WHY Each Reference Matters**:
  - `auth.ts` routes — Consistent route pattern ensures all endpoints look and behave the same
  - `story-state-machine.ts` — MUST use existing state machine for story state transitions, not ad-hoc validation
  - Repositories — Every endpoint delegates to repository methods, never direct DB queries

  **Acceptance Criteria**:
  - [ ] 15+ endpoints for projects, epics, stories
  - [ ] All endpoints require authentication
  - [ ] All mutations require appropriate RBAC permissions
  - [ ] All mutations logged to audit trail
  - [ ] Story state transitions use existing state machine
  - [ ] All responses org-scoped (no cross-org data)
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full CRUD lifecycle for project → epic → story
    Tool: Bash
    Preconditions: API server running, user authenticated with MEMBER role
    Steps:
      1. POST /api/projects with `{"name":"Test Project","description":"Test"}` — assert 201, capture projectId
      2. POST /api/projects/$projectId/epics with `{"title":"Auth Epic","description":"Auth features"}` — assert 201, capture epicId
      3. POST /api/projects/$projectId/stories with `{"title":"Login Page","description":"Build login","acceptanceCriteria":["User can login"],"epicId":"$epicId"}` — assert 201, capture storyId
      4. GET /api/stories/$storyId — assert 200, body has title "Login Page" and epicId
      5. PATCH /api/stories/$storyId/state with `{"state":"REFINED"}` — assert 200
      6. DELETE /api/stories/$storyId — assert 200
    Expected Result: Full lifecycle creates and returns correct data at each step
    Failure Indicators: Non-2xx status, missing fields, state transition rejected
    Evidence: .sisyphus/evidence/task-12-crud-lifecycle.txt

  Scenario: Org isolation — user cannot see other org's data
    Tool: Bash
    Preconditions: Two users in different orgs, both authenticated
    Steps:
      1. User A creates project in OrgA — capture projectId
      2. User B (OrgB) calls GET /api/projects/$projectId — assert 404
      3. User B calls GET /api/projects — assert response does not include User A's project
    Expected Result: Cross-org data invisible
    Failure Indicators: User B sees User A's project
    Evidence: .sisyphus/evidence/task-12-org-isolation.txt

  Scenario: Viewer cannot create stories
    Tool: Bash
    Preconditions: Viewer user authenticated
    Steps:
      1. POST /api/projects/$projectId/stories with valid body using viewer token
      2. Assert 403 Forbidden
    Expected Result: RBAC blocks viewer from write operations
    Failure Indicators: 201 Created for viewer
    Evidence: .sisyphus/evidence/task-12-rbac-enforcement.txt
  ```

  **Commit**: YES
  - Message: `feat(api): Epic/Story/Project CRUD endpoints with auth, RBAC, and audit`
  - Files: `packages/api/src/routes/projects.ts`, `packages/api/src/routes/epics.ts`, `packages/api/src/routes/stories.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 13. Roadmap Import Endpoint (YAML → Epics + Stories)

  **What to do**:
  - Create `packages/api/src/routes/roadmap.ts`:
    - `POST /api/projects/:projectId/roadmap/import` — body: `{ yaml: string }` (raw YAML text) or multipart file upload
    - Parse YAML using `js-yaml` (already in project dependencies)
    - Extract structure: look for `executionPhases` or `epics` or `stories` arrays in the YAML
    - For each epic/phase: create Epic via EpicRepository
    - For each story within an epic/phase: create Story via StoryRepository, linked to the epic
    - Handle `dependsOn` references: resolve story IDs within the import context
    - Return: `{ epicsCreated: number, storiesCreated: number, errors: string[] }`
    - Wrap in a transaction — if any story fails validation, roll back entire import
  - Create `packages/api/src/services/roadmap-parser.ts`:
    - `parseRoadmapYaml(yaml: string): { epics: EpicInput[], stories: StoryInput[] }` — pure function, no DB access
    - Support flexible YAML format — look for common patterns:
      - `executionPhases[].stories[]` (like AI-Coaching-App.yaml)
      - `epics[].stories[]` (standard epic-first format)
      - `stories[]` (flat story list, no epics)
    - Validate each story against StorySchema (allowing partial — id and workspacePath auto-generated)
  - Add tests: `packages/api/src/services/roadmap-parser.test.ts` — test with real YAML from `docs/backlog.yaml` and `docs/AI-Coaching-App.yaml`

  **Must NOT do**:
  - Do NOT formalize the YAML schema — parser should be flexible/forgiving
  - Do NOT add AI-based story refinement — just import raw stories
  - Do NOT validate acceptance criteria quality — just import them as-is
  - Do NOT add export functionality — import only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: YAML parsing with flexible format detection, transaction handling, and reference resolution is moderately complex
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 14, 15, 16) — depends on Tasks 7 and 12
  - **Blocks**: Task 14
  - **Blocked By**: Tasks 7, 12

  **References**:

  **Pattern References**:
  - `docs/AI-Coaching-App.yaml` — Real-world YAML spec with `executionPhases[].stories[]` format. Parser MUST handle this structure
  - `docs/backlog.yaml` — Flat story list YAML with `dependsOn` chains. Parser MUST handle this structure
  - `packages/integrations/src/file.ts` — Existing file story source. Study how it parses YAML stories today

  **API/Type References**:
  - `packages/core/src/types.ts:47-62` — `StorySchema` — imported stories must validate against this
  - `packages/core/src/types.ts` — `EpicSchema` (from Task 7) — epics created during import

  **External References**:
  - js-yaml: https://github.com/nodeca/js-yaml — `yaml.load(text)` for YAML parsing

  **WHY Each Reference Matters**:
  - `AI-Coaching-App.yaml` — This IS the real input format. Parser must handle its exact structure
  - `backlog.yaml` — Second real input format. Tests should use this file directly
  - `file.ts` — Existing YAML parsing logic to reuse or align with

  **Acceptance Criteria**:
  - [ ] `POST /api/projects/:projectId/roadmap/import` accepts YAML and creates epics + stories
  - [ ] Parser handles `executionPhases[].stories[]` format (AI-Coaching-App.yaml)
  - [ ] Parser handles flat `stories[]` format (backlog.yaml)
  - [ ] `dependsOn` references resolved within import
  - [ ] Failed import rolls back (no partial data)
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Import backlog.yaml creates stories
    Tool: Bash
    Preconditions: API server running, project created, user authenticated
    Steps:
      1. Read content of `docs/backlog.yaml`
      2. POST /api/projects/$projectId/roadmap/import with `{"yaml":"<backlog.yaml content>"}` using admin token
      3. Assert 200, response has `storiesCreated` > 0
      4. GET /api/projects/$projectId/stories — assert story count matches
    Expected Result: All stories from backlog.yaml imported with correct titles and dependsOn
    Failure Indicators: 0 stories created, import error, dependsOn unresolved
    Evidence: .sisyphus/evidence/task-13-backlog-import.txt

  Scenario: Import AI-Coaching-App.yaml creates epics and stories
    Tool: Bash
    Preconditions: API server running, project created
    Steps:
      1. Read `docs/AI-Coaching-App.yaml`
      2. POST /api/projects/$projectId/roadmap/import with YAML content
      3. Assert 200, response has both `epicsCreated` > 0 and `storiesCreated` > 0
      4. GET /api/projects/$projectId/epics — assert epics exist
    Expected Result: Execution phases mapped to epics, stories linked
    Failure Indicators: 0 epics created, stories without epic links
    Evidence: .sisyphus/evidence/task-13-app-spec-import.txt

  Scenario: Invalid YAML rolls back entirely
    Tool: Bash
    Preconditions: API server running, project created
    Steps:
      1. POST with malformed YAML: `{"yaml":"invalid: [unclosed"}`
      2. Assert 400 error
      3. GET /api/projects/$projectId/stories — assert count unchanged
    Expected Result: 400 error, no stories created from failed import
    Failure Indicators: Partial stories created from failed import
    Evidence: .sisyphus/evidence/task-13-rollback.txt
  ```

  **Commit**: YES
  - Message: `feat(api): roadmap import endpoint — YAML to epics and stories`
  - Files: `packages/api/src/routes/roadmap.ts`, `packages/api/src/services/roadmap-parser.ts`, `packages/api/src/services/roadmap-parser.test.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 14. Sprint Auto-Planning (Velocity + Priority + Dependencies)

  **What to do**:
  - Create `packages/api/src/services/sprint-planner.ts`:
    - `planSprint(projectId, orgId, options?): Promise<SprintPlan>` — auto-generates sprint contents
    - Algorithm:
      1. Fetch project velocity via VelocityRepository.getAverageVelocity(projectId, last 3 sprints)
      2. Fetch all SPRINT_READY stories for the project (not assigned to any sprint)
      3. Sort by priority: stories with no dependsOn first, then by storyPoints ascending, then by creation date
      4. Greedily add stories until total storyPoints ≥ velocity (or all stories added)
      5. Validate dependency chains: if story A depends on B, B must be in same sprint or already DONE
      6. Return `SprintPlan`: `{ sprintName, stories, totalPoints, estimatedVelocity, warnings }`
    - If no velocity history: default to 20 points per sprint
  - Create `packages/api/src/routes/sprints.ts`:
    - `POST /api/projects/:projectId/sprints/plan` — auto-plan a sprint (requires SPRINT_WRITE), returns SprintPlan for review
    - `POST /api/projects/:projectId/sprints` — create sprint from plan (requires SPRINT_WRITE), body: `{ name, goal, storyIds }`. Links stories to sprint, sets sprint status to "planning"
    - `GET /api/projects/:projectId/sprints` — list sprints (requires SPRINT_READ)
    - `GET /api/sprints/:sprintId` — get sprint details with stories (requires SPRINT_READ)
    - `PATCH /api/sprints/:sprintId/start` — start sprint (requires SPRINT_EXECUTE), sets status to "active", transitions stories to IN_PROGRESS
    - `PATCH /api/sprints/:sprintId/complete` — complete sprint (requires SPRINT_EXECUTE), captures velocity snapshot, transitions to "completed"
  - Use `packages/core/src/story-dependencies.ts` for dependency resolution (topological sort)
  - Add tests: `packages/api/src/services/sprint-planner.test.ts`

  **Must NOT do**:
  - Do NOT add AI-based estimation — use story points from stories (manual or default)
  - Do NOT add sprint retrospective generation — out of scope
  - Do NOT trigger actual code execution — that comes through CLI/orchestrator integration (Task 19)
  - Do NOT add drag-and-drop sprint board — API only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Sprint planning algorithm with dependency resolution, velocity computation, and greedy selection requires careful logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 13, 15, 16) — depends on Tasks 11 and 13
  - **Blocks**: Task 24
  - **Blocked By**: Tasks 11, 13

  **References**:

  **Pattern References**:
  - `packages/core/src/story-dependencies.ts` — `topologicalSort()` function. Reuse for dependency chain validation
  - `packages/agents/src/orchestrator.ts` — `runPlannedSprint()` — study how it selects and orders stories. Sprint planner should produce compatible output

  **API/Type References**:
  - `packages/db/src/repositories/velocity.repo.ts` — Created in Task 11. Use `getAverageVelocity()`
  - `packages/db/src/repositories/story.repo.ts` — Created in Task 5. Use `listByProject()` filtered by state=SPRINT_READY
  - `packages/db/src/repositories/sprint.repo.ts` — Created in Task 5. Use for sprint CRUD

  **WHY Each Reference Matters**:
  - `story-dependencies.ts` — MUST reuse existing topological sort, not reimplement
  - `orchestrator.ts` — Sprint planner output must be compatible with existing execution model
  - `velocity.repo.ts` — Velocity data drives the planning algorithm's capacity calculation

  **Acceptance Criteria**:
  - [ ] `planSprint` auto-selects stories based on velocity and dependencies
  - [ ] Sprint CRUD endpoints work (create, list, get, start, complete)
  - [ ] Sprint completion captures velocity snapshot
  - [ ] Dependency validation prevents invalid sprint contents
  - [ ] Default velocity (20) used when no history exists
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Auto-plan sprint with velocity-based selection
    Tool: Bash
    Preconditions: Project with 10 SPRINT_READY stories (varying points), 3 completed sprints with known velocity
    Steps:
      1. POST /api/projects/$projectId/sprints/plan
      2. Assert 200, response has `stories` array with total points ≈ average velocity
      3. Assert `estimatedVelocity` matches average of last 3 sprints
      4. Assert stories are ordered respecting dependsOn chains
    Expected Result: Sprint plan contains stories filling velocity capacity
    Failure Indicators: Total points way over/under velocity, dependency violations
    Evidence: .sisyphus/evidence/task-14-auto-plan.txt

  Scenario: Sprint lifecycle — plan → create → start → complete
    Tool: Bash
    Preconditions: Sprint planned, stories exist
    Steps:
      1. POST /api/projects/$projectId/sprints with `{"name":"Sprint 1","goal":"MVP","storyIds":["S1","S2"]}`
      2. Assert 201, sprint created with status "planning"
      3. PATCH /api/sprints/$sprintId/start — assert status becomes "active"
      4. PATCH /api/sprints/$sprintId/complete — assert status becomes "completed"
      5. Check velocity_snapshots table has new entry for this sprint
    Expected Result: Full sprint lifecycle works, velocity captured on completion
    Failure Indicators: State transitions fail, no velocity snapshot
    Evidence: .sisyphus/evidence/task-14-sprint-lifecycle.txt

  Scenario: Default velocity used when no history
    Tool: Bash
    Preconditions: New project with no completed sprints, stories with total 40 points
    Steps:
      1. POST /api/projects/$projectId/sprints/plan
      2. Assert `estimatedVelocity` is 20 (default)
      3. Assert total selected points ≤ 20
    Expected Result: Default velocity caps sprint at 20 points
    Failure Indicators: estimatedVelocity != 20 for new project
    Evidence: .sisyphus/evidence/task-14-default-velocity.txt
  ```

  **Commit**: YES
  - Message: `feat(api): sprint auto-planning with velocity tracking and lifecycle management`
  - Files: `packages/api/src/services/sprint-planner.ts`, `packages/api/src/routes/sprints.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 15. Audit Trail (Append-Only Log Table + Middleware)

  **What to do**:
  - Create `packages/api/src/middleware/audit.ts`:
    - `auditMiddleware` — intercepts all mutating requests (POST, PUT, PATCH, DELETE) AFTER successful processing
    - Captures: `userId`, `orgId`, `action` (HTTP method + path), `entityType` (resource from path), `entityId` (from path or response), `diff` (request body as jsonb), `timestamp`
    - Calls `AuditRepository.append()` (from Task 5)
    - Non-blocking — audit failure should NOT block the original request (fire-and-forget with error logging)
  - Create `packages/api/src/routes/audit.ts`:
    - `GET /api/audit` — list audit log entries for current org (requires AUDIT_READ, ADMIN or MEMBER role)
    - Query params: `entityType`, `entityId`, `userId`, `from`, `to`, `limit` (default 50), `offset`
    - Returns paginated audit entries
  - Wire audit middleware into server for all `/api/` routes
  - Add tests: `packages/api/src/middleware/audit.test.ts`, `packages/api/src/routes/audit.test.ts`

  **Must NOT do**:
  - Do NOT add audit log deletion — append-only, no cleanup
  - Do NOT add audit log export — read-only API
  - Do NOT add audit alerting — not in scope
  - Do NOT make audit synchronous/blocking — fire-and-forget

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Middleware wrapping existing repository calls — straightforward pattern
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 13, 14, 16)
  - **Blocks**: Task 17
  - **Blocked By**: Task 8

  **References**:

  **Pattern References**:
  - `packages/api/src/middleware/error-handler.ts` — Created in Task 8. Follow same middleware pattern
  - `packages/api/src/auth/middleware.ts` — Created in Task 9. Audit middleware chains after auth (needs userId)

  **API/Type References**:
  - `packages/db/src/repositories/audit.repo.ts` — Created in Task 5. Use `append()` and `listByOrg()`
  - `packages/db/src/schema/audit_log.ts` — Created in Task 4. Column definitions for audit entries

  **WHY Each Reference Matters**:
  - `error-handler.ts` — Consistent middleware pattern
  - `audit.repo.ts` — Middleware delegates to repository; must match `append()` signature

  **Acceptance Criteria**:
  - [ ] All POST/PUT/PATCH/DELETE requests automatically logged
  - [ ] Audit entries contain userId, orgId, action, entityType, entityId, diff
  - [ ] `GET /api/audit` returns paginated entries
  - [ ] Audit failure doesn't block request
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Mutations automatically logged to audit trail
    Tool: Bash
    Preconditions: API server running, user authenticated
    Steps:
      1. POST /api/projects with `{"name":"Audit Test"}` — assert 201
      2. Wait 1s (fire-and-forget)
      3. GET /api/audit?entityType=project — assert audit entry exists with action "POST /api/projects"
      4. Assert entry has userId matching authenticated user
    Expected Result: Project creation automatically logged to audit
    Failure Indicators: No audit entry found, missing fields
    Evidence: .sisyphus/evidence/task-15-auto-audit.txt

  Scenario: Audit entries are paginated
    Tool: Bash
    Preconditions: 10+ audit entries exist
    Steps:
      1. GET /api/audit?limit=5 — assert 5 entries returned
      2. GET /api/audit?limit=5&offset=5 — assert next 5 entries
      3. Assert no overlap between pages
    Expected Result: Pagination works correctly
    Failure Indicators: Duplicate entries across pages, wrong count
    Evidence: .sisyphus/evidence/task-15-pagination.txt
  ```

  **Commit**: YES
  - Message: `feat(api): audit trail middleware with automatic mutation logging`
  - Files: `packages/api/src/middleware/audit.ts`, `packages/api/src/routes/audit.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 16. Webhook Outbound System (Story/Sprint State Change Events)

  **What to do**:
  - Create `packages/api/src/services/webhook-dispatcher.ts`:
    - `WebhookDispatcher` class:
      - `dispatch(orgId, event: WebhookEvent): Promise<void>` — find all webhooks for org subscribed to this event type, POST payload to each URL
      - `WebhookEvent` type: `{ type: string, payload: object, timestamp: string }`
      - Event types: `story.created`, `story.updated`, `story.state_changed`, `sprint.started`, `sprint.completed`, `epic.created`, `epic.updated`
      - Each webhook call includes HMAC signature in `X-Webhook-Signature` header (using webhook's `secret` from DB)
      - Timeout per webhook call: 10s
      - Fire-and-forget — failures logged but don't block caller
    - Log delivery attempts (success/failure) — add `webhook_deliveries` table to track
  - Create `packages/api/src/routes/webhooks.ts`:
    - `GET /api/webhooks` — list org webhooks (requires WEBHOOK_MANAGE)
    - `POST /api/webhooks` — register webhook (requires WEBHOOK_MANAGE), body: `{ url, secret, events: string[] }`
    - `PUT /api/webhooks/:webhookId` — update webhook
    - `DELETE /api/webhooks/:webhookId` — delete webhook
    - `GET /api/webhooks/:webhookId/deliveries` — view delivery history
  - Integrate dispatcher: call `webhookDispatcher.dispatch()` in story/epic/sprint mutation endpoints (after DB write, fire-and-forget)
  - Add `webhook_deliveries` table to `packages/db/src/schema/`
  - Add tests for dispatcher (mock fetch) and routes

  **Must NOT do**:
  - Do NOT add retry queues — fire once, log result
  - Do NOT add webhook signature verification endpoint — that's the consumer's responsibility
  - Do NOT add inbound webhooks — outbound only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Webhook dispatch with HMAC signing, delivery tracking, and integration into existing endpoints requires careful implementation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 12, 13, 14, 15)
  - **Blocks**: Task 18
  - **Blocked By**: Tasks 8, 5

  **References**:

  **Pattern References**:
  - `packages/integrations/src/jira.ts` — HTTP request pattern with error handling. Webhook dispatcher follows similar fetch-based pattern
  - `packages/api/src/routes/auth.ts` — Created in Task 9. Route structure pattern for webhook CRUD

  **API/Type References**:
  - `packages/db/src/repositories/webhook.repo.ts` — Created in Task 5. Use for webhook lookup by org and event type
  - `packages/db/src/schema/webhooks.ts` — Created in Task 4. Webhook URL, secret, events columns

  **External References**:
  - HMAC signing: Use `crypto.createHmac('sha256', secret).update(payload).digest('hex')` — standard webhook signature pattern

  **WHY Each Reference Matters**:
  - `jira.ts` — HTTP call pattern with error handling and timeouts — reuse for webhook dispatch
  - `webhook.repo.ts` — Dispatcher queries this to find matching webhooks

  **Acceptance Criteria**:
  - [ ] Webhook CRUD endpoints work (create, list, update, delete)
  - [ ] `dispatch()` sends POST to all matching webhooks with HMAC signature
  - [ ] Delivery history tracked in `webhook_deliveries` table
  - [ ] Webhook failures don't block caller
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Register webhook and receive event on story creation
    Tool: Bash
    Preconditions: API server running, user authenticated
    Steps:
      1. POST /api/webhooks with `{"url":"https://httpbin.org/post","secret":"test123","events":["story.created"]}`
      2. Assert 201, webhook created
      3. POST /api/projects/$projectId/stories (create a story)
      4. Wait 2s
      5. GET /api/webhooks/$webhookId/deliveries — assert at least 1 delivery with status "success" or "sent"
    Expected Result: Webhook delivery logged after story creation
    Failure Indicators: No delivery logged, delivery with error status
    Evidence: .sisyphus/evidence/task-16-webhook-delivery.txt

  Scenario: HMAC signature included in webhook call
    Tool: Bash
    Preconditions: Webhook dispatcher tested
    Steps:
      1. Run `bun test packages/api/src/services/webhook-dispatcher.test.ts`
      2. Verify test asserts X-Webhook-Signature header is present and correctly computed
    Expected Result: HMAC signature verified in test
    Failure Indicators: Missing signature header in test assertions
    Evidence: .sisyphus/evidence/task-16-hmac-test.txt

  Scenario: Webhook failure doesn't block story creation
    Tool: Bash
    Preconditions: Webhook registered with unreachable URL
    Steps:
      1. POST /api/webhooks with `{"url":"http://localhost:99999/unreachable","secret":"s","events":["story.created"]}`
      2. POST /api/projects/$projectId/stories — assert 201 (not 500)
      3. GET /api/webhooks/$webhookId/deliveries — assert delivery logged with "failed" status
    Expected Result: Story created successfully despite webhook failure
    Failure Indicators: 500 error on story creation, no failed delivery logged
    Evidence: .sisyphus/evidence/task-16-webhook-failure.txt
  ```

  **Commit**: YES
  - Message: `feat(api): webhook outbound system with HMAC signing and delivery tracking`
  - Files: `packages/api/src/services/webhook-dispatcher.ts`, `packages/api/src/routes/webhooks.ts`, `packages/db/src/schema/webhook_deliveries.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

### Wave 5 — Enterprise Operations (After Wave 4)

- [ ] 17. Multi-Tenant Org Model (org_id on All Entities)

  **What to do**:
  - Create `packages/api/src/middleware/org-scope.ts`:
    - `orgScopeMiddleware` — extracts `orgId` from the authenticated user's JWT payload (set by authMiddleware in Task 9), attaches to request context
    - All repository calls in route handlers MUST receive this `orgId` — no repo call without org scoping
    - Add helper: `requireOrgAccess(orgId: string, userOrgId: string)` — asserts they match, throws 403 if not
  - Create `packages/api/src/routes/organizations.ts`:
    - `GET /api/organizations/current` — get current org details (requires auth)
    - `PUT /api/organizations/current` — update org name/settings (requires ORG_MANAGE, ADMIN only)
    - `GET /api/organizations/current/members` — list org members (requires auth)
    - `POST /api/organizations/current/members` — invite member (requires USER_MANAGE), body: `{ email, name, role }`
    - `PUT /api/organizations/current/members/:userId` — change member role (requires USER_MANAGE, ADMIN only)
    - `DELETE /api/organizations/current/members/:userId` — remove member (requires USER_MANAGE, ADMIN only)
  - Verify ALL existing routes (from Tasks 12-16) pass `orgId` to every repository call — audit each route handler
  - Add integration test: create two orgs, verify data isolation end-to-end

  **Must NOT do**:
  - Do NOT implement schema-per-tenant — row-level org_id only
  - Do NOT add org switching — one user belongs to one org
  - Do NOT add org creation outside of registration flow (Task 9 handles it)
  - Do NOT add billing or subscription features

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires auditing ALL existing routes for org scoping plus new org management endpoints
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 18, 19, 20)
  - **Blocks**: Tasks 20, 22
  - **Blocked By**: Tasks 10, 12, 15

  **References**:

  **Pattern References**:
  - `packages/api/src/auth/middleware.ts` — Created in Task 9. Auth context already includes `orgId` from JWT — org scope middleware builds on this
  - `packages/api/src/routes/projects.ts` — Created in Task 12. Verify all handlers pass `orgId` to repo
  - `packages/api/src/routes/epics.ts` — Created in Task 12. Same verification
  - `packages/api/src/routes/stories.ts` — Created in Task 12. Same verification
  - `packages/api/src/routes/sprints.ts` — Created in Task 14. Same verification

  **API/Type References**:
  - `packages/db/src/repositories/*.repo.ts` — Created in Task 5. Every repository method should already accept `orgId` parameter
  - `packages/db/src/schema/users.ts` — Created in Task 4. User-org relationship defined here

  **WHY Each Reference Matters**:
  - All route files — Must audit every handler to ensure org_id is passed. A single missing org_id creates a data leak
  - Repository files — Verify all repo methods filter by org_id

  **Acceptance Criteria**:
  - [ ] Org management endpoints work (view, update, manage members)
  - [ ] ALL existing routes verified to pass orgId to every repo call
  - [ ] Cross-org data isolation verified with integration test
  - [ ] Member invitation creates user in correct org
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Complete org isolation — two orgs cannot see each other's data
    Tool: Bash
    Preconditions: API server running with Postgres
    Steps:
      1. Register user A with orgName "OrgAlpha" — get tokenA
      2. Register user B with orgName "OrgBeta" — get tokenB
      3. User A creates project "Alpha Project" — capture projectIdA
      4. User B calls GET /api/projects with tokenB — assert "Alpha Project" NOT in response
      5. User B calls GET /api/projects/$projectIdA with tokenB — assert 404
    Expected Result: Complete data isolation between orgs
    Failure Indicators: User B sees User A's data
    Evidence: .sisyphus/evidence/task-17-org-isolation.txt

  Scenario: Admin can manage members, member cannot
    Tool: Bash
    Preconditions: OrgAlpha with admin user A
    Steps:
      1. User A (admin) POST /api/organizations/current/members with `{"email":"new@test.com","name":"New User","role":"MEMBER"}` — assert 201
      2. Login as new user, attempt POST /api/organizations/current/members — assert 403
    Expected Result: Admin can add members, non-admin cannot
    Failure Indicators: 403 for admin, 201 for non-admin
    Evidence: .sisyphus/evidence/task-17-member-management.txt
  ```

  **Commit**: YES
  - Message: `feat(api): multi-tenant org model with member management and data isolation`
  - Files: `packages/api/src/middleware/org-scope.ts`, `packages/api/src/routes/organizations.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 18. SSE Streaming for Sprint Execution Progress

  **What to do**:
  - Create `packages/api/src/services/event-stream.ts`:
    - `EventStreamManager` class — manages active SSE connections per sprint
    - `subscribe(sprintId, orgId): ReadableStream` — returns a Server-Sent Events stream
    - `publish(sprintId, event: SprintEvent): void` — pushes event to all subscribers for that sprint
    - `SprintEvent` type: `{ type: string, data: object, timestamp: string }`
    - Event types: `sprint.started`, `story.agent_started`, `story.agent_completed`, `story.completed`, `story.failed`, `sprint.completed`, `sprint.progress` (periodic update with % complete)
    - Auto-cleanup: remove connections on disconnect, timeout after 30 min idle
  - Create `packages/api/src/routes/stream.ts`:
    - `GET /api/sprints/:sprintId/stream` — SSE endpoint (requires SPRINT_READ)
    - Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    - Each event formatted as: `data: ${JSON.stringify(event)}\n\n`
    - Heartbeat: send `:\n\n` comment every 30s to keep connection alive
  - Integration point: When sprint execution is triggered (through CLI or API), the orchestrator's telemetry hooks publish events to EventStreamManager
  - Add tests: mock SSE connection, verify events are received in order

  **Must NOT do**:
  - Do NOT use WebSockets — SSE only (unidirectional server→client)
  - Do NOT add message persistence — events are ephemeral (historical data comes from DB)
  - Do NOT modify the orchestrator — events are published from the API layer that wraps the orchestrator
  - Do NOT add authentication to the SSE stream beyond JWT — no separate auth

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: SSE implementation with connection management, heartbeats, and multi-subscriber fan-out requires careful async handling
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser needed for SSE testing (curl handles it)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 17, 19, 20)
  - **Blocks**: Task 23
  - **Blocked By**: Task 16

  **References**:

  **Pattern References**:
  - `packages/agents/src/orchestrator.ts` — Study the orchestrator's event/callback hooks. SSE events should map to orchestrator lifecycle events (story started, agent completed, etc.)
  - `packages/api/src/server.ts` — Created in Task 8. SSE route must integrate with Bun.serve's response handling

  **API/Type References**:
  - `packages/core/src/types.ts:165-176` — `SprintTelemetrySchema` — SSE events should carry a subset of this data

  **External References**:
  - Bun.serve SSE: Bun supports `ReadableStream` responses natively — `return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })`
  - SSE spec: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

  **WHY Each Reference Matters**:
  - `orchestrator.ts` — Event types must map 1:1 to orchestrator lifecycle for accurate progress reporting
  - Bun SSE — Must use Bun's native ReadableStream, no polyfills

  **Acceptance Criteria**:
  - [ ] `GET /api/sprints/:sprintId/stream` returns `text/event-stream`
  - [ ] Events pushed to subscribers when `publish()` called
  - [ ] Heartbeat sent every 30s
  - [ ] Connections cleaned up on client disconnect
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: SSE stream receives events
    Tool: Bash
    Preconditions: API server running, sprint exists, user authenticated
    Steps:
      1. Start SSE connection: `curl -N -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/sprints/$sprintId/stream &`
      2. In separate call, trigger event: publish a test event to the sprint's EventStreamManager
      3. Assert curl output contains `data:` line with the event payload
      4. Kill curl process
    Expected Result: SSE event received by curl client
    Failure Indicators: No data received, connection refused, timeout
    Evidence: .sisyphus/evidence/task-18-sse-events.txt

  Scenario: SSE heartbeat keeps connection alive
    Tool: Bash
    Preconditions: API server running, SSE endpoint accessible
    Steps:
      1. Start SSE connection with timeout: `timeout 35 curl -N -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/sprints/$sprintId/stream`
      2. Wait 35 seconds
      3. Assert output contains `:\n` comment (heartbeat) within 30s
    Expected Result: Heartbeat comment received within 30s
    Failure Indicators: No heartbeat, connection dropped
    Evidence: .sisyphus/evidence/task-18-heartbeat.txt

  Scenario: Unauthenticated SSE request rejected
    Tool: Bash
    Preconditions: API server running
    Steps:
      1. Run `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/sprints/S1/stream` (no auth header)
      2. Assert 401
    Expected Result: 401 Unauthorized without token
    Failure Indicators: 200 or event stream without auth
    Evidence: .sisyphus/evidence/task-18-sse-auth.txt
  ```

  **Commit**: YES
  - Message: `feat(api): SSE streaming for real-time sprint execution progress`
  - Files: `packages/api/src/services/event-stream.ts`, `packages/api/src/routes/stream.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

- [ ] 19. CLI Refactor to Use API Client

  **What to do**:
  - Create `packages/cli/src/api-client.ts`:
    - `SplintyApiClient` class wrapping `fetch` calls to the API:
      - `constructor(baseUrl: string, token?: string)`
      - Auth methods: `register(email, password, name, orgName)`, `login(email, password)` — stores JWT
      - Project methods: `listProjects()`, `createProject(data)`, `getProject(id)`
      - Story methods: `listStories(projectId, filters?)`, `createStory(projectId, data)`, `getStory(id)`
      - Sprint methods: `planSprint(projectId)`, `createSprint(projectId, data)`, `startSprint(sprintId)`, `completeSprint(sprintId)`
      - Roadmap methods: `importRoadmap(projectId, yaml)`
      - Stream method: `streamSprint(sprintId, onEvent)` — connects to SSE endpoint
  - Refactor `packages/cli/src/index.ts`:
    - Add `--api` flag to `cmdRun` — when set, use API client instead of direct orchestrator invocation
    - When `--api` is set: authenticate, create/find project, import stories, plan sprint, start sprint, stream progress
    - When `--api` is NOT set: existing behavior (direct orchestrator invocation) — UNCHANGED
    - Add new CLI commands:
      - `splinty login` — interactive login, stores token in `~/.splinty/credentials.json`
      - `splinty projects list` — list projects via API
      - `splinty sprints plan <projectId>` — auto-plan sprint via API
      - `splinty sprints start <sprintId>` — start sprint via API
      - `splinty roadmap import <projectId> <file>` — import YAML roadmap via API
    - Preserve ALL existing CLI behavior when `--api` flag is not used
  - Add tests for API client (mock fetch responses)

  **Must NOT do**:
  - Do NOT remove existing direct-orchestrator CLI commands — they MUST continue working
  - Do NOT make API the default — it's opt-in via `--api` flag
  - Do NOT modify the orchestrator
  - Do NOT add interactive TUI — CLI commands only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: CLI refactor requires careful preservation of existing behavior while adding significant new functionality
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 17, 18, 20)
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 8, 9

  **References**:

  **Pattern References**:
  - `packages/cli/src/index.ts` — CURRENT CLI entry point (686 lines). Study ALL existing commands: `cmdRun`, `cmdCreateStory`, their argument parsing, and execution flow. New commands must follow same patterns
  - `packages/integrations/src/jira.ts` — `JiraConnector` class pattern. API client should follow same class-based pattern with typed methods

  **API/Type References**:
  - `packages/api/src/routes/auth.ts` — Created in Task 9. API client auth methods must match these endpoints
  - `packages/api/src/routes/projects.ts` — Created in Task 12. Client project methods match these endpoints
  - `packages/api/src/routes/sprints.ts` — Created in Task 14. Client sprint methods match these endpoints
  - `packages/api/src/routes/roadmap.ts` — Created in Task 13. Client import method matches this endpoint

  **WHY Each Reference Matters**:
  - `cli/index.ts` — Existing CLI is 686 lines with established patterns. New commands MUST follow same argument parsing, error handling, and output formatting conventions
  - `jira.ts` — Proven HTTP client class pattern to replicate for API client

  **Acceptance Criteria**:
  - [ ] API client class with methods for all major API operations
  - [ ] New CLI commands: `login`, `projects list`, `sprints plan/start`, `roadmap import`
  - [ ] Existing `splinty run` works WITHOUT `--api` flag (unchanged behavior)
  - [ ] `splinty run --api` routes through API client
  - [ ] Credentials stored in `~/.splinty/credentials.json`
  - [ ] `bun test packages/cli` → PASS (existing + new tests)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Existing CLI commands still work without --api flag
    Tool: interactive_bash (tmux)
    Preconditions: No API server running
    Steps:
      1. Run `bun run packages/cli/src/index.ts run --source file --input docs/backlog.yaml --project test-regression --dry-run` (or similar safe invocation)
      2. Assert it starts the orchestrator directly (not via API)
      3. Assert it does NOT attempt to connect to localhost:3000
    Expected Result: CLI backwards compatible — direct orchestrator path unchanged
    Failure Indicators: Connection refused error, API-related errors
    Evidence: .sisyphus/evidence/task-19-cli-regression.txt

  Scenario: CLI login stores credentials
    Tool: interactive_bash (tmux)
    Preconditions: API server running
    Steps:
      1. Run `bun run packages/cli/src/index.ts login --email test@test.com --password Test1234! --api-url http://localhost:3000`
      2. Assert exit code 0
      3. Assert file `~/.splinty/credentials.json` exists and contains `token` field
    Expected Result: Login succeeds, credentials persisted
    Failure Indicators: Login error, missing credentials file
    Evidence: .sisyphus/evidence/task-19-cli-login.txt

  Scenario: CLI roadmap import via API
    Tool: Bash
    Preconditions: API server running, user logged in, project exists
    Steps:
      1. Run `bun run packages/cli/src/index.ts roadmap import $projectId docs/backlog.yaml --api`
      2. Assert output shows stories imported count
      3. Run `bun run packages/cli/src/index.ts projects list --api` — verify project shows stories
    Expected Result: Roadmap imported via CLI→API→DB pipeline
    Failure Indicators: Import error, 0 stories, API connection failure
    Evidence: .sisyphus/evidence/task-19-cli-roadmap.txt
  ```

  **Commit**: YES
  - Message: `refactor(cli): add API client and new CLI commands for platform operations`
  - Files: `packages/cli/src/api-client.ts`, `packages/cli/src/index.ts`
  - Pre-commit: `bun test packages/cli && tsc --noEmit`

---

- [ ] 20. Cross-Project Metrics Aggregation

  **What to do**:
  - Create `packages/api/src/services/metrics-aggregator.ts`:
    - `MetricsAggregator` class:
      - `getOrgMetrics(orgId): Promise<OrgMetrics>` — aggregate across all projects:
        - Total sprints completed
        - Total stories completed
        - Average velocity across projects
        - Total cost (sum of costEstimateUsd from story metrics)
        - Total LLM calls
        - Average sprint duration
      - `getProjectComparison(orgId): Promise<ProjectComparison[]>` — per-project stats for comparison:
        - Project name, total sprints, avg velocity, total stories, avg cost per story, success rate
      - `getTrends(orgId, months): Promise<TrendData>` — monthly aggregation:
        - Stories per month, velocity trend, cost trend
  - Create `packages/api/src/routes/metrics.ts`:
    - `GET /api/metrics/org` — org-wide metrics (requires AUDIT_READ or ADMIN)
    - `GET /api/metrics/projects` — project comparison table (requires AUDIT_READ)
    - `GET /api/metrics/trends?months=6` — trend data (requires AUDIT_READ)
    - `GET /api/projects/:id/velocity` — per-project velocity data (requires PROJECT_READ). Returns `Array<{sprintId, sprintName, plannedPoints, completedPoints, velocity, startDate, endDate}>` using `VelocityRepository.getByProject()`
  - Use `VelocityRepository` and `StoryMetricsRepository` from Task 11 for data
  - Add tests with mock data

  **Must NOT do**:
  - Do NOT add data export to CSV/PDF — API JSON only
  - Do NOT add real-time metrics — computed on request
  - Do NOT add per-user metrics — org and project level only
  - Do NOT add predictive analytics — historical aggregation only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Aggregation queries across multiple tables with trend computation require careful SQL/repository logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 17, 18, 19)
  - **Blocks**: Task 28
  - **Blocked By**: Tasks 11, 17

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/audit.ts` — Created in Task 15. Follow same route pattern for read-only endpoints with pagination/filtering

  **API/Type References**:
  - `packages/db/src/repositories/velocity.repo.ts` — Created in Task 11. Use `getByProject()` and `getAverageVelocity()` for velocity data
  - `packages/db/src/repositories/story-metrics.repo.ts` — Created in Task 11. Use for cost and execution time aggregation
  - `packages/db/src/repositories/sprint.repo.ts` — Created in Task 5. Use for sprint counts and durations
  - `packages/core/src/types.ts:112-127` — `StoryMetricsSchema` — source of cost, LLM call, duration data

  **WHY Each Reference Matters**:
  - `velocity.repo.ts` — Primary data source for velocity metrics and trends
  - `story-metrics.repo.ts` — Primary data source for cost and execution aggregation
  - Existing route patterns — Consistent API shape and error handling

  **Acceptance Criteria**:
  - [ ] Org-wide metrics endpoint returns aggregated stats
  - [ ] Project comparison endpoint returns per-project breakdown
  - [ ] Trend endpoint returns monthly data for specified range
  - [ ] All endpoints org-scoped
  - [ ] `bun test packages/api` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Org metrics aggregate across projects
    Tool: Bash
    Preconditions: API server running, 2+ projects with completed sprints and story metrics
    Steps:
      1. GET /api/metrics/org with admin token
      2. Assert response contains: totalSprintsCompleted, totalStoriesCompleted, averageVelocity, totalCostUsd, totalLlmCalls
      3. Assert totalSprintsCompleted equals sum of sprints across all projects
    Expected Result: Aggregated metrics across all projects in org
    Failure Indicators: Missing fields, aggregation errors, zero values when data exists
    Evidence: .sisyphus/evidence/task-20-org-metrics.txt

  Scenario: Project comparison returns per-project stats
    Tool: Bash
    Preconditions: 2+ projects with data
    Steps:
      1. GET /api/metrics/projects with admin token
      2. Assert response is array with one entry per project
      3. Assert each entry has: projectName, totalSprints, avgVelocity, totalStories, avgCostPerStory
    Expected Result: Per-project comparison data
    Failure Indicators: Missing projects, incorrect per-project aggregation
    Evidence: .sisyphus/evidence/task-20-project-comparison.txt

  Scenario: Empty org returns zero metrics (not errors)
    Tool: Bash
    Preconditions: New org with no projects
    Steps:
      1. Register new user in new org
      2. GET /api/metrics/org — assert 200 with all values = 0
    Expected Result: Zero metrics, not 404 or 500
    Failure Indicators: Error response, null values
    Evidence: .sisyphus/evidence/task-20-empty-metrics.txt
  ```

  **Commit**: YES
  - Message: `feat(api): cross-project metrics aggregation with trends`
  - Files: `packages/api/src/services/metrics-aggregator.ts`, `packages/api/src/routes/metrics.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

### Wave 6 — Web UI (After Wave 5)

- [ ] 21. React + Vite Scaffold with Auth Pages

  **What to do**:
  - Initialize `packages/web/` using Vite + React + TypeScript (already scaffolded in Task 3 — flesh it out):
    - `vite.config.ts` — configure with `@vitejs/plugin-react`, proxy `/api` to `http://localhost:3000`
    - `tsconfig.json` — strict mode, path aliases `@/` → `src/`
    - `tailwind.config.ts` — Tailwind CSS v3 with custom Splinty color palette (dark-first: zinc-900 base, emerald-500 accent, amber-400 warning)
    - `postcss.config.js` — tailwindcss + autoprefixer
  - Create core layout and routing:
    - `src/main.tsx` — React 18 root with `<BrowserRouter>` and `<AuthProvider>`
    - `src/App.tsx` — Route definitions:
      - `/login` → `LoginPage` (public)
      - `/register` → `RegisterPage` (public)
      - `/` → `DashboardLayout` → `ProjectListPage` (protected)
      - `/projects/:id` → `ProjectDashboardPage` (protected)
      - `/projects/:id/sprints/:sprintId` → `SprintViewerPage` (protected)
      - `/projects/:id/analytics` → `AnalyticsPage` (protected)
    - `src/layouts/DashboardLayout.tsx` — Sidebar nav + top bar + content area + user menu
    - `src/layouts/AuthLayout.tsx` — Centered card layout for login/register
  - Create auth system:
    - `src/contexts/AuthContext.tsx` — React context providing `user`, `token`, `login()`, `logout()`, `register()`, `isAuthenticated`
    - `src/hooks/useAuth.ts` — convenience hook for AuthContext
    - `src/lib/api-client.ts` — fetch wrapper that:
      - Prepends `/api` base path
      - Attaches `Authorization: Bearer <token>` header
      - Handles 401 → redirect to `/login`
      - Parses JSON responses with error extraction
      - Stores token in `localStorage` under `splinty_token`
    - `src/components/ProtectedRoute.tsx` — Redirects to `/login` if not authenticated
  - Create auth pages:
    - `src/pages/LoginPage.tsx` — email + password form, "Remember me" checkbox, "Register" link, error display, submit → `POST /api/auth/login`
    - `src/pages/RegisterPage.tsx` — email + password + confirm password + org name (for new org), submit → `POST /api/auth/register`
  - Create shared UI primitives (DO NOT use a component library — hand-built with Tailwind):
    - `src/components/ui/Button.tsx` — variant: primary/secondary/danger/ghost, size: sm/md/lg, loading state with spinner
    - `src/components/ui/Input.tsx` — label, error message, disabled state
    - `src/components/ui/Card.tsx` — wrapper with padding, border, shadow
    - `src/components/ui/Badge.tsx` — status indicator with color coding
    - `src/components/ui/Spinner.tsx` — loading indicator
    - `src/components/ui/EmptyState.tsx` — icon + title + description + optional CTA
  - Add `"dev"` script to `packages/web/package.json`: `"vite --port 5173"`
  - Add `"build"` script: `"vite build"`
  - Verify `bun install` resolves all new dependencies
  - Verify `bun run --cwd packages/web build` produces dist output

  **Must NOT do**:
  - Do NOT use a UI component library (no shadcn, no MUI, no Ant Design) — hand-built with Tailwind
  - Do NOT implement SSE or real-time features — that's Task 23
  - Do NOT fetch project/sprint data — that's Tasks 22-24
  - Do NOT add tests for UI components — QA via Playwright only
  - Do NOT use Redux or Zustand — React Context only for auth state
  - Do NOT add dark/light mode toggle — dark mode only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Full frontend scaffold with layout, routing, auth context, and UI primitives — core visual engineering domain
  - **Skills**: [`playwright`]
    - `playwright`: QA scenarios verify login/register flows in browser
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Could apply but `visual-engineering` category already covers this domain

  **Parallelization**:
  - **Can Run In Parallel**: NO — first UI task, sets up scaffold others depend on
  - **Parallel Group**: Wave 6 (starts first, T22-T24 follow after)
  - **Blocks**: Tasks 22, 23, 24
  - **Blocked By**: Task 9 (JWT auth endpoints must exist for login/register)

  **References**:

  **Pattern References**:
  - `packages/web/package.json` — Created in Task 3. Extend with React, Vite, Tailwind dependencies
  - `packages/api/src/routes/auth.ts` — Created in Task 9. Auth endpoints: `POST /api/auth/register` (body: `{email, password, orgName}`), `POST /api/auth/login` (body: `{email, password}`), response: `{token, user: {id, email, role, orgId}}`
  - `packages/api/src/auth/middleware.ts` — Created in Task 9. JWT token format — `Authorization: Bearer <jwt>`, payload includes `{userId, orgId, role}`

  **API/Type References**:
  - `packages/core/src/types.ts` — `UserRole` enum (OWNER, ADMIN, DEVELOPER, VIEWER) from Task 7 — use for role display in user menu
  - `packages/api/src/routes/auth.ts` — Response shape for login: `{ token: string, user: { id, email, role, orgId } }`

  **External References**:
  - Vite React guide: https://vitejs.dev/guide/#scaffolding-your-first-vite-project
  - Tailwind CSS installation: https://tailwindcss.com/docs/installation/using-postcss
  - React Router v6: https://reactrouter.com/en/main/start/overview

  **WHY Each Reference Matters**:
  - `routes/auth.ts` — MUST match exact request/response shapes for login/register to work
  - `auth/middleware.ts` — Token format determines how `api-client.ts` attaches auth headers
  - `UserRole` enum — Role names must match for consistent display

  **Acceptance Criteria**:
  - [ ] `bun run --cwd packages/web build` → succeeds with no errors
  - [ ] `tsc --noEmit` → 0 errors
  - [ ] Vite dev server starts on port 5173
  - [ ] `/api` requests proxy to `localhost:3000`
  - [ ] Login page renders at `/login`
  - [ ] Register page renders at `/register`
  - [ ] Unauthenticated access to `/` redirects to `/login`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Login flow with valid credentials
    Tool: Playwright (playwright skill)
    Preconditions: API server running on :3000 with a registered user (test@splinty.dev / Test1234!), Vite dev server running on :5173
    Steps:
      1. Navigate to http://localhost:5173/login
      2. Assert page contains input[name="email"] and input[name="password"]
      3. Fill input[name="email"] with "test@splinty.dev"
      4. Fill input[name="password"] with "Test1234!"
      5. Click button[type="submit"]
      6. Wait for navigation — assert URL is now http://localhost:5173/
      7. Assert localStorage contains key "splinty_token" with non-empty value
      8. Assert page contains text matching the user's email or a welcome message
    Expected Result: User logged in, token stored, redirected to dashboard
    Failure Indicators: Stays on /login, no token in localStorage, error message displayed
    Evidence: .sisyphus/evidence/task-21-login-flow.png

  Scenario: Login with invalid credentials shows error
    Tool: Playwright (playwright skill)
    Preconditions: API server running, Vite dev server running
    Steps:
      1. Navigate to http://localhost:5173/login
      2. Fill input[name="email"] with "wrong@splinty.dev"
      3. Fill input[name="password"] with "WrongPassword!"
      4. Click button[type="submit"]
      5. Wait 2s for response
      6. Assert page still shows /login URL
      7. Assert page contains an element with text "Invalid" or "incorrect" (case-insensitive)
      8. Assert localStorage does NOT contain "splinty_token"
    Expected Result: Error message shown, not redirected, no token stored
    Failure Indicators: Redirect to dashboard, token stored, no error shown
    Evidence: .sisyphus/evidence/task-21-login-error.png

  Scenario: Protected route redirects to login when unauthenticated
    Tool: Playwright (playwright skill)
    Preconditions: Vite dev server running, no token in localStorage
    Steps:
      1. Navigate to http://localhost:5173/
      2. Assert URL redirects to http://localhost:5173/login
      3. Navigate to http://localhost:5173/projects/test-id
      4. Assert URL redirects to http://localhost:5173/login
    Expected Result: All protected routes redirect to /login
    Failure Indicators: Dashboard content visible without authentication
    Evidence: .sisyphus/evidence/task-21-protected-route.png

  Scenario: Vite build produces valid output
    Tool: Bash
    Preconditions: Dependencies installed
    Steps:
      1. Run `bun run --cwd packages/web build`
      2. Assert exit code 0
      3. Assert `packages/web/dist/index.html` exists
      4. Assert `packages/web/dist/assets/` contains .js and .css files
    Expected Result: Production build succeeds with HTML + JS + CSS assets
    Failure Indicators: Build errors, missing dist directory, no assets
    Evidence: .sisyphus/evidence/task-21-build-output.txt
  ```

  **Commit**: YES
  - Message: `feat(web): React + Vite scaffold with auth pages and UI primitives`
  - Files: `packages/web/src/**`, `packages/web/vite.config.ts`, `packages/web/tailwind.config.ts`, `packages/web/postcss.config.js`
  - Pre-commit: `bun run --cwd packages/web build && tsc --noEmit`

---

- [ ] 22. Project Dashboard + Epic/Story List

  **What to do**:
  - Create data fetching hooks in `src/hooks/`:
    - `useProjects.ts` — `GET /api/projects` → list of projects for current org. Returns `{ projects, loading, error, refetch }`
    - `useProject.ts` — `GET /api/projects/:id` → single project with stats. Returns `{ project, loading, error }`
    - `useEpics.ts` — `GET /api/projects/:id/epics` → epics for a project. Returns `{ epics, loading, error }`
    - `useStories.ts` — `GET /api/projects/:id/stories?epicId=&state=&page=&limit=` → paginated stories with filters. Returns `{ stories, total, loading, error, loadMore }`
  - Create project list page:
    - `src/pages/ProjectListPage.tsx`:
      - Grid of project cards showing: name, description, story count, sprint count, last activity date
      - "New Project" button → modal with name + description fields → `POST /api/projects`
      - Empty state with illustration when no projects exist
      - Click card → navigate to `/projects/:id`
  - Create project dashboard page:
    - `src/pages/ProjectDashboardPage.tsx`:
      - Header: project name + description + edit button
      - Stats row: total epics, total stories, stories by state (pie/donut visual), active sprint name
      - Tab navigation: "Backlog" | "Sprints" | "Analytics"
      - Backlog tab (default):
        - Epic accordion list — each epic expandable to show its stories
        - Each story row: title, state badge (color-coded by StoryState), story points, assigned sprint
        - Story state colors: RAW=gray, REFINED=blue, SPRINT_READY=emerald, IN_PROGRESS=amber, IN_REVIEW=purple, DONE=green, PR_OPEN=cyan, MERGED=teal
        - Click story → inline detail panel (right side) showing: title, description, acceptance criteria, state history
      - Sprints tab: List of sprints with status badges (PLANNING/ACTIVE/COMPLETED), click → navigate to sprint viewer (Task 23)
  - Create reusable components:
    - `src/components/ProjectCard.tsx` — card for project list grid
    - `src/components/EpicAccordion.tsx` — collapsible epic with story list
    - `src/components/StoryRow.tsx` — single story in list with state badge and points
    - `src/components/StoryDetail.tsx` — side panel showing full story details
    - `src/components/StatCard.tsx` — metric card (number + label + optional trend)
    - `src/components/CreateProjectModal.tsx` — form modal for new project

  **Must NOT do**:
  - Do NOT implement story editing/creation from UI — read-only display + create project only
  - Do NOT implement drag-and-drop reordering
  - Do NOT add search/filter beyond state filter for stories
  - Do NOT implement real-time updates — manual refetch only
  - Do NOT add pagination beyond "Load More" button for stories

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Data-driven dashboard with multiple views, accordion patterns, stat cards — core visual engineering
  - **Skills**: [`playwright`]
    - `playwright`: QA scenarios verify dashboard rendering and navigation in browser
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Could enhance but visual-engineering covers dashboard layouts

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T21 completes, parallel with T23 and T24)
  - **Parallel Group**: Wave 6 (with Tasks 23, 24 — all depend on T21)
  - **Blocks**: — (no downstream tasks)
  - **Blocked By**: Tasks 12 (Epic/Story CRUD endpoints), 17 (multi-tenant org model — org-scoped projects), 21 (React scaffold + auth)

  **References**:

  **Pattern References**:
  - `packages/web/src/lib/api-client.ts` — Created in Task 21. Use this for all API calls in hooks
  - `packages/web/src/components/ui/Card.tsx` — Created in Task 21. Base card component for ProjectCard and StatCard
  - `packages/web/src/components/ui/Badge.tsx` — Created in Task 21. Use for story state badges
  - `packages/web/src/components/ui/EmptyState.tsx` — Created in Task 21. Use for empty project list

  **API/Type References**:
  - `packages/api/src/routes/projects.ts` — Created in Task 12. Endpoints: `GET /api/projects` (list), `POST /api/projects` (create), `GET /api/projects/:id` (detail)
  - `packages/api/src/routes/epics.ts` — Created in Task 12. Endpoint: `GET /api/projects/:id/epics` (list epics with story counts)
  - `packages/api/src/routes/stories.ts` — Created in Task 12. Endpoint: `GET /api/projects/:id/stories?epicId=X&state=Y` (filtered, paginated)
  - `packages/core/src/types.ts:10-22` — `StoryState` enum — use for state badge color mapping

  **WHY Each Reference Matters**:
  - `api-client.ts` — All data hooks MUST use this client for consistent auth header attachment and error handling
  - `routes/projects.ts` — Response shapes define the data available for rendering project cards and stats
  - `StoryState` enum — Must use exact enum values for color mapping to be correct

  **Acceptance Criteria**:
  - [ ] Project list page renders at `/` after login
  - [ ] "New Project" creates a project via API and shows it in the list
  - [ ] Project dashboard shows stats, epics, stories at `/projects/:id`
  - [ ] Story state badges use correct colors per StoryState enum
  - [ ] Epic accordion expands/collapses to show/hide stories
  - [ ] `bun run --cwd packages/web build` → succeeds
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Project list displays projects and empty state
    Tool: Playwright (playwright skill)
    Preconditions: API running, user logged in, 0 projects initially
    Steps:
      1. Navigate to http://localhost:5173/
      2. Assert page contains empty state element (text "No projects" or similar)
      3. Click "New Project" button
      4. Fill input[name="name"] with "Test Project Alpha"
      5. Fill input[name="description"] with "A test project for QA"
      6. Click submit button in modal
      7. Wait for modal to close
      8. Assert page now contains a card with text "Test Project Alpha"
    Expected Result: Empty state shown first, project created and visible in grid
    Failure Indicators: Empty state missing, project not appearing after creation, modal not closing
    Evidence: .sisyphus/evidence/task-22-project-list.png

  Scenario: Project dashboard shows epics and stories
    Tool: Playwright (playwright skill)
    Preconditions: API running, user logged in, project exists with 2 epics each having 3 stories in various states
    Steps:
      1. Navigate to http://localhost:5173/projects/{projectId}
      2. Assert stats row shows "2" for total epics and "6" for total stories
      3. Assert first epic accordion is visible with epic title
      4. Click first epic accordion header
      5. Assert 3 story rows appear with title, state badge, and story points
      6. Assert state badges have correct colors: RAW stories have gray badge, DONE stories have green badge
    Expected Result: Dashboard renders with stats, expandable epics, colored story rows
    Failure Indicators: Missing stats, accordion not expanding, wrong badge colors
    Evidence: .sisyphus/evidence/task-22-project-dashboard.png

  Scenario: Story detail panel shows full information
    Tool: Playwright (playwright skill)
    Preconditions: Dashboard loaded with stories visible
    Steps:
      1. Click on a story row
      2. Assert a detail panel appears on the right side
      3. Assert panel contains: story title, description text, acceptance criteria list, current state badge
      4. Click a different story row
      5. Assert panel updates to show the new story's details
    Expected Result: Side panel shows full story details, updates on selection change
    Failure Indicators: Panel doesn't appear, details don't update, missing fields
    Evidence: .sisyphus/evidence/task-22-story-detail.png
  ```

  **Commit**: YES
  - Message: `feat(web): project dashboard with epic/story list and stat cards`
  - Files: `packages/web/src/pages/ProjectListPage.tsx`, `packages/web/src/pages/ProjectDashboardPage.tsx`, `packages/web/src/hooks/*.ts`, `packages/web/src/components/ProjectCard.tsx`, `packages/web/src/components/EpicAccordion.tsx`, `packages/web/src/components/StoryRow.tsx`, `packages/web/src/components/StoryDetail.tsx`, `packages/web/src/components/StatCard.tsx`, `packages/web/src/components/CreateProjectModal.tsx`
  - Pre-commit: `bun run --cwd packages/web build && tsc --noEmit`

---

- [ ] 23. Sprint Execution Viewer with SSE

  **What to do**:
  - Create sprint data hooks:
    - `src/hooks/useSprint.ts` — `GET /api/projects/:id/sprints/:sprintId` → sprint details (status, stories, start/end dates). Returns `{ sprint, loading, error }`
    - `src/hooks/useSprintSSE.ts` — SSE connection hook:
      - Connects to `GET /api/sprints/:sprintId/stream` (created in Task 18)
      - Parses `event: agent_start | agent_complete | story_progress | sprint_complete | error` events
      - Maintains local state: `{ events: SSEEvent[], currentAgent: string | null, currentStory: string | null, progress: number, connected: boolean }`
      - Auto-reconnects on connection drop (3 retries with exponential backoff)
      - Provides `disconnect()` method for cleanup on unmount
  - Create sprint viewer page:
    - `src/pages/SprintViewerPage.tsx`:
      - Header: sprint name + status badge (PLANNING/ACTIVE/COMPLETED) + date range
      - Two main sections:
        1. **Story Progress Panel** (left, 60% width):
           - List of stories in sprint with progress indicators
           - Each story shows: title, current state, agent currently processing it (if any)
           - Progress bar per story (percentage based on agent pipeline completion: 0/12 agents → 12/12 agents)
           - Color transitions: gray (pending) → amber (in progress) → green (complete) → red (failed)
        2. **Live Agent Feed** (right, 40% width):
           - Scrolling feed of SSE events as they arrive
           - Each event card shows: timestamp, agent name, event type, brief summary
           - Agent icons/avatars: BusinessOwner 📋, ProductOwner 📝, Architect 🏗️, Developer 💻, QAEngineer 🧪, etc.
           - Auto-scroll to bottom on new events (with "scroll to latest" button if user scrolled up)
      - Sprint summary section (visible when COMPLETED):
        - Total duration, stories completed vs planned, success rate, total cost
  - Create reusable components:
    - `src/components/StoryProgressCard.tsx` — story with progress bar and current agent
    - `src/components/AgentEventCard.tsx` — single SSE event in the feed
    - `src/components/AgentFeed.tsx` — scrolling container for agent events with auto-scroll logic
    - `src/components/SprintSummary.tsx` — completion stats card

  **Must NOT do**:
  - Do NOT implement sprint start/stop controls — read-only viewer
  - Do NOT add log file viewing or terminal output — agent-level summary only
  - Do NOT implement event filtering or search
  - Do NOT cache SSE events in localStorage — in-memory only
  - Do NOT add audio/notification alerts for events

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Real-time UI with SSE streaming, progress animations, and live feed — visual engineering with streaming complexity
  - **Skills**: [`playwright`]
    - `playwright`: QA scenarios verify real-time rendering and SSE integration in browser
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Visual-engineering category covers this

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T21 completes, parallel with T22 and T24)
  - **Parallel Group**: Wave 6 (with Tasks 22, 24)
  - **Blocks**: — (no downstream tasks)
  - **Blocked By**: Tasks 18 (SSE streaming endpoint), 21 (React scaffold)

  **References**:

  **Pattern References**:
  - `packages/web/src/hooks/useProjects.ts` — Created in Task 22. Follow same hook pattern (loading, error, data) for `useSprint.ts`
  - `packages/web/src/lib/api-client.ts` — Created in Task 21. Use for initial sprint data fetch (NOT for SSE — SSE uses native EventSource)
  - `packages/web/src/components/ui/Badge.tsx` — Created in Task 21. Use for sprint status badge

  **API/Type References**:
  - `packages/api/src/routes/stream.ts` — Created in Task 18. SSE endpoint: `GET /api/sprints/:sprintId/stream`. Event types: `agent_start` (data: `{agentName, storyId}`), `agent_complete` (data: `{agentName, storyId, result}`), `story_progress` (data: `{storyId, state, progress}`), `sprint_complete` (data: `{sprintId, summary}`)
  - `packages/api/src/routes/sprints.ts` — Created in Task 12. `GET /api/projects/:id/sprints/:sprintId` returns sprint object with stories array
  - `packages/core/src/types.ts:10-22` — `StoryState` enum — use for progress color mapping
  - `packages/agents/src/orchestrator.ts` — Reference agent names (BusinessOwnerAgent, ProductOwnerAgent, etc.) for agent icons/avatars mapping

  **External References**:
  - MDN EventSource API: https://developer.mozilla.org/en-US/docs/Web/API/EventSource

  **WHY Each Reference Matters**:
  - `routes/stream.ts` — MUST match exact event type names and data shapes for the feed to render correctly
  - `orchestrator.ts` — Agent names from the pipeline define the icon/avatar mapping; must match exactly
  - `StoryState` enum — Progress color transitions depend on exact state values

  **Acceptance Criteria**:
  - [ ] Sprint viewer page renders at `/projects/:id/sprints/:sprintId`
  - [ ] SSE connection established when page loads (visible in Network tab)
  - [ ] Agent events appear in live feed as they arrive
  - [ ] Story progress bars update based on SSE events
  - [ ] Auto-reconnect works on connection drop
  - [ ] Sprint summary section shows when sprint is COMPLETED
  - [ ] `bun run --cwd packages/web build` → succeeds
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Sprint viewer renders with story list and status
    Tool: Playwright (playwright skill)
    Preconditions: API running, user logged in, project with an ACTIVE sprint containing 3 stories
    Steps:
      1. Navigate to http://localhost:5173/projects/{projectId}/sprints/{sprintId}
      2. Assert header shows sprint name and "ACTIVE" badge
      3. Assert left panel contains 3 story progress cards
      4. Assert each card shows story title and a progress bar
      5. Assert right panel contains "Agent Feed" heading
    Expected Result: Sprint viewer layout renders with stories and feed sections
    Failure Indicators: Missing stories, no feed panel, wrong sprint status
    Evidence: .sisyphus/evidence/task-23-sprint-viewer.png

  Scenario: SSE events appear in live feed
    Tool: Playwright (playwright skill)
    Preconditions: API running with SSE endpoint, active sprint with ongoing execution (or mock SSE server sending test events)
    Steps:
      1. Navigate to sprint viewer page
      2. Wait up to 30s for at least one event to appear in the agent feed
      3. Assert event card contains: timestamp, agent name (e.g., "BusinessOwner"), event type
      4. Assert story progress card for the affected story shows updated progress (non-zero progress bar width)
      5. Take screenshot showing both feed event and progress update
    Expected Result: Live events render in feed and update story progress
    Failure Indicators: Empty feed after 30s, progress bars stuck at 0, no SSE connection in Network tab
    Evidence: .sisyphus/evidence/task-23-sse-events.png

  Scenario: Completed sprint shows summary section
    Tool: Playwright (playwright skill)
    Preconditions: API running, project with a COMPLETED sprint
    Steps:
      1. Navigate to http://localhost:5173/projects/{projectId}/sprints/{completedSprintId}
      2. Assert header shows "COMPLETED" badge
      3. Assert sprint summary section is visible
      4. Assert summary contains: total duration, stories completed count, success rate percentage
      5. Assert all story progress bars show 100% (green)
    Expected Result: Completed sprint shows summary stats and all stories at 100%
    Failure Indicators: Summary section missing, stories not showing 100%, no completion stats
    Evidence: .sisyphus/evidence/task-23-completed-sprint.png
  ```

  **Commit**: YES
  - Message: `feat(web): sprint execution viewer with SSE live agent feed`
  - Files: `packages/web/src/pages/SprintViewerPage.tsx`, `packages/web/src/hooks/useSprint.ts`, `packages/web/src/hooks/useSprintSSE.ts`, `packages/web/src/components/StoryProgressCard.tsx`, `packages/web/src/components/AgentEventCard.tsx`, `packages/web/src/components/AgentFeed.tsx`, `packages/web/src/components/SprintSummary.tsx`
  - Pre-commit: `bun run --cwd packages/web build && tsc --noEmit`

---

- [ ] 24. Burndown + Velocity Charts

  **What to do**:
  - Install charting library: `recharts` (lightweight, React-native, no D3 complexity)
    - Add `recharts` and `@types/recharts` (if needed) to `packages/web/package.json`
  - Create analytics data hooks:
    - `src/hooks/useVelocity.ts` — `GET /api/projects/:id/velocity` (from Task 20 metrics routes) → velocity data per sprint. Returns `{ velocityData: Array<{sprintName, planned, completed, velocity}>, loading, error }`
    - `src/hooks/useBurndown.ts` — Compute burndown from sprint data:
      - Fetch sprint stories and their state change timestamps
      - Compute ideal burndown line (linear from total → 0 over sprint duration)
      - Compute actual burndown line (remaining story points at each day)
      - Returns `{ burndownData: Array<{day, ideal, actual}>, loading, error }`
    - `src/hooks/useProjectMetrics.ts` — `GET /api/metrics/projects` (from Task 20 endpoint) → per-project comparison. Returns `{ metrics, loading, error }`
  - Create analytics page:
    - `src/pages/AnalyticsPage.tsx`:
      - Tab navigation: "Sprint Burndown" | "Velocity" | "Project Metrics"
      - **Sprint Burndown tab**:
        - Sprint selector dropdown (list of completed + active sprints)
        - Line chart (recharts `<LineChart>`) with two lines:
          - Ideal burndown (dashed, gray) — linear from total points → 0
          - Actual burndown (solid, emerald) — remaining points per day
        - X-axis: sprint days, Y-axis: remaining story points
        - Tooltip on hover showing exact values
      - **Velocity tab**:
        - Bar chart (recharts `<BarChart>`) showing last N sprints (default 10):
          - Two bars per sprint: planned points (light) vs completed points (dark)
          - Horizontal line showing average velocity across displayed sprints
        - Trend indicator: "↑ Velocity trending up" / "↓ Velocity trending down" / "→ Stable"
      - **Project Metrics tab** (visible for ADMIN/OWNER roles only):
        - Comparison table: project name, total sprints, avg velocity, total stories, avg cost per story, success rate
        - Bar chart comparing velocity across projects
  - Create chart wrapper components:
    - `src/components/charts/BurndownChart.tsx` — recharts LineChart with ideal/actual lines
    - `src/components/charts/VelocityChart.tsx` — recharts BarChart with planned/completed + average line
    - `src/components/charts/ProjectComparisonChart.tsx` — recharts BarChart for cross-project velocity
    - `src/components/charts/ChartContainer.tsx` — responsive wrapper with title and empty state
  - Ensure charts are responsive (use recharts `<ResponsiveContainer>`)
  - Handle empty data states gracefully (no data → EmptyState component, not broken chart)

  **Must NOT do**:
  - Do NOT use D3.js directly — recharts only (simpler, React-native)
  - Do NOT add data export (CSV/PDF) — display only
  - Do NOT implement custom date range pickers — predefined ranges only
  - Do NOT add predictive/forecast lines — historical data only
  - Do NOT implement chart animations beyond recharts defaults

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Data visualization with recharts, responsive layouts, multi-tab analytics — visual engineering domain
  - **Skills**: [`playwright`]
    - `playwright`: QA scenarios verify chart rendering and data display in browser
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Visual-engineering category covers chart/dashboard layouts

  **Parallelization**:
  - **Can Run In Parallel**: YES (after T21 completes, parallel with T22 and T23)
  - **Parallel Group**: Wave 6 (with Tasks 22, 23)
  - **Blocks**: — (no downstream tasks)
  - **Blocked By**: Tasks 11 (velocity tracking endpoints), 14 (sprint auto-planning — provides historical data), 21 (React scaffold)

  **References**:

  **Pattern References**:
  - `packages/web/src/hooks/useProjects.ts` — Created in Task 22. Follow same hook pattern for data fetching
  - `packages/web/src/components/ui/EmptyState.tsx` — Created in Task 21. Use when no sprint/velocity data exists
  - `packages/web/src/pages/ProjectDashboardPage.tsx` — Created in Task 22. Tab navigation pattern to reuse

  **API/Type References**:
  - `packages/api/src/routes/metrics.ts` — Created in Task 20. `GET /api/projects/:id/velocity` returns `Array<{sprintId, sprintName, plannedPoints, completedPoints, velocity, startDate, endDate}>` (velocity per project). Also `GET /api/metrics/projects` returns `Array<{projectName, totalSprints, avgVelocity, totalStories, avgCostPerStory, successRate}>`
  - `packages/api/src/routes/sprints.ts` — Created in Task 12. `GET /api/projects/:id/sprints/:sprintId` includes stories with state and timestamps for burndown computation

  **External References**:
  - Recharts documentation: https://recharts.org/en-US/guide
  - Recharts LineChart: https://recharts.org/en-US/api/LineChart
  - Recharts BarChart: https://recharts.org/en-US/api/BarChart
  - Recharts ResponsiveContainer: https://recharts.org/en-US/api/ResponsiveContainer

  **WHY Each Reference Matters**:
  - `routes/metrics.ts` — Velocity endpoint data shape determines bar chart config; project comparison data determines table columns
  - Recharts docs — API for chart configuration, responsive sizing, and tooltip formatting

  **Acceptance Criteria**:
  - [ ] Analytics page renders at `/projects/:id/analytics`
  - [ ] Burndown chart renders with ideal and actual lines
  - [ ] Velocity chart renders with planned vs completed bars
  - [ ] Average velocity line visible on velocity chart
  - [ ] Project metrics tab shows comparison table (ADMIN/OWNER only)
  - [ ] Empty data shows EmptyState, not broken chart
  - [ ] Charts are responsive (resize browser → charts resize)
  - [ ] `bun run --cwd packages/web build` → succeeds
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Burndown chart renders with sprint data
    Tool: Playwright (playwright skill)
    Preconditions: API running, user logged in, project with at least 1 completed sprint containing stories with state change history
    Steps:
      1. Navigate to http://localhost:5173/projects/{projectId}/analytics
      2. Assert "Sprint Burndown" tab is active by default
      3. Assert an SVG chart element is visible (recharts renders SVG)
      4. Assert chart contains at least 2 line paths (ideal + actual)
      5. Hover over a data point — assert tooltip appears with day number and story points value
      6. Take screenshot
    Expected Result: Burndown chart visible with two lines and interactive tooltips
    Failure Indicators: No SVG element, missing lines, tooltip not appearing
    Evidence: .sisyphus/evidence/task-24-burndown-chart.png

  Scenario: Velocity chart shows sprint comparison
    Tool: Playwright (playwright skill)
    Preconditions: API running, project with 3+ completed sprints with velocity data
    Steps:
      1. Navigate to analytics page
      2. Click "Velocity" tab
      3. Assert bar chart renders with bars (SVG rect elements)
      4. Assert chart contains bars for at least 3 sprints
      5. Assert average velocity line is visible (horizontal line across chart)
      6. Assert trend indicator text is visible ("↑", "↓", or "→")
    Expected Result: Bar chart with planned vs completed per sprint, average line, trend
    Failure Indicators: No bars rendered, missing average line, no trend indicator
    Evidence: .sisyphus/evidence/task-24-velocity-chart.png

  Scenario: Empty project shows EmptyState, not broken chart
    Tool: Playwright (playwright skill)
    Preconditions: API running, project with 0 completed sprints (no velocity data)
    Steps:
      1. Navigate to http://localhost:5173/projects/{emptyProjectId}/analytics
      2. Assert burndown tab shows EmptyState component (text "No sprint data" or similar), NOT a broken chart
      3. Click "Velocity" tab
      4. Assert velocity tab also shows EmptyState, NOT empty axes
    Expected Result: Graceful empty state for all chart tabs
    Failure Indicators: Broken chart rendering, JavaScript errors, empty axes with no data
    Evidence: .sisyphus/evidence/task-24-empty-analytics.png
  ```

  **Commit**: YES
  - Message: `feat(web): burndown and velocity charts with recharts analytics page`
  - Files: `packages/web/src/pages/AnalyticsPage.tsx`, `packages/web/src/hooks/useVelocity.ts`, `packages/web/src/hooks/useBurndown.ts`, `packages/web/src/hooks/useProjectMetrics.ts`, `packages/web/src/components/charts/*.tsx`
  - Pre-commit: `bun run --cwd packages/web build && tsc --noEmit`

---

### Wave 7 — CI/CD + Polish (After Wave 6)

- [ ] 25. GitHub Actions CI Pipeline

  **What to do**:
  - Create `.github/workflows/ci.yml`:
    - Trigger on: `push` to `main`, `pull_request` to `main`
    - Jobs:
      1. **typecheck** — `tsc --noEmit` (fast, catches type errors early)
      2. **test** — `bun test` (all packages, parallel with typecheck)
      3. **build-web** — `bun run --cwd packages/web build` (depends on typecheck)
      4. **build-api** — Verify `packages/api/src/index.ts` can be loaded by Bun without errors (depends on typecheck)
    - Environment:
      - Use `oven-sh/setup-bun@v2` action for Bun installation
      - Node.js not needed (Bun handles everything)
      - Bun version: pin to `1.1.x` (or match root `package.json` engines if specified)
    - Cache: `actions/cache` for `~/.bun/install/cache` (bun install cache)
    - Matrix: Not needed (single runtime — Bun)
  - Create `.github/workflows/pr-checks.yml`:
    - Trigger on: `pull_request` only
    - Jobs:
      1. **forbidden-patterns** — grep for `as any`, `@ts-ignore`, `console.log` (excluding test files), empty catch blocks
      2. **bundle-size** — Run `bun run --cwd packages/web build`, report `dist/` size in PR comment via `actions/github-script`
  - Ensure all workflow files use `bun` (not `npm` or `yarn`)
  - Test workflows pass locally using `act` or by pushing to a test branch

  **Must NOT do**:
  - Do NOT add deployment jobs (staging/prod) — CI only, not CD
  - Do NOT add Kubernetes or container registry pushes
  - Do NOT add Slack/Discord notifications
  - Do NOT add code coverage reporting (can be added later)
  - Do NOT use `npm` or `yarn` — Bun only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: YAML workflow files with well-known GitHub Actions patterns — straightforward configuration
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed
    - `git-master`: No git operations, just workflow files

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 26, 27, 28)
  - **Blocks**: — (no downstream tasks)
  - **Blocked By**: Task 3 (package scaffolding — workflows reference all packages)

  **References**:

  **Pattern References**:
  - `package.json` (root) — Workspace configuration: `"workspaces": ["packages/*"]` — workflows must install at root
  - `tsconfig.json` (root) — TypeScript config that `tsc --noEmit` uses

  **External References**:
  - Bun GitHub Action: https://github.com/oven-sh/setup-bun
  - GitHub Actions workflow syntax: https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions

  **WHY Each Reference Matters**:
  - Root `package.json` — `bun install` at root installs all workspace packages; workflow must not install per-package
  - Bun action — Correct action name and version for Bun setup

  **Acceptance Criteria**:
  - [ ] `.github/workflows/ci.yml` exists with typecheck, test, build jobs
  - [ ] `.github/workflows/pr-checks.yml` exists with forbidden-patterns and bundle-size jobs
  - [ ] All jobs use `oven-sh/setup-bun@v2`
  - [ ] No references to `npm` or `yarn`
  - [ ] YAML is valid (parseable by GitHub Actions)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: CI workflow YAML is valid
    Tool: Bash
    Preconditions: Workflow files created
    Steps:
      1. Run `bun -e "const yaml = require('js-yaml'); const fs = require('fs'); const ci = yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8')); console.log('Jobs:', Object.keys(ci.jobs).join(', ')); console.log('Valid: true')"`
      2. Assert output contains "Jobs: typecheck, test, build-web, build-api"
      3. Assert output contains "Valid: true"
      4. Repeat for pr-checks.yml
    Expected Result: Both YAML files parse correctly with expected job names
    Failure Indicators: YAML parse error, missing job names
    Evidence: .sisyphus/evidence/task-25-workflow-validation.txt

  Scenario: CI workflow uses Bun, not npm/yarn
    Tool: Bash
    Preconditions: Workflow files created
    Steps:
      1. Search `.github/workflows/ci.yml` for "npm " or "yarn " — assert 0 matches
      2. Search for "oven-sh/setup-bun" — assert at least 1 match
      3. Search for "bun install" — assert at least 1 match
      4. Search for "bun test" — assert at least 1 match
    Expected Result: Bun-only workflows, no npm/yarn references
    Failure Indicators: npm or yarn found, setup-bun missing
    Evidence: .sisyphus/evidence/task-25-bun-only.txt

  Scenario: Forbidden patterns job catches violations
    Tool: Bash
    Preconditions: pr-checks.yml created
    Steps:
      1. Parse pr-checks.yml and verify "forbidden-patterns" job exists
      2. Verify job step contains grep for "as any" (excluding test/spec files)
      3. Verify job step contains grep for "@ts-ignore"
      4. Verify job step contains grep for "console.log" in production files
    Expected Result: Forbidden pattern checks are configured for all known anti-patterns
    Failure Indicators: Missing pattern checks, overly broad grep catching test files
    Evidence: .sisyphus/evidence/task-25-forbidden-patterns.txt
  ```

  **Commit**: YES
  - Message: `ci: GitHub Actions pipeline with typecheck, test, build, and PR checks`
  - Files: `.github/workflows/ci.yml`, `.github/workflows/pr-checks.yml`
  - Pre-commit: `tsc --noEmit`

---

- [ ] 26. Docker Compose for Local Development

  **What to do**:
  - Create `docker-compose.yml` at repo root:
    - **postgres** service:
      - Image: `postgres:16-alpine`
      - Environment: `POSTGRES_USER=splinty`, `POSTGRES_PASSWORD=splinty_dev`, `POSTGRES_DB=splinty`
      - Port: `5432:5432`
      - Volume: `splinty-pgdata:/var/lib/postgresql/data` (named volume for persistence)
      - Healthcheck: `pg_isready -U splinty`
    - **api** service:
      - Build: `Dockerfile.api` (see below)
      - Port: `3000:3000`
      - Environment: `DATABASE_URL=postgres://splinty:splinty_dev@postgres:5432/splinty`, `JWT_SECRET=dev-secret-change-in-prod`, `PORT=3000`
      - Depends on: `postgres` (condition: service_healthy)
      - Volume: `./packages:/app/packages` (bind mount for hot reload in dev)
    - **web** service:
      - Build: `Dockerfile.web` (see below)
      - Port: `5173:5173`
      - Environment: `VITE_API_URL=http://localhost:3000`
      - Depends on: `api`
      - Volume: `./packages/web/src:/app/packages/web/src` (bind mount for hot reload)
    - **migrate** service (one-shot):
      - Build: same as `api`
      - Command: `bun run drizzle-kit push`
      - Depends on: `postgres` (condition: service_healthy)
      - Profiles: `["setup"]` (only runs with `docker compose --profile setup up`)
  - Create `Dockerfile.api`:
    - Base: `oven/bun:1.1-alpine`
    - Copy `package.json`, `bun.lockb`, `packages/` (excluding `packages/web`)
    - `RUN bun install --production`
    - CMD: `bun run packages/api/src/index.ts`
    - Expose: 3000
  - Create `Dockerfile.web`:
    - Base: `oven/bun:1.1-alpine`
    - Copy `packages/web/`
    - `RUN bun install`
    - CMD: `bun run --cwd packages/web dev --host 0.0.0.0`
    - Expose: 5173
  - Create `.dockerignore`:
    - `node_modules`, `.git`, `dist`, `.sisyphus`, `*.md` (except README)
  - Add scripts to root `package.json`:
    - `"dev:docker": "docker compose up -d"`
    - `"dev:docker:setup": "docker compose --profile setup up -d"`
    - `"dev:docker:down": "docker compose down"`
    - `"dev:docker:logs": "docker compose logs -f"`

  **Must NOT do**:
  - Do NOT add nginx/reverse proxy — direct port mapping only
  - Do NOT add production Dockerfile optimizations (multi-stage builds) — dev-focused
  - Do NOT add Docker Swarm or Kubernetes manifests
  - Do NOT include secrets in Dockerfiles — environment variables only
  - Do NOT add Redis or other services beyond Postgres

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Docker Compose + Dockerfiles are well-known patterns, configuration files only
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 25, 27, 28)
  - **Blocks**: — (no downstream tasks)
  - **Blocked By**: Tasks 4 (Drizzle schema — migrate service runs drizzle-kit), 8 (API scaffold — api service runs it)

  **References**:

  **Pattern References**:
  - `package.json` (root) — Workspace config and existing scripts pattern
  - `packages/api/src/index.ts` — Created in Task 8. Entry point for API service
  - `packages/db/drizzle.config.ts` — Created in Task 3/4. Drizzle config for migration service

  **External References**:
  - Bun Docker image: https://hub.docker.com/r/oven/bun
  - Docker Compose specification: https://docs.docker.com/compose/compose-file/

  **WHY Each Reference Matters**:
  - `packages/api/src/index.ts` — CMD in Dockerfile must point to exact entry file
  - `drizzle.config.ts` — Migrate service runs drizzle-kit which reads this config; DATABASE_URL must match

  **Acceptance Criteria**:
  - [ ] `docker-compose.yml` exists with postgres, api, web, migrate services
  - [ ] `Dockerfile.api` and `Dockerfile.web` exist and are valid
  - [ ] `.dockerignore` exists
  - [ ] `docker compose config` validates without errors
  - [ ] Root `package.json` has `dev:docker*` scripts

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Docker Compose config validates
    Tool: Bash
    Preconditions: Docker and docker compose installed, files created
    Steps:
      1. Run `docker compose config --quiet` — assert exit code 0
      2. Run `docker compose config --services` — assert output contains: postgres, api, web
      3. Run `docker compose config --services --profile setup` — assert output also contains: migrate
    Expected Result: All services defined and config valid
    Failure Indicators: YAML error, missing service names
    Evidence: .sisyphus/evidence/task-26-compose-validation.txt

  Scenario: Postgres container starts with healthcheck
    Tool: Bash
    Preconditions: Docker installed
    Steps:
      1. Run `docker compose up -d postgres`
      2. Wait up to 30s: `docker compose exec postgres pg_isready -U splinty`
      3. Assert exit code 0 (postgres is ready)
      4. Run `docker compose exec postgres psql -U splinty -c "SELECT 1"` — assert "1 row"
      5. Run `docker compose down`
    Expected Result: Postgres starts, passes healthcheck, accepts queries
    Failure Indicators: Container crash, healthcheck timeout, connection refused
    Evidence: .sisyphus/evidence/task-26-postgres-health.txt

  Scenario: Dockerfiles build without errors
    Tool: Bash
    Preconditions: All source files exist from previous tasks
    Steps:
      1. Run `docker compose build api` — assert exit code 0
      2. Run `docker compose build web` — assert exit code 0
      3. Assert no "error" or "failed" in build output (case-insensitive)
    Expected Result: Both images build successfully
    Failure Indicators: Build errors, missing dependencies, COPY failures
    Evidence: .sisyphus/evidence/task-26-docker-build.txt
  ```

  **Commit**: YES
  - Message: `chore: Docker Compose for local dev with Postgres, API, and Web`
  - Files: `docker-compose.yml`, `Dockerfile.api`, `Dockerfile.web`, `.dockerignore`, `package.json` (scripts only)
  - Pre-commit: `docker compose config --quiet`

---

- [ ] 27. Security Scanning Integration

  **What to do**:
  - Create `packages/agents/src/security-scanner.ts` — **NOT a new agent class** — a utility function callable by existing QA pipeline:
    - `scanCodeForVulnerabilities(files: string[], workspacePath: string): Promise<SecurityReport>`
    - Uses static analysis patterns (NO external SAST tool dependencies — pure TypeScript analysis):
      - **Secret detection**: regex patterns for API keys, passwords, tokens, AWS credentials in source files
      - **SQL injection**: detect raw string interpolation in SQL queries (template literals with `${}` inside SQL-like strings)
      - **Path traversal**: detect unvalidated path concatenation (user input + path.join without sanitization)
      - **Insecure crypto**: detect `Math.random()` for security purposes, weak hash algorithms (md5, sha1 for passwords)
      - **Dependency audit**: `bun audit` (or `npm audit --json`) — parse output for high/critical vulnerabilities
    - Returns `SecurityReport`:
      ```
      { findings: Array<{ severity: 'critical' | 'high' | 'medium' | 'low', category: string, file: string, line: number, description: string, recommendation: string }>, summary: { critical: number, high: number, medium: number, low: number } }
      ```
  - Create `packages/api/src/routes/security.ts`:
    - `POST /api/projects/:id/security-scan` (requires ADMIN role) — triggers scan on project workspace, returns SecurityReport
    - `GET /api/projects/:id/security-report` — returns latest scan result (stored in DB via audit log)
  - Create `packages/api/src/services/security-scanner.service.ts`:
    - Wraps the scanner utility, stores results, integrates with audit trail
  - Add tests for scanner patterns (test each detection category with positive and negative cases)
  - Register scanner in audit trail (scan started, scan completed, findings count)

  **Must NOT do**:
  - Do NOT create a new Agent class — this is a utility, not a pipeline agent
  - Do NOT modify the orchestrator pipeline or agent sequence
  - Do NOT add external SAST tools (Semgrep, Snyk, etc.) as dependencies
  - Do NOT block PRs based on scan results — advisory only
  - Do NOT scan at build time — on-demand API endpoint only
  - Do NOT add DAST (runtime) scanning — static analysis only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Regex-based vulnerability detection patterns require careful implementation to avoid false positives/negatives
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 25, 26, 28)
  - **Blocks**: — (no downstream tasks)
  - **Blocked By**: Tasks 8 (API scaffold), 5 (repositories — for storing scan results)

  **References**:

  **Pattern References**:
  - `packages/agents/src/qa-engineer.ts` — Existing QA agent. Scanner utility follows similar review-and-report pattern. Study how `QAEngineerAgent.execute()` processes files and returns findings
  - `packages/api/src/routes/audit.ts` — Created in Task 15. Follow audit trail pattern for recording scan events
  - `packages/core/src/workspace.ts` — `WorkspaceManager.listFiles()` pattern for finding files to scan

  **API/Type References**:
  - `packages/core/src/types.ts` — No existing SecurityReport type. Create new Zod schema in this task
  - `packages/db/src/repositories/audit.repo.ts` — Created in Task 5. Use `append()` for scan audit events

  **External References**:
  - OWASP Top 10: https://owasp.org/www-project-top-ten/ — Categories guide what to scan for
  - Bun security audit: `bun audit` command (if available, else fall back to `npm audit --json`)

  **WHY Each Reference Matters**:
  - `qa-engineer.ts` — Scanner follows same "analyze files → produce findings" pattern as QA agent
  - `audit.repo.ts` — Scan results must be persisted via audit trail for compliance
  - OWASP — Vulnerability categories prioritized by real-world risk

  **Acceptance Criteria**:
  - [ ] `packages/agents/src/security-scanner.ts` exports `scanCodeForVulnerabilities`
  - [ ] Scanner detects: secrets, SQL injection, path traversal, insecure crypto, dependency vulns
  - [ ] `POST /api/projects/:id/security-scan` returns SecurityReport
  - [ ] `GET /api/projects/:id/security-report` returns latest scan
  - [ ] Scan events recorded in audit trail
  - [ ] `bun test packages/agents` → PASS (scanner tests)
  - [ ] `bun test packages/api` → PASS (endpoint tests)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Scanner detects hardcoded secrets
    Tool: Bash
    Preconditions: Scanner utility exists
    Steps:
      1. Create temp file with content: `const API_KEY = "AKIAIOSFODNN7EXAMPLE"` (fake AWS key pattern)
      2. Run scanner on temp file via test: `bun test packages/agents/src/security-scanner.test.ts --filter "secret detection"`
      3. Assert test passes and finding has severity "critical", category "secret-detection"
      4. Clean up temp file
    Expected Result: Scanner finds hardcoded AWS key pattern with critical severity
    Failure Indicators: No finding, wrong severity, false negative
    Evidence: .sisyphus/evidence/task-27-secret-detection.txt

  Scenario: Scanner does NOT flag false positives on safe patterns
    Tool: Bash
    Preconditions: Scanner utility exists
    Steps:
      1. Create temp file with safe code: `const key = process.env.API_KEY` (env var reference, not hardcoded)
      2. Run scanner on temp file
      3. Assert 0 findings for "secret-detection" category
    Expected Result: No false positives on environment variable references
    Failure Indicators: False positive finding on env var usage
    Evidence: .sisyphus/evidence/task-27-no-false-positive.txt

  Scenario: Security scan API endpoint returns report
    Tool: Bash
    Preconditions: API running, project exists with files in workspace
    Steps:
      1. POST /api/projects/{projectId}/security-scan with admin token
      2. Assert response 200 with body containing: `findings` (array), `summary` (object with critical/high/medium/low counts)
      3. GET /api/projects/{projectId}/security-report
      4. Assert response matches the scan result from step 2
    Expected Result: Scan completes, report stored and retrievable
    Failure Indicators: 500 error, empty findings when vulnerabilities exist, report not persisted
    Evidence: .sisyphus/evidence/task-27-scan-api.txt
  ```

  **Commit**: YES
  - Message: `feat(agents): security scanning utility with API endpoint`
  - Files: `packages/agents/src/security-scanner.ts`, `packages/agents/src/security-scanner.test.ts`, `packages/api/src/routes/security.ts`, `packages/api/src/services/security-scanner.service.ts`
  - Pre-commit: `bun test packages/agents && bun test packages/api && tsc --noEmit`

---

- [ ] 28. Executive Reporting Endpoint

  **What to do**:
  - Create `packages/api/src/services/executive-report.ts`:
    - `ExecutiveReportGenerator` class:
      - `generateProjectReport(projectId, orgId): Promise<ProjectReport>`:
        - Project overview: name, description, created date, total epics, total stories
        - Sprint history: list of sprints with status, start/end dates, velocity, stories completed
        - Current sprint status: active sprint name, progress percentage, stories in progress, estimated completion
        - Story breakdown: count by state (RAW, REFINED, SPRINT_READY, IN_PROGRESS, DONE, etc.)
        - Velocity trend: last 5 sprints avg velocity, trend direction
        - Cost summary: total cost, avg cost per story, cost trend
        - Risk indicators: stories blocked, overdue sprints, velocity declining
      - `generateOrgReport(orgId): Promise<OrgReport>`:
        - Organization overview: name, project count, total users
        - Per-project summaries (compact): name, health status (GREEN/YELLOW/RED based on velocity trend + blocked stories), active sprint, completion percentage
        - Aggregate metrics: total stories delivered, avg velocity, total cost
        - Top risks across all projects
      - Health status computation:
        - GREEN: velocity stable or increasing, no blocked stories, sprint on track
        - YELLOW: velocity declining OR 1-2 blocked stories OR sprint slightly behind
        - RED: velocity significantly declining AND blocked stories AND sprint significantly behind
  - Create `packages/api/src/routes/reports.ts`:
    - `GET /api/projects/:id/report` — project executive report (requires AUDIT_READ or ADMIN)
    - `GET /api/reports/org` — org-wide executive report (requires ADMIN or OWNER)
  - Use data from `MetricsAggregator` (Task 20), `VelocityRepository` (Task 11), `SprintRepository` (Task 5), `StoryRepository` (Task 5)
  - Add tests with mock data verifying health status computation logic

  **Must NOT do**:
  - Do NOT generate PDF/HTML reports — JSON API only
  - Do NOT add scheduled report generation (cron) — on-demand only
  - Do NOT add email delivery of reports
  - Do NOT add AI-generated natural language summaries — structured data only
  - Do NOT implement report caching — computed fresh on each request

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Business logic for health status computation, risk indicators, and multi-source data aggregation requires careful implementation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 7 (with Tasks 25, 26, 27)
  - **Blocks**: — (no downstream tasks)
  - **Blocked By**: Task 20 (cross-project metrics — reuses MetricsAggregator)

  **References**:

  **Pattern References**:
  - `packages/api/src/services/metrics-aggregator.ts` — Created in Task 20. Reuse `MetricsAggregator` methods for aggregate data; extend with health status logic
  - `packages/api/src/routes/metrics.ts` — Created in Task 20. Follow same route pattern for report endpoints

  **API/Type References**:
  - `packages/db/src/repositories/velocity.repo.ts` — Created in Task 11. Use `getByProject()` for velocity trend data
  - `packages/db/src/repositories/sprint.repo.ts` — Created in Task 5. Use `getActive()` for current sprint, `listByProject()` for sprint history
  - `packages/db/src/repositories/story.repo.ts` — Created in Task 5. Use `listByProject()` with state filter for story breakdown
  - `packages/core/src/types.ts:10-22` — `StoryState` enum — use for story breakdown categories

  **WHY Each Reference Matters**:
  - `MetricsAggregator` — Reuse existing aggregation logic; don't duplicate velocity/cost computation
  - `velocity.repo.ts` — Source data for velocity trend and health status computation
  - `StoryState` enum — Breakdown categories must use exact enum values

  **Acceptance Criteria**:
  - [ ] `GET /api/projects/:id/report` returns ProjectReport JSON
  - [ ] `GET /api/reports/org` returns OrgReport JSON
  - [ ] Health status computed correctly (GREEN/YELLOW/RED)
  - [ ] Risk indicators identify blocked stories and declining velocity
  - [ ] Both endpoints are role-restricted (AUDIT_READ/ADMIN)
  - [ ] `bun test packages/api` → PASS (report tests)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Project report returns comprehensive data
    Tool: Bash
    Preconditions: API running, project with 3 completed sprints, 1 active sprint, stories in various states
    Steps:
      1. GET /api/projects/{projectId}/report with admin token
      2. Assert response 200
      3. Assert response contains: projectOverview (name, totalEpics, totalStories), sprintHistory (array with 3+ entries), currentSprint (with progress percentage), storyBreakdown (counts by state), velocityTrend (last5SprintsAvg, direction), costSummary (totalCost, avgCostPerStory)
      4. Assert healthStatus is one of: "GREEN", "YELLOW", "RED"
    Expected Result: Complete project report with all sections populated
    Failure Indicators: Missing sections, null values, incorrect health status
    Evidence: .sisyphus/evidence/task-28-project-report.txt

  Scenario: Org report aggregates across projects
    Tool: Bash
    Preconditions: API running, org with 2+ projects
    Steps:
      1. GET /api/reports/org with owner token
      2. Assert response contains: orgOverview (name, projectCount), projectSummaries (array with per-project health status), aggregateMetrics (totalStoriesDelivered, avgVelocity, totalCost)
      3. Assert each projectSummary has: name, healthStatus, activeSprint, completionPercentage
    Expected Result: Org-wide report with per-project health summaries
    Failure Indicators: Missing projects, no health status, aggregate math errors
    Evidence: .sisyphus/evidence/task-28-org-report.txt

  Scenario: Health status correctly identifies RED condition
    Tool: Bash
    Preconditions: API running, project with declining velocity (each sprint lower than previous) AND blocked stories
    Steps:
      1. GET /api/projects/{troubledProjectId}/report
      2. Assert healthStatus is "RED"
      3. Assert riskIndicators contains entries for: declining velocity, blocked stories
    Expected Result: Troubled project correctly flagged as RED with risk details
    Failure Indicators: Health status GREEN or YELLOW for a clearly troubled project
    Evidence: .sisyphus/evidence/task-28-health-red.txt
  ```

  **Commit**: YES
  - Message: `feat(api): executive reporting with health status and risk indicators`
  - Files: `packages/api/src/services/executive-report.ts`, `packages/api/src/routes/reports.ts`
  - Pre-commit: `bun test packages/api && tsc --noEmit`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real QA** — `unspecified-high` (+ `playwright` skill for UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `fix(integrations): complete Jira integration QA` + `refactor(core): introduce StorageAdapter interface` + `chore: scaffold db, api, web packages`
- **Wave 2**: `feat(db): add Drizzle schema and repository implementations` + `refactor(core): filesystem adapter for StorageAdapter` + `feat(core): add Epic and Roadmap types`
- **Wave 3**: `feat(api): REST API scaffold with Bun.serve` + `feat(api): JWT auth and RBAC middleware` + `feat(db): velocity tracking tables`
- **Wave 4**: `feat(api): Epic/Story CRUD endpoints` + `feat(api): roadmap import` + `feat(api): sprint auto-planning` + `feat(api): audit trail and webhooks`
- **Wave 5**: `feat(db): multi-tenant org model` + `feat(api): SSE streaming` + `refactor(cli): use API client` + `feat(api): cross-project metrics`
- **Wave 6**: `feat(web): React scaffold and auth` + `feat(web): project dashboard` + `feat(web): sprint viewer` + `feat(web): burndown charts`
- **Wave 7**: `ci: GitHub Actions pipeline` + `chore: Docker Compose setup` + `feat(agents): security scanning integration` + `feat(api): executive reports`

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
bun test                              # Expected: 800+ tests pass

# Type check clean
tsc --noEmit                          # Expected: 0 errors

# API health
curl -s localhost:3000/api/health     # Expected: {"status":"ok"}

# Auth flow
curl -s -X POST localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"email":"test@test.com","password":"Test1234!","name":"Test User"}'
# Expected: 201 with JWT token

# Epic CRUD
curl -s -H "Authorization: Bearer $TOKEN" localhost:3000/api/epics
# Expected: 200 with array

# Sprint execution streaming
curl -N -H "Authorization: Bearer $TOKEN" localhost:3000/api/sprints/S1/stream
# Expected: text/event-stream with execution events

# CLI still works
bun run packages/cli/src/index.ts run --source file --input docs/backlog.yaml --project test
# Expected: Pipeline executes (exit 0 or 1)

# Web UI loads
# Playwright: navigate to localhost:5173, assert login page renders
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass (800+)
- [ ] API endpoints respond correctly
- [ ] Web UI renders and is interactive
- [ ] CLI backwards compatible
- [ ] Jira write-back verified
- [ ] CI pipeline runs on push
