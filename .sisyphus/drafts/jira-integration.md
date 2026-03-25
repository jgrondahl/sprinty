# Draft: Jira Read/Write Integration

## Requirements (confirmed)
- Read stories from Jira (currently exists, read-only)
- Create new stories in Jira (NEW)
- Update existing stories in Jira (NEW) — status transitions, description, comments

## Open Questions
- None remaining

## User Decisions (confirmed)

### Write-back scope
- POST QA results comment: verdict, passed/failed AC, bugs, PR URL
- Transition story status automatically (In Progress → Done/Blocked)
- Create new Jira Bug issues when QA finds bugs (linked to parent story)
- NO: update story description/fields with generated artifacts

### Story creation
- YES — new CLI command: `splinty create-story --title '...' (--project PROJ override)`
- NOT auto-created during sprint planning

### Write-back trigger
- AUTO at end of `splinty run` — controlled by JIRA_WRITEBACK_ENABLED=true
- --no-writeback flag suppresses for a specific run

### Jira deployment
- Cloud only (atlassian.net) — REST API v3, API token auth, ADF descriptions

### HTTP client
- Keep raw fetch — extend existing JiraConnector class, no new dep

### Acceptance criteria location
- Inside the Jira description (bullet points parsed by convention)

### Custom field discovery
- Auto-discover field IDs via GET /rest/api/3/field on startup (cached in memory)
- Story points: discover by name "Story Points"
- No dedicated AC custom field

### Project key for new issues
- JIRA_PROJECT_KEY env var (required for create/bug operations)

### Tests
- Unit tests with mocked fetch — mirror existing jira.test.ts pattern

## Technical Decisions
- (pending user answers)

## Research Findings

### Existing Jira Connector (packages/integrations/src/jira.ts)
- Already has: fetchStories (read), addComment, updateStatus, getTransitions — PARTIALLY WRITTEN
- Missing: createIssue, updateDescription, updateField, createSubtask
- Auth: Basic auth (base64 email:apiToken) — already wired to JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN

### Write-back: currently NOTHING is written back to any source after a sprint
- Only extensibility hook is optional `createPullRequest` callback in OrchestratorConfig (GitHub only)
- All sprint results (QA verdict, bugs, AC results, PR URL) stay in memory / local workspace

### Connector Pattern (canonical from GitHub connector)
- Class with typed config interface
- fetch*/parse* for reads returning Story[]
- async void/string write methods (addComment, updateStatus, createIssue, etc.)
- Custom error classes: AuthError (401), NotFoundError (404), ParseError

### Story Schema key fields relevant to Jira
- sourceId?: string — already stores "PROJ-1" style key
- state: StoryState — maps to Jira workflow transitions
- acceptanceCriteria: string[] — must map to/from ADF custom field or description
- source: StorySource.JIRA for Jira-sourced stories

### AppBuilderResult (output of orchestrator.run())
- storyId, gitBranch, prUrl?, commitShas[], testResults, duration, metrics
- QA verdict / bugs / failedAC are in handoff.stateOfWorld (not in AppBuilderResult directly)

### Jira REST API v3 key facts
- Auth: API token (Basic) is fine for server-to-server; OAuth 2.0 is more secure for long-lived
- Create issue: POST /rest/api/3/issue — fields.project.key, fields.issuetype.name, fields.summary required; description in ADF
- Update issue: PUT /rest/api/3/issue/{key} — fields or update blocks
- Add comment: POST /rest/api/3/issue/{key}/comment — body in ADF
- Transition: POST /rest/api/3/issue/{key}/transitions — needs transition id (fetched via GET first)
- Custom fields (story points, AC) vary by Jira instance — need GET /rest/api/3/field discovery
- ADF format: { type: "doc", version: 1, content: [ { type: "paragraph", content: [...] } ] }
- Rate limiting: 429 + Retry-After; new points-based limits in force March 2026 — need exponential backoff
- TypeScript: jira.js (npm) is the recommended typed client; OR raw fetch with hand-typed interfaces

### JIRA_PROJECT_KEY question
- createIssue needs a project key — not currently in JiraConfig

## Scope Boundaries
- INCLUDE: createIssue, createBugIssue, updateDescription, write-back hook in orchestrator, auto write-back after run, --no-writeback flag, `create-story` CLI command, field metadata discovery/caching, retry+backoff on 429, unit tests
- EXCLUDE: OAuth 2.0 auth (API token is sufficient), Jira Data Center/Server support, updating story description/fields with generated artifacts, integration tests against live Jira
