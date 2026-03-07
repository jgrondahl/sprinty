# Splinty Enterprise Evolution Roadmap

From isolated single-story code generation to building full sophisticated enterprise applications.

---

## Current State

Splinty runs a linear pipeline per story: BusinessOwner → ProductOwner → Architect → Developer → QA → TechnicalWriter → PR. Each story runs in complete isolation. This works well for generating standalone, single-purpose applications from a user story, but it cannot build multi-file, multi-service enterprise systems where stories build on each other.

### Hard Constraints Requiring Redesign

| Constraint | Impact |
|---|---|
| **Single-story isolation** | Workspace is keyed by `(projectId, storyId)`. Agents cannot see files from other stories. |
| **No code execution** | Developer writes files; QA reads source but never compiles or runs tests. Generated code may not actually work. |
| **Linear hardcoded pipeline** | No conditional routing, no parallel story execution, no dynamic agent selection. |
| **No incremental editing** | Every file is generated from scratch. Modifying an existing file means regenerating it entirely, risking regressions. |
| **No persistent project memory** | The ledger tracks `ID | Title | State | Agent | Date` as a markdown table. No record of what was built, which files exist, or what decisions were made. |
| **Unstructured stateOfWorld** | `Record<string, string>` — no type safety, no schema, no validation. |

### Extension Points That Don't Require Redesign

These work today and scale naturally: new LLM providers, new story source connectors (Jira, GitHub, file), custom `stateOfWorld` fields, git factory injection, per-persona model overrides.

---

## Phase 1: Sandbox Execution + Incremental Editing

**Goal**: Generated code actually compiles and passes tests.

**Timeline**: 1–2 weeks

**Why this is first**: Without code execution, Splinty is a sophisticated text generator. The compile→test→fix loop is the single highest-leverage capability to add — it transforms output quality from "plausible code" to "working code."

### 1.1 Sandbox Environment

Create a `SandboxEnvironment` interface in `@splinty/core`:

```typescript
interface SandboxEnvironment {
  init(config: SandboxConfig): Promise<void>;
  execute(command: string, opts?: ExecOpts): Promise<SandboxResult>;
  writeFile(path: string, content: string): Promise<void>;
  readFile(path: string): Promise<string>;
  cleanup(): Promise<void>;
}

interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: string;
  resourceUsage?: ResourceUsage;      // populated when resource monitoring is available
  resourceLimitViolation?: ResourceLimitViolation;  // populated when a limit was exceeded
}

interface ResourceUsage {
  peakCpuPercent: number;
  peakMemoryMb: number;
  diskUsageMb: number;
}

interface ResourceLimitViolation {
  limit: 'cpu' | 'memory' | 'runtime' | 'disk';
  configured: number;            // the configured limit value
  actual: number;                // the actual value that exceeded the limit
  description: string;           // human-readable description
}

interface SandboxConfig {
  image: string;              // e.g. "node:20-slim", "python:3.12-slim"
  timeoutMs: number;          // per-command timeout
  memoryLimitMb: number;      // container memory cap
  cpuLimit: number;           // CPU shares
  networkEnabled: boolean;    // false by default
  workDir: string;
  maxDiskMb?: number;         // filesystem quota (default: 500MB)
}
```

**Implementation**: Docker-based (one container per story execution). Use the Docker Engine API directly via `dockerode` or shell out to `docker run`. No Kubernetes, no E2B — keep it local and simple.

**Security defaults**:
- Network disabled by default (allowlist specific registries for `npm install` if needed)
- CPU and memory cgroups enforced
- Filesystem restricted to the workspace mount
- Command timeout kills the container

**Resource limit enforcement**: Generated code can produce runaway processes, infinite loops, or excessive memory consumption. The sandbox must enforce all configured limits via Docker cgroups and return structured telemetry when violations occur:

| Limit | Enforcement | On Violation |
|---|---|---|
| `timeoutMs` | Docker `--stop-timeout`; process kill after timeout | Return `exitCode: 137`, populate `resourceLimitViolation` with `limit: 'runtime'` |
| `memoryLimitMb` | Docker `--memory` flag | Container OOM-killed; return `exitCode: 137`, populate violation with `limit: 'memory'` |
| `cpuLimit` | Docker `--cpus` flag | Throttled (not killed); `resourceUsage.peakCpuPercent` reflects actual usage |
| `maxDiskMb` | Docker `--storage-opt size` or tmpfs limit | Write fails inside container; populate violation with `limit: 'disk'` |

When a `ResourceLimitViolation` is returned, the Developer agent receives it as structured context in the next retry. If the same resource limit is violated across 2+ retries on the same task, this becomes a `sandbox-constraint` revision trigger (see Architecture Revision Loop) — the architectural approach may need to change (e.g., streaming instead of batch processing, async workers instead of synchronous handlers).

### 1.2 Developer Agent → Sandbox Integration

The Developer agent's workflow becomes:

1. Generate code files (as today)
2. Write files into the sandbox
3. Run `npm install` / `pip install` (dependency installation)
4. Run `npm run build` / `tsc` (compilation)
5. Run `npm test` / `pytest` (tests)
6. Capture `SandboxResult` for each command
7. If any command fails → include stdout/stderr in the handoff as structured error context

The existing QA rework loop (`FAIL` → Developer retry, up to 3 cycles) handles the fix cycle naturally. The difference: Developer now gets **actual compiler errors and test failures** instead of QA's subjective assessment of source code.

### 1.3 QA Agent Enhancement

QA receives structured test output:

```typescript
interface QAInput {
  // existing fields...
  sandboxResults: {
    build: SandboxResult;
    test: SandboxResult;
    commands: SandboxResult[];  // any additional commands
  };
}
```

QA's verdict becomes grounded in **real test outcomes** rather than static code review. QA can still flag design concerns, but `PASS`/`FAIL` should primarily reflect whether the code compiles and tests pass.

### 1.4 Incremental Editing

When modifying existing files (not first-time generation), the Developer agent produces **unified diff patches** instead of full file content:

```diff
--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -15,7 +15,9 @@
 export async function login(email: string, password: string) {
   const user = await findUserByEmail(email);
-  if (!user) throw new Error('Not found');
+  if (!user) {
+    throw new AuthenticationError('Invalid credentials');
+  }
   const valid = await bcrypt.compare(password, user.passwordHash);
```

**Why unified diff over SEARCH/REPLACE**: SEARCH/REPLACE requires the LLM to produce exact-match anchor text, which is brittle under formatting changes or when the LLM hallucinates whitespace. Unified diffs are a well-understood format that can be applied and verified deterministically with `patch`.

**Fallback strategy**: If patch application fails (context mismatch), fall back to targeted full-file regeneration for that specific file, then re-run build/tests.

### 1.5 Resume Points

Add `ResumePoint` support to the orchestrator so a failed pipeline can resume mid-execution without re-running earlier agents:

```typescript
interface ResumePoint {
  storyId: string;
  lastCompletedStep: AgentPersona;
  handoffId: string;        // handoff document to resume from
  timestamp: string;
}
```

Each agent step writes a typed output artifact. On resume, the orchestrator skips to the next step after `lastCompletedStep` and loads the saved handoff.

**Why now**: The compile→fix loop means stories take longer and involve multiple iterations. Restarting from scratch after a mid-pipeline failure wastes significant time and LLM tokens.

### 1.6 Supported Workflows (Initially)

Keep the sandbox scope tight. Support exactly these commands per stack:

| Stack | Install | Build | Test |
|---|---|---|---|
| Node/TypeScript | `npm install` | `npm run build` | `npm test` |
| Python | `pip install -r requirements.txt` | *(none)* | `pytest` |

Add more stacks later. Avoid "smart" test selection, parallel test runs, or coverage analysis in Phase 1.

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Docker dependency** | Make `SandboxEnvironment` an interface; production uses Docker, tests use a mock. CI can use Docker-in-Docker or a pre-built image. |
| **Sandbox startup latency** | Cache base images; use `--rm` containers (not persistent); pre-pull images during `splinty init`. |
| **LLM generates non-deterministic tests** | Instruct the Developer agent prompt to generate deterministic tests. If tests are flaky, add retry policy + flake detection (test passes on re-run = flaky, quarantine it). |
| **Resource abuse from generated code** | Enforce cgroups/ulimits; kill container on timeout; log resource usage per run. |

### Definition of Done

- [ ] `SandboxEnvironment` interface in `@splinty/core` with Docker implementation
- [ ] `SandboxResult` includes `ResourceUsage` and `ResourceLimitViolation` fields
- [ ] Resource limits enforced via Docker cgroups (CPU, memory, disk, runtime)
- [ ] Developer agent writes files → runs build/tests → captures structured results including resource telemetry
- [ ] QA agent receives `SandboxResult` data in handoff
- [ ] Incremental editing via unified diff for file modifications
- [ ] `ResumePoint` saves/loads mid-pipeline state
- [ ] All existing tests still pass; new tests cover sandbox, diff, resume, and resource limits
- [ ] End-to-end: a story that generates a Node.js app compiles and passes its own tests

---

## Infrastructure: Tool Runtime & Observability

These two cross-cutting capabilities are **shared infrastructure** consumed by all subsystems and phases. They are not standalone features — they provide the deterministic execution layer and telemetry backbone that the sandbox, enforcement, revision loop, and project memory depend on.

**Timeline**: Built alongside Phase 1. Tool Runtime wraps the existing `WorkspaceManager` API first; telemetry hooks into sandbox and enforcement as they're implemented.

### Tool Runtime Abstraction

**Problem**: Agents currently interact with the filesystem and execution environment through `this.workspaceManager.writeFile()` and similar direct calls. This makes auditing difficult, debugging opaque in long-running systems, and reproducibility impossible. In a system where multiple agents, the enforcer, and the sandbox all mutate state, every mutation must be traceable.

**Solution**: Agents interact with the environment exclusively through deterministic **tools**. Every tool invocation produces an execution log entry.

#### Tool Interface

```typescript
interface AgentTool<TInput, TOutput> {
  name: string;
  execute(input: TInput): Promise<TOutput>;
}

interface ExecutionLogEntry {
  entryId: string;
  agentPersona: AgentPersona;
  taskId?: string;                // which ImplementationTask (if in planned-sprint mode)
  toolName: string;
  input: Record<string, unknown>; // redacted — see retention policy
  output: Record<string, unknown>;
  timestamp: string;
  durationMs: number;
}
```

#### Core Tools

| Tool | Operations | Used By |
|---|---|---|
| `FileSystemTool` | `createFile`, `readFile`, `patchFile`, `deleteFile`, `listFiles` | Developer, TechnicalWriter, IntegrationTasks |
| `GitTool` | `createBranch`, `commit`, `diffFiles`, `openPullRequest` | Orchestrator, Developer |
| `SandboxTool` | `executeCommand`, `installDeps`, `runBuild`, `runTests` | Developer, QA |

#### Migration Strategy (Adapter-First)

The migration preserves the `BaseAgent` + `WorkspaceManager` API surface. No agent code changes in Phase 1.

**Phase 1**: Introduce `ToolBackedWorkspaceManager` — an adapter that implements the existing `WorkspaceManager` interface but routes all file operations through `FileSystemTool` and records `ExecutionLogEntry` for each call. Agents continue calling `this.workspaceManager.writeFile()` — they don't know the implementation changed.

```typescript
class ToolBackedWorkspaceManager implements WorkspaceManager {
  constructor(
    private readonly fsTool: FileSystemTool,
    private readonly logger: ExecutionLogger,
  ) {}

  writeFile(ws: WorkspaceState, path: string, content: string): void {
    this.fsTool.execute({ operation: 'createFile', path, content });
    this.logger.record({
      toolName: 'FileSystemTool',
      input: { operation: 'createFile', path, contentLength: content.length },
      output: { success: true },
      // ... other fields
    });
  }

  // ... other WorkspaceManager methods delegated similarly
}
```

**Phase 2**: Agents that need explicit tool access (e.g., Developer running sandbox commands) receive tools via constructor injection. The `BaseAgent` class gains an optional `tools` parameter.

**Phase 3**: Remove direct FS code paths; `ToolBackedWorkspaceManager` becomes the only implementation.

#### Retention & Redaction Policy

Execution logs can leak secrets (API keys in config files, credentials in environment variables). The logger applies a simple redaction policy:

- File content is **not** logged — only file path + content length
- Environment variables are **never** logged
- Sandbox command output is truncated to 10KB per entry
- Logs are stored per-sprint in `.splinty/{projectId}/logs/sprint-{sprintId}.jsonl`
- Retention: last 5 sprints by default (configurable)

### Observability & Telemetry

**Problem**: Build and test results are currently captured in isolation. There is no consolidated view of system behavior across a full sprint run. Autonomous development systems require complete traceability — architectural drift, runtime inefficiencies, and execution failures must be visible rather than hidden.

**Solution**: A unified `RunTelemetry` schema that aggregates metrics from the enforcement layer, task execution, sandbox runs, and architecture revisions.

#### RunTelemetry Schema

```typescript
interface RunTelemetry {
  runId: string;
  sprintId: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed' | 'halted';

  architecture: ArchitectureMetrics;
  execution: ExecutionMetrics;
  sandbox: AggregateSandboxTelemetry;
  cost: CostMetrics;             // merged from Phase 3's cost tracking
}

interface ArchitectureMetrics {
  planId: string;
  revisionCount: number;
  moduleBoundaryViolations: number;
  dependencyViolations: number;
  technologyViolations: number;
  driftScore: number;            // 0.0 = perfect compliance, 1.0 = total drift
  constraintsSatisfied: number;
  constraintsTotal: number;
}

interface ExecutionMetrics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  blockedTasks: number;
  totalRetries: number;
  architectureRevisions: number;
  averageTaskDurationMs: number;
  totalDurationMs: number;
}

interface AggregateSandboxTelemetry {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  resourceLimitViolations: number;
  peakCpuPercent: number;
  peakMemoryMb: number;
  totalDiskUsageMb: number;
  totalSandboxRuntimeMs: number;
}

interface CostMetrics {
  llmCalls: number;
  totalTokens: { input: number; output: number };
  estimatedCostUsd: number;
  costPerStory: Record<string, number>;  // storyId → USD
  costPerAgent: Record<string, number>;  // AgentPersona → USD
}
```

#### Telemetry Collection Points

| Source | What It Reports | When |
|---|---|---|
| `ArchitectureEnforcer` | Violation counts, drift score, compliance metrics | After each enforcement pass |
| `SandboxEnvironment` | CPU, memory, disk, runtime, exit codes | After each sandbox execution |
| Orchestrator | Task completion/failure/block counts, retry counts | After each task lifecycle event |
| `ArchitecturePlannerAgent` | Revision triggers, plan version changes | After each revision |
| LLM client wrapper | Token counts, call duration, model used | After each LLM call |

#### Storage & Access

- Telemetry is stored per-sprint: `.splinty/{projectId}/telemetry/sprint-{sprintId}.json`
- Exposed via CLI: `splinty status --metrics` (current sprint) and `splinty status --metrics --sprint={id}` (historical)
- Drift score trending: `splinty status --drift` shows drift score across recent sprints

#### Relationship to Phase 3 Observability

This infrastructure provides the **foundational telemetry layer**. Phase 3's "Observability & Cost Tracking" section (3.6) builds on it with enterprise-grade additions: cost attribution per story/agent, trace correlation across multi-service runs, metric export to external systems, and configurable retention policies.

### Infrastructure Definition of Done

- [ ] `AgentTool` interface with `FileSystemTool`, `GitTool`, `SandboxTool` implementations
- [ ] `ToolBackedWorkspaceManager` adapter wrapping `WorkspaceManager` API
- [ ] `ExecutionLogEntry` recording for all tool invocations
- [ ] Redaction policy applied to execution logs
- [ ] `RunTelemetry` schema with collection hooks in enforcer, sandbox, and orchestrator
- [ ] `splinty status --metrics` CLI command
- [ ] Log storage in `.splinty/{projectId}/logs/` with configurable retention
- [ ] All existing tests still pass (adapter is transparent to agents)

---

## Foundation: Prerequisite Subsystems

Before Phase 2 can be built, four foundational subsystems must be designed and implemented. The first three address the fundamental assumption in the current architecture: that stories are isolated units. Enterprise applications require coherent architecture *across* stories — consistent tech stack, shared modules, and enforced boundaries. The fourth provides a controlled mechanism for revising the architecture when execution reveals problems.

These four subsystems transform the pipeline from story-centric to architecture-centric execution.

### Pipeline Transformation

```
CURRENT:
  stories[] → [per-story: BizOwner → PO → Architect → Dev → QA → TW → PR]

PROPOSED:
  stories[] → [per-story: BizOwner → PO]
            → ArchPlanner(all refined stories)
            → TaskDecomposer(plan + stories)
            → [per-task: Dev → Enforcer → QA]
            → [per-story: TW → PR]
```

### Backward Compatibility

The four subsystems are **additive**. Existing single-story mode continues to work via a mode flag:

```typescript
interface OrchestratorConfig {
  // ... existing fields ...
  executionMode: 'story' | 'planned-sprint';  // default: 'story'
}
```

In `story` mode, the orchestrator behaves exactly as today. In `planned-sprint` mode, the four subsystems activate. This means no breaking changes to the existing pipeline.

The `HandoffDocument` schema extends additively — new optional typed fields alongside the existing `stateOfWorld`:

```typescript
// Extended HandoffDocument (backward compatible)
interface HandoffDocument {
  // ... existing fields (unchanged) ...
  stateOfWorld: Record<string, string>;   // kept for human-readable breadcrumbs

  // NEW: typed artifact references (all optional)
  architecturePlan?: ArchitecturePlanRef;
  sprintTaskPlan?: SprintTaskPlanRef;
  task?: ImplementationTaskRef;
  enforcementReport?: EnforcementReport;
}
```

Schema versioning ensures old runs still deserialize.

---

### Subsystem 1: Architecture Planning Layer

**Problem**: Each story gets its own Architect pass that knows nothing about other stories. Story 1 might choose Express+PostgreSQL while Story 2 chooses Fastify+MongoDB for the same project.

**When it runs**: ONCE per sprint batch, AFTER per-story BizOwner + PO refinement, BEFORE any task execution.

**New agent**: `ArchitecturePlannerAgent` (extends BaseAgent). NOT the same as the existing Architect. The existing `ArchitectAgent` becomes a "story-level architect" that designs implementation details WITHIN the constraints set by the planner.

#### Multi-Pass Design

A single LLM call producing the full plan is unreliable — too much output, too many coupled decisions. The planner runs as **three sequential LLM passes** with deterministic validation between each:

**Pass A — Story Fact Extraction** (can run in parallel per story):
- Normalize each refined story into: `{ domain, nouns, verbs, externalIntegrations, dataEntities, endpoints, nonFunctionals }`
- This compresses story context and makes Pass B's input consistent

**Pass B — Global Architecture Synthesis** (single call, all story facts as input):
- Propose `techStack`, `modules` with `exposedInterfaces`, and module dependency graph
- This is the core creative decision — which modules exist, what each module's boundary is

**Pass C — Mechanizable Outputs** (single call, modules + stories as input):
- Produce `storyModuleMapping`, `executionOrder`, and `constraints` expressed as structural rules
- Constraints must be machine-checkable (import path rules, allowed deps, required exports)

**Deterministic validation** runs after each pass:
- Schema validation (Zod)
- Acyclic dependency graph check
- Every story mapped to at least one module
- Every module has at least one owning story
- Every `exposedInterface` has an owning task slot

#### ArchitecturePlan Schema

```typescript
interface ArchitecturePlan {
  planId: string;
  schemaVersion: number;        // for forward compatibility
  projectId: string;
  sprintId: string;
  supersedesPlanId?: string;    // if this replaces a prior plan
  createdAt: string;

  techStack: TechStackDecision;
  modules: ModuleDefinition[];
  storyModuleMapping: StoryModuleMapping[];
  executionOrder: ExecutionGroup[];
  decisions: ArchitectureDecision[];
  constraints: ArchitectureConstraint[];
}

interface TechStackDecision {
  language: string;             // e.g. "TypeScript"
  runtime: string;              // e.g. "Node.js 20"
  framework: string;            // e.g. "Express"
  database?: string;            // e.g. "PostgreSQL"
  testFramework: string;        // e.g. "Vitest"
  buildTool: string;            // e.g. "tsc"
  rationale: string;
}

interface ModuleDefinition {
  name: string;                 // e.g. "auth", "payments", "api-gateway"
  description: string;
  responsibility: string;       // single-responsibility statement
  directory: string;            // e.g. "src/modules/auth"
  exposedInterfaces: string[];  // public API surface (exported symbols)
  dependencies: string[];       // other module names this depends on
  owningStories: string[];      // storyIds that contribute to this module
}

interface StoryModuleMapping {
  storyId: string;
  modules: string[];            // module names this story touches
  primaryModule: string;        // the main module this story is about
  estimatedFiles: string[];     // files this story will create/modify
}

interface ExecutionGroup {
  groupId: number;              // execution order (1 = first)
  storyIds: string[];           // stories in this group
  rationale: string;
  dependsOn: number[];          // group IDs that must complete first
}

interface ArchitectureDecision {
  id: string;                   // e.g. "ADR-001"
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: 'accepted' | 'proposed' | 'superseded';
}

interface ArchitectureConstraint {
  id: string;
  type: 'dependency' | 'naming' | 'pattern' | 'boundary' | 'technology';
  description: string;          // human-readable
  rule: string;                 // machine-checkable rule (see Enforcement Layer)
  severity: 'error' | 'warning';
}
```

#### Integration

1. `SprintOrchestrator.run(stories[])` runs per-story BizOwner + PO first
2. Calls `ArchitecturePlannerAgent.execute(refinedStories, projectMemory)` 
3. Saves `ArchitecturePlan` to project workspace as a versioned artifact
4. Plan is injected into every subsequent handoff via the typed `architecturePlan` field
5. The existing `ArchitectAgent` (per-story) designs implementation within plan constraints

#### Plan Evolution Across Sprints

When a prior `ArchitecturePlan` exists (from a previous sprint), the planner receives it as input and must:
- **Extend** existing modules (add new interfaces, new stories) — the default
- **Supersede** decisions only when explicitly justified (new ADR with `status: 'superseded'` referencing the old one)
- Never silently change tech stack or module boundaries — flag for human review if needed

---

### Subsystem 2: Capability/Task Decomposition Layer

**Problem**: "1 story = 1 pipeline run" doesn't scale. A story like "user authentication" touches auth module, user model, API routes, middleware, and tests. Two stories might both need to create the User model. Without decomposition, you get duplicate code and conflicting implementations.

**When it runs**: AFTER Architecture Planning, BEFORE task execution.

**New component**: `TaskDecomposer` — an LLM agent that translates the architecture plan + stories into implementation tasks.

#### Task Granularity: Capability Slices

The right granularity is **one module + one interface slice**:
- A task adds or changes a small public surface on one module + its implementation + its tests
- Typically touches **1–5 files**, produces **1–3 exported symbols** (or one endpoint)
- Has explicit prerequisites (e.g., "UserRepository exists")

Too coarse ("implement auth module") hides ordering and AC traceability. Too fine ("create user.ts") fragments context so the LLM can't make coherent decisions.

#### SprintTaskPlan Schema

```typescript
interface SprintTaskPlan {
  sprintId: string;
  planId: string;               // references the ArchitecturePlan.planId
  schemaVersion: number;

  tasks: ImplementationTask[];
  schedule: TaskSchedule;
  integrationTasks: IntegrationTask[];  // system wiring tasks
}

interface ImplementationTask {
  taskId: string;
  storyIds: string[];           // stories this task satisfies (can be multiple)
  module: string;               // architectural module name
  type: 'create' | 'extend' | 'integrate' | 'test' | 'configure';
  description: string;
  targetFiles: string[];        // files to create or modify
  ownedFiles: string[];         // files ONLY this task may write (prevents collisions)
  dependencies: string[];       // other taskIds that must complete first
  inputs: TaskInput[];          // artifacts needed from other tasks
  expectedOutputs: string[];    // files/exports this task produces
  acceptanceCriteria: string[]; // subset of story AC this task must satisfy
}

interface TaskInput {
  fromTaskId: string;
  artifact: string;             // file path or export name needed
}

interface IntegrationTask {
  taskId: string;
  type: 'bootstrap' | 'routing' | 'di-container' | 'migration' | 'config';
  description: string;
  targetFiles: string[];
  dependsOnTasks: string[];     // all module tasks that must complete first
}

interface TaskSchedule {
  groups: TaskGroup[];
}

interface TaskGroup {
  groupId: number;
  taskIds: string[];            // tasks in this group (can run in parallel)
  dependsOn: number[];          // groups that must complete first
}
```

#### File Ownership Rule

**Critical**: No two tasks in the same `TaskGroup` may have overlapping `ownedFiles`. The decomposer must serialize tasks that touch the same file. This prevents nondeterministic overwrites when tasks run in parallel.

Validation (deterministic, runs after decomposition):
```typescript
function validateNoFileCollisions(group: TaskGroup, tasks: ImplementationTask[]): void {
  const fileOwners = new Map<string, string>();
  for (const taskId of group.taskIds) {
    const task = tasks.find(t => t.taskId === taskId);
    for (const file of task.ownedFiles) {
      if (fileOwners.has(file)) {
        throw new Error(`File collision: ${file} owned by both ${fileOwners.get(file)} and ${taskId}`);
      }
      fileOwners.set(file, taskId);
    }
  }
}
```

#### Integration Tasks

Module-level tasks produce code that compiles in isolation. But system wiring — app bootstrap, DI/container registration, route mounting, database connection — needs dedicated `IntegrationTask`s that run AFTER module tasks complete. Without these, you get artifacts that "work in isolation" but don't compose into a running application.

#### How the Developer Agent Changes

The Developer agent receives an `ImplementationTask` instead of a `Story`:

```typescript
// Current: dev.execute(handoff, story)
// Proposed: dev.execute(handoff, story, { task, plan })

interface DeveloperContext {
  task: ImplementationTask;
  plan: ArchitecturePlan;
  moduleFiles: FileContent[];    // existing files in this module
  dependencyOutputs: FileContent[]; // outputs from prerequisite tasks
}
```

The Developer prompt includes the task description, target files, expected outputs, acceptance criteria, and relevant module context — scoped tightly to what this task needs.

#### Result Mapping Back to Stories

After all tasks complete, results are aggregated per-story for QA:
- For each story, collect all tasks where `storyIds.includes(storyId)`
- Gather the files produced by those tasks
- Map back to the story's acceptance criteria
- QA validates at the story level (does the user-facing feature work?)

#### Task Decomposition Guardrails

Large batches of stories can produce dozens or hundreds of tasks, dramatically increasing LLM usage and execution time. To maintain predictable execution characteristics, the `TaskDecomposer` enforces configurable operational guardrails.

```typescript
interface DecompositionGuardrails {
  maxTasksPerStory: number;       // default: 5
  maxTasksPerSprint: number;      // default: 50
  maxParallelTasks: number;       // default: os.cpus().length
  maxRevisionsPerSprint: number;  // default: 3 (shared with revision loop)
  maxRevisionsPerStory: number;   // default: 2
}

const DEFAULT_GUARDRAILS: DecompositionGuardrails = {
  maxTasksPerStory: 5,
  maxTasksPerSprint: 50,
  maxParallelTasks: require('os').cpus().length,
  maxRevisionsPerSprint: 3,
  maxRevisionsPerStory: 2,
};
```

**When limits are exceeded**:

| Limit | Behavior |
|---|---|
| `maxTasksPerStory` exceeded | `TaskDecomposer` merges related tasks (same module, adjacent files). If still exceeded after merge, request human review. |
| `maxTasksPerSprint` exceeded | Batch is too large. Split into sub-sprints by domain or execution group. Surface to user: "Sprint has N tasks (limit: 50). Split into K sub-sprints?" |
| `maxParallelTasks` exceeded | Scheduler enforces — groups are paged through at `maxParallelTasks` concurrency. Not an error, just throttling. |
| `maxRevisionsPerSprint` exceeded | Halt sprint, escalate to human review. Architecture may be fundamentally misaligned. |
| `maxRevisionsPerStory` exceeded | Halt affected story only. Other stories continue. |

**Task merging strategy**: When the decomposer produces >5 tasks for a story, it runs a merge pass:
1. Group tasks by `module`
2. Within each module, merge tasks that share `targetFiles` or sequential `dependencies`
3. Merged task inherits the union of `acceptanceCriteria` from source tasks
4. If a merged task would exceed 8 files, it's too large — flag for human review instead

Guardrails are configured via `OrchestratorConfig`:

```typescript
interface OrchestratorConfig {
  // ... existing fields ...
  executionMode: 'story' | 'planned-sprint';
  guardrails?: Partial<DecompositionGuardrails>;  // merged with defaults
}
```

---

### Subsystem 3: Architecture Enforcement Layer

**Problem**: LLMs deviate. Even with explicit architectural constraints in the prompt, the Developer agent might use the wrong framework, import internal module details instead of exposed interfaces, or place files in the wrong directory. The enforcement layer catches these violations deterministically — no LLM involved.

**When it runs**: AFTER each Developer task pass, BEFORE QA. Also runs once at the end, after all tasks and integration tasks complete.

**New component**: `ArchitectureEnforcer` — a deterministic rules engine. NOT an LLM agent.

#### EnforcementReport Schema

```typescript
interface EnforcementReport {
  taskId: string;
  planId: string;               // must reference the plan version it validated against
  timestamp: string;
  status: 'pass' | 'fail' | 'warn';
  violations: ArchitectureViolation[];
  metrics: ComplianceMetrics;
}

interface ArchitectureViolation {
  constraintId: string;
  severity: 'error' | 'warning';
  file: string;
  line?: number;
  description: string;
  suggestion: string;           // how to fix
}

interface ComplianceMetrics {
  totalConstraints: number;
  satisfied: number;
  violated: number;
  warnings: number;
}
```

#### What It Checks (All Deterministic)

Only structural facts that can be proven from code without understanding semantics:

| Check | How |
|---|---|
| **Dependency boundaries** | Parse imports/requires. Module A may only import from Module B's `exposedInterfaces`, not its internals. Verify via import path analysis. |
| **Technology compliance** | Scan `package.json` dependencies. If plan says Express, flag Fastify/Koa/Hapi. If plan says Vitest, flag Jest/Mocha. |
| **Directory conventions** | If plan says `src/modules/{name}/`, verify files are in the correct directory for their module. |
| **Pattern compliance (structural proxy)** | Reframe semantic patterns as import rules. E.g., "repository pattern" → only `**/repositories/**` may import `db/*` or database packages. Route handlers may not import database packages directly. |
| **Required exports** | If a module declares `exposedInterfaces: ["loginHandler", "authMiddleware"]`, verify those symbols are actually exported from the module's public surface. |
| **File ownership** | Verify the task only wrote to its `ownedFiles` list. Flag any writes outside the task's scope. |

#### What It Does NOT Check

- Code quality, readability, naming style (leave to QA or linters)
- Whether the code works (that's the sandbox's job)
- Business logic correctness (that's QA's job)
- Semantic architectural patterns that can't be reduced to import/path rules

#### Feedback Loop

The enforcer creates a second feedback loop alongside the sandbox compile→fix loop:

```
Developer generates code
  → ArchitectureEnforcer.validate(code, plan, task)
    if violations with severity='error':
      → Feed violations to Developer as structured context
      → Developer fixes and re-submits (within existing retry loop)
      → Enforcer re-validates
    if only warnings:
      → Include in handoff to QA for awareness, don't block
    if pass:
      → Proceed to sandbox (build/test)
        → If sandbox fails, Developer fixes and loops back through enforcer
```

**Ordering**: Enforcement runs BEFORE sandbox. There's no point compiling code that violates architectural boundaries — fix structure first, then verify it builds.

#### Plan Version Pinning

The enforcer must validate against a specific `planId`. During Developer retry loops, the plan is immutable — the Developer may only change code to satisfy the fixed plan. If the plan itself needs changing, that requires a new planner pass (escalation to human or re-planning).

---

### Subsystem 4: Architecture Revision Loop

**Problem**: The three subsystems above assume the `ArchitecturePlan` remains valid throughout the sprint. In practice, architecture frequently evolves as implementation reveals new constraints, missing abstractions, or conflicting assumptions. Without a controlled revision mechanism, the system either deadlocks against an incorrect plan or silently drifts as developers work around constraints.

**When it runs**: During task execution, triggered by specific failure conditions.

#### PlanRevisionTrigger Schema

```typescript
interface PlanRevisionTrigger {
  reason: PlanRevisionReason;
  taskId?: string;              // task that triggered the revision (if applicable)
  module?: string;              // module involved (if applicable)
  description: string;          // human-readable description of the issue
  evidence: string[];           // specific errors, violations, or gaps that justify revision
  timestamp: string;
}

type PlanRevisionReason =
  | 'task-failure'              // Developer retries exhausted on the same task
  | 'architecture-violation'    // Enforcer repeatedly blocks code that satisfies task requirements
  | 'new-capability-required'   // Task needs functionality not in any defined module
  | 'dependency-conflict'       // Module dependencies create unresolvable circular or missing deps
  | 'plan-reality-drift'        // Import graph / module boundaries diverged materially from plan
  | 'sandbox-constraint'        // Repeated resource-limit failures requiring architectural change
  | 'human-override';           // Human explicitly requests plan revision via CLI
```

#### Trigger Sources

Five conditions emit a `PlanRevisionTrigger`. The first two are **weak signals** — they require corroborating evidence (enforcement reports, compiler errors, or sandbox telemetry) before triggering a revision. The remaining three are **strong signals** that trigger directly.

**Weak signals (require corroboration):**

1. **Developer retry exhaustion**: If the Developer agent fails the same `ImplementationTask` after all retries (default 3), this *may* indicate incorrect or incomplete architectural constraints — or it may indicate a flaky test, a prompt issue, or a skill gap in the generated code. To trigger a revision, the orchestrator must verify that the failure is *structural* — at least one of: (a) the enforcer blocked the code in every retry, (b) the same compiler error references a missing module/interface, or (c) the sandbox consistently fails with the same architectural symptom (e.g., missing dependency, circular import). If the failure appears non-structural (e.g., logic bug, test flake), the task is marked `BLOCKED` and escalated to human review without triggering a revision.

2. **Repeated enforcement violations**: If the `ArchitectureEnforcer` blocks code that would otherwise satisfy the task's acceptance criteria across multiple Developer retries, this signals potential constraint misalignment. To qualify as a revision trigger, the enforcer must report the **same constraint category** (e.g., `boundary`, `technology`) failing across N distinct code submissions (default N=2). The enforcer's `ArchitectureViolation[]` entries are bundled as evidence.

**Strong signals (trigger directly):**

3. **Capability gaps**: If a task requires functionality not represented in any module's `exposedInterfaces` — e.g., the Developer determines it needs a `NotificationService` but no such module exists — the Developer emits a structured signal indicating the missing capability. This is a clear plan deficiency and triggers revision immediately.

4. **Plan-reality drift**: If the actual import graph or module boundaries (measured by the `ArchitectureEnforcer`'s compliance metrics) diverge materially from the plan — e.g., drift score exceeds a configurable threshold — the orchestrator triggers a revision to realign the plan with the codebase state. This catches gradual drift that accumulates across many tasks without any single task failing.

5. **Persistent sandbox constraint**: If sandbox execution repeatedly hits resource limits (CPU, memory, runtime) on the same task despite Developer revisions, this may indicate an architectural issue requiring a different approach (e.g., split workload, streaming, async processing). Requires 2+ distinct sandbox resource-limit failures on the same task.

#### Evidence Packaging

Every `PlanRevisionTrigger` must include a minimal **evidence bundle** — the artifacts that justify the revision. Without evidence, the planner cannot make an informed decision and risks making the architecture worse.

Required evidence by trigger type:

| Trigger | Required Evidence |
|---|---|
| `task-failure` | Compiler errors, test failures, enforcer violation IDs from all retry attempts |
| `architecture-violation` | `EnforcementReport` IDs showing the same constraint category failing across retries |
| `new-capability-required` | Missing module/interface name, which task needs it, why no existing module suffices |
| `plan-reality-drift` | Current drift score, import graph delta, list of files violating module boundaries |
| `sandbox-constraint` | Sandbox telemetry from each failed run (CPU%, memory, runtime), task description |

Evidence is stored in `ProjectMemory`'s artifact index (see Phase 2, section 2.3 "Project Memory") and referenced by ID in the trigger, not inlined.

#### Revision Flow

```
Task execution proceeds normally
  → Failure condition detected (weak signal with corroboration, or strong signal)
    → Orchestrator packages evidence bundle into PlanRevisionTrigger
      → Check revision count against BOTH limits:
        - maxRevisionsPerSprint (default: 3)
        - maxRevisionsPerStory (default: 2)
        if either exceeded → Escalate to human review, halt affected story
        if within limits:
          → ArchitecturePlannerAgent.execute(mode='revision', trigger, currentPlan)
            → Produces new ArchitecturePlan with supersedesPlanId = currentPlan.planId
            → New ArchitectureDecision entry: reason for change, impact description
            → Deterministic validation (same checks as initial plan)
          → TaskDecomposer re-runs against revised plan
            → Produces updated SprintTaskPlan
            → Completed tasks are preserved; only affected tasks are regenerated
          → Execution resumes with revised plan
```

#### Plan Version Pinning (Strengthened)

Plan version pinning remains active during task retries — the Developer **cannot** trigger a plan change by simply failing. Only the orchestrator may initiate revisions, and only after exhausting the task's retry budget. This prevents a feedback loop where:
1. Developer generates code that violates constraints
2. System revises plan to accommodate the bad code
3. Architecture degrades sprint after sprint

The revision must fix the *plan*, not rubber-stamp the Developer's output. The planner receives the trigger evidence and decides whether to adjust module boundaries, relax constraints, or add new modules — never to remove constraints wholesale.

#### ArchitecturePlan Extension

```typescript
interface ArchitecturePlan {
  // ... existing fields ...
  supersedesPlanId?: string;    // already defined — now actively used
  revisionNumber: number;       // 0 = initial plan, 1+ = revisions
  revisionTrigger?: PlanRevisionTrigger;  // what caused this revision
}
```

#### Integration with Orchestrator

```typescript
// In planned-sprint mode orchestrator loop:
interface PlannedSprintState {
  currentPlan: ArchitecturePlan;
  taskPlan: SprintTaskPlan;
  revisionCount: number;
  maxRevisions: number;              // sprint-level cap, default 3
  storyRevisionCounts: Map<string, number>;  // per-story revision counts
  maxRevisionsPerStory: number;      // per-story cap, default 2
}

// Pseudocode for revision check:
// if (taskFailedAfterAllRetries || repeatedEnforcementBlocks || capabilityGap) {
//   if (state.revisionCount >= state.maxRevisions) {
//     escalateToHuman(trigger);
//     return;
//   }
//   const revisedPlan = await planner.execute('revision', trigger, state.currentPlan);
//   const revisedTaskPlan = await decomposer.execute(revisedPlan, stories, completedTasks);
//   state.currentPlan = revisedPlan;
//   state.taskPlan = revisedTaskPlan;
//   state.revisionCount++;
// }
```

---

### Subsystem Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Planner produces bad module decomposition** | Multi-pass design limits blast radius. Deterministic validation catches structural issues (cycles, unmapped stories). Human gate before execution (optional). |
| **Task decomposition creates too many tasks** | Guardrails enforce limits (5/story, 50/sprint). Task merging reduces count. Human review when limits exceeded after merge. |
| **Enforcement false positives** | Only check structural facts (imports, paths, exports). Semantic checks are advisory warnings, never blocking errors. |
| **Parallel task file collisions** | `ownedFiles` rule with deterministic validation. No two parallel tasks may write the same file. |
| **Plan drift across retries** | Plan version pinning. Developer retries validate against the same `planId`. Only orchestrator initiates revisions. |
| **Circular module dependencies** | Planner must output acyclic dependency graph. Deterministic validation rejects cycles. |
| **Integration gaps** | Dedicated `IntegrationTask` type for system wiring (bootstrap, routing, DI). These run after module tasks. |
| **Context overflow with large sprint batches** | Pass A compresses each story. If still too large, split into sub-batches by domain and merge plans. |
| **Revision loop runaway** | Per-sprint cap (3) and per-story cap (2) on revisions. Exceeded → human escalation, not more replanning. |
| **Weak revision triggers (false positives)** | Developer retry exhaustion and enforcement blocks are weak signals — require corroborating evidence. Only capability gaps, drift, and sandbox constraints trigger directly. |
| **Revision degrades architecture** | Revision fixes the *plan*, not rubber-stamps the Developer's output. Planner adjusts boundaries or adds modules — never removes constraints wholesale. |
| **Guardrail defaults too restrictive** | All guardrails configurable via `OrchestratorConfig.guardrails`. Document escape hatches clearly. |

### Subsystem Definition of Done

- [ ] `ArchitecturePlannerAgent` with three-pass design (fact extraction → synthesis → constraints)
- [ ] `ArchitecturePlannerAgent` revision mode (receives trigger + current plan, produces superseding plan)
- [ ] Deterministic plan validation (schema, acyclicity, coverage)
- [ ] `TaskDecomposer` producing `SprintTaskPlan` with capability-slice granularity
- [ ] `DecompositionGuardrails` with configurable limits and task merging
- [ ] File ownership validation (no parallel collisions)
- [ ] `IntegrationTask` type for system wiring
- [ ] `ArchitectureEnforcer` rules engine (dependency boundaries, tech compliance, directory conventions, required exports, file ownership)
- [ ] Enforcer → Developer feedback loop integrated into orchestrator retry logic
- [ ] `PlanRevisionTrigger` emission from orchestrator (all 5 trigger types)
- [ ] Per-sprint and per-story revision caps with human escalation
- [ ] `HandoffDocument` extended with typed artifact references (backward compatible)
- [ ] `executionMode: 'story' | 'planned-sprint'` flag in `OrchestratorConfig`
- [ ] Existing tests unaffected; new tests cover all subsystems including revision loop
- [ ] End-to-end: 3 stories → planner → decomposer → per-task dev → enforcer → QA → per-story TW/PR
- [ ] End-to-end: task failure triggers plan revision → re-decompose → resume

---

## Phase 2: Cross-Story Awareness + Project Memory

**Goal**: Stories can build on each other's code. The system remembers what it built.

**Timeline**: 2–3 weeks

**Prerequisites**: Phase 1 (sandbox execution) + the four foundational subsystems (architecture planning, task decomposition, enforcement, revision loop). Phase 2 builds ON TOP of the subsystems — the `ArchitecturePlan` becomes the source of truth for cross-story coordination, and `ProjectMemory` records the plan's decisions for future sprints.

**Why this is after the subsystems**: The subsystems solve "how do we plan coherently across stories." Phase 2 solves "how do we remember what we built and reuse it." Without the planning layer, cross-story awareness is just shared files with no coherent structure.

### 2.1 Project Workspace

Add a shared artifact layer alongside per-story workspaces:

```
.splinty/
  my-app/
    project/                    # ← NEW: shared project workspace
      src/
        auth/login.ts           # written by story-001
        auth/middleware.ts       # written by story-001
        users/profile.ts        # written by story-002
      package.json
      tsconfig.json
    stories/
      story-001/                # per-story workspace (existing)
      story-002/
    project-memory.json         # ← NEW: structured project memory
    ledger.md                   # existing sprint ledger
```

When a story completes successfully (reaches `DONE` or `PR_OPEN`), its files are promoted to the `project/` workspace. Subsequent stories see the full project workspace as their starting point.

### 2.2 Story Manifest

Each completed story writes a `StoryManifest` to project memory:

```typescript
interface StoryManifest {
  storyId: string;
  title: string;
  completedAt: string;
  filesCreated: string[];       // relative paths
  filesModified: string[];
  keyExports: string[];         // e.g. "loginHandler", "AuthMiddleware"
  dependencies: string[];       // npm packages added
  commands: {                   // how to build/test
    build: string;
    test: string;
    run?: string;
  };
  testStatus: 'pass' | 'fail' | 'skip';
  architectureDecisions: string[];  // e.g. "Using JWT for auth", "PostgreSQL for persistence"
}
```

This is the "cheap code navigation" approach — no embeddings, no vector database. Agents can look up which story created which files, what exports are available, and what architectural decisions were made.

### 2.3 Project Memory

Replace the markdown ledger with a structured JSON `ProjectMemory` for agent consumption (keep the markdown ledger for human readability):

```typescript
interface ProjectMemory {
  projectId: string;
  createdAt: string;
  updatedAt: string;
  stack: StackInfo;             // language, framework, key dependencies
  stories: StoryManifest[];
  sharedDecisions: string[];    // cross-story architectural decisions
  knownConstraints: string[];   // e.g. "All APIs use REST, not GraphQL"
  fileIndex: FileEntry[];       // flat list: path → owning story → key exports
  artifactIndex: ArtifactEntry[];  // tracks planning and execution artifacts across sprints
}

interface FileEntry {
  path: string;
  createdBy: string;            // storyId
  lastModifiedBy: string;
  exports: string[];
  description: string;          // one-line summary
}

interface ArtifactEntry {
  type: ArtifactType;
  id: string;                   // artifact identifier (e.g., planId, reportId)
  path: string;                 // relative path to the artifact file in the workspace
  createdAt: string;
  sprintId: string;
  relatedStories: string[];     // storyIds this artifact relates to
  supersedes?: string;          // ID of the artifact this replaces (for plan revisions)
}

type ArtifactType =
  | 'architecture-plan'
  | 'sprint-task-plan'
  | 'enforcement-report'
  | 'sandbox-result'
  | 'architecture-decision'
  | 'run-telemetry'
  | 'revision-trigger';
```

The artifact index is **append-only** — entries are never deleted, only superseded. This provides a complete audit trail of planning decisions and execution outcomes across sprints. Future agents can query "which architecture plan was active when story X was implemented?" or "what enforcement violations occurred in the last 3 sprints?"

Artifact files themselves are stored at their `path` location; the index stores only pointers. This keeps the index lightweight (typically <100KB even for large projects) while preserving access to full artifact content when needed.

**Why JSON over a database**: Splinty is a local CLI tool. JSON files are debuggable, version-controllable, and require zero infrastructure. If the project memory grows too large for a single JSON file, split by domain (one file per service/module).

### 2.4 Project Context for Agents

All agents receive a `ProjectContext` in their handoff:

```typescript
interface ProjectContext {
  memory: ProjectMemory;
  relevantFiles: FileContent[];   // files from project workspace that relate to this story
  dependencyGraph: string[];      // which stories this story depends on
}
```

**File selection strategy** (no embeddings needed):
1. Parse the story description for keywords (module names, feature areas)
2. Match against `fileIndex` entries and `storyManifest.keyExports`
3. Include all files from stories listed as dependencies
4. Include shared config files (`package.json`, `tsconfig.json`, entry points)

If the total context exceeds the model's window, prioritize: dependency story files → keyword-matched files → shared config.

### 2.5 Story Dependencies

Stories can declare dependencies on other stories:

```markdown
## Story: User profile page
Depends on: story-001 (authentication)

Display the logged-in user's profile information...
```

The orchestrator builds a **topologically-sorted queue** and processes stories in dependency order. Independent stories can run in parallel (if desired).

**Conflict detection**: Before a story starts, check if any of its target files are also being modified by a currently-running story. If so, block until the conflicting story completes. This prevents merge conflicts without requiring a full DAG runtime.

### 2.6 Code Navigation (Import Graph)

Build a lightweight import/require graph from the project workspace:

```typescript
interface ImportGraph {
  files: Map<string, string[]>;   // file → files it imports
  reverse: Map<string, string[]>; // file → files that import it
}
```

Parse with a simple regex or lightweight AST parser (TypeScript's `ts.createSourceFile` for TS/JS, `ast` module for Python). This tells agents: "if you change `auth/middleware.ts`, these 5 files import it and may need updates."

**No embeddings, no vector DB.** If retrieval failures become frequent and the import graph + manifest search can't locate relevant code, *then* consider adding embeddings. Measure first.

#### Retrieval Failure Signal & Escalation

The file selection strategy above is efficient but may fail in large codebases where keyword matching and import graphs don't surface the right files. Rather than preemptively adding semantic embeddings (which introduce infrastructure complexity), the system tracks retrieval quality and escalates only when evidence warrants it.

```typescript
interface RetrievalAttempt {
  storyId: string;
  taskId?: string;
  query: string;                    // what the agent was looking for
  strategy: 'keyword' | 'import-graph' | 'manifest' | 'dependency';
  filesReturned: string[];
  filesActuallyUsed: string[];      // files the agent ended up needing (post-hoc)
  missed: string[];                 // files the agent needed but weren't returned
  timestamp: string;
}

interface RetrievalMetrics {
  totalAttempts: number;
  successfulAttempts: number;       // missed.length === 0
  partialAttempts: number;          // missed.length > 0 but agent succeeded anyway
  failedAttempts: number;           // agent cited missing context as failure reason
  failureRate: number;              // failedAttempts / totalAttempts
}
```

**How `missed` files are detected**: After task completion (or failure), compare the files the Developer agent actually imported/referenced in its output against the files that were provided as context. Files that appear in the output but weren't in the input context are retroactively marked as `missed`. This is a post-hoc signal — it doesn't slow down execution.

**Escalation threshold**: If `failureRate` exceeds a configurable threshold (default: 0.15 — 15% of retrieval attempts fail), the system surfaces a recommendation:

```
⚠ Retrieval failure rate: 23% (threshold: 15%)
  - 7/30 retrieval attempts failed to locate needed files
  - Most missed: src/utils/validation.ts (3x), src/config/env.ts (2x)
  
  Recommendation: Enable hybrid retrieval with semantic embeddings.
  Run: splinty config set retrieval.mode hybrid
```

**Hybrid retrieval mode** (activated on escalation):
1. Build embeddings index from all project files (using a local model — no cloud API)
2. File selection combines keyword + import graph + cosine similarity
3. Embeddings rebuild on each story completion (incremental — only changed files re-embedded)

This approach maintains the "simple first, upgrade when proven necessary" principle from the existing roadmap while providing a concrete, data-driven upgrade path.

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Project memory gets stale** | Require agents to cite which manifest items/files they relied on. If cited files don't exist or have changed, flag it. |
| **Cross-story merge conflicts** | File-level conflict detection blocks concurrent modifications to the same file. For more complex cases, add an explicit "integration story" mechanism. |
| **Context window overflow** | File selection strategy with priority ordering. If still too large, summarize older story manifests (keep full detail for recent/dependent stories). |
| **Story dependency cycles** | Topological sort detects cycles at planning time. Reject or flag for human intervention. |
| **Retrieval failures degrade code quality** | `RetrievalMetrics` tracks failure rate. Automatic escalation recommendation at 15% threshold. Hybrid retrieval mode available as an upgrade path. |
| **Artifact index grows unbounded** | Append-only index stores pointers (not content). Artifacts older than N sprints can be archived. Index itself stays <100KB for typical projects. |

### Definition of Done

- [ ] `ProjectWorkspace` with shared artifact layer and per-story promotion
- [ ] `StoryManifest` written on story completion
- [ ] `ProjectMemory` JSON with `ArtifactEntry` index replaces ledger as the primary agent-facing data store
- [ ] `ArtifactEntry` index populated by planner, decomposer, enforcer, and sandbox
- [ ] `ProjectContext` passed to all agents with relevant files, dependency info, and artifact references
- [ ] Story dependency ordering via topological sort
- [ ] Import graph built from project workspace
- [ ] Conflict detection blocks concurrent modifications to same files
- [ ] `RetrievalAttempt` tracking with post-hoc missed file detection
- [ ] `RetrievalMetrics` computation with configurable failure rate threshold
- [ ] Retrieval failure escalation recommendation via CLI
- [ ] End-to-end: Story 2 imports and uses a module created by Story 1

---

## Phase 3: Enterprise Features

**Goal**: Multi-service applications, integration testing, infrastructure, human oversight.

**Timeline**: 3+ weeks

**Why this is last**: Phases 1 and 2 must be solid before scaling out. Multi-service orchestration amplifies every reliability issue — if single-service sandbox execution is flaky, multi-service integration testing will be unusable.

### 3.1 Config-Driven Pipeline

Replace the hardcoded pipeline in `orchestrator.ts` with a configurable agent sequence:

```typescript
interface PipelineConfig {
  steps: PipelineStep[];
}

interface PipelineStep {
  agent: AgentPersona;
  condition?: (context: StoryContext) => boolean;  // skip if false
  retries?: number;
  timeout?: number;
}

// Default pipeline (backward compatible)
const defaultPipeline: PipelineConfig = {
  steps: [
    { agent: AgentPersona.BUSINESS_OWNER },
    { agent: AgentPersona.PRODUCT_OWNER },
    { agent: AgentPersona.ARCHITECT },
    { agent: AgentPersona.SOUND_ENGINEER, condition: (ctx) => ctx.requiresAudio },
    { agent: AgentPersona.DEVELOPER, retries: 3 },
    { agent: AgentPersona.QA_ENGINEER, retries: 3 },
    { agent: AgentPersona.TECHNICAL_WRITER },
  ],
};
```

**Not a full DAG runtime.** A DAG executor is justified only when you need: parallel fan-out/fan-in within a single story, conditional error-path routing, or per-story pipeline variation. Start with an ordered step list with conditions — upgrade to a DAG only when a concrete use case demands it.

### 3.2 Multi-Service Support

For applications with multiple services (API, frontend, worker, database):

```typescript
interface ServiceDefinition {
  name: string;                 // e.g. "api", "web", "worker"
  stack: StackInfo;
  repoPath: string;             // subdirectory or separate repo
  dependencies: string[];       // other services this depends on
  ports: number[];
}
```

Each service gets its own workspace subdirectory. The Architect agent plans which service each story's code belongs to. The Developer agent writes to the correct service workspace.

**Start with monorepo** (subdirectories within one repo). Multi-repo support adds git coordination complexity that isn't justified until the single-repo approach breaks down.

**Service count guardrail**: Language models frequently over-propose microservices, even for simple applications that would be better served by a modular monolith. The architecture planner must enforce a configurable limit:

```typescript
interface ServiceGuardrails {
  maxServicesPerProject: number;    // default: 4
  requireHumanApproval: boolean;    // default: true (when limit is exceeded)
}
```

When the `ArchitecturePlannerAgent` (or the existing `ArchitectAgent` in story mode) proposes more services than `maxServicesPerProject`, the orchestrator:
1. Presents the service list to the user via CLI: "Planner proposes N services (limit: 4). Approve? [y/N] Or merge services? [list]"
2. If the user rejects, the planner re-runs with an explicit constraint: "maximum N services, merge the following..."
3. If the user approves, the limit is raised for this project and recorded as an `ArchitectureDecision`

This guardrail also applies to the Architecture Revision Loop — a revision cannot introduce new services beyond the limit without human approval.

### 3.3 New Specialized Agents

| Agent | Purpose |
|---|---|
| **IntegrationTestEngineer** | Tests cross-service communication in a sandboxed Docker network (docker-compose with all services running). |
| **MigrationEngineer** | Generates database migration files (schema changes, seed data) with rollback support. Uses a sandbox database container. |
| **InfrastructureEngineer** | Generates Dockerfiles, docker-compose configs, CI pipeline configs (GitHub Actions), and deployment manifests. |

Each follows the existing `BaseAgent` pattern. They receive `ProjectContext` and produce files in the appropriate service workspace.

### 3.4 Integration Testing Environment

Extend the sandbox to support multi-container environments:

```typescript
interface IntegrationSandbox extends SandboxEnvironment {
  addService(name: string, config: SandboxConfig): Promise<void>;
  getServiceUrl(name: string): string;   // e.g. "http://api:3000"
  executeInService(name: string, command: string): Promise<SandboxResult>;
}
```

Implementation: `docker-compose` with a generated compose file. Each service gets its own container on a shared network. The IntegrationTestEngineer writes tests that hit service endpoints and runs them inside the network.

### 3.5 Human-in-the-Loop Gates

Configurable approval points:

```typescript
interface GateConfig {
  after: AgentPersona;
  requireApproval: 'always' | 'on-cross-service' | 'on-breaking-change' | 'never';
  notifyVia?: 'cli-prompt' | 'slack' | 'github-comment';
}
```

**Phase 3 scope**: CLI prompt only (user types `y/n` to proceed). Slack/GitHub notifications are a future enhancement.

Use cases:
- Approve architectural decisions before Developer starts coding
- Review cross-service changes before merging
- Gate database migrations (always require human approval)

### 3.6 Advanced Observability & Cost Attribution

**Prerequisites**: The foundational telemetry layer (see "Infrastructure: Tool Runtime & Observability") provides `RunTelemetry`, `ExecutionLogEntry`, and basic `splinty status --metrics`. This Phase 3 section builds **enterprise-grade** additions on top of that foundation.

#### Per-Story Cost Attribution

Extend `RunTelemetry.cost` with granular cost breakdowns:

```typescript
interface StoryMetrics {
  storyId: string;
  totalDurationMs: number;
  llmCalls: number;
  totalTokens: { input: number; output: number };
  sandboxRuns: number;
  reworkCycles: number;
  revisionContributions: number;    // how many plan revisions this story caused
  costEstimateUsd: number;
}
```

Surface via `splinty status --metrics --detail` for per-story breakdown. Essential for enterprise adoption — teams need to know what a sprint costs and which stories are expensive.

#### Multi-Service Trace Correlation

When running multi-service sprints, correlate execution logs across services:
- Each service execution gets a `traceId` linking it to the parent sprint run
- `splinty status --traces` shows cross-service execution timeline
- Integration test results are correlated with the services they tested

#### Metric Export

For teams using external observability platforms:
- `splinty export --format=json --sprint={id}` exports all telemetry
- Future: OpenTelemetry-compatible export (OTLP) for integration with Grafana, Datadog, etc.

#### Configurable Retention

Extend the basic 5-sprint retention from the infrastructure layer:
- Configurable via `splinty config set telemetry.retention.sprints 20`
- Separate retention for logs (verbose, short-lived) vs metrics (compact, long-lived)
- Archive to compressed `.jsonl.gz` for long-term storage

### Risks & Mitigations

| Risk | Mitigation |
|---|---|
| **Multi-container startup time** | Pre-built images; lazy service startup (only start services that the current story touches). |
| **Integration test flakiness** | Deterministic test data; health checks before test execution; retry with backoff. |
| **Migration rollback failures** | Always generate `up` and `down` migrations; test rollback in sandbox before applying. |
| **Human gates blocking automation** | Sensible defaults (`never` for most gates); timeout with auto-proceed option for non-critical gates. |

### Definition of Done

- [ ] Config-driven pipeline replaces hardcoded step sequence
- [ ] Multi-service workspace support (monorepo with subdirectories)
- [ ] IntegrationTestEngineer, MigrationEngineer, InfrastructureEngineer agents
- [ ] Multi-container sandbox via docker-compose
- [ ] Human-in-the-loop CLI gates
- [ ] Service count guardrail with human approval for exceeding limit
- [ ] Per-story cost attribution and advanced observability (trace correlation, metric export)
- [ ] Configurable telemetry retention + archive
- [ ] End-to-end: a 3-story sprint produces a working 2-service app (API + frontend) with database migrations, integration tests, CI config, and a README

---

## Implementation Order Within Each Phase

### Phase 1 + Infrastructure (recommended order)
1. `AgentTool` interface + `FileSystemTool`, `GitTool`, `SandboxTool` implementations
2. `ToolBackedWorkspaceManager` adapter (transparent to agents)
3. `ExecutionLogEntry` recording + redaction policy
4. `SandboxEnvironment` interface + Docker implementation + resource limit enforcement + tests
5. `RunTelemetry` schema + collection hooks in sandbox
6. Developer agent sandbox integration (write → build → test → capture results + resource telemetry)
7. QA agent enhancement (receive `SandboxResult` with `ResourceUsage`)
8. Incremental editing (unified diff generation + patch application)
9. `ResumePoint` support in orchestrator
10. `splinty status --metrics` CLI command

### Foundational Subsystems (recommended order — after Phase 1, before Phase 2)
1. `ArchitecturePlan` schema + Zod validation + persistence
2. `ArchitecturePlannerAgent` Pass A (story fact extraction)
3. `ArchitecturePlannerAgent` Pass B (module/interface synthesis)
4. `ArchitecturePlannerAgent` Pass C (constraints + execution groups)
5. Deterministic plan validation (acyclicity, coverage, schema)
6. `SprintTaskPlan` schema + `TaskDecomposer` agent
7. `DecompositionGuardrails` (limits, task merging, human escalation)
8. File ownership validation + `IntegrationTask` type
9. `ArchitectureEnforcer` rules engine (import analysis, tech compliance, directory checks)
10. Telemetry collection hooks in enforcer (violation counts, drift score, compliance metrics)
11. Enforcer → Developer feedback loop in orchestrator
12. `PlanRevisionTrigger` schema + trigger detection logic (all 5 trigger types)
13. `ArchitecturePlannerAgent` revision mode + evidence packaging
14. Revision loop integration in orchestrator (caps, escalation, re-decomposition)
15. `executionMode` flag + `HandoffDocument` schema extension
16. Orchestrator integration (`planned-sprint` mode end-to-end)

### Phase 2 (recommended order)
1. `ProjectWorkspace` shared layer + file promotion on story completion
2. `StoryManifest` + `ProjectMemory` JSON with `ArtifactEntry` index (incorporates plan decisions from subsystems)
3. `ProjectContext` injection into agent handoffs (includes plan + memory + artifact references)
4. Story dependency ordering (topological sort + conflict detection)
5. Import graph construction
6. `RetrievalAttempt` tracking + `RetrievalMetrics` computation
7. Retrieval failure signal + escalation threshold + CLI recommendation

### Phase 3 (recommended order)
1. Config-driven pipeline
2. Multi-service workspace support + service count guardrail
3. InfrastructureEngineer agent (Dockerfiles, compose, CI)
4. MigrationEngineer agent
5. Multi-container integration sandbox
6. IntegrationTestEngineer agent
7. Human-in-the-loop gates
8. Advanced observability: per-story cost attribution, multi-service trace correlation, metric export
9. Configurable retention + archive

---

## Escalation Triggers

Don't over-build. Add these heavier capabilities only when you have evidence they're needed:

| Capability | Add When |
|---|---|
| **Embeddings / Vector DB** | `RetrievalMetrics.failureRate` exceeds 15% threshold (see Phase 2 "Retrieval Failure Signal & Escalation"). The system will recommend this automatically via CLI. |
| **Full DAG pipeline executor** | You need conditional error-path routing, per-story pipeline variation, or parallel fan-out/fan-in within a single story. |
| **AST-based editing** | Unified diff patch failures or complex refactoring tasks become common and costly. |
| **Multi-repo git coordination** | Monorepo subdirectory approach breaks down (different deploy cycles, different teams, different CI). |
| **Slack / GitHub gate notifications** | CLI prompts are insufficient for team workflows. |
| **OpenTelemetry export** | Teams need to integrate Splinty metrics with external observability platforms (Grafana, Datadog). See Phase 3 "Metric Export". |

---

## What This Roadmap Does NOT Cover

These are explicitly deferred and should be revisited after Phase 3:

- **Cloud deployment / hosted API** — Splinty remains a local CLI tool
- **Web UI / dashboard** — CLI only; `splinty status` is the interface
- **Linear / Trello integration** — Jira and GitHub Issues are sufficient initially
- **Multi-tenant / team features** — Single-user local execution only
- **LLM fine-tuning** — Use foundation models with good prompts
- **Natural language story refinement chat** — Stories are input, not negotiated

---

## References

- [Aider SEARCH/REPLACE pattern](https://github.com/Aider-AI/aider) — incremental editing approach (we chose unified diff instead)
- [E2B Sandbox SDK](https://github.com/e2b-dev/E2B) — cloud sandbox reference (we use local Docker instead)
- [OpenHands CodeAct](https://docs.all-hands.dev/openhands/usage/agents) — agent-in-sandbox architecture
- [SWE-agent](https://github.com/SWE-agent/SWE-agent) — tool-augmented coding agent
- [Firecracker microVMs](https://github.com/firecracker-microvm/firecracker) — lightweight VM alternative to Docker (future consideration)
- ["Comparing AI Coding Agents" (2025)](https://arxiv.org/pdf/2602.08915) — empirical study of agent architectures
