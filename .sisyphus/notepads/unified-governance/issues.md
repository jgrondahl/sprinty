
---

## D11 Investigation: TaskDecomposer Test Failures (March 24, 2026)

### Executive Summary
- **Actual failure count**: 11 failing tests (matches D11 baseline)
- **Root cause**: Test pollution / order-dependent test failures
- **Failure pattern**: Tests pass in isolation but fail when run in full suite
- **Severity**: Medium (tests are flaky, not broken functionality)
- **Estimated fix effort**: 15-30 minutes per test (total: 3-5 hours)

### Reproduction
```bash
# Full suite fails with 11 test failures
cd /mnt/c/Users/jgron/Repos/splinty && bun test
# Result: 838 pass, 11 fail

# Isolated run passes all tests
cd /mnt/c/Users/jgron/Repos/splinty && bun test packages/core/src/task-decomposition.test.ts
# Result: 27 pass, 0 fail
```

### Failing Tests (All in packages/core/src/task-decomposition.test.ts)
1. `TaskDecomposer.decompose > single story single module single interface yields one task`
2. `TaskDecomposer.decompose > single story multi-module yields tasks per module interfaces`
3. `TaskDecomposer.decompose > multi-story shared modules keep correct storyIds per task`
4. `TaskDecomposer.decompose > module dependencies produce task dependencies and inputs`
5. `TaskDecomposer.decompose > task groups are derived from executionOrder`
6. `TaskDecomposer.decompose > creates integration tasks for modules with dependencies`
7. `TaskDecomposer.decompose > creates integration phase depending on all task groups`
8. `TaskDecomposer.decompose > filters acceptance criteria by module or interface name match`
9. `TaskDecomposer guardrails > custom guardrails override defaults`
10. `TaskDecomposer guardrails > maxTasksPerStory can trigger merge pass and reduce task count`
11. `TaskDecomposer guardrails > maxTasksPerSprint exceeded throws descriptive error`

### Example Failure (Test #1)
```
File: packages/core/src/task-decomposition.test.ts:204
Expected: module === "auth"
Received: module === "auth-module"

Error: expect(received).toBe(expected)
Context: The task.module field is set from ArchitecturePlan.modules[].name
The test expects module.name === "auth" but receives "auth-module"
```

### Root Cause Analysis
**Test pollution from earlier tests in the suite**

Evidence:
- Tests pass when run in isolation (package only)
- Tests fail at position #593 in full suite (838 total tests)
- Tests fail consistently when run after agents tests complete
- No global state mutation in task-decomposition.ts implementation
- The `makePlan()` helper creates module with `name: 'auth'` (line 53)
- Something before test #593 is mutating test data or environment

Probable culprits:
1. **File system state pollution**: Earlier tests may create temp directories/files that persist
2. **Module resolution cache**: Node/Bun module cache may be returning stale objects
3. **Global object mutation**: Some test may be mutating shared objects (ArchitecturePlan, ModuleDefinition)
4. **Timing/async issues**: Race conditions in test setup/teardown

### Diagnostic Details
- Test file: `packages/core/src/task-decomposition.test.ts` (645 lines)
- Implementation: `packages/core/src/task-decomposition.ts` (588 lines)
- Coverage: 85.92% functions, 93.75% lines (good coverage, not a code quality issue)
- Test helpers: `makePlan()` (line 32), `makeStory()` (line 18)
- No `beforeEach`, `afterEach`, `beforeAll`, or `afterAll` hooks in test file
- Tests use Bun's test runner (not Jest, Vitest, etc.)

### Remediation Plan

#### Priority 1: Quick Wins (30-60 minutes)
1. **Add test isolation guard**
   - Action: Add `beforeEach` hook to reset module resolution cache
   - File: `packages/core/src/task-decomposition.test.ts`
   - Code:
     ```typescript
     import { beforeEach } from 'bun:test';
     beforeEach(() => {
       // Clear any cached test fixtures
       // Force new object creation for each test
     });
     ```
   - Risk: Low
   - Confidence: Medium (may not fully fix)

2. **Deep-clone test fixtures**
   - Action: Wrap `makePlan()` and `makeStory()` with `structuredClone()`
   - File: `packages/core/src/task-decomposition.test.ts`
   - Code:
     ```typescript
     const plan = structuredClone(makePlan());
     const stories = [structuredClone(makeStory('story-1', [...]))];
     ```
   - Risk: Low
   - Confidence: High (prevents shared object mutation)

#### Priority 2: Root Cause Investigation (1-2 hours)
3. **Binary search for polluting test**
   - Action: Run test suite in chunks to isolate which package causes pollution
   - Commands:
     ```bash
     # Test agents only
     bun test packages/agents/src
     # Test agents + core
     bun test packages/agents/src packages/core/src/task-decomposition.test.ts
     # Bisect to find exact test file
     ```
   - Risk: None (diagnostic only)
   - Confidence: High (will identify culprit)

4. **Add test cleanup hook**
   - Action: Add `afterAll` hook to clean up global state in polluting test file
   - Target: TBD (depends on step 3 findings)
   - Risk: Low
   - Confidence: High

#### Priority 3: Long-term Solution (2-3 hours)
5. **Migrate to isolated test fixtures**
   - Action: Replace global `makePlan()` with factory pattern that guarantees isolation
   - File: Create `packages/core/src/__fixtures__/plan-factory.ts`
   - Code:
     ```typescript
     export class PlanFactory {
       static create(overrides?: Partial<ArchitecturePlan>): ArchitecturePlan {
         // Return fresh, deep-cloned object every time
         return structuredClone({ /* ... */ });
       }
     }
     ```
   - Risk: Medium (large refactor, 11 tests + other files may use makePlan)
   - Confidence: High (industry best practice)

6. **Add test run order documentation**
   - Action: Document test execution order and known interdependencies
   - File: `packages/core/src/README.test.md`
   - Content: Test execution graph, known pollution vectors, debug tips
   - Risk: None
   - Confidence: High (prevents future regressions)

### Decision Matrix

| Fix | Effort | Risk | Confidence | Priority |
|-----|--------|------|------------|----------|
| Deep-clone fixtures | 15 min | Low | High | **DO FIRST** |
| Binary search polluter | 1 hour | None | High | **DO SECOND** |
| Add beforeEach guard | 30 min | Low | Medium | DO THIRD |
| Cleanup hook in polluter | 30 min | Low | High | DO FOURTH |
| Migrate to factory pattern | 2 hours | Medium | High | DEFER (nice-to-have) |
| Add test order docs | 1 hour | None | High | DEFER (maintenance) |

### Recommended Next Action
**Execute Priority 1, Step 2 (Deep-clone test fixtures) FIRST**

Justification:
- Smallest effort (15 minutes)
- Highest confidence (prevents shared object mutation)
- Lowest risk (non-breaking change)
- Can be committed immediately
- If it doesn't fully fix, provides data for deeper investigation

### Notes
- All 11 failures are in the same test file (task-decomposition.test.ts)
- No code changes needed in implementation (task-decomposition.ts)
- Tests have good coverage (>85%), so failure is environmental, not functional
- The D11 baseline is accurate: exactly 11 pre-existing failures
- Issue does not block Wave 9 work (tests can be fixed in parallel)

### Evidence File
- Full test output: `.sisyphus/evidence/d11-investigation.txt`
- Test run timestamp: March 24, 2026
- Bun version: 1.3.10 (30e609e0)
- Total test suite: 838 pass, 11 fail, 1797 expect() calls


## D11: Fix Test Pollution in TaskDecomposer Tests - RESOLVED ✅

**Status**: FIXED - All 27 TaskDecomposer tests now pass in full test suite (849 tests, 0 failures)

**Cause**: Two-pronged test pollution:
1. `planFixture()` not wrapping with `deepClone()` - shallow references causing mutation
2. Missing `afterEach` hook in orchestrator.test.ts "writeBackStory hook" describe block - `TaskDecomposer.prototype.decompose` mock not restored

**Solution Applied**:
- Wrapped all fixture factory functions with `deepClone()/structuredClone()`
- Added `afterEach` hook to restore mocked decompose method
- Verified: full suite passes, all 27 task-decomposition tests pass, no test semantics changed

**Commit**: 5f448ae
**Evidence**: .sisyphus/evidence/d11-fix-run.txt
