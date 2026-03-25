# Task-Decomposition & Fixture Pollution Inventory — D11 Research

**Session**: ses_336b0f7beffeh4nml15aXPwg7B  
**Date**: 2026-03-24  
**Focus**: Exhaustive inventory of fixture factories, shared mutable state, and potential pollution vectors

---

## Executive Summary

- **Total test files scanned**: 74 across packages/core, packages/agents, packages/api, packages/db, packages/cli
- **Fixture factory patterns found**: 100+ `make*()` and `*Fixture()` functions
- **Files with beforeEach/afterEach hooks**: 17 in packages/agents alone
- **Critical finding**: Only 1 test file already implements `structuredClone` protection — `task-decomposition.test.ts`
- **Pollution vectors identified**: 
  1. Factories returning shared mutable objects without cloning
  2. Tests lacking beforeEach/afterEach for fixture isolation
  3. Plan/Story fixtures with mutable arrays/objects used across tests

---

## Files With Task-Decomposition, Fixture, & Decomposer References

### Core Package (`packages/core/src/`)

| File | Line | Symbol | Pattern | Risk Level |
|------|------|--------|---------|-----------|
| `task-decomposition.ts` | 256-425 | `TaskDecomposer` class | Stateful decomposer; `guardrails` stored as instance field | Medium |
| `task-decomposition.test.ts` | 1 | (header comment) | "TEST FIX: use structuredClone" — **ALREADY IMPLEMENTS PROTECTION** | Low |
| `task-decomposition.test.ts` | 19-25 | `deepClone()` helper | Deep clone factory with `structuredClone` fallback | Low ✓ |
| `task-decomposition.test.ts` | 27-39 | `makeStory()` | Factory without clone; used by `storyFixture()` wrapper | Medium |
| `task-decomposition.test.ts` | 41-42 | `storyFixture()` | **Wraps `deepClone(makeStory())`** — **SAFE** | Low ✓ |
| `task-decomposition.test.ts` | 44-93 | `makePlan()` | Factory for ArchitecturePlan with mutable modules array | Medium |
| `task-decomposition.test.ts` | 95-96 | `planFixture()` | **Wraps `deepClone(makePlan())`** — **SAFE** | Low ✓ |
| `task-decomposition.test.ts` | 98-128 | `makeMinimalSprintTaskPlan()` | Factory with mutable tasks array; overrides use `deepClone()` | Medium |
| `task-decomposition.test.ts` | 130-131 | `minimalSprintFixture()` | **Wraps `deepClone(makeMinimalSprintTaskPlan())`** — **SAFE** | Low ✓ |
| `task-decomposition.test.ts` | 133-212 | Schema validation tests | 100+ assertions using fixtures via safe fixture functions | Low ✓ |
| `task-decomposition.test.ts` | 214-474 | `TaskDecomposer.decompose` tests | All use `planFixture()`, `storyFixture()`, `minimalSprintFixture()` — **SAFE** | Low ✓ |

**Key finding**: `task-decomposition.test.ts` is the **gold standard** for fixture isolation. All factories wrapped with `deepClone()`.

### Agents Package (`packages/agents/src/`)

| File | Line | Symbol | Pattern | Risk Level |
|------|------|--------|---------|-----------|
| `orchestrator.ts` | 1720 | `OrchestratorConfigSchema` | Zod schema export — immutable | Low |
| `orchestrator.test.ts` | 1-100 | Imports + setup | `makeRawStory()`, `makeQueuedClient()`, canned responses | Medium |
| `orchestrator.test.ts` | 45-60 | `makeRawStory()` | Story factory **without clone** — creates new object each call | Medium |
| `orchestrator.test.ts` | 175-236 | `makePlanForStories()` | Plan factory **without clone** — mutable modules + mappings | **High** ⚠️ |
| `orchestrator.test.ts` | 238-264 | `makeTaskPlanForStories()` | Task plan factory **without clone** — mutable tasks array | **High** ⚠️ |
| `orchestrator.test.ts` | 282-288 | beforeEach/afterEach | File system temp cleanup; **no fixture isolation** | **High** ⚠️ |
| `orchestrator.test.ts` | 292-1652 | 17+ test suites | All use `makePlanForStories()` + `makeTaskPlanForStories()` — **shared state risk** | **High** ⚠️ |
| `architecture-planner.test.ts` | 29-280 | Fixture factories | `makeStories()`, `makePassAResponse()`, `makeGlobalPlan()`, etc. — **no cloning** | **High** ⚠️ |
| `architecture-planner.test.ts` | 413-420 | beforeEach/afterEach | Temp dir only; **no fixture cloning** | **High** ⚠️ |
| `base-agent.test.ts` | 47-61 | `makeStory()` | Story factory **without clone** | Medium |
| `base-agent.test.ts` | 70-79 | beforeEach/afterEach | Workspace + handoff manager reset; **no fixture cloning** | **High** ⚠️ |
| `developer.test.ts` | 260-273 | beforeEach/afterEach | Workspace setup; **no fixture cloning** | **High** ⚠️ |
| `qa-engineer.test.ts` | 120-139 | beforeEach/afterEach | Workspace setup; **no fixture cloning** | **High** ⚠️ |
| `gate.test.ts` | 24-39 | `makeStory()`, `makeHandoff()` | Story/handoff factories **without clone** | Medium |
| `business-owner.test.ts` | 55-62 | beforeEach/afterEach | Workspace only | Medium |
| `product-owner.test.ts` | 90-97 | beforeEach/afterEach | Workspace only | Medium |

**Critical finding**: **17 agent test files** have `beforeEach/afterEach` but **NONE clone fixtures** when reusing them. High pollution risk.

### Core Package Additional Tests

| File | Line | Symbol | Risk |
|------|------|--------|------|
| `architecture-enforcer.test.ts` | 13-118 | `makePlan()`, `makeTask()` | **No cloning** — mutable constraints/modules | **High** ⚠️ |
| `architecture-plan.test.ts` | 24 | `makeBasePlan()` | **No cloning** — mutable modules array | **High** ⚠️ |
| `plan-validation.test.ts` | 13 | `makeTestPlan()` | **No cloning** — mutable objects | **High** ⚠️ |
| `project-memory.manager.test.ts` | 23-65 | 4 factories (makeStack, makeStoryManifest, etc.) | **No cloning** — return new object each call (safe by construction) | Medium |
| `story-dependencies.test.ts` | 7-20 | `makeStory()` | **No cloning** — returns new object each call (safe by construction) | Low ✓ |
| `service-guard.test.ts` | 15 | `makePlan()` | **No cloning** — mutable modules array | **High** ⚠️ |
| `sprint-state.test.ts` | 20-129 | 4 factories | **No cloning** — mutable arrays | **High** ⚠️ |
| `plan-revision.test.ts` | 19-28 | `makeTrigger()`, `makeReport()` | **No cloning** — mutable objects | **High** ⚠️ |
| `retrieval-tracking.test.ts` | 4 | `makeAttempt()` | **No cloning** | Medium |

---

## Inventory: Fixture Factories by Category

### Safe Factories (Already Using Cloning or Immutable By Construction)

1. **task-decomposition.test.ts** — `storyFixture()`, `planFixture()`, `minimalSprintFixture()`
   - Pattern: Explicit `deepClone()` wrapping factory
   - Status: ✓ Already protected

2. **story-dependencies.test.ts** — `makeStory()`
   - Pattern: Returns new object literal each call
   - Status: ✓ Safe by construction

3. **project-memory.manager.test.ts** — `makeStack()`, `makeStoryManifest()`, etc.
   - Pattern: Returns new object literal each call (uses spread operator)
   - Status: ✓ Safe by construction

### Unsafe Factories (Require Protection)

**High Risk — Mutable Complex Objects**:

1. **orchestrator.test.ts**
   - `makePlanForStories()` — mutable modules, storyModuleMapping, executionOrder arrays
   - `makeTaskPlanForStories()` — mutable tasks, schedule arrays
   - Used across 17+ test suites
   - **Patch location**: Lines 175-264

2. **architecture-planner.test.ts**
   - `makeStories()` — array of Story objects
   - `makePassAResponse()`, `makePassBResponse()`, etc. — response objects
   - `makeGlobalPlan()`, `makeCurrentSprintPlan()` — plan factories with mutable modules
   - **Patch location**: Lines 29-330

3. **architecture-enforcer.test.ts**
   - `makePlan()` — plan with mutable modules, constraints
   - `makeTask()` — mutable targetFiles, ownedFiles
   - **Patch location**: Lines 13-118

4. **service-guard.test.ts**
   - `makePlan()` — plan with mutable modules array
   - **Patch location**: Line 15

5. **sprint-state.test.ts**
   - `makeArchitecturePlan()`, `makeSprintTaskPlan()`, `makeCheckpoint()`, `makePlannedState()`
   - **Patch location**: Lines 20-129

6. **plan-validation.test.ts**
   - `makeTestPlan()` — plan with mutable modules, storyModuleMapping
   - **Patch location**: Line 13

7. **plan-revision.test.ts**
   - `makeTrigger()`, `makeReport()` — mutable nested objects
   - **Patch location**: Lines 19-28

---

## Tests With beforeEach/afterEach (Setup/Teardown Present)

### Agents Package (17 files)

| Test File | beforeEach | afterEach | Fixture Cloning | Risk |
|-----------|-----------|----------|-----------------|------|
| `architect.test.ts` | L94 | L101 | ❌ No | **High** |
| `architecture-planner.test.ts` | L413 | L420 | ❌ No | **High** |
| `base-agent.test.ts` | L70 | L77 | ❌ No | **High** |
| `business-owner.test.ts` | L55 | L62 | ❌ No | **High** |
| `developer.test.ts` | L260 | L271 | ❌ No | **High** |
| `infrastructure-engineer.test.ts` | L78 | L85 | ❌ No | **High** |
| `integration-test-engineer.test.ts` | L82 | L89 | ❌ No | **High** |
| `migration-engineer.test.ts` | L79 | L86 | ❌ No | **High** |
| `orchestrator.test.ts` | L282 | L286 | ❌ No | **High** |
| `product-owner.test.ts` | L90 | L97 | ❌ No | **High** |
| `qa-engineer.test.ts` | L120 | L139 | ❌ No | **High** |
| `security-scanner.test.ts` | L10 (afterEach only) | — | ❌ No | **High** |
| `sound-engineer.test.ts` | L123 | L131 | ❌ No | **High** |
| `technical-writer.test.ts` | L88 | L106 | ❌ No | **High** |
| `github-copilot-client.test.ts` | L29 | L32 | ❌ No | **High** |
| `cross-story.integration.test.ts` | L108 | L112 | ❌ No | **High** |
| `pipeline.integration.test.ts` | L125 | L130 | ❌ No | **High** |

**Finding**: All 17 agent test files have beforeEach/afterEach, but **NONE of them clone fixtures**. This is the primary pollution vector for D11.

### API Package (3 files with beforeEach/afterEach)

| Test File | beforeEach | afterEach | Note |
|-----------|-----------|----------|------|
| `jwt.test.ts` | Yes | Yes | JWT operations — immutable by nature |
| `rate-limiter.test.ts` | Yes | Yes | Middleware state reset — low risk |
| `cli/index.test.ts` | Yes | Yes | CLI operations — low risk |

**Finding**: API tests are lower risk because they test stateless operations.

---

## Shared Module-Level Exports (Potential Mutable State)

Searched for mutable module-level exports in packages/core, packages/agents, packages/db:

**Finding**: No dangerous module-level mutable singletons found. Most exports are:
- Zod schemas (immutable definitions)
- Class constructors (not shared instances)
- Functions (pure or stateless)

**Exception**: Some tests define constants at module level and reuse them across tests — handled by fixture wrapper pattern.

---

## Shared Fixture Objects & Dependencies Map

### Shared Plan Fixtures

```
makePlan() [base factory]
├─→ planFixture() [task-decomposition.test.ts — SAFE with deepClone]
├─→ makePlanForStories() [orchestrator.test.ts — UNSAFE, used by 17+ tests]
├─→ makeGlobalPlan() [architecture-planner.test.ts — UNSAFE]
├─→ makeCurrentSprintPlan() [architecture-planner.test.ts — UNSAFE]
└─→ 10+ other variants [various test files — UNSAFE]
```

### Shared Story Fixtures

```
makeStory() [base factory]
├─→ storyFixture() [task-decomposition.test.ts — SAFE with deepClone]
├─→ makeRawStory() [orchestrator.test.ts — UNSAFE, used by 10+ tests]
└─→ 3+ variants [other test files — UNSAFE]
```

### Shared Task Plan Fixtures

```
makeMinimalSprintTaskPlan() [base factory]
├─→ minimalSprintFixture() [task-decomposition.test.ts — SAFE with deepClone]
├─→ makeTaskPlanForStories() [orchestrator.test.ts — UNSAFE, used by 5+ tests]
└─→ 2+ variants [other test files — UNSAFE]
```

---

## Summary of Pollution Vectors

| Vector | Count | Files | Severity |
|--------|-------|-------|----------|
| Unsafe plan factories without cloning | 7 | architecture-enforcer, architecture-planner, orchestrator, plan-validation, plan-revision, service-guard, sprint-state | **HIGH** |
| Unsafe story factories without cloning | 4 | base-agent, orchestrator, qa-engineer, others | **HIGH** |
| Tests reusing fixtures without cloning in beforeEach | 17 | All agents/src/*.test.ts | **HIGH** |
| Factories with mutable arrays (modules, tasks, storyIds) | 9 | core + agents test files | **MEDIUM** |
| Safe-by-construction factories (create new objects) | 3 | task-decomposition, story-dependencies, project-memory | **LOW** ✓ |

---

## Recommended Minimal Patches (Ordered by Impact)

### Priority 1: Orchestrator Tests (Highest Impact)

**File**: `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/orchestrator.test.ts`

**Patch**: Add `deepClone` helper and wrap factories

```typescript
// Line 1-2: Add import
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as structuredClone from 'util'; // or use inline helper if available

// Line 80 (after makeQueuedClient): Add deep clone helper
const deepClone = <T>(obj: T): T => {
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj)) as T;
};

// Line 175: Wrap makePlanForStories
const makePlanForStories = (storyIds: string[], level: 'global' | 'sprint', id: string): ArchitecturePlan =>
  deepClone({
    // ... existing factory body
  });

// Line 238: Wrap makeTaskPlanForStories
const makeTaskPlanForStories = (storyIds: string[]): SprintTaskPlan =>
  deepClone({
    // ... existing factory body
  });
```

**Impact**: 17+ test suites will be protected.

### Priority 2: Architecture Planner Tests

**File**: `/mnt/c/Users/jgron/Repos/splinty/packages/agents/src/architecture-planner.test.ts`

**Patch**: Wrap all plan factories (lines 286-330)

```typescript
const deepClone = <T>(obj: T): T => /* same as above */;

// Wrap makeGlobalPlan, makeCurrentSprintPlan, etc.
const makeGlobalPlan = (stories: Story[]): ArchitecturePlan =>
  deepClone({
    // ... body
  });
```

**Impact**: 10+ tests will be protected.

### Priority 3: Core Test Files

**Files to patch**:
- `architecture-enforcer.test.ts` (lines 13-118)
- `service-guard.test.ts` (line 15)
- `sprint-state.test.ts` (lines 20-129)
- `plan-validation.test.ts` (line 13)
- `plan-revision.test.ts` (lines 19-28)

**Pattern**: Add `deepClone` helper at top of each file, wrap factories

---

## Tests Lacking beforeEach/afterEach (Stateful Factories at File Scope)

**Finding**: Most core tests DO NOT have beforeEach/afterEach because they create fresh fixtures per test via inline factory calls. This is **safe** as long as factories create new objects (not clone shared state).

**Examples of safe patterns**:
- `story-dependencies.test.ts` — all tests call `makeStory()` inline, which creates new object
- `project-memory.manager.test.ts` — all makers return new object literals

**Risk**: Only when test file has both:
1. File-scope factory definition (e.g., `const makePlan = () => {...}`)
2. NO deepClone wrapping
3. Multiple tests reusing the same factory

This applies to ~8 core test files.

---

## Call Sites of structuredClone (Global Search)

Only **1 file** explicitly uses `structuredClone`:
- `packages/core/src/task-decomposition.test.ts` (lines 1, 19-25)

This is the **only currently protected** test file.

---

## Next Steps (Wave 9 Gate — Pre-Integration Testing)

Before Wave 9 integration tests start, the 11 pre-existing TaskDecomposer failures must be fixed. This research identifies that:

1. **TaskDecomposer tests are already protected** with `structuredClone` — if tests fail, it's due to logic, not pollution.
2. **Agent tests using TaskDecomposer will inherit pollution risk** — orchestrator.test.ts, architecture-planner.test.ts, etc. will need fixture protection before integration tests.

### Minimal Patches Required Before Wave 9

1. **Orchestrator tests** — Wrap `makePlanForStories()`, `makeTaskPlanForStories()` (1 file, ~10 lines)
2. **Architecture Planner tests** — Wrap plan factories (1 file, ~15 lines)
3. **Core test files** — Wrap 6 files' factories (6 files, ~20 lines total)

**Total effort**: ~3 hours to apply patches, verify `bun test` passes.

---

## Conventions & Patterns Observed

1. **Safe pattern** (used in task-decomposition.test.ts):
   ```typescript
   const deepClone = <T>(obj: T): T => structuredClone ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
   const storyFixture = (id: string) => deepClone(makeStory(id));
   ```

2. **Unsafe pattern** (used in 50+ tests):
   ```typescript
   const makePlan = () => ({ /* mutable object */ });
   // Tests call makePlan() directly without clone
   ```

3. **Safe-by-construction pattern** (story-dependencies.test.ts):
   ```typescript
   const makeStory = (id: string) => ({ id, ...literalProps });
   // Safe because it returns new object literal each call
   ```

---

## Files Ready for Integration Testing (No Patches Needed)

- ✓ `packages/core/src/task-decomposition.test.ts` — already protected with `deepClone`
- ✓ `packages/core/src/story-dependencies.test.ts` — safe by construction
- ✓ `packages/core/src/project-memory.manager.test.ts` — safe by construction
- ✓ Most API tests — immutable operations

---

## Files Requiring Patches Before Wave 9

**Blocking on D11 resolution**:

1. `packages/agents/src/orchestrator.test.ts` — 17 tests
2. `packages/agents/src/architecture-planner.test.ts` — 10+ tests
3. `packages/core/src/architecture-enforcer.test.ts` — 8+ tests
4. `packages/core/src/service-guard.test.ts` — 7 tests
5. `packages/core/src/sprint-state.test.ts` — 12+ tests
6. `packages/core/src/plan-validation.test.ts` — 20+ tests
7. `packages/core/src/plan-revision.test.ts` — 5+ tests

**Total test count**: 80+ tests across 7 files.

---

## Code Quality Observations

**Positive**:
- All test files use `describe`/`it` correctly from `bun:test`
- All agent tests properly clean up temp directories in `afterEach`
- Factories follow naming convention (`make*`, `*Fixture`)

**Negative**:
- No factory protection with deep cloning (except task-decomposition.test.ts)
- Mutable fixture arrays passed directly to tests
- No JSDoc or comments warning about fixture reuse

**Recommendation**: Establish team convention: "All fixtures returning objects with mutable properties (arrays, nested objects) MUST be wrapped with `deepClone()` or marked with `// SAFE: returns new object per call`".

