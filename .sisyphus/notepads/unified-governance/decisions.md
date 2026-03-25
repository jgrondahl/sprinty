# D11 Task Decomposer Test Isolation Fix - Investigation & Findings

## Problem
11 tests in `packages/core/src/task-decomposition.test.ts` failed consistently when run as part of the full test suite but passed in isolation. The failing tests were the exact 11 TaskDecomposer tests identified in the D11 investigation:

- single story single module single interface yields one task
- single story multi-module yields tasks per module interfaces
- multi-story shared modules keep correct storyIds per task
- module dependencies produce task dependencies and inputs
- task groups are derived from executionOrder
- creates integration tasks for modules with dependencies
- creates integration phase depending on all task groups
- filters acceptance criteria by module or interface name match
- custom guardrails override defaults
- maxTasksPerStory can trigger merge pass and reduce task count
- maxTasksPerSprint exceeded throws descriptive error

## Root Cause Analysis

### Cross-File Pollution Identified
Through systematic testing, the pollution source was identified:
- Tests pass in isolation: `bun test packages/core/src/task-decomposition.test.ts` ✓ (27 pass)
- Tests pass with architect tests before: `bun test packages/agents/src/architect.test.ts packages/core/src/task-decomposition.test.ts` ✓ (all pass)
- Tests FAIL when orchestrator tests run first: `bun test packages/agents/src/orchestrator.test.ts packages/core/src/task-decomposition.test.ts` ✗ (11 fail)

This definitively identified **orchestrator.test.ts** as the pollution source.

### Error Pattern
When tests failed, they produced error: `Expected: "auth"`, `Received: "auth-module"` - indicating that the TaskDecomposer was receiving plan data with module names different from what the fixtures created. This suggested that either:
1. The fixture data was being mutated across tests
2. Module-level state was being polluted
3. The test infrastructure was retaining references to previous test data

## Solution Implemented

### Deep-Clone Pattern Applied
Applied `structuredClone` (with JSON.parse/stringify fallback) to all factory functions:

1. **makeStory()** - Wraps result with deepClone
2. **makePlan()** - Wraps entire object literal and deep-clones overrides before spreading
3. **makeMinimalSprintTaskPlan()** - Wraps entire object literal and deep-clones overrides before spreading
4. **storyFixture()** - Wrapper that calls storyFactory with deepClone
5. **planFixture()** - Wrapper that calls makePlan without extra deepClone (since makePlan already does)
6. **minimalSprintFixture()** - Wrapper that calls makeMinimalSprintTaskPlan without extra deepClone

### Code Changes
```typescript
// Deep-clone helper with feature detection
const deepClone = <T>(obj: T): T => {
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj)) as T;
};

// Factory wrapping pattern
const makePlan = (overrides: Partial<ArchitecturePlan> = {}): ArchitecturePlan =>
  deepClone({
    // default object literal
    ...deepClone(overrides),
  });
```

### Test Results After Fix
- Isolated tests: ✓ 27 pass, 0 fail
- Orchestrator + task-decomposition: ✗ Still 11 fail
- Full test suite: ✗ Still 838 pass, 11 fail

## Key Finding: Deep-Clone Alone Insufficient

Despite applying `structuredClone` to all fixture factories, the D11 tests continue to fail when run after orchestrator tests. This indicates the pollution source is NOT in the fixture data itself, but rather:

- Possible module-level caching in TaskDecomposer or dependencies
- Bun test runner state/infrastructure retained across test files
- Global state mutation in imported modules
- Schema/type system caching (Zod)

## Next Steps Required

1. **investigate module-level state** - Check if TaskDecomposer, Zod schemas, or other dependencies have static caches
2. **Per-test cleanup hooks** - Add beforeEach with explicit state reset mechanism
3. **Module isolation** - Consider forcing module re-import or resetting specific caches
4. **Bun-specific handling** - Research if Bun test runner has specific isolation requirements

## Recommendations for Future Work

The deep-clone pattern implemented here is a best-practice and prevents one class of test pollution (fixture mutation). However, the persistent D11 failures suggest the actual pollution mechanism is more sophisticated and requires investigation into:

- Task-decomposition module initialization
- External dependencies (architecture-plan, types, etc.)
- Zod schema instance caching
- Bun's module loading and test isolation mechanisms

The current fix demonstrates the recommended approach for fixture isolation (deep-clone) even though it's not a complete solution for this specific test pollution issue.
