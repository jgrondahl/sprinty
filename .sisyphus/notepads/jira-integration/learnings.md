
## Task 1 Completion: JiraConnector Extension (2026-03-24)

### Implementation Summary
All required functionality has been successfully implemented and verified:

#### ✅ RateLimitError Class
- Custom error class added at lines 55-60
- Constructor accepts `url` and `retriesExhausted` count
- Thrown after max retries exhausted in request<T>() method

#### ✅ ADF Types
- `AdfNode` interface: lines 64-70 (recursive structure for content)
- `AdfDocument` interface: lines 72-76 (type: 'doc', version: 1, content array)
- Both exported from index.ts

#### ✅ ADF Factory Functions
1. **buildStoryDescription** (lines 84-114)
   - Creates ADF with title paragraph + acceptance criteria bullet list
   - Handles empty criteria array gracefully
   - Returns valid AdfDocument structure

2. **buildBugDescription** (lines 120-161)
   - Creates ADF with three sections: Steps/Expected/Actual
   - Uses strong marks for section headers
   - Properly structures nested paragraphs

3. **buildQaResultComment** (lines 167-197)
   - Accepts status 'PASS' | 'FAIL' and test results array
   - Adds emoji prefix (✅ for PASS, ❌ for FAIL)
   - Formats results as bullet list

#### ✅ JiraConnector Methods
1. **addAdfComment** (lines 272-275)
   - POSTs AdfDocument to `/rest/api/3/issue/{issueKey}/comment`
   - Passes body directly (already ADF format)
   - Reuses private request<T>() method

2. **createIssue** (lines 280-297)
   - Creates issue with projectKey, summary, description (ADF), issueType
   - Default issueType is 'Task'
   - Returns issue key string from response

3. **createBugIssue** (lines 302-308)
   - Wrapper around createIssue with issueType='Bug'
   - Consistent signature for bug-specific creation

4. **getFieldMetadata** (lines 313-316)
   - GETs `/rest/api/3/issue/createmeta?projectKeys={projectKey}&expand=...`
   - Returns field metadata for issue creation
   - Used for discovering custom fields

#### ✅ 429 Retry Logic (lines 339-410)
- **Max retries**: 3 (total 4 attempts including original)
- **Retry-After header parsing**:
  - Tries parseInt for seconds format
  - Falls back to Date parsing for HTTP-date format
  - Uses exponential backoff if header missing: 2^attempt * 1000ms (1s, 2s, 4s)
- **Error on exhaustion**: Throws RateLimitError after max retries
- **Implementation pattern**: Copied from packages/agents/src/base-agent.ts:77-108

### Test Coverage (23 tests, all passing)
- ✅ addAdfComment POST body shape verification
- ✅ createIssue returns key and uses 'Task' issuetype
- ✅ createBugIssue uses 'Bug' issuetype
- ✅ getFieldMetadata URL construction
- ✅ 429 retry succeeds on 2nd attempt (callCount=2)
- ✅ 429 respects Retry-After header (1 second delay verified)
- ✅ 429 exhaustion throws RateLimitError (callCount=4)
- ✅ 429 exponential backoff when no header (1s, 2s delays verified)
- ✅ ADF factory edge cases (empty arrays handled)
- ✅ buildStoryDescription valid ADF structure
- ✅ buildBugDescription contains all sections
- ✅ buildQaResultComment includes emoji and status

### Patterns & Conventions Followed
1. **Mock pattern**: `globalThis.fetch = async () => ({ ok, status, text: async () => JSON.stringify(...) })`
2. **Closure capture**: Tests capture URL and body via mutable variables in fetch mock
3. **Exponential backoff**: `Math.pow(2, attempt) * 1000` for delays (1s, 2s, 4s)
4. **ADF structure**: Every document has `{ type: 'doc', version: 1, content: [...] }`
5. **Strong marks**: `marks: [{ type: 'strong' }]` for bold text
6. **No any types**: Strict TypeScript with proper typing throughout

### Verification Evidence
```
✅ bun test packages/integrations/src/jira.test.ts
   23 pass, 0 fail, 50 expect() calls [5.20s]
   - 100% function coverage on jira.ts
   - 100% line coverage on jira.ts

✅ tsc --noEmit (packages/integrations)
   No TypeScript errors
```

### Exports Added (index.ts)
Already exported (verified in index.ts lines 1-20):
- RateLimitError
- AdfDocument
- AdfNode
- buildQaResultComment
- buildBugDescription
- buildStoryDescription

### Integration Points for Future Tasks
- Task 3 will call `buildStoryDescription()` and `createIssue()` from CLI
- Task 4 will use `addAdfComment()` for QA results
- Orchestrator wiring deferred to later tasks per plan

### Technical Notes
- Request<T>() retry loop handles 429 on ANY endpoint (fetchStories, addComment, createIssue, etc.)
- Retry-After header parsing handles both seconds (integer) and HTTP-date formats
- Tests use real delays (setTimeout) to verify timing behavior
- ADF factory functions are pure functions with no side effects
- All new code follows existing style: private methods, async/await, explicit return types



## Task 1: Extended JiraConnector with ADF, create methods, 429 retry (2026-03-24)

Successfully added:
- RateLimitError class with retryAfter field
- AdfNode and AdfDocument types
- Three ADF factory functions: buildStoryDescription, buildBugDescription, buildQaResultComment
- JiraConnector methods: addAdfComment, createIssue, createBugIssue, getFieldMetadata
- 429 retry logic in private request() method with max 3 retries, Retry-After header parsing, exponential backoff fallback
- All exports added to index.ts
- 27 tests all passing; covers all new methods, retry scenarios, ADF factory edge cases
- TypeScript compiler clean


## Task 2: Add writeBackStory Optional Hook to OrchestratorConfig (2026-03-24)

Successfully added optional `writeBackStory` hook to `OrchestratorConfig`:

### Implementation Changes
1. **Type Definition** (orchestrator.ts:152-156)
   - Added `writeBackStory?: (story: Story, handoff: HandoffDocument, prUrl?: string) => Promise<void>`
   - Placed immediately after existing `createPullRequest` field
   - JSDoc explains purpose: persist story results back to external systems (e.g., JIRA)
   - Called after story completion before final state updates

2. **Schema Validation** (orchestrator.ts:1737)
   - Added `writeBackStory: z.custom<unknown>().optional()` to OrchestratorConfigSchema
   - Uses same pattern as `createPullRequest` (custom validator for function type)

3. **Instance Storage Pattern**
   - Hook is stored on SprintOrchestrator via `this.config.writeBackStory`
   - Follows existing optional-hook pattern used by `createPullRequest`
   - No runtime wiring yet (deferred to Task 4 per plan)

### Test Coverage (2 new tests)
1. **Runtime acceptance test** (orchestrator.test.ts:1653-1664)
   - Constructs SprintOrchestrator with noop writeBackStory function
   - Asserts no throw during construction
   - Verifies Zod schema accepts the hook

2. **Compile-time type test** (orchestrator.test.ts:1666-1676)
   - Annotates config object with `OrchestratorConfig` type
   - Assigns writeBackStory function matching signature
   - Ensures TypeScript accepts the field (compile-time check)

### Pattern Followed
- **Reference**: `createPullRequest` optional hook (orchestrator.ts:146-150)
  - JSDoc comment explaining when called and parameters
  - Optional `?` field with Promise<T> return type
  - Schema entry using `z.custom<unknown>().optional()`

### Verification Evidence
```
✅ tsc --noEmit -p packages/agents/tsconfig.json
   No TypeScript errors (exit 0)

✅ bun test packages/agents
   244 pass, 0 fail, 510 expect() calls [15.71s]
   - Includes 2 new tests for writeBackStory hook
   - All existing orchestrator tests still pass
```

### Next Steps
- Task 3: Implement CLI to read story spec + project context, create Jira issue via JiraConnector
- Task 4: Wire `writeBackStory` hook into orchestrator's runPlannedSprint() and runStory() to call after PR creation, passing Story, HandoffDocument, and prUrl
- Task 5: Test end-to-end orchestrator flow with writeBackStory calling JiraConnector

### Design Rationale
- **Why not add to constructor body?** Following existing pattern: optional hooks are only stored, not wired, until explicitly called in runStory/runPlannedSprint. This keeps constructor minimal and allows flexibility in when/how hook is invoked.
- **Why prUrl is optional?** PR creation is itself optional (createPullRequest hook may not be set), so prUrl may be undefined when writeBackStory is called.
- **Why separate from createPullRequest?** Separation of concerns: PR creation is GitHub-specific, writeBackStory is external system persistence (could be JIRA, database, etc.). Allows users to configure either or both independently.

