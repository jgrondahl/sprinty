# Scrum Product Plane + Delivery Provenance Plan

## TL;DR

> **Quick Summary**: Extend Splinty with a Scrum Product Plane (Product Goal, Product Backlog, Sprint Backlog, Increment, Sprint Review, Retrospective) and a Delivery Provenance Plane (Delivery Record, SBOM Manifest, Provenance Attestation, Post-Delivery Review) so that Splinty functions as a governed internal SDLC operating system.
> 
> **Deliverables**:
> - Catch-up migration for 7 unmigrated governance tables + 5 new repositories
> - New `product_goals` and `delivery_records` dedicated tables
> - 8 new artifact type enum values for document-like artifacts stored in `artifact_versions`
> - `sortOrder` and `readiness` columns on `stories` table for Product Backlog ordering
> - 6 new RBAC permissions with role matrix updates
> - 15 new API routes across 8 route files (product-goals, delivery-records, increments, sprint-reviews, retrospectives, sbom, attestations, post-delivery-reviews)
> - Zod validation schemas for all new artifact payload types
> - Web UI pages for Product Goal management, Backlog view, Sprint Backlog, Increment/Review/Retro creation, and Delivery Record tracking
> - End-to-end pilot flow verifying full Scrum + Delivery lifecycle
> 
> **Estimated Effort**: XL
> **Parallel Execution**: YES — 6 waves (Wave 0-5)
> **Critical Path**: Wave 0 (catch-up migration) → Wave 1 (schema + types) → Wave 2 (Product Plane routes) → Wave 3 (Delivery routes) → Wave 4 (Web UI) → Wave 5 (Integration pilot + Final Verification)

---

## Context

### Original Request
User provided a comprehensive planning document titled "Splinty — Scrum Product Plane + Delivery Provenance Plan" specifying full component designs (A1-A6 Scrum, B1-B4 Delivery), API surface (15 routes), schema requirements, evaluation/approval rules, non-negotiable rules, wave breakdown (P1-P5), and explicit execution workflow instructions.

### Interview Summary
**Key Discussions**:
- **Dedicated tables vs artifact payloads**: HYBRID approach — dedicated tables for Product Goal (high-query structured entity) and Delivery Record (critical audit entity with FK relationships). All other artifact types (Increment, Sprint Review, Retrospective, SBOM, Attestation, Post-Delivery Review) stored as typed JSON payloads in `artifact_versions`.
- **Product Backlog**: NOT a new table — filtered/ordered VIEW of stories. Add `sortOrder` (integer) and `readiness` (text enum) columns to existing `stories` table.
- **Sprint Backlog**: NOT a new table — extend existing `sprints` table + `stories.sprintId` FK relationship.
- **Story state machine**: IMMUTABLE overlay — Scrum workflows MAP to existing StoryState values, do not add new states.
- **Test strategy**: TDD with `bun test`. 850 test baseline is the regression floor.
- **Two-migration strategy**: Migration 1 catches up 7 unmigrated tables, Migration 2 adds new Scrum/Delivery schema.

**Research Findings**:
- 7 tables exist in Drizzle schema but have NO migration (artifact_versions, artifact_evaluations, artifact_lineage, gate_definitions, stage_transitions, story_metrics, velocity_snapshots)
- TWO parallel artifact type systems: DB `artifactTypeEnum` (8 governance types) vs Core `ArtifactTypeSchema` (10 project-memory types) — both need coordinated expansion
- PostgreSQL enum expansion is destructive (add-only, no removal) — vocabulary must be frozen before migration
- No repositories exist for 5 governance tables (artifact_versions, artifact_evaluations, artifact_lineage, gate_definitions, stage_transitions)
- Core StorySchema Zod omits FK fields — StoryRepository.toStoryRow() mapper must be updated when stories columns change
- API uses pure Bun.serve() with manual regex routing — each new route needs regex pattern + import + handler in server.ts
- Web UI uses NO framework — inline styles, React 19, Router 7, custom fetch hooks, WebApiClient singleton

### Metis Review
**Identified Gaps** (all addressed in this plan):
- Schema-migration gap for 7 tables → Wave 0 catch-up migration
- Two parallel artifact type systems → Coordinate expansion in both DB enum and Core Zod schema
- Missing sortOrder/readiness on stories → Wave 1 schema addition
- No repositories for artifact/promotion tables → Wave 0 repository creation
- No RBAC permissions for new planes → Wave 1 permission expansion
- Core StorySchema missing FK fields → Update Zod + mapper when adding columns
- 850 test baseline must be preserved → Every task includes `bun test` regression gate

**Guardrails Applied** (G1-G7 from Metis):
- G1: Agent pipeline (`packages/agents/`) is OFF-LIMITS
- G2: Frozen artifact vocabulary — no execution agent invents types outside frozen contracts
- G3: Story state machine is IMMUTABLE — no new states
- G4: Two-migration strategy (catch-up first, then new schema)
- G5: No UI framework — inline styles only
- G6: Test baseline (850 tests, 0 failures) is sacred — every task must maintain it
- G7: Per-task file boundaries strictly enforced

---

## Work Objectives

### Core Objective
Transform Splinty into a governed SDLC operating system by adding a Scrum Product Plane (goal-driven backlog management, sprint commitment, increment evaluation, review/retrospective ceremonies) and a Delivery Provenance Plane (auditable delivery records, SBOM/attestation seams, post-delivery quality assessment).

### Concrete Deliverables
- **DB Migration 0001**: Catch-up migration for 7 unmigrated governance tables
- **DB Migration 0002**: New tables (product_goals, delivery_records), expanded artifactTypeEnum (+8 values), stories table columns (sortOrder, readiness)
- **5 New Repositories**: ArtifactVersionRepository, ArtifactEvaluationRepository, ArtifactLineageRepository, GateDefinitionRepository, StageTransitionRepository
- **2 New Repositories**: ProductGoalRepository, DeliveryRecordRepository
- **8 Route Files**: product-goals.ts, delivery-records.ts, increments.ts, sprint-reviews.ts, retrospectives.ts, sbom.ts, attestations.ts, post-delivery-reviews.ts
- **15 API Endpoints**: Full CRUD + domain operations across all planes
- **6 RBAC Permissions**: PRODUCT_GOAL_READ/WRITE, DELIVERY_RECORD_READ/WRITE, ARTIFACT_VERSION_READ/WRITE
- **Zod Schemas**: Typed payload schemas for all 8 new artifact types
- **Web UI Pages**: ProductGoalsPage, BacklogPage, SprintBacklogView, IncrementPage, SprintReviewPage, RetrospectivePage, DeliveryRecordsPage
- **Web Hooks/Client**: useProductGoals, useBacklog, useDeliveryRecords + WebApiClient methods

### Definition of Done
- [ ] `bunx drizzle-kit generate` (run from `packages/db/`) produces clean migration (0001 + 0002)
- [ ] `bun test` passes with ≥850 tests, 0 failures
- [ ] All 15 API routes return correct responses (tested via curl)
- [ ] All Web UI pages render and navigate correctly (tested via bun test + curl)
- [ ] Full Scrum lifecycle testable: Create Product Goal → Populate Backlog → Plan Sprint → Complete Sprint → Create Increment → Sprint Review → Retrospective
- [ ] Full Delivery lifecycle testable: Create Delivery Record → Attach SBOM seam → Attach Attestation seam → Post-Delivery Review

### Must Have
- Every new artifact has: schema contract, lineage rules, approval behavior, evaluation rules, audit events
- Sprint Review is NOT a release gate (evaluation only, no state transitions)
- Release governance overlays Scrum; it does not replace it
- Delivery provenance is evidence-oriented, not narrative-only
- Two-migration strategy (catch-up first, then new)
- All routes follow existing patterns: Zod validation, authMiddleware, requirePermission, AuditRepository.append, WebhookDispatcher.dispatch

### Must NOT Have (Guardrails)
- **G1**: No modifications to `packages/agents/` or `packages/cli/`
- **G2**: No artifact vocabulary outside frozen contracts — all 8 new types defined in Wave 1, immutable thereafter
- **G3**: No new StoryState enum values — Scrum workflows map to existing states
- **G4**: No hand-written SQL migrations — use `drizzle-kit generate` only
- **G5**: No UI framework (Tailwind, MUI, Chakra) — inline styles only
- **G6**: No test regression — 850 baseline maintained at every task
- **G7**: No cross-task file contamination — each task owns specific files
- **SC1**: No actual SBOM generation or Sigstore signing — seams/schemas only
- **SC2**: No complex approval UI — minimal forms following existing patterns
- **SC3**: No auto-generated delivery records — manual creation via API
- **SC4**: No Product Goal hierarchies — flat goals per project
- **SC5**: No new dashboard pages — extend existing views only where needed
- **SC6**: No agent pipeline integration — Scrum ceremonies are API-driven, not agent-driven

---

## Verification Strategy

> **Automated verification for repeatable checks. Human review for final acceptance.**
> Agent-executed QA covers unit tests, integration tests, and API contract validation.
> Final Verification Wave (F1-F4) produces a consolidated report for human sign-off before marking work complete.

### Test Decision
- **Infrastructure exists**: YES (bun test, 850 tests across 76 files)
- **Automated tests**: TDD (RED → GREEN → REFACTOR)
- **Framework**: bun test
- **Each task**: Write failing tests first, then implement, then verify `bun test` passes

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API Routes**: Use Bash (curl) — Send requests, assert status + response fields. **All curl scenarios must follow the "QA Setup" section below for server startup, user registration, and token capture.**
- **DB Migrations**: Use Bash (bun run) — Generate migration, verify SQL output, apply to test DB
- **Repositories**: Use Bash (bun test) — Unit tests with DB assertions
- **Web UI**: Use Bash (bun test) — Export sanity tests (verify component exports a function) following `packages/web/src/App.test.tsx` pattern. No component rendering tests (no Testing Library/jsdom available). Playwright is NOT available in this repo.
- **RBAC**: Use Bash (curl) — Test forbidden/allowed access per role

### QA Setup (shared preconditions for curl-based scenarios)

All curl-based QA scenarios in this plan require a running server and authenticated user. Use these concrete steps to satisfy those preconditions:

```bash
# 1. Start the API server (from repo root)
cd packages/api && bun run src/server.ts &
API_PID=$!
sleep 2  # wait for server to bind

# 2. Register a user + org (returns JWT)
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"qa@test.com","password":"Test1234!","name":"QA User","orgName":"QA Org"}')
TOKEN=$(echo $REGISTER_RESPONSE | jq -r '.token')
ORG_ID=$(echo $REGISTER_RESPONSE | jq -r '.user.orgId')

# 3. Create a project (needed for project-scoped routes)
PROJECT_RESPONSE=$(curl -s -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"QA Project"}')
PROJECT_ID=$(echo $PROJECT_RESPONSE | jq -r '.id')

# 4. All subsequent curl commands use:
#    -H "Authorization: Bearer $TOKEN"
#    Replace {projectId} with $PROJECT_ID

# 5. Cleanup after QA
kill $API_PID
```

**NOTE**: The registered user gets `admin` role by default (see `packages/api/src/routes/auth.ts`). VIEWER role permission checks are tested via `bun test` unit tests with mocked auth context (not via curl), since the API has no endpoint to create/downgrade users to VIEWER role.

**NOTE**: `jq` is used for JSON parsing in QA scripts. If not available, use `bun -e "console.log(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).token)"` as alternative.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (Foundation — catch-up migration + missing repositories):
├── Task 1: Generate catch-up migration for 7 unmigrated tables [quick]
├── Task 2: ArtifactVersionRepository [quick]
├── Task 3: ArtifactEvaluationRepository [quick]
├── Task 4: ArtifactLineageRepository [quick]
├── Task 5: GateDefinitionRepository + StageTransitionRepository [quick]
└── Task 6: Export all new repositories from index.ts [quick]

Wave 1 (Schema + Types — new tables, enum expansion, Zod contracts):
├── Task 7: Expand artifactTypeEnum with 8 new values [quick]
├── Task 8: Create product_goals table schema [quick]
├── Task 9: Create delivery_records table schema [quick]
├── Task 10: Add sortOrder + readiness columns to stories table [quick]
├── Task 11: Generate migration 0002 for all Wave 1 schema changes [quick]
├── Task 12: Zod payload schemas for all 8 new artifact types [unspecified-high]
├── Task 13: RBAC permission expansion (6 new permissions + matrix) [quick]
└── Task 14: Update Core StorySchema + StoryRepository mapper for new columns [quick]

Wave 2 (Product Plane API — routes + repositories for Scrum):
├── Task 15: ProductGoalRepository [unspecified-high]
├── Task 16: Product Goal API routes (POST/GET/PATCH) [unspecified-high]
├── Task 17: Product Backlog API route (GET + refine) [unspecified-high]
├── Task 18: Sprint Planning API route (POST sprint plan) [unspecified-high]
├── Task 19: Increment creation route (POST) [unspecified-high]
├── Task 20: Sprint Review route (POST) [unspecified-high]
└── Task 21: Retrospective route (POST) [unspecified-high]

Wave 3 (Delivery Provenance API — routes for delivery plane):
├── Task 22: DeliveryRecordRepository [unspecified-high]
├── Task 23: Delivery Record API routes (POST/GET) [unspecified-high]
├── Task 24: SBOM Manifest seam route (POST) [unspecified-high]
├── Task 25: Provenance Attestation seam route (POST) [unspecified-high]
├── Task 26: Post-Delivery Review route (POST) [unspecified-high]
└── Task 27: Register all new routes in server.ts [unspecified-high]

Wave 4 (Web UI — pages, hooks, client methods):
├── Task 28: WebApiClient methods for all new endpoints [quick]
├── Task 29: ProductGoalsPage + useProductGoals hook [visual-engineering]
├── Task 30: BacklogPage + useBacklog hook [visual-engineering]
├── Task 31: SprintBacklogView (extend SprintViewer) [visual-engineering]
├── Task 32: IncrementPage + SprintReviewPage + RetrospectivePage [visual-engineering]
├── Task 33: DeliveryRecordsPage + useDeliveryRecords hook [visual-engineering]
└── Task 34: Route registration in App.tsx [quick]

Wave 5 (Integration Pilot + Final Verification):
├── Task 35: Scrum lifecycle integration pilot test [deep]
├── Task 36: Delivery Provenance lifecycle integration pilot test [deep]
└── Final Verification Wave (F1-F4)

Critical Path: T1 → T7/T8/T9/T10 → T11 → T15/T16 → T27 → T28 → T29-T34 → T35/T36 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 8 (Wave 1)
```

### Dependency Matrix

| Task | Blocked By | Blocks |
|------|-----------|--------|
| 1 | — | 2-6, 7-14 |
| 2-5 | 1 | 6, 15-27 |
| 6 | 2-5 | 15-27 |
| 7 | 1 | 11, 12, 19-21, 24-26 |
| 8 | 1 | 11, 15, 16 |
| 9 | 1 | 11, 22, 23 |
| 10 | 1 | 11, 14, 17 |
| 11 | 7-10 | 15-27 |
| 12 | 7 | 19-21, 24-26 |
| 13 | — | 16-27 |
| 14 | 10 | 17 |
| 15 | 8, 11 | 16 |
| 16 | 13, 15 | 27, 29 |
| 17 | 13, 14 | 27, 30 |
| 18 | 13 | 27, 31 |
| 19 | 12, 13 | 27, 32 |
| 20 | 12, 13 | 27, 32 |
| 21 | 12, 13 | 27, 32 |
| 22 | 9, 11 | 23 |
| 23 | 13, 22 | 27, 33 |
| 24 | 12, 13 | 27, 33 |
| 25 | 12, 13 | 27, 33 |
| 26 | 12, 13 | 27, 33 |
| 27 | 16-26 | 28 |
| 28 | 27 | 29-34 |
| 29 | 28 | 34, 35 |
| 30 | 28 | 34, 35 |
| 31 | 28 | 34, 35 |
| 32 | 28 | 34, 35 |
| 33 | 28 | 34, 36 |
| 34 | 29-33 | 35, 36 |
| 35 | 34 | F1-F4 |
| 36 | 34 | F1-F4 |

### Agent Dispatch Summary

- **Wave 0**: **6 tasks** — T1 → `quick`, T2-T5 → `quick`, T6 → `quick`
- **Wave 1**: **8 tasks** — T7-T11 → `quick`, T12 → `unspecified-high`, T13-T14 → `quick`
- **Wave 2**: **7 tasks** — T15 → `unspecified-high`, T16-T21 → `unspecified-high`
- **Wave 3**: **6 tasks** — T22 → `unspecified-high`, T23-T26 → `unspecified-high`, T27 → `unspecified-high`
- **Wave 4**: **7 tasks** — T28 → `quick`, T29-T33 → `visual-engineering`, T34 → `quick`
- **Wave 5**: **2 tasks** — T35-T36 → `deep`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

### Wave 0 — Foundation: Catch-Up Migration + Missing Repositories

- [ ] 1. Generate catch-up migration for 7 unmigrated governance tables

  **What to do**:
  - Run `drizzle-kit generate` to produce a migration file (0001_*.sql) that creates the 7 tables already defined in Drizzle schema but missing from the DB: `artifact_versions`, `artifact_evaluations`, `artifact_lineage`, `gate_definitions`, `stage_transitions`, `story_metrics`, `velocity_snapshots`
  - Also creates the `artifact_type` enum, `promotion_stage` enum, and `relationship_type` enum referenced by these tables. NOTE: There is no `evaluation_dimension` or `approval_decision` enum — dimension scores are stored as jsonb and approval decisions are embedded in the `approvals` jsonb column.
  - Verify the generated SQL contains CREATE TABLE statements for all 7 tables
  - Verify no existing tables (organizations, users, projects, epics, stories, sprints, etc.) are duplicated
  - Run `bun test` to confirm no regression

  **Must NOT do**:
  - Do NOT hand-write SQL — use `drizzle-kit generate` only
  - Do NOT modify any existing schema files — this task only generates the migration
  - Do NOT touch `packages/agents/` or `packages/cli/`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single drizzle-kit command + verification — no complex logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed
    - `git-master`: No git operations needed

  **Parallelization**:
  - **Can Run In Parallel**: NO — must complete before all other tasks
  - **Parallel Group**: Wave 0 (sequential — first task)
  - **Blocks**: Tasks 2-6, 7-14
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/db/drizzle/0000_worried_silver_fox.sql` — Existing migration file showing the expected SQL format and table creation patterns
  - `packages/db/drizzle.config.ts` — Drizzle config specifying schema location and migration output directory

  **API/Type References**:
  - `packages/db/src/schema/artifact_versions.ts` — Schema definition for artifact_versions table + artifactTypeEnum (lines 1-26)
  - `packages/db/src/schema/artifact_evaluations.ts` — Schema definition for artifact_evaluations table (columns: artifactType, artifactId, artifactVersion, evaluationModel, overallScore, dimensionScores jsonb, rawLlmResponse jsonb, evaluatedBy, evaluatedAt, orgId, projectId)
  - `packages/db/src/schema/artifact_lineage.ts` — Schema definition for artifact_lineage table + relationshipTypeEnum
  - `packages/db/src/schema/promotion.ts` — Schema definition for gate_definitions + stage_transitions tables + promotionStageEnum (no approvalDecisionEnum — approvals stored as jsonb array of {userId, role, decision, justification, timestamp})
  - `packages/db/src/schema/story_metrics.ts` — Schema definition for story_metrics table
  - `packages/db/src/schema/velocity_snapshots.ts` — Schema definition for velocity_snapshots table

  **External References**:
  - Drizzle Kit generate docs: `https://orm.drizzle.team/docs/drizzle-kit-generate`

  **WHY Each Reference Matters**:
  - The existing migration file shows the exact SQL dialect (PostgreSQL) and naming conventions used
  - Each schema file defines the exact table structure drizzle-kit will read to generate SQL
  - The drizzle config tells drizzle-kit where to find schemas and where to output migrations

  **Acceptance Criteria**:

  **TDD:**
  - [ ] No new test file needed — this is a migration generation task
  - [ ] `bun test` → PASS (≥850 tests, 0 failures) — regression gate

  **QA Scenarios:**

  ```
  Scenario: Migration file generated with all 7 tables
    Tool: Bash
    Preconditions: packages/db/drizzle/ contains only 0000_worried_silver_fox.sql
    Steps:
      1. Run `bunx drizzle-kit generate` from packages/db/      2. List files in packages/db/drizzle/ — expect a new 0001_*.sql file
      3. Read the new migration file
      4. Assert it contains: CREATE TABLE "artifact_versions"
      5. Assert it contains: CREATE TABLE "artifact_evaluations"
      6. Assert it contains: CREATE TABLE "artifact_lineage"
      7. Assert it contains: CREATE TABLE "gate_definitions"
      8. Assert it contains: CREATE TABLE "stage_transitions"
      9. Assert it contains: CREATE TABLE "story_metrics"
      10. Assert it contains: CREATE TABLE "velocity_snapshots"
      11. Assert it contains: CREATE TYPE "artifact_type" (or DO $$ block for enum). Also expect "promotion_stage" and "relationship_type" enums. Do NOT expect "evaluation_dimension" or "approval_decision" enums (these don't exist).
      12. Assert it does NOT contain: CREATE TABLE "organizations" or CREATE TABLE "users" (no duplication)
    Expected Result: New migration file with exactly 7 CREATE TABLE statements + 3 enum definitions (artifact_type, promotion_stage, relationship_type), no duplicate tables
    Failure Indicators: Missing tables, duplicate table creation, drizzle-kit error
    Evidence: .sisyphus/evidence/task-1-migration-generated.txt

  Scenario: Test baseline preserved after migration generation
    Tool: Bash
    Preconditions: Migration file generated
    Steps:
      1. Run `bun test` from repo root
      2. Assert output contains "0 fail"
      3. Assert test count ≥ 850
    Expected Result: All tests pass, no regression
    Failure Indicators: Any test failure, test count below 850
    Evidence: .sisyphus/evidence/task-1-test-baseline.txt
  ```

  **Commit**: YES
  - Message: `chore(db): generate catch-up migration for 7 governance tables`
  - Files: `packages/db/drizzle/0001_*.sql`
  - Pre-commit: `bun test`

- [ ] 2. Create ArtifactVersionRepository

  **What to do**:
  - Create `packages/db/src/repositories/artifact-version.repo.ts`
  - Implement class `ArtifactVersionRepository` with constructor `(private db: DbClient)`
  - Methods: `create(input)`, `findById(id)`, `findByArtifactId(artifactId)`, `findByType(artifactType)`, `findLatestVersion(artifactId)`, `listAll(filters?)` — return typed results. NOTE: The artifact_versions table has NO orgId or projectId columns, so all queries are unscoped. Scoping by project/org must be done via the `artifactId` field (which contains the related entity's ID) at the caller level.
  - Write TDD tests in `packages/db/src/repositories/artifact-version.repo.test.ts`
  - Follow exact patterns from `packages/db/src/repositories/story.repo.ts` (class structure, error handling, query building)

  **Must NOT do**:
  - Do NOT modify the artifact_versions schema file
  - Do NOT export from index.ts yet (Task 6 handles that)
  - Do NOT add methods beyond standard CRUD + the listed queries

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single repository file following established pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 3, 4, 5
  - **Parallel Group**: Wave 0 (after Task 1)
  - **Blocks**: Task 6, Tasks 19-21 (artifact-based routes)
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/story.repo.ts` — Primary pattern reference: class structure, constructor signature, DbClient injection, query patterns, error handling, return types
  - `packages/db/src/repositories/sprint.repo.ts` — Secondary pattern: simpler CRUD operations, filter patterns

  **API/Type References**:
  - `packages/db/src/schema/artifact_versions.ts:1-26` — Table definition with columns: id, artifactType, artifactId, version, snapshotData, createdBy, createdAt, metadata
  - `packages/db/src/schema/artifact_versions.ts:4-13` — artifactTypeEnum values for type filtering

  **WHY Each Reference Matters**:
  - story.repo.ts shows the exact class-based repository pattern with DbClient injection that ALL repos follow
  - The schema file defines the exact columns and types the repository must query against

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/db/src/repositories/artifact-version.repo.test.ts`
  - [ ] `bun test packages/db/src/repositories/artifact-version.repo.test.ts` → PASS (≥6 tests)
  - [ ] Tests cover: create, findById, findByArtifactId, findByType, findLatestVersion, listAll

  **QA Scenarios:**

  ```
  Scenario: Repository CRUD operations work correctly
    Tool: Bash (bun test)
    Preconditions: Task 1 migration exists, mocked DbClient
    Steps:
      1. Run `bun test packages/db/src/repositories/artifact-version.repo.test.ts`
      2. Assert all tests pass
      3. Verify test file contains describe blocks for create, findById, findByArtifactId, findByType, findLatestVersion, listAll
    Expected Result: All repository method tests pass
    Failure Indicators: Test failures, missing method implementations
    Evidence: .sisyphus/evidence/task-2-repo-tests.txt

  Scenario: Repository class follows established pattern
    Tool: Bash (grep)
    Preconditions: Repository file created
    Steps:
      1. Read artifact-version.repo.ts
      2. Assert it contains `class ArtifactVersionRepository`
      3. Assert it contains `constructor(private db: DbClient)`
      4. Assert it imports from '../schema/artifact_versions'
      5. Assert it does NOT contain `as any` or `@ts-ignore`
    Expected Result: Repository follows class-based pattern with typed DbClient
    Failure Indicators: Missing class structure, untyped database access
    Evidence: .sisyphus/evidence/task-2-pattern-check.txt
  ```

  **Commit**: YES (groups with Tasks 3-6)
  - Message: `feat(db): add repositories for artifact governance tables`
  - Files: `packages/db/src/repositories/artifact-version.repo.ts`, `packages/db/src/repositories/artifact-version.repo.test.ts`
  - Pre-commit: `bun test`

- [ ] 3. Create ArtifactEvaluationRepository

  **What to do**:
  - Create `packages/db/src/repositories/artifact-evaluation.repo.ts`
  - Implement class `ArtifactEvaluationRepository` with constructor `(private db: DbClient)`
  - Methods: `create(input)`, `findById(id)`, `findByArtifact(artifactType, artifactId)`, `findByArtifactVersion(artifactType, artifactId, artifactVersion)`, `listByOrg(orgId, filters?)`
  - Write TDD tests in `packages/db/src/repositories/artifact-evaluation.repo.test.ts`
  - Follow exact patterns from `packages/db/src/repositories/story.repo.ts`

  **Must NOT do**:
  - Do NOT modify the artifact_evaluations schema file
  - Do NOT export from index.ts yet (Task 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single repository file following established pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 2, 4, 5
  - **Parallel Group**: Wave 0 (after Task 1)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/story.repo.ts` — Class structure, constructor, DbClient injection pattern
  - `packages/db/src/repositories/artifact-version.repo.ts` — Sibling repo (if Task 2 completes first) for artifact-domain query patterns

  **API/Type References**:
  - `packages/db/src/schema/artifact_evaluations.ts` — Table definition with columns: id, artifactType (artifactTypeEnum), artifactId (text), artifactVersion (integer), evaluationModel (text), overallScore (numeric), dimensionScores (jsonb array of {dimension, score, reasoning}), rawLlmResponse (jsonb), evaluatedBy (text), evaluatedAt (timestamp), orgId (uuid FK), projectId (uuid FK)

  **WHY Each Reference Matters**:
  - story.repo.ts provides the canonical repository pattern
  - The schema file defines exact columns for query construction

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/db/src/repositories/artifact-evaluation.repo.test.ts`
  - [ ] `bun test packages/db/src/repositories/artifact-evaluation.repo.test.ts` → PASS (≥5 tests)

  **QA Scenarios:**

  ```
  Scenario: Evaluation repository CRUD works
    Tool: Bash (bun test)
    Preconditions: Task 1 migration exists
    Steps:
      1. Run `bun test packages/db/src/repositories/artifact-evaluation.repo.test.ts`
      2. Assert all tests pass
    Expected Result: All evaluation repository tests pass
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-3-repo-tests.txt
  ```

  **Commit**: YES (groups with Tasks 2, 4-6)
  - Message: `feat(db): add repositories for artifact governance tables`
  - Files: `packages/db/src/repositories/artifact-evaluation.repo.ts`, test file
  - Pre-commit: `bun test`

- [ ] 4. Create ArtifactLineageRepository

  **What to do**:
  - Create `packages/db/src/repositories/artifact-lineage.repo.ts`
  - Implement class `ArtifactLineageRepository` with constructor `(private db: DbClient)`
  - Methods: `create(input)`, `findById(id)`, `findByParent(parentType, parentId)`, `findByChild(childType, childId)`, `findByRelationshipType(type)`, `getLineageChain(artifactType, artifactId)` — traces upstream lineage by following parentType/parentId links
  - Write TDD tests in `packages/db/src/repositories/artifact-lineage.repo.test.ts`
  - Follow exact patterns from story.repo.ts

  **Must NOT do**:
  - Do NOT modify the artifact_lineage schema file
  - Do NOT export from index.ts yet (Task 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single repository file following established pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 2, 3, 5
  - **Parallel Group**: Wave 0 (after Task 1)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/story.repo.ts` — Class structure, constructor, DbClient injection

  **API/Type References**:
  - `packages/db/src/schema/artifact_lineage.ts` — Table definition with columns: id, parentType (artifactTypeEnum), parentId (text), childType (artifactTypeEnum), childId (text), relationshipType (relationshipTypeEnum), createdAt (timestamp), metadata (jsonb nullable)
  - Relationship types: `derived_from`, `decomposed_from`, `verified_by`, `supersedes`, `implements`

  **WHY Each Reference Matters**:
  - Lineage repository must support chain traversal (getLineageChain) — important for Scrum→Delivery traceability later
  - The 5 relationship types define the domain vocabulary for lineage queries

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/db/src/repositories/artifact-lineage.repo.test.ts`
  - [ ] `bun test packages/db/src/repositories/artifact-lineage.repo.test.ts` → PASS (≥6 tests)

  **QA Scenarios:**

  ```
  Scenario: Lineage repository traces upstream chain
    Tool: Bash (bun test)
    Preconditions: Task 1 migration exists
    Steps:
      1. Run `bun test packages/db/src/repositories/artifact-lineage.repo.test.ts`
      2. Assert all tests pass, including getLineageChain test
    Expected Result: Chain traversal correctly returns ordered lineage
    Failure Indicators: Test failures, incorrect chain ordering
    Evidence: .sisyphus/evidence/task-4-repo-tests.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3, 5-6)
  - Message: `feat(db): add repositories for artifact governance tables`
  - Files: `packages/db/src/repositories/artifact-lineage.repo.ts`, test file
  - Pre-commit: `bun test`

- [ ] 5. Create GateDefinitionRepository + StageTransitionRepository

  **What to do**:
  - Create `packages/db/src/repositories/gate-definition.repo.ts`
  - Implement class `GateDefinitionRepository`: `create`, `findById`, `findByTransition(fromStage, toStage)`, `findByFromStage(fromStage)`, `listAll(orgId?)`, `listByProject(projectId)`
  - Create `packages/db/src/repositories/stage-transition.repo.ts`
  - Implement class `StageTransitionRepository`: `create`, `findById`, `findByArtifact(artifactType, artifactId)`, `findByFromStage(stage)`, `findByToStage(stage)`, `getTransitionHistory(artifactType, artifactId)` — ordered by transitionedAt
  - Write TDD tests for both in separate test files
  - Follow exact patterns from story.repo.ts

  **Must NOT do**:
  - Do NOT modify the promotion schema file
  - Do NOT export from index.ts yet (Task 6)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small repositories following established pattern, combined to reduce task overhead
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 2, 3, 4
  - **Parallel Group**: Wave 0 (after Task 1)
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/story.repo.ts` — Class structure, constructor, DbClient injection

  **API/Type References**:
  - `packages/db/src/schema/promotion.ts` — Table definitions for gate_definitions (fromStage, toStage promotionStageEnum, requiredEvidence jsonb, requiredApprovals jsonb, autoPassThreshold numeric, disqualifyingConditions jsonb, orgId, projectId) and stage_transitions (artifactType artifactTypeEnum, artifactId text, fromStage, toStage promotionStageEnum, triggeredBy uuid FK, approvals jsonb array of {userId, role, decision, justification, timestamp}, evaluationId uuid FK, evidenceIds jsonb string array, transitionedAt timestamp, metadata jsonb)
  - `packages/db/src/schema/promotion.ts` — promotionStageEnum (12 stages: draft → post_delivery_review). NOTE: No approvalDecisionEnum exists — approval decisions are embedded in the approvals jsonb column as typed objects

  **WHY Each Reference Matters**:
  - Gate definitions control what evidence/approvals are needed at each promotion stage — critical for delivery governance
  - Stage transitions form an auditable history of how artifacts moved through the pipeline

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test files: `gate-definition.repo.test.ts`, `stage-transition.repo.test.ts`
  - [ ] `bun test packages/db/src/repositories/gate-definition.repo.test.ts` → PASS
  - [ ] `bun test packages/db/src/repositories/stage-transition.repo.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Gate definitions and stage transitions work correctly
    Tool: Bash (bun test)
    Preconditions: Task 1 migration exists
    Steps:
      1. Run `bun test packages/db/src/repositories/gate-definition.repo.test.ts`
      2. Run `bun test packages/db/src/repositories/stage-transition.repo.test.ts`
      3. Assert all tests pass
    Expected Result: Both repositories pass all tests
    Failure Indicators: Test failures
    Evidence: .sisyphus/evidence/task-5-repo-tests.txt
  ```

  **Commit**: YES (groups with Tasks 2-4, 6)
  - Message: `feat(db): add repositories for artifact governance tables`
  - Files: `packages/db/src/repositories/gate-definition.repo.ts`, `stage-transition.repo.ts`, test files
  - Pre-commit: `bun test`

- [ ] 6. Export all new repositories from index.ts

  **What to do**:
  - Add export statements to `packages/db/src/repositories/index.ts` for all 5 new repositories:
    - `export { ArtifactVersionRepository } from './artifact-version.repo';`
    - `export { ArtifactEvaluationRepository } from './artifact-evaluation.repo';`
    - `export { ArtifactLineageRepository } from './artifact-lineage.repo';`
    - `export { GateDefinitionRepository } from './gate-definition.repo';`
    - `export { StageTransitionRepository } from './stage-transition.repo';`
  - Run `bun test` to confirm no import resolution errors

  **Must NOT do**:
  - Do NOT modify any repository implementation files
  - Do NOT add repositories that don't exist yet (ProductGoalRepository comes in Wave 2)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit — adding 5 export lines
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — must wait for Tasks 2-5
  - **Parallel Group**: Wave 0 (final task)
  - **Blocks**: Tasks 15-27 (all API routes that use repositories)
  - **Blocked By**: Tasks 2, 3, 4, 5

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/index.ts:1-10` — Existing barrel export pattern (10 exports, one per line)

  **WHY Each Reference Matters**:
  - Must follow exact barrel export format used by existing 10 exports

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures) — no import resolution errors

  **QA Scenarios:**

  ```
  Scenario: All 5 new repositories are importable from barrel export
    Tool: Bash
    Preconditions: Tasks 2-5 complete
    Steps:
      1. Read `packages/db/src/repositories/index.ts`
      2. Assert it contains export for ArtifactVersionRepository
      3. Assert it contains export for ArtifactEvaluationRepository
      4. Assert it contains export for ArtifactLineageRepository
      5. Assert it contains export for GateDefinitionRepository
      6. Assert it contains export for StageTransitionRepository
      7. Run `bun test` to verify no import errors
    Expected Result: 15 total exports in index.ts, all resolve correctly
    Failure Indicators: Import resolution errors, missing exports
    Evidence: .sisyphus/evidence/task-6-exports.txt
  ```

  **Commit**: YES (groups with Tasks 2-5)
  - Message: `feat(db): add repositories for artifact governance tables`
  - Files: `packages/db/src/repositories/index.ts`
  - Pre-commit: `bun test`

### Wave 1 — Schema + Types: New Tables, Enum Expansion, Zod Contracts

- [ ] 7. Expand artifactTypeEnum with 8 new values

  **What to do**:
  - Edit `packages/db/src/schema/artifact_versions.ts` to add 8 new values to `artifactTypeEnum`:
    `'product_goal'`, `'increment'`, `'sprint_review'`, `'retrospective'`, `'delivery_record'`, `'sbom_manifest'`, `'provenance_attestation'`, `'post_delivery_review'`
  - The enum array goes from 8 values to 16 values
  - Do NOT rename or remove any existing values (PostgreSQL enum expansion is add-only)
  - Run `bun test` to confirm no regression

  **Must NOT do**:
  - Do NOT remove or rename existing enum values (destructive in PostgreSQL)
  - Do NOT modify the `artifactVersions` table definition — only the enum
  - Do NOT generate a migration yet (Task 11 handles all schema changes in one migration)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single array edit in one file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 8, 9, 10, 13
  - **Parallel Group**: Wave 1 (after Wave 0)
  - **Blocks**: Tasks 11, 12, 19-21, 24-26
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/schema/artifact_versions.ts:4-13` — Current artifactTypeEnum definition with 8 values

  **WHY Each Reference Matters**:
  - Must append to existing array without changing order (PostgreSQL enum position matters)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)

  **QA Scenarios:**

  ```
  Scenario: Enum expanded with exactly 8 new values
    Tool: Bash
    Preconditions: artifact_versions.ts exists with 8 values
    Steps:
      1. Read `packages/db/src/schema/artifact_versions.ts`
      2. Find the artifactTypeEnum definition
      3. Assert it contains all 8 original values: story, epic, project, architecture_plan, requirement_set, evidence_bundle, verification_result, release_candidate
      4. Assert it contains all 8 new values: product_goal, increment, sprint_review, retrospective, delivery_record, sbom_manifest, provenance_attestation, post_delivery_review
      5. Assert total count = 16 values
      6. Run `bun test` — all pass
    Expected Result: 16 enum values, no originals removed, tests pass
    Failure Indicators: Missing values, removed originals, test failures
    Evidence: .sisyphus/evidence/task-7-enum-expansion.txt
  ```

  **Commit**: YES (groups with Tasks 8-11)
  - Message: `feat(db): expand artifact type enum and add scrum/delivery schema`
  - Files: `packages/db/src/schema/artifact_versions.ts`
  - Pre-commit: `bun test`

- [ ] 8. Create product_goals table schema

  **What to do**:
  - Create `packages/db/src/schema/product_goals.ts`
  - Define table `product_goals` with columns:
    - `id`: uuid, defaultRandom, primaryKey
    - `projectId`: uuid, FK → projects.id, onDelete cascade, notNull
    - `orgId`: uuid, FK → organizations.id, onDelete cascade, notNull
    - `title`: text, notNull
    - `problemStatement`: text, notNull, default ''
    - `targetUsers`: text, notNull, default ''
    - `successMeasures`: jsonb array of strings, notNull, default []
    - `businessConstraints`: jsonb array of strings, notNull, default []
    - `nonGoals`: jsonb array of strings, notNull, default []
    - `approvedBy`: uuid, FK → users.id, nullable
    - `approvalStatus`: text, notNull, default 'draft' (values: 'draft', 'pending_approval', 'approved', 'rejected')
    - `sourceArtifacts`: jsonb array of strings (artifact IDs), notNull, default []
    - `version`: integer, notNull, default 1
    - `createdAt`: timestamp with timezone, defaultNow, notNull
    - `updatedAt`: timestamp with timezone, defaultNow, notNull
  - Export the table from `packages/db/src/schema/index.ts`
  - Run `bun test`

  **Must NOT do**:
  - Do NOT generate migration yet (Task 11)
  - Do NOT create the repository yet (Task 15)
  - Do NOT use a pgEnum for approvalStatus — use plain text with Zod validation at API layer (avoids another PostgreSQL enum that can't be easily modified)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single schema file creation following established patterns
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 7, 9, 10, 13
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 11, 15, 16
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/schema/stories.ts:1-37` — Complete table definition pattern: imports, FK references, column types, jsonb arrays, timestamps
  - `packages/db/src/schema/sprints.ts:1-27` — Simpler table showing uuid PK with defaultRandom, orgId/projectId FK pattern

  **API/Type References**:
  - `packages/db/src/schema/organizations.ts` — organizations.id FK target
  - `packages/db/src/schema/projects.ts` — projects.id FK target
  - `packages/db/src/schema/users.ts` — users.id FK target for approvedBy

  **WHY Each Reference Matters**:
  - stories.ts shows exact import pattern for drizzle-orm/pg-core functions and FK references to other tables
  - The FK targets must be imported for .references() calls

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)

  **QA Scenarios:**

  ```
  Scenario: product_goals schema correctly defined
    Tool: Bash
    Preconditions: Schema file created
    Steps:
      1. Read `packages/db/src/schema/product_goals.ts`
      2. Assert it contains `pgTable('product_goals', {`
      3. Assert it contains FK references to projects.id, organizations.id, users.id
      4. Assert it contains jsonb columns for successMeasures, businessConstraints, nonGoals, sourceArtifacts
      5. Assert it contains approvalStatus as text (not pgEnum)
      6. Read `packages/db/src/schema/index.ts` — assert it exports product_goals
      7. Run `bun test` — all pass
    Expected Result: Schema file with all columns, proper FK refs, exported from index
    Failure Indicators: Missing columns, wrong FK targets, not exported
    Evidence: .sisyphus/evidence/task-8-schema.txt
  ```

  **Commit**: YES (groups with Tasks 7, 9-11)
  - Message: `feat(db): expand artifact type enum and add scrum/delivery schema`
  - Files: `packages/db/src/schema/product_goals.ts`, `packages/db/src/schema/index.ts`
  - Pre-commit: `bun test`

- [ ] 9. Create delivery_records table schema

  **What to do**:
  - Create `packages/db/src/schema/delivery_records.ts`
  - Define table `delivery_records` with columns:
    - `id`: uuid, defaultRandom, primaryKey
    - `projectId`: uuid, FK → projects.id, onDelete cascade, notNull
    - `orgId`: uuid, FK → organizations.id, onDelete cascade, notNull
    - `releaseCandidateId`: text, nullable (links to artifact_versions.artifactId where type = release_candidate)
    - `incrementId`: text, nullable (links to artifact_versions.artifactId where type = increment)
    - `environment`: text, notNull (e.g., 'staging', 'production')
    - `deployedVersion`: text, notNull
    - `deploymentWindow`: jsonb, nullable — `{ start: string, end: string }` ISO timestamps
    - `approvedBy`: uuid, FK → users.id, nullable
    - `deploymentResult`: text, notNull, default 'pending' (values: 'pending', 'success', 'failed', 'rolled_back')
    - `rollbackReference`: text, nullable (previous delivery record ID or version)
    - `evidenceReferences`: jsonb array of strings (artifact version IDs), notNull, default []
    - `createdAt`: timestamp with timezone, defaultNow, notNull
  - Export from `packages/db/src/schema/index.ts`
  - Run `bun test`

  **Must NOT do**:
  - Do NOT generate migration yet (Task 11)
  - Do NOT create repository yet (Task 22)
  - Do NOT use pgEnum for deploymentResult or environment — use plain text with Zod validation

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single schema file creation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 7, 8, 10, 13
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 11, 22, 23
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/schema/stories.ts:1-37` — Table definition pattern with FK references and jsonb
  - `packages/db/src/schema/sprints.ts:1-27` — uuid PK + orgId/projectId FK pattern

  **API/Type References**:
  - `packages/db/src/schema/artifact_versions.ts:15-26` — artifact_versions table (linked via releaseCandidateId → artifactId)

  **WHY Each Reference Matters**:
  - delivery_records links to artifact_versions via text IDs (not UUID FK) because artifactId is text, not uuid
  - The evidenceReferences column stores artifact version IDs for provenance traceability

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)

  **QA Scenarios:**

  ```
  Scenario: delivery_records schema correctly defined
    Tool: Bash
    Preconditions: Schema file created
    Steps:
      1. Read `packages/db/src/schema/delivery_records.ts`
      2. Assert it contains `pgTable('delivery_records', {`
      3. Assert FK references to projects.id, organizations.id, users.id
      4. Assert jsonb columns for deploymentWindow, evidenceReferences
      5. Assert text columns for environment, deploymentResult (not pgEnum)
      6. Read schema/index.ts — assert it exports delivery_records
      7. Run `bun test`
    Expected Result: Complete schema with all columns and proper types
    Failure Indicators: Missing columns, wrong types, not exported
    Evidence: .sisyphus/evidence/task-9-schema.txt
  ```

  **Commit**: YES (groups with Tasks 7, 8, 10, 11)
  - Message: `feat(db): expand artifact type enum and add scrum/delivery schema`
  - Files: `packages/db/src/schema/delivery_records.ts`, `packages/db/src/schema/index.ts`
  - Pre-commit: `bun test`

- [ ] 10. Add sortOrder + readiness columns to stories table

  **What to do**:
  - Edit `packages/db/src/schema/stories.ts` to add two new columns to the `stories` table:
    - `sortOrder`: `integer('sort_order').notNull().default(0)` — for Product Backlog ordering
    - `readiness`: `text('readiness').notNull().default('not_ready')` — values: 'not_ready', 'refinement_needed', 'ready'
  - Do NOT use pgEnum for readiness — use plain text with Zod validation at API layer
  - Run `bun test` to confirm no regression

  **Must NOT do**:
  - Do NOT modify any other columns in the stories table
  - Do NOT modify the StoryState enum or story state machine
  - Do NOT update Core StorySchema yet (Task 14 handles that)
  - Do NOT generate migration yet (Task 11)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding 2 columns to existing table — minimal edit
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 7, 8, 9, 13
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 11, 14, 17
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `packages/db/src/schema/stories.ts:12-37` — Existing stories table definition — add columns AFTER existing ones, before closing `)`

  **WHY Each Reference Matters**:
  - Must add columns in the correct position within the pgTable definition
  - Must follow existing column definition style (type, notNull, default patterns)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)

  **QA Scenarios:**

  ```
  Scenario: stories table has sortOrder and readiness columns
    Tool: Bash
    Preconditions: stories.ts exists
    Steps:
      1. Read `packages/db/src/schema/stories.ts`
      2. Assert it contains `sortOrder: integer('sort_order').notNull().default(0)`
      3. Assert it contains `readiness: text('readiness').notNull().default('not_ready')`
      4. Assert it does NOT contain a pgEnum for readiness
      5. Run `bun test` — all pass
    Expected Result: Two new columns added, no pgEnum, tests pass
    Failure Indicators: Missing columns, pgEnum used, test failures
    Evidence: .sisyphus/evidence/task-10-stories-columns.txt
  ```

  **Commit**: YES (groups with Tasks 7-9, 11)
  - Message: `feat(db): expand artifact type enum and add scrum/delivery schema`
  - Files: `packages/db/src/schema/stories.ts`
  - Pre-commit: `bun test`

- [ ] 11. Generate migration 0002 for all Wave 1 schema changes

  **What to do**:
  - Run `drizzle-kit generate` to produce migration 0002_*.sql containing:
    - ALTER TYPE artifact_type ADD VALUE for each of 8 new enum values
    - CREATE TABLE product_goals
    - CREATE TABLE delivery_records
    - ALTER TABLE stories ADD COLUMN sort_order, ADD COLUMN readiness
  - Verify the generated SQL contains all expected statements
  - Verify no existing tables are duplicated or dropped
  - Run `bun test`

  **Must NOT do**:
  - Do NOT hand-write SQL — use drizzle-kit generate only
  - Do NOT modify schema files — this task only generates the migration
  - Verify drizzle-kit doesn't try to recreate tables from Task 1's migration (may need drizzle meta snapshot)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single drizzle-kit command + verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — must wait for Tasks 7-10
  - **Parallel Group**: Wave 1 (final — after 7, 8, 9, 10)
  - **Blocks**: Tasks 15-27 (all API routes depend on final schema)
  - **Blocked By**: Tasks 7, 8, 9, 10

  **References**:

  **Pattern References**:
  - `packages/db/drizzle/0000_worried_silver_fox.sql` — First migration format
  - `packages/db/drizzle/0001_*.sql` — Task 1's migration (catch-up)

  **WHY Each Reference Matters**:
  - Must not duplicate anything from 0000 or 0001 migrations
  - drizzle-kit tracks state via snapshot files — should only generate delta

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)

  **QA Scenarios:**

  ```
  Scenario: Migration 0002 contains all schema changes
    Tool: Bash
    Preconditions: Tasks 7-10 complete, Task 1 migration exists
    Steps:
      1. Run `bunx drizzle-kit generate` from packages/db/      2. Find new 0002_*.sql file
      3. Assert it contains ALTER TYPE or ADD VALUE for product_goal, increment, sprint_review, retrospective, delivery_record, sbom_manifest, provenance_attestation, post_delivery_review
      4. Assert it contains CREATE TABLE "product_goals"
      5. Assert it contains CREATE TABLE "delivery_records"
      6. Assert it contains ALTER TABLE "stories" ADD COLUMN "sort_order"
      7. Assert it contains ALTER TABLE "stories" ADD COLUMN "readiness"
      8. Assert it does NOT contain CREATE TABLE "artifact_versions" (already in 0001)
      9. Run `bun test`
    Expected Result: Clean migration with enum expansion + 2 new tables + 2 new columns
    Failure Indicators: Missing statements, duplicate table creation, drizzle-kit error
    Evidence: .sisyphus/evidence/task-11-migration.txt
  ```

  **Commit**: YES
  - Message: `chore(db): generate migration for scrum product + delivery provenance tables`
  - Files: `packages/db/drizzle/0002_*.sql`
  - Pre-commit: `bun test`

- [ ] 12. Create Zod payload schemas for all 8 new artifact types

  **What to do**:
  - Create `packages/db/src/schemas/artifact-payloads.ts`
  - Define Zod schemas for artifact_versions.snapshotData payloads:
    - `IncrementPayloadSchema`: sprintId (string), completedStoryIds (string[]), incompleteStoryIds (string[]), demonstrableFeatures (string[]), technicalDebt (string[]), notes (string)
    - `SprintReviewPayloadSchema`: sprintId (string), incrementId (string), productGoalId (string), goalAlignmentScore (number 0-100), stakeholderFeedback ({ reviewer: string, feedback: string, rating: number }[]), actionItems (string[]), demonstrationNotes (string)
    - `RetrospectivePayloadSchema`: sprintId (string), whatWentWell (string[]), whatDidntGoWell (string[]), improvements ({ description: string, priority: 'high'|'medium'|'low', assignee?: string, targetSprintId?: string }[]), teamSentiment (number 1-5)
    - `SbomManifestPayloadSchema`: format (string, e.g. 'cyclonedx'|'spdx'), version (string), components ({ name: string, version: string, type: string, license?: string }[]), generatedAt (string ISO), toolUsed (string), hash (string)
    - `ProvenanceAttestationPayloadSchema`: format (string, e.g. 'slsa-v1'|'in-toto'), builderId (string), buildStartedAt (string ISO), buildFinishedAt (string ISO), sourceDigest (string), outputDigest (string), reproducible (boolean), signingMethod (string), signature (string, placeholder)
    - `PostDeliveryReviewPayloadSchema`: deliveryRecordId (string), reviewedAt (string ISO), reviewedBy (string), healthChecks ({ name: string, status: 'pass'|'fail', details?: string }[]), performanceBaseline ({ metric: string, expected: number, actual: number }[]), issues (string[]), followUpStoryIds (string[])
    - `ProductGoalPayloadSchema`: (for artifact_versions representation — mirrors product_goals table fields for versioning: title, problemStatement, targetUsers, successMeasures, businessConstraints, nonGoals)
    - `DeliveryRecordPayloadSchema`: (for artifact_versions representation — mirrors delivery_records table fields for versioning)
  - Export all schemas from the file
  - Write TDD tests verifying parse/validation for each schema
  - Run `bun test`

  **Must NOT do**:
  - Do NOT modify Core `ArtifactTypeSchema` in `packages/core/src/project-memory.ts` — that's a separate type system for project memory, not DB artifacts
  - Do NOT add runtime validation to existing code — these schemas are consumed by new routes only

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 8 Zod schemas with nested types, validation rules, and tests — moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 8, 9, 10, 13, 14 (only needs Task 7 for enum awareness)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 19-21 (Increment, Sprint Review, Retrospective routes), Tasks 24-26 (SBOM, Attestation, Post-Delivery Review routes)
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/stories.ts` — Zod schema definitions at file top, `.parse()` usage pattern
  - `packages/api/src/routes/sprints.ts` — Zod validation for sprint-related payloads

  **API/Type References**:
  - `packages/db/src/schema/artifact_versions.ts:20` — `snapshotData: jsonb('snapshot_data').$type<Record<string, unknown>>()` — the column these schemas validate

  **External References**:
  - Zod docs: `https://zod.dev` — z.object, z.array, z.enum, z.number().min().max()

  **WHY Each Reference Matters**:
  - Existing route files show how Zod schemas are defined and used in the codebase
  - The snapshotData column is generic jsonb — these schemas provide type-safe validation for each artifact type

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/db/src/schemas/artifact-payloads.test.ts`
  - [ ] `bun test packages/db/src/schemas/artifact-payloads.test.ts` → PASS (≥16 tests — 2 per schema: valid + invalid)
  - [ ] Each schema rejects invalid payloads (missing required fields, wrong types)

  **QA Scenarios:**

  ```
  Scenario: All 8 Zod schemas validate correctly
    Tool: Bash (bun test)
    Preconditions: Schema file created
    Steps:
      1. Run `bun test packages/db/src/schemas/artifact-payloads.test.ts`
      2. Assert all tests pass
      3. Verify test file tests both valid and invalid payloads for each schema
    Expected Result: All 16+ tests pass, covering valid inputs and rejection of invalid inputs
    Failure Indicators: Test failures, missing schema tests
    Evidence: .sisyphus/evidence/task-12-zod-schemas.txt

  Scenario: Schemas reject invalid data gracefully
    Tool: Bash (bun test)
    Preconditions: Tests exist
    Steps:
      1. Verify IncrementPayloadSchema rejects payload missing sprintId
      2. Verify SprintReviewPayloadSchema rejects goalAlignmentScore > 100
      3. Verify RetrospectivePayloadSchema rejects teamSentiment > 5
      4. Verify SbomManifestPayloadSchema rejects missing components array
    Expected Result: All invalid payloads throw ZodError with descriptive messages
    Failure Indicators: Invalid data accepted, unhelpful error messages
    Evidence: .sisyphus/evidence/task-12-validation-errors.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add Zod payload schemas for scrum and delivery artifact types`
  - Files: `packages/db/src/schemas/artifact-payloads.ts`, test file
  - Pre-commit: `bun test`

- [ ] 13. RBAC permission expansion (6 new permissions + matrix update)

  **What to do**:
  - Edit `packages/api/src/auth/rbac.ts`:
    - Add to Permission enum:
      - `PRODUCT_GOAL_READ = 'PRODUCT_GOAL_READ'`
      - `PRODUCT_GOAL_WRITE = 'PRODUCT_GOAL_WRITE'`
      - `DELIVERY_RECORD_READ = 'DELIVERY_RECORD_READ'`
      - `DELIVERY_RECORD_WRITE = 'DELIVERY_RECORD_WRITE'`
      - `ARTIFACT_VERSION_READ = 'ARTIFACT_VERSION_READ'`
      - `ARTIFACT_VERSION_WRITE = 'ARTIFACT_VERSION_WRITE'`
    - Update permissionMatrix:
      - `ADMIN`: Gets all (already uses `allPermissions`)
      - `MEMBER`: Add PRODUCT_GOAL_READ, PRODUCT_GOAL_WRITE, DELIVERY_RECORD_READ, DELIVERY_RECORD_WRITE, ARTIFACT_VERSION_READ, ARTIFACT_VERSION_WRITE
      - `VIEWER`: Add PRODUCT_GOAL_READ, DELIVERY_RECORD_READ, ARTIFACT_VERSION_READ
      - `SERVICE_ACCOUNT`: Add PRODUCT_GOAL_READ, PRODUCT_GOAL_WRITE, DELIVERY_RECORD_READ, DELIVERY_RECORD_WRITE, ARTIFACT_VERSION_READ, ARTIFACT_VERSION_WRITE
  - Write TDD tests verifying each role has correct permissions
  - Run `bun test`

  **Must NOT do**:
  - Do NOT modify the requirePermission or requireRole functions
  - Do NOT add new Role enum values
  - Do NOT change existing permission assignments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit — adding enum values and updating matrix arrays
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 7-10 (no schema dependency)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 16-27 (all routes need RBAC permissions)
  - **Blocked By**: None (can start immediately, but logically Wave 1)

  **References**:

  **Pattern References**:
  - `packages/api/src/auth/rbac.ts:1-87` — Complete RBAC file: Permission enum (lines 11-25), permissionMatrix (lines 29-60), requirePermission function (lines 71-80)

  **WHY Each Reference Matters**:
  - ADMIN uses `allPermissions` (line 27-30) so new enum values are automatically included
  - MEMBER, VIEWER, SERVICE_ACCOUNT need explicit additions to their arrays

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/auth/rbac.test.ts` (create or extend if exists)
  - [ ] Tests verify: ADMIN has all 19 permissions, MEMBER has 15, VIEWER has 8, SERVICE_ACCOUNT has 14
  - [ ] Tests verify: requirePermission(viewer, PRODUCT_GOAL_WRITE) throws ForbiddenError
  - [ ] Tests verify: requirePermission(member, PRODUCT_GOAL_WRITE) does NOT throw

  **QA Scenarios:**

  ```
  Scenario: All roles have correct new permissions
    Tool: Bash (bun test)
    Preconditions: rbac.ts updated
    Steps:
      1. Run `bun test packages/api/src/auth/rbac.test.ts`
      2. Assert all tests pass
      3. Verify Permission enum has 19 values total (13 original + 6 new)
    Expected Result: All permission tests pass, correct role assignments
    Failure Indicators: Wrong permission counts, incorrect role assignments
    Evidence: .sisyphus/evidence/task-13-rbac.txt

  Scenario: VIEWER cannot write product goals
    Tool: Bash (bun test)
    Preconditions: Tests exist
    Steps:
      1. Call requirePermission({ role: 'viewer' }, Permission.PRODUCT_GOAL_WRITE)
      2. Assert ForbiddenError is thrown
    Expected Result: ForbiddenError with "Insufficient permissions"
    Failure Indicators: No error thrown, wrong error type
    Evidence: .sisyphus/evidence/task-13-rbac-viewer.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add RBAC permissions for product goal, delivery record, artifact version`
  - Files: `packages/api/src/auth/rbac.ts`, `packages/api/src/auth/rbac.test.ts`
  - Pre-commit: `bun test`

- [ ] 14. Update Core StorySchema + StoryRepository mapper for new columns

  **What to do**:
  - Edit `packages/core/src/types.ts`: Add `sortOrder` (number, optional) and `readiness` (string enum, optional) to the StorySchema Zod definition
  - Edit `packages/db/src/repositories/story.repo.ts`: Update `toStoryRow()` mapper to include sortOrder and readiness columns when mapping from Drizzle results to StorySchema
  - Update any `toStory()` or similar mapping functions that convert between DB rows and Core types
  - Ensure existing tests still pass — new fields are optional so backward-compatible
  - Write tests verifying new fields are correctly mapped

  **Must NOT do**:
  - Do NOT modify the StoryState enum or story state machine
  - Do NOT modify any other Core types
  - Do NOT change existing field types or nullability

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small edits (Zod schema + mapper) in existing files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 7, 8, 9, 12, 13 (needs Task 10 for column awareness)
  - **Parallel Group**: Wave 1 (after Task 10)
  - **Blocks**: Task 17 (Product Backlog route needs these fields in API responses)
  - **Blocked By**: Task 10

  **References**:

  **Pattern References**:
  - `packages/core/src/types.ts` — StorySchema Zod definition: find the z.object({...}) block for stories
  - `packages/db/src/repositories/story.repo.ts` — toStoryRow() mapper function that converts DB rows → Core types

  **API/Type References**:
  - `packages/db/src/schema/stories.ts:12-37` — DB column definitions (after Task 10 adds sortOrder + readiness)

  **WHY Each Reference Matters**:
  - StorySchema is the Core contract for story data — all consumers depend on it
  - toStoryRow() is the bridge between DB and Core — must include new columns or they're silently dropped
  - Metis specifically flagged this as a critical finding: "Core StorySchema omits FK fields — mapper strips them"

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures) — backward compatible
  - [ ] Tests verify: story with sortOrder=5 and readiness='ready' maps correctly through toStoryRow()

  **QA Scenarios:**

  ```
  Scenario: New story fields preserved through mapping
    Tool: Bash (bun test)
    Preconditions: Tasks 10 complete, StorySchema and mapper updated
    Steps:
      1. Run `bun test packages/db/src/repositories/story.repo.test.ts`
      2. Assert all tests pass (existing + new)
      3. Verify new test covers: create story with sortOrder=3, readiness='ready', retrieve it, assert fields preserved
    Expected Result: sortOrder and readiness survive create→retrieve round-trip
    Failure Indicators: Fields dropped by mapper, type mismatches
    Evidence: .sisyphus/evidence/task-14-mapper.txt

  Scenario: Existing story tests unaffected (backward compat)
    Tool: Bash
    Preconditions: StorySchema updated with optional new fields
    Steps:
      1. Run `bun test` (full suite)
      2. Assert ≥850 tests pass, 0 failures
    Expected Result: No regressions — new fields are optional
    Failure Indicators: Any existing test fails due to new required fields
    Evidence: .sisyphus/evidence/task-14-regression.txt
  ```

  **Commit**: YES
  - Message: `feat(core): add sortOrder and readiness fields to StorySchema and mapper`
  - Files: `packages/core/src/types.ts`, `packages/db/src/repositories/story.repo.ts`
  - Pre-commit: `bun test`

### Wave 2 — Product Plane API: Routes + Repositories for Scrum

- [ ] 15. Create ProductGoalRepository

  **What to do**:
  - Create `packages/db/src/repositories/product-goal.repo.ts`
  - Implement class `ProductGoalRepository` with constructor `(private db: DbClient)`
  - Methods:
    - `create(input: NewProductGoal): Promise<ProductGoal>` — insert with defaults
    - `findById(id: string, orgId: string): Promise<ProductGoal | null>` — scoped to org
    - `findByProjectId(projectId: string, orgId: string): Promise<ProductGoal[]>` — all goals for project
    - `update(id: string, orgId: string, input: Partial<ProductGoal>): Promise<ProductGoal>` — partial update, set updatedAt
    - `findByApprovalStatus(status: string, orgId: string): Promise<ProductGoal[]>` — filter by approval state
  - Export from `packages/db/src/repositories/index.ts`
  - Write TDD tests in `packages/db/src/repositories/product-goal.repo.test.ts`

  **Must NOT do**:
  - Do NOT add approval workflow logic — the repository is pure CRUD
  - Do NOT add versioning logic — version field is just an integer counter managed by the route

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Repository with typed queries, org-scoping, and partial updates — moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 17, 18, 19, 20, 21
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 16 (Product Goal routes)
  - **Blocked By**: Tasks 8, 11

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/story.repo.ts` — Class structure, DbClient injection, org-scoped queries, partial update pattern
  - `packages/db/src/repositories/sprint.repo.ts` — Simpler CRUD with projectId/orgId scoping

  **API/Type References**:
  - `packages/db/src/schema/product_goals.ts` — Table definition (from Task 8) with all columns and types

  **WHY Each Reference Matters**:
  - story.repo.ts shows the exact pattern for org-scoped queries (always filter by orgId for multi-tenancy)
  - sprint.repo.ts shows how to scope by projectId + orgId together

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/db/src/repositories/product-goal.repo.test.ts`
  - [ ] `bun test packages/db/src/repositories/product-goal.repo.test.ts` → PASS (≥8 tests)
  - [ ] Tests cover: create, findById, findByProjectId, update, findByApprovalStatus

  **QA Scenarios:**

  ```
  Scenario: CRUD operations work with org scoping
    Tool: Bash (bun test)
    Preconditions: Migration applied, mocked DbClient
    Steps:
      1. Run `bun test packages/db/src/repositories/product-goal.repo.test.ts`
      2. Assert all tests pass
      3. Verify test includes: create goal → findById returns it → update title → findById returns updated title
      4. Verify test includes: findByProjectId returns only goals for that project
    Expected Result: All CRUD tests pass with correct org scoping
    Failure Indicators: Cross-org data leaks, update not persisting
    Evidence: .sisyphus/evidence/task-15-repo-tests.txt

  Scenario: Repository exported from barrel
    Tool: Bash
    Steps:
      1. Read `packages/db/src/repositories/index.ts`
      2. Assert it contains `export { ProductGoalRepository } from './product-goal.repo'`
    Expected Result: ProductGoalRepository importable from barrel
    Evidence: .sisyphus/evidence/task-15-export.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add ProductGoalRepository with org-scoped CRUD`
  - Files: `packages/db/src/repositories/product-goal.repo.ts`, test file, `index.ts`
  - Pre-commit: `bun test`

- [ ] 16. Product Goal API routes (POST/GET/PATCH)

  **What to do**:
  - Create `packages/api/src/routes/product-goals.ts` with 3 route handlers:
    - `POST /api/projects/:projectId/product-goal` — Create new product goal
      - authMiddleware → requirePermission(PRODUCT_GOAL_WRITE) → validate body with Zod → ProductGoalRepository.create() → AuditRepository.append() → WebhookDispatcher.dispatch('product_goal.created') → return json(goal, 201)
    - `GET /api/projects/:projectId/product-goal` — List product goals for project
      - authMiddleware → requirePermission(PRODUCT_GOAL_READ) → ProductGoalRepository.findByProjectId() → return json(goals, 200)
    - `PATCH /api/product-goals/:goalId` — Update product goal
      - authMiddleware → requirePermission(PRODUCT_GOAL_WRITE) → validate body with Zod partial → ProductGoalRepository.update() → AuditRepository.append() → WebhookDispatcher.dispatch('product_goal.updated') → return json(goal, 200)
  - Define Zod schemas at file top: `CreateProductGoalSchema`, `UpdateProductGoalSchema` (partial)
  - Write TDD tests in `packages/api/src/routes/product-goals.test.ts`
  - Do NOT register in server.ts yet (Task 27)

  **Must NOT do**:
  - Do NOT implement approval workflow in routes — just set approvalStatus field via PATCH
  - Do NOT add lineage creation — that's a separate concern
  - Do NOT register routes in server.ts (Task 27)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 3 route handlers with auth, validation, audit, webhooks — follows existing pattern but moderate LOC
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 17, 18, 19, 20, 21
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 27 (server.ts registration), Task 29 (UI page)
  - **Blocked By**: Tasks 13, 15

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/stories.ts` — PRIMARY pattern: Zod schemas at top, authMiddleware usage, requirePermission call, AuditRepository.append(), WebhookDispatcher.dispatch(), json() response
  - `packages/api/src/routes/sprints.ts` — SECONDARY pattern: project-scoped routes, similar CRUD structure
  - `packages/api/src/routes/projects.ts` — PATCH pattern for partial updates

  **API/Type References**:
  - `packages/api/src/auth/rbac.ts:11-25` — Permission.PRODUCT_GOAL_READ, Permission.PRODUCT_GOAL_WRITE (from Task 13)
  - `packages/api/src/auth/middleware.ts` — authMiddleware function signature and AuthContext return type
  - `packages/api/src/utils/response.ts` — json() helper function
  - `packages/api/src/services/webhook-dispatcher.ts` — WebhookDispatcher.dispatch() signature

  **WHY Each Reference Matters**:
  - stories.ts is the gold standard for route implementation — every new route must follow its exact pattern
  - AuthContext provides userId, orgId, role which are needed for RBAC and audit

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/product-goals.test.ts`
  - [ ] `bun test packages/api/src/routes/product-goals.test.ts` → PASS (≥9 tests: 3 happy paths + 3 auth failures + 3 validation failures)

  **QA Scenarios:**

  ```
  Scenario: Create and retrieve product goal
    Tool: Bash (curl)
    Preconditions: Follow "QA Setup" section in Verification Strategy — server running, TOKEN and PROJECT_ID captured
    Steps:
      1. POST /api/projects/{projectId}/product-goal with body: {"title":"MVP Auth","problemStatement":"Users need secure login","targetUsers":"Internal team","successMeasures":["100% login success rate"],"businessConstraints":["No external OAuth"],"nonGoals":["SSO integration"]}
      2. Assert response status 201
      3. Assert response body contains id, title="MVP Auth", approvalStatus="draft"
      4. GET /api/projects/{projectId}/product-goal
      5. Assert response status 200
      6. Assert response body is array containing the created goal
    Expected Result: Goal created with draft status, retrievable by project
    Failure Indicators: 401/403 errors, missing fields in response, wrong status
    Evidence: .sisyphus/evidence/task-16-create-retrieve.txt

  Scenario: VIEWER cannot create product goal
    Tool: Bash (bun test)
    Preconditions: TDD test file exists for product-goals routes
    Steps:
      1. In `packages/api/src/routes/product-goals.test.ts`, include a test case that calls `createProductGoal()` with a DbClient mock where the authenticated user has role='viewer'
      2. Assert the route handler returns 403
      3. Assert response body contains "Insufficient permissions"
      4. Run `bun test packages/api/src/routes/product-goals.test.ts`
      5. Assert this specific test passes
    Expected Result: 403 Forbidden verified via unit test with mocked VIEWER role
    Failure Indicators: Test failure, 201 returned instead of 403
    Evidence: .sisyphus/evidence/task-16-viewer-forbidden.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add product goal CRUD routes with RBAC and audit`
  - Files: `packages/api/src/routes/product-goals.ts`, test file
  - Pre-commit: `bun test`

- [ ] 17. Product Backlog API route (GET + refine)

  **What to do**:
  - Create `packages/api/src/routes/backlog.ts` with 2 route handlers:
    - `GET /api/projects/:projectId/backlog` — Return stories ordered by sortOrder, filterable by readiness
      - authMiddleware → requirePermission(STORY_READ) → query stories by projectId, ordered by sortOrder ASC → return json(stories, 200)
      - Support query params: `?readiness=ready` (filter), `?limit=50&offset=0` (pagination)
    - `POST /api/projects/:projectId/backlog/refine` — Update story sortOrder and/or readiness
      - authMiddleware → requirePermission(STORY_WRITE) → validate body: `{ storyId: string, sortOrder?: number, readiness?: 'not_ready'|'refinement_needed'|'ready' }` → StoryRepository.update() → AuditRepository.append() → return json(story, 200)
  - Define Zod schemas: `BacklogQuerySchema`, `RefineStorySchema`
  - Write TDD tests

  **Must NOT do**:
  - Do NOT create a new table — backlog is a filtered view of stories
  - Do NOT modify story state — refinement only updates sortOrder and readiness metadata
  - Do NOT implement bulk reordering — single story refinement only (keeps it simple)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 2 route handlers with query params, ordering, pagination — moderate
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 15, 16, 18, 19, 20, 21
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 27, Task 30 (BacklogPage)
  - **Blocked By**: Tasks 13, 14

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/stories.ts` — Story query patterns, StoryRepository usage
  - `packages/api/src/routes/reports.ts` — Query parameter parsing pattern (if any GET with filters exists)

  **API/Type References**:
  - `packages/db/src/repositories/story.repo.ts` — StoryRepository methods for querying and updating stories
  - `packages/db/src/schema/stories.ts` — sortOrder and readiness columns (from Task 10)

  **WHY Each Reference Matters**:
  - Backlog is just stories with ordering — must use existing StoryRepository, not a new one
  - stories.ts route shows how to handle story updates with audit logging

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/backlog.test.ts`
  - [ ] `bun test packages/api/src/routes/backlog.test.ts` → PASS (≥8 tests)

  **QA Scenarios:**

  ```
  Scenario: Retrieve ordered backlog
    Tool: Bash (curl)
    Preconditions: 3 stories exist with sortOrder 3, 1, 2
    Steps:
      1. GET /api/projects/{projectId}/backlog
      2. Assert response status 200
      3. Assert stories returned in sortOrder ASC: [1, 2, 3]
      4. GET /api/projects/{projectId}/backlog?readiness=ready
      5. Assert only stories with readiness='ready' returned
    Expected Result: Stories ordered by sortOrder, filterable by readiness
    Failure Indicators: Wrong order, filter not applied, missing sortOrder/readiness fields
    Evidence: .sisyphus/evidence/task-17-backlog.txt

  Scenario: Refine story updates sortOrder and readiness
    Tool: Bash (curl)
    Preconditions: Story exists with sortOrder=0, readiness='not_ready'
    Steps:
      1. POST /api/projects/{projectId}/backlog/refine with body: {"storyId":"story-1","sortOrder":5,"readiness":"ready"}
      2. Assert response status 200
      3. Assert response body shows sortOrder=5, readiness="ready"
      4. GET /api/projects/{projectId}/backlog — verify updated order
    Expected Result: Story refined with new ordering and readiness
    Failure Indicators: sortOrder not persisted, readiness not updated
    Evidence: .sisyphus/evidence/task-17-refine.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add product backlog query and refinement routes`
  - Files: `packages/api/src/routes/backlog.ts`, test file
  - Pre-commit: `bun test`

- [ ] 18. Sprint Planning API route (POST)

  **What to do**:
  - Create `packages/api/src/routes/sprint-planning.ts` with 1 route handler:
    - `POST /api/projects/:projectId/sprints/:sprintId/assign-stories` — Assign ready stories to an existing sprint
      - authMiddleware → requirePermission(SPRINT_WRITE) → validate body: `{ storyIds: string[], sprintGoal?: string }` → verify sprint exists and is in 'planning' status → assign stories by updating sprintId → optionally update sprint.goal → AuditRepository.append() → WebhookDispatcher.dispatch('sprint.stories_assigned') → return json({ sprint, assignedStories }, 200)
  - NOTE: `POST /api/projects/:projectId/sprints/plan` ALREADY EXISTS in `packages/api/src/routes/sprints.ts` (it creates a new sprint and auto-selects stories by velocity). This new route is DIFFERENT — it assigns specific stories to an EXISTING sprint.
  - Only stories with readiness='ready' should be assignable (validate)
  - Define Zod schema: `AssignStoriesSchema`
  - Write TDD tests

  **Must NOT do**:
  - Do NOT create a new sprint — use existing SprintRepository.findById()
  - Do NOT implement capacity calculation — just assign stories
  - Do NOT change sprint status — it stays in 'planning' until manually activated
  - Do NOT modify or conflict with the existing `planSprint` function in `sprints.ts` — that endpoint auto-creates sprints, this one assigns stories to an existing one

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Business logic validation (readiness check, sprint status check) beyond simple CRUD
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 15, 16, 17, 19, 20, 21
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 27, Task 31 (SprintBacklogView)
  - **Blocked By**: Task 13

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/sprints.ts` — Sprint route patterns, SprintRepository usage
  - `packages/api/src/routes/stories.ts` — Story update patterns (updating sprintId on stories)

  **API/Type References**:
  - `packages/db/src/repositories/sprint.repo.ts` — SprintRepository.findById(), sprint status checking
  - `packages/db/src/repositories/story.repo.ts` — StoryRepository for updating sprintId on stories
  - `packages/db/src/schema/sprints.ts:5-10` — sprintStatusEnum: planning, active, completed, cancelled

  **WHY Each Reference Matters**:
  - Sprint planning is an orchestration across Sprint and Story repositories — must verify sprint status before assigning
  - Stories' sprintId FK already exists — just update it

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/sprint-planning.test.ts`
  - [ ] `bun test packages/api/src/routes/sprint-planning.test.ts` → PASS (≥6 tests)
  - [ ] Tests cover: happy path, sprint not in planning status, story not ready, sprint not found

  **QA Scenarios:**

  ```
  Scenario: Assign ready stories to sprint
    Tool: Bash (curl)
    Preconditions: Sprint in 'planning' status, 2 stories with readiness='ready'
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/assign-stories with body: {"storyIds":["story-1","story-2"],"sprintGoal":"Complete auth module"}
      2. Assert response status 200
      3. Assert response contains sprint with goal="Complete auth module"
      4. Assert assignedStories array has 2 entries
      5. Verify stories assigned by checking the POST response body (which returns { sprint, assignedStories }) — no separate sprint GET endpoint exists
    Expected Result: Stories assigned to sprint, goal updated
    Failure Indicators: 400/500 errors, stories not assigned
    Evidence: .sisyphus/evidence/task-18-assign-stories.txt

  Scenario: Reject assignment for active sprint
    Tool: Bash (curl)
    Preconditions: Sprint in 'active' status
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/assign-stories with body: {"storyIds":["story-1"]}
      2. Assert response status 400 or 409
      3. Assert error message indicates sprint must be in planning status
    Expected Result: Rejected with clear error about sprint status
    Failure Indicators: 200 success, vague error
    Evidence: .sisyphus/evidence/task-18-active-sprint-rejected.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add sprint story assignment route with readiness validation`
  - Files: `packages/api/src/routes/sprint-planning.ts`, test file
  - Pre-commit: `bun test`

- [ ] 19. Increment creation route (POST)

  **What to do**:
  - Create `packages/api/src/routes/increments.ts` with 1 route handler:
    - `POST /api/projects/:projectId/sprints/:sprintId/increment` — Create increment artifact
      - authMiddleware → requirePermission(ARTIFACT_VERSION_WRITE) → validate body with IncrementPayloadSchema (from Task 12) → create artifact_version with type='increment' via ArtifactVersionRepository → create lineage links (increment → sprint stories via 'derived_from') via ArtifactLineageRepository → AuditRepository.append() → WebhookDispatcher.dispatch('increment.created') → return json(artifactVersion, 201)
  - The route creates an artifact_version record with snapshotData validated by IncrementPayloadSchema
  - Write TDD tests

  **Must NOT do**:
  - Do NOT create a dedicated increment table — stored as artifact_version
  - Do NOT trigger story state changes — increment is a snapshot, not a state transition
  - Sprint Review is NOT a release gate — increment exists independently

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Creates artifact version + lineage links — moderate business logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 15-18, 20, 21
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 27, Task 32 (UI)
  - **Blocked By**: Tasks 12, 13

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/stories.ts` — Route handler pattern with auth, validation, audit, webhooks
  - `packages/db/src/repositories/artifact-version.repo.ts` — ArtifactVersionRepository.create() (from Task 2)
  - `packages/db/src/repositories/artifact-lineage.repo.ts` — ArtifactLineageRepository.create() (from Task 4)

  **API/Type References**:
  - `packages/db/src/schemas/artifact-payloads.ts` — IncrementPayloadSchema (from Task 12)
  - `packages/db/src/schema/artifact_versions.ts:15-26` — artifact_versions table structure

  **WHY Each Reference Matters**:
  - Increments are stored as artifact_versions with typed snapshotData — the Zod schema validates the payload
  - Lineage links connect the increment to the sprint's completed stories for traceability

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/increments.test.ts`
  - [ ] `bun test packages/api/src/routes/increments.test.ts` → PASS (≥5 tests)

  **QA Scenarios:**

  ```
  Scenario: Create increment for completed sprint
    Tool: Bash (curl)
    Preconditions: Sprint exists, stories completed
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/increment with body: {"sprintId":"sprint-1","completedStoryIds":["story-1","story-2"],"incompleteStoryIds":[],"demonstrableFeatures":["User auth"],"technicalDebt":[],"notes":"Clean sprint"}
      2. Assert response status 201
      3. Assert response body contains artifactType="increment", version=1
      4. Assert snapshotData matches submitted payload
    Expected Result: Increment artifact created with validated payload
    Failure Indicators: 400 validation error, missing snapshotData fields
    Evidence: .sisyphus/evidence/task-19-create-increment.txt

  Scenario: Reject increment with invalid payload
    Tool: Bash (curl)
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/increment with body: {"notes":"missing required fields"}
      2. Assert response status 400
      3. Assert error references missing required field (sprintId)
    Expected Result: 400 with Zod validation error
    Evidence: .sisyphus/evidence/task-19-invalid-payload.txt
  ```

  **Commit**: YES (groups with Tasks 20, 21)
  - Message: `feat(api): add increment, sprint review, and retrospective artifact routes`
  - Files: `packages/api/src/routes/increments.ts`, test file
  - Pre-commit: `bun test`

- [ ] 20. Sprint Review route (POST)

  **What to do**:
  - Create `packages/api/src/routes/sprint-reviews.ts` with 1 route handler:
    - `POST /api/projects/:projectId/sprints/:sprintId/review` — Create sprint review artifact
      - authMiddleware → requirePermission(ARTIFACT_VERSION_WRITE) → validate body with SprintReviewPayloadSchema → create artifact_version with type='sprint_review' → create lineage link (review → increment via 'derived_from') → AuditRepository.append() → WebhookDispatcher.dispatch('sprint_review.created') → return json(artifactVersion, 201)
  - Write TDD tests

  **Must NOT do**:
  - Sprint Review is NOT a release gate — it's evaluation only
  - Do NOT trigger any story state changes or sprint status changes
  - Do NOT enforce that increment exists before review (soft link via lineage)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Same pattern as Task 19 with different payload schema
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 15-19, 21
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 27, Task 32 (UI)
  - **Blocked By**: Tasks 12, 13

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/increments.ts` — Sibling route (Task 19) for artifact creation pattern
  - `packages/api/src/routes/stories.ts` — Route handler base pattern

  **API/Type References**:
  - `packages/db/src/schemas/artifact-payloads.ts` — SprintReviewPayloadSchema (from Task 12)

  **WHY Each Reference Matters**:
  - Sprint review follows identical pattern to increment — different Zod schema, same artifact_version storage
  - CRITICAL: Sprint Review is evaluation-only. Must NOT trigger state changes. This is a non-negotiable rule.

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/sprint-reviews.test.ts`
  - [ ] `bun test packages/api/src/routes/sprint-reviews.test.ts` → PASS (≥5 tests)
  - [ ] Tests verify: no sprint status change after review creation

  **QA Scenarios:**

  ```
  Scenario: Create sprint review linked to increment
    Tool: Bash (curl)
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/review with body: {"sprintId":"sprint-1","incrementId":"inc-1","productGoalId":"goal-1","goalAlignmentScore":85,"stakeholderFeedback":[{"reviewer":"PM","feedback":"Good progress","rating":4}],"actionItems":["Improve test coverage"],"demonstrationNotes":"Demo showed auth flow"}
      2. Assert response status 201
      3. Assert artifactType="sprint_review"
      4. Assert goalAlignmentScore=85 in snapshotData
    Expected Result: Sprint review artifact created, no state changes triggered
    Failure Indicators: Sprint status changed, 400 errors
    Evidence: .sisyphus/evidence/task-20-sprint-review.txt
  ```

  **Commit**: YES (groups with Tasks 19, 21)
  - Message: `feat(api): add increment, sprint review, and retrospective artifact routes`
  - Files: `packages/api/src/routes/sprint-reviews.ts`, test file
  - Pre-commit: `bun test`

- [ ] 21. Retrospective route (POST)

  **What to do**:
  - Create `packages/api/src/routes/retrospectives.ts` with 1 route handler:
    - `POST /api/projects/:projectId/sprints/:sprintId/retrospective` — Create retrospective artifact
      - authMiddleware → requirePermission(ARTIFACT_VERSION_WRITE) → validate body with RetrospectivePayloadSchema → create artifact_version with type='retrospective' → create lineage link (retro → sprint_review via 'derived_from') → AuditRepository.append() → WebhookDispatcher.dispatch('retrospective.created') → return json(artifactVersion, 201)
  - Improvements from the retrospective can optionally link to follow-up stories via lineage
  - Write TDD tests

  **Must NOT do**:
  - Do NOT auto-create stories from improvement items — that's a future enhancement
  - Do NOT enforce sprint review exists before retro (soft link)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Same artifact creation pattern as Tasks 19-20
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 15-20
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 27, Task 32 (UI)
  - **Blocked By**: Tasks 12, 13

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/increments.ts` — Artifact creation pattern (Task 19)
  - `packages/api/src/routes/sprint-reviews.ts` — Sibling pattern (Task 20)

  **API/Type References**:
  - `packages/db/src/schemas/artifact-payloads.ts` — RetrospectivePayloadSchema (from Task 12)

  **WHY Each Reference Matters**:
  - Retrospective follows identical artifact_version pattern — different payload, same storage
  - improvements[] array is structured (description, priority, assignee, targetSprintId) not freeform

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/retrospectives.test.ts`
  - [ ] `bun test packages/api/src/routes/retrospectives.test.ts` → PASS (≥5 tests)

  **QA Scenarios:**

  ```
  Scenario: Create retrospective with structured improvements
    Tool: Bash (curl)
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/retrospective with body: {"sprintId":"sprint-1","whatWentWell":["CI/CD pipeline stable"],"whatDidntGoWell":["Flaky integration tests"],"improvements":[{"description":"Add retry logic to flaky tests","priority":"high","assignee":"dev-1"}],"teamSentiment":4}
      2. Assert response status 201
      3. Assert artifactType="retrospective"
      4. Assert improvements array has 1 structured item with priority="high"
    Expected Result: Retrospective artifact created with structured data
    Failure Indicators: improvements stored as freeform text, missing fields
    Evidence: .sisyphus/evidence/task-21-retrospective.txt

  Scenario: Reject retrospective with invalid teamSentiment
    Tool: Bash (curl)
    Steps:
      1. POST with body containing teamSentiment: 6 (max is 5)
      2. Assert response status 400
      3. Assert Zod error references teamSentiment
    Expected Result: 400 with validation error for out-of-range sentiment
    Evidence: .sisyphus/evidence/task-21-invalid-sentiment.txt
  ```

  **Commit**: YES (groups with Tasks 19, 20)
  - Message: `feat(api): add increment, sprint review, and retrospective artifact routes`
  - Files: `packages/api/src/routes/retrospectives.ts`, test file
  - Pre-commit: `bun test`

### Wave 3 — Delivery Provenance API: Routes for Delivery Plane

- [ ] 22. Create DeliveryRecordRepository

  **What to do**:
  - Create `packages/db/src/repositories/delivery-record.repo.ts`
  - Implement class `DeliveryRecordRepository` with constructor `(private db: DbClient)`
  - Methods:
    - `create(input: NewDeliveryRecord): Promise<DeliveryRecord>`
    - `findById(id: string, orgId: string): Promise<DeliveryRecord | null>`
    - `findByProjectId(projectId: string, orgId: string): Promise<DeliveryRecord[]>`
    - `findByEnvironment(projectId: string, environment: string, orgId: string): Promise<DeliveryRecord[]>`
    - `updateResult(id: string, orgId: string, result: string, rollbackRef?: string): Promise<DeliveryRecord>` — update deploymentResult
  - Export from `packages/db/src/repositories/index.ts`
  - Write TDD tests

  **Must NOT do**:
  - Do NOT implement actual deployment logic — just CRUD for records
  - Do NOT add immutability enforcement at repo level (route handles that)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Repository with environment-scoped queries, result updates — moderate
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 24, 25, 26
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 23
  - **Blocked By**: Tasks 9, 11

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/story.repo.ts` — Class structure, DbClient injection, org-scoped queries
  - `packages/db/src/repositories/product-goal.repo.ts` — Sibling repo (Task 15) for similar CRUD pattern

  **API/Type References**:
  - `packages/db/src/schema/delivery_records.ts` — Table definition (from Task 9)

  **WHY Each Reference Matters**:
  - Delivery records are critical audit entities — org scoping prevents cross-org data leaks
  - The updateResult method is the only mutable operation after creation (delivery records are otherwise append-only)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/db/src/repositories/delivery-record.repo.test.ts`
  - [ ] `bun test packages/db/src/repositories/delivery-record.repo.test.ts` → PASS (≥7 tests)

  **QA Scenarios:**

  ```
  Scenario: CRUD operations with environment filtering
    Tool: Bash (bun test)
    Preconditions: Migration applied
    Steps:
      1. Run tests
      2. Verify create → findById returns correct record
      3. Verify findByEnvironment('production') returns only production records
      4. Verify updateResult changes deploymentResult from 'pending' to 'success'
    Expected Result: All CRUD tests pass with correct filtering
    Failure Indicators: Cross-environment data leaks, result not updating
    Evidence: .sisyphus/evidence/task-22-repo-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add DeliveryRecordRepository with environment-scoped queries`
  - Files: `packages/db/src/repositories/delivery-record.repo.ts`, test file, `index.ts`
  - Pre-commit: `bun test`

- [ ] 23. Delivery Record API routes (POST/GET)

  **What to do**:
  - Create `packages/api/src/routes/delivery-records.ts` with 3 route handlers:
    - `POST /api/projects/:projectId/delivery-records` — Create delivery record
      - authMiddleware → requirePermission(DELIVERY_RECORD_WRITE) → validate body with Zod → DeliveryRecordRepository.create() → create artifact_version with type='delivery_record' for versioning → create lineage (delivery_record → release_candidate via 'derived_from') → AuditRepository.append() → WebhookDispatcher.dispatch('delivery_record.created') → return json(record, 201)
    - `GET /api/projects/:projectId/delivery-records` — List delivery records for project
      - authMiddleware → requirePermission(DELIVERY_RECORD_READ) → DeliveryRecordRepository.findByProjectId() → return json(records, 200)
      - Support query params: `?environment=production` (filter)
    - `GET /api/delivery-records/:deliveryId` — Get single delivery record with evidence
      - authMiddleware → requirePermission(DELIVERY_RECORD_READ) → DeliveryRecordRepository.findById() → return json(record, 200)
  - Define Zod schemas: `CreateDeliveryRecordSchema`, `DeliveryRecordQuerySchema`
  - Write TDD tests

  **Must NOT do**:
  - Do NOT implement actual deployment — just record creation
  - Do NOT auto-generate delivery records — manual API only
  - Do NOT add result update route yet — keep it simple (can extend later)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 3 route handlers with lineage + artifact version dual-write — moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 24, 25, 26
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 27, Task 33 (UI)
  - **Blocked By**: Tasks 13, 22

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/product-goals.ts` — Sibling route (Task 16) for CRUD pattern with audit + webhooks
  - `packages/api/src/routes/stories.ts` — Route handler base pattern

  **API/Type References**:
  - `packages/api/src/auth/rbac.ts` — Permission.DELIVERY_RECORD_READ/WRITE (from Task 13)
  - `packages/db/src/repositories/delivery-record.repo.ts` — DeliveryRecordRepository (from Task 22)
  - `packages/db/src/repositories/artifact-version.repo.ts` — For creating versioned artifact record
  - `packages/db/src/repositories/artifact-lineage.repo.ts` — For lineage links

  **WHY Each Reference Matters**:
  - Delivery records have dual-write: dedicated table (for queries) + artifact_version (for versioning/governance)
  - Lineage connects delivery records to release candidates for traceability

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/delivery-records.test.ts`
  - [ ] `bun test packages/api/src/routes/delivery-records.test.ts` → PASS (≥9 tests)

  **QA Scenarios:**

  ```
  Scenario: Create and retrieve delivery record
    Tool: Bash (curl)
    Preconditions: Authenticated MEMBER user, project exists
    Steps:
      1. POST /api/projects/{projectId}/delivery-records with body: {"environment":"staging","deployedVersion":"1.2.0","releaseCandidateId":"rc-1","deploymentWindow":{"start":"2025-03-26T10:00:00Z","end":"2025-03-26T11:00:00Z"},"evidenceReferences":["artifact-v-1","artifact-v-2"]}
      2. Assert response status 201
      3. Assert response body contains id, environment="staging", deploymentResult="pending"
      4. GET /api/projects/{projectId}/delivery-records
      5. Assert response contains the created record
      6. GET /api/delivery-records/{deliveryId}
      7. Assert response contains full record with evidenceReferences
    Expected Result: Record created with pending status, retrievable by project and by ID
    Failure Indicators: Missing fields, wrong default status
    Evidence: .sisyphus/evidence/task-23-delivery-record.txt

  Scenario: Filter delivery records by environment
    Tool: Bash (curl)
    Preconditions: Records exist for staging and production
    Steps:
      1. GET /api/projects/{projectId}/delivery-records?environment=production
      2. Assert only production records returned
    Expected Result: Environment filter applied correctly
    Failure Indicators: Staging records included, filter ignored
    Evidence: .sisyphus/evidence/task-23-env-filter.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add delivery record CRUD routes with lineage and audit`
  - Files: `packages/api/src/routes/delivery-records.ts`, test file
  - Pre-commit: `bun test`

- [ ] 24. SBOM Manifest seam route (POST)

  **What to do**:
  - Create `packages/api/src/routes/sbom.ts` with 1 route handler:
    - `POST /api/release-candidates/:id/sbom` — Attach SBOM manifest to release candidate
      - authMiddleware → requirePermission(ARTIFACT_VERSION_WRITE) → validate body with SbomManifestPayloadSchema → create artifact_version with type='sbom_manifest' → create lineage (sbom → release_candidate via 'verified_by') → AuditRepository.append() → WebhookDispatcher.dispatch('sbom.attached') → return json(artifactVersion, 201)
  - This is a SEAM — no actual SBOM generation logic. Accepts pre-generated SBOM data.
  - Write TDD tests

  **Must NOT do**:
  - Do NOT implement actual SBOM generation (CycloneDX/SPDX tooling)
  - Do NOT implement dependency scanning
  - This is a data storage seam only — accepts structured SBOM data and stores it

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Single route handler with artifact creation — follows established pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 22, 23, 25, 26
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 27
  - **Blocked By**: Tasks 12, 13

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/increments.ts` — Artifact creation pattern (Task 19) — identical storage approach

  **API/Type References**:
  - `packages/db/src/schemas/artifact-payloads.ts` — SbomManifestPayloadSchema (from Task 12)

  **WHY Each Reference Matters**:
  - SBOM follows the same artifact_version storage pattern as increments/reviews/retros
  - Lineage type is 'verified_by' (SBOM verifies a release candidate) not 'derived_from'

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/sbom.test.ts`
  - [ ] `bun test packages/api/src/routes/sbom.test.ts` → PASS (≥4 tests)

  **QA Scenarios:**

  ```
  Scenario: Attach SBOM to release candidate
    Tool: Bash (curl)
    Steps:
      1. POST /api/release-candidates/{id}/sbom with body: {"format":"cyclonedx","version":"1.4","components":[{"name":"express","version":"4.18.2","type":"library","license":"MIT"}],"generatedAt":"2025-03-26T10:00:00Z","toolUsed":"cdx-gen","hash":"sha256:abc123"}
      2. Assert response status 201
      3. Assert artifactType="sbom_manifest"
      4. Assert snapshotData.components has 1 entry
    Expected Result: SBOM artifact stored with validated payload
    Failure Indicators: Validation error, wrong artifact type
    Evidence: .sisyphus/evidence/task-24-sbom.txt

  Scenario: Reject SBOM with empty components
    Tool: Bash (curl)
    Steps:
      1. POST with body missing components array
      2. Assert response status 400
    Expected Result: Zod validation rejects missing required field
    Evidence: .sisyphus/evidence/task-24-invalid-sbom.txt
  ```

  **Commit**: YES (groups with Tasks 25, 26)
  - Message: `feat(api): add SBOM, attestation, and post-delivery review seam routes`
  - Files: `packages/api/src/routes/sbom.ts`, test file
  - Pre-commit: `bun test`

- [ ] 25. Provenance Attestation seam route (POST)

  **What to do**:
  - Create `packages/api/src/routes/attestations.ts` with 1 route handler:
    - `POST /api/release-candidates/:id/attest` — Attach provenance attestation to release candidate
      - authMiddleware → requirePermission(ARTIFACT_VERSION_WRITE) → validate body with ProvenanceAttestationPayloadSchema → create artifact_version with type='provenance_attestation' → create lineage (attestation → release_candidate via 'verified_by') → AuditRepository.append() → WebhookDispatcher.dispatch('attestation.created') → return json(artifactVersion, 201)
  - This is a SEAM — no actual Sigstore/SLSA signing. Accepts pre-generated attestation data with placeholder signature.
  - Write TDD tests

  **Must NOT do**:
  - Do NOT implement Sigstore signing or in-toto/SLSA verification
  - Do NOT implement key management or certificate chains
  - Signature field accepts any string (placeholder for future integration)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Single route handler — same artifact creation pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 22, 23, 24, 26
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 27
  - **Blocked By**: Tasks 12, 13

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/sbom.ts` — Sibling seam route (Task 24) — identical pattern

  **API/Type References**:
  - `packages/db/src/schemas/artifact-payloads.ts` — ProvenanceAttestationPayloadSchema (from Task 12)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/attestations.test.ts`
  - [ ] `bun test packages/api/src/routes/attestations.test.ts` → PASS (≥4 tests)

  **QA Scenarios:**

  ```
  Scenario: Create provenance attestation
    Tool: Bash (curl)
    Steps:
      1. POST /api/release-candidates/{id}/attest with body: {"format":"slsa-v1","builderId":"github-actions","buildStartedAt":"2025-03-26T09:00:00Z","buildFinishedAt":"2025-03-26T09:15:00Z","sourceDigest":"sha256:src123","outputDigest":"sha256:out456","reproducible":true,"signingMethod":"placeholder","signature":"placeholder-sig"}
      2. Assert response status 201
      3. Assert artifactType="provenance_attestation"
    Expected Result: Attestation artifact stored with placeholder signature accepted
    Failure Indicators: Signature validation error, wrong type
    Evidence: .sisyphus/evidence/task-25-attestation.txt
  ```

  **Commit**: YES (groups with Tasks 24, 26)
  - Message: `feat(api): add SBOM, attestation, and post-delivery review seam routes`
  - Files: `packages/api/src/routes/attestations.ts`, test file
  - Pre-commit: `bun test`

- [ ] 26. Post-Delivery Review route (POST)

  **What to do**:
  - Create `packages/api/src/routes/post-delivery-reviews.ts` with 1 route handler:
    - `POST /api/delivery-records/:deliveryId/post-review` — Create post-delivery review
      - authMiddleware → requirePermission(ARTIFACT_VERSION_WRITE) → validate body with PostDeliveryReviewPayloadSchema → verify delivery record exists → create artifact_version with type='post_delivery_review' → create lineage (review → delivery_record via 'derived_from') → AuditRepository.append() → WebhookDispatcher.dispatch('post_delivery_review.created') → return json(artifactVersion, 201)
  - The review captures health checks, performance baseline comparison, issues, and follow-up story IDs
  - Write TDD tests

  **Must NOT do**:
  - Do NOT auto-create follow-up stories — just store the IDs for reference
  - Do NOT implement automated health check execution — accepts pre-gathered data

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Single route handler with delivery record validation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 22-25
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 27
  - **Blocked By**: Tasks 12, 13

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/increments.ts` — Artifact creation pattern
  - `packages/api/src/routes/delivery-records.ts` — DeliveryRecordRepository for existence check

  **API/Type References**:
  - `packages/db/src/schemas/artifact-payloads.ts` — PostDeliveryReviewPayloadSchema (from Task 12)
  - `packages/db/src/repositories/delivery-record.repo.ts` — findById for existence verification

  **WHY Each Reference Matters**:
  - Must verify delivery record exists before creating review (unlike Sprint Review which soft-links)
  - Post-delivery review is evidence-oriented: health checks and performance baselines, not just narrative

  **Acceptance Criteria**:

  **TDD:**
  - [ ] Test file: `packages/api/src/routes/post-delivery-reviews.test.ts`
  - [ ] `bun test packages/api/src/routes/post-delivery-reviews.test.ts` → PASS (≥5 tests)
  - [ ] Tests cover: happy path, delivery record not found (404), invalid payload

  **QA Scenarios:**

  ```
  Scenario: Create post-delivery review with health checks
    Tool: Bash (curl)
    Preconditions: Delivery record exists
    Steps:
      1. POST /api/delivery-records/{deliveryId}/post-review with body: {"deliveryRecordId":"del-1","reviewedAt":"2025-03-27T10:00:00Z","reviewedBy":"ops-lead","healthChecks":[{"name":"API latency","status":"pass","details":"p99 < 200ms"},{"name":"Error rate","status":"pass","details":"< 0.1%"}],"performanceBaseline":[{"metric":"p99_latency_ms","expected":200,"actual":185}],"issues":[],"followUpStoryIds":[]}
      2. Assert response status 201
      3. Assert artifactType="post_delivery_review"
      4. Assert healthChecks has 2 entries
    Expected Result: Review created with structured health check data
    Failure Indicators: Missing health check data, wrong artifact type
    Evidence: .sisyphus/evidence/task-26-post-review.txt

  Scenario: Reject review for non-existent delivery record
    Tool: Bash (curl)
    Steps:
      1. POST /api/delivery-records/nonexistent-id/post-review with valid body
      2. Assert response status 404
    Expected Result: 404 when delivery record doesn't exist
    Evidence: .sisyphus/evidence/task-26-not-found.txt
  ```

  **Commit**: YES (groups with Tasks 24, 25)
  - Message: `feat(api): add SBOM, attestation, and post-delivery review seam routes`
  - Files: `packages/api/src/routes/post-delivery-reviews.ts`, test file
  - Pre-commit: `bun test`

- [ ] 27. Register all new routes in server.ts

  **What to do**:
  - Edit `packages/api/src/server.ts` to add regex patterns + handler registrations for all 15 new routes:
    - `POST /api/projects/:projectId/product-goal` → createProductGoal
    - `GET /api/projects/:projectId/product-goal` → listProductGoals
    - `PATCH /api/product-goals/:goalId` → updateProductGoal
    - `GET /api/projects/:projectId/backlog` → getBacklog
    - `POST /api/projects/:projectId/backlog/refine` → refineBacklogItem
    - `POST /api/projects/:projectId/sprints/:sprintId/assign-stories` → assignStories
    - `POST /api/projects/:projectId/sprints/:sprintId/increment` → createIncrement
    - `POST /api/projects/:projectId/sprints/:sprintId/review` → createSprintReview
    - `POST /api/projects/:projectId/sprints/:sprintId/retrospective` → createRetrospective
    - `POST /api/projects/:projectId/delivery-records` → createDeliveryRecord
    - `GET /api/projects/:projectId/delivery-records` → listDeliveryRecords
    - `GET /api/delivery-records/:deliveryId` → getDeliveryRecord
    - `POST /api/release-candidates/:id/sbom` → attachSbom
    - `POST /api/release-candidates/:id/attest` → createAttestation
    - `POST /api/delivery-records/:deliveryId/post-review` → createPostDeliveryReview
  - Follow exact regex pattern used by existing routes (e.g., `path.match(/^\/api\/projects\/([^/]+)\/product-goal$/)`)
  - Add imports for all new route handler files at the top
  - Write TDD tests for route matching

  **Must NOT do**:
  - Do NOT refactor the existing routing approach — just add to it
  - Do NOT change existing route patterns
  - Do NOT add middleware or interceptors — each route handler manages its own auth/audit

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 15 regex patterns + imports + handler wiring in a large file — careful editing needed
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — must wait for all route handlers (Tasks 16-26)
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: Task 28 (WebApiClient needs routes accessible)
  - **Blocked By**: Tasks 16, 17, 18, 19, 20, 21, 23, 24, 25, 26

  **References**:

  **Pattern References**:
  - `packages/api/src/server.ts` — CRITICAL: Read the ENTIRE route() function to understand the regex pattern + method check + handler call pattern. Each route block looks like:
    ```
    const match = path.match(/^\/api\/projects\/([^/]+)\/stories$/);
    if (match && req.method === 'POST') {
      const projectId = match[1]!;
      return authMiddleware(req).then((auth) => createStory(req, projectId, context.db, auth));
    }
    ```

  **WHY Each Reference Matters**:
  - MUST follow exact regex pattern — different regex style will break routing
  - The route() function is the central dispatch — all routes must be in this file
  - Order matters for ambiguous patterns — more specific routes before less specific

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)
  - [ ] Verify all 15 routes resolve correctly via integration tests

  **QA Scenarios:**

  ```
  Scenario: All 15 new routes are registered and respond
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. POST /api/projects/test-proj/product-goal — expect 401 (no auth) not 404
      2. GET /api/projects/test-proj/product-goal — expect 401 not 404
      3. PATCH /api/product-goals/test-goal — expect 401 not 404
      4. GET /api/projects/test-proj/backlog — expect 401 not 404
      5. POST /api/projects/test-proj/backlog/refine — expect 401 not 404
      6. POST /api/projects/test-proj/sprints/sp-1/assign-stories — expect 401 not 404
      7. POST /api/projects/test-proj/sprints/sp-1/increment — expect 401 not 404
      8. POST /api/projects/test-proj/sprints/sp-1/review — expect 401 not 404
      9. POST /api/projects/test-proj/sprints/sp-1/retrospective — expect 401 not 404
      10. POST /api/projects/test-proj/delivery-records — expect 401 not 404
      11. GET /api/projects/test-proj/delivery-records — expect 401 not 404
      12. GET /api/delivery-records/del-1 — expect 401 not 404
      13. POST /api/release-candidates/rc-1/sbom — expect 401 not 404
      14. POST /api/release-candidates/rc-1/attest — expect 401 not 404
      15. POST /api/delivery-records/del-1/post-review — expect 401 not 404
    Expected Result: All 15 routes return 401 (auth required) not 404 (route not found)
    Failure Indicators: Any route returns 404 — means regex pattern not matched
    Evidence: .sisyphus/evidence/task-27-route-registration.txt
  ```

  **Commit**: YES
  - Message: `feat(api): register all scrum and delivery routes in server.ts`
  - Files: `packages/api/src/server.ts`
  - Pre-commit: `bun test`

### Wave 4 — Web UI: Pages, Hooks, Client Methods

- [ ] 28. WebApiClient methods for all new endpoints

  **What to do**:
  - Edit `packages/web/src/lib/api-client.ts` to add methods to the WebApiClient class:
    - `createProductGoal(token: string, projectId: string, data: CreateProductGoalInput): Promise<ProductGoal>`
    - `listProductGoals(token: string, projectId: string): Promise<ProductGoal[]>`
    - `updateProductGoal(token: string, goalId: string, data: Partial<ProductGoal>): Promise<ProductGoal>`
    - `getBacklog(token: string, projectId: string, params?: { readiness?: string, limit?: number, offset?: number }): Promise<Story[]>`
    - `refineBacklogItem(token: string, projectId: string, data: { storyId: string, sortOrder?: number, readiness?: string }): Promise<Story>`
    - `assignStories(token: string, projectId: string, sprintId: string, data: { storyIds: string[], sprintGoal?: string }): Promise<SprintAssignResult>`
    - `createIncrement(token: string, projectId: string, sprintId: string, data: IncrementPayload): Promise<ArtifactVersion>`
    - `createSprintReview(token: string, projectId: string, sprintId: string, data: SprintReviewPayload): Promise<ArtifactVersion>`
    - `createRetrospective(token: string, projectId: string, sprintId: string, data: RetrospectivePayload): Promise<ArtifactVersion>`
    - `createDeliveryRecord(token: string, projectId: string, data: CreateDeliveryRecordInput): Promise<DeliveryRecord>`
    - `listDeliveryRecords(token: string, projectId: string, params?: { environment?: string }): Promise<DeliveryRecord[]>`
    - `getDeliveryRecord(token: string, deliveryId: string): Promise<DeliveryRecord>`
  - CRITICAL: All new methods MUST take `token: string` as first parameter and pass it via `authHeaders(token)` in the request headers — this is the existing pattern used by `me()`, `listProjects()`, `listEpics()`, `listStories()`, etc.
  - Follow existing `this.jsonRequest()` method pattern for all API calls
  - Define TypeScript interfaces for input/output types at top of file or in a shared types file

  **Must NOT do**:
  - Do NOT add SBOM/Attestation/PostDeliveryReview client methods (those are admin operations, not UI-driven yet)
  - Do NOT change existing methods or authentication logic
  - Do NOT install any new dependencies

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding methods to existing class — follows established fetch pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — must complete before UI pages (Tasks 29-33)
  - **Parallel Group**: Wave 4 (first task)
  - **Blocks**: Tasks 29, 30, 31, 32, 33
  - **Blocked By**: Task 27

  **References**:

  **Pattern References**:
  - `packages/web/src/lib/api-client.ts` — CRITICAL: Read entire file. Understand the fetch wrapper, auth header injection, error handling, and method naming conventions used by existing methods

  **WHY Each Reference Matters**:
  - ALL new methods must follow the exact same fetch pattern — no introducing axios or different patterns
  - Auth token injection must use the same mechanism (Bearer token from auth context)

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)

  **QA Scenarios:**

  ```
  Scenario: All 12 new client methods exist and are typed
    Tool: Bash
    Preconditions: api-client.ts updated
    Steps:
      1. Read `packages/web/src/lib/api-client.ts`
      2. Assert it contains methods: createProductGoal, listProductGoals, updateProductGoal, getBacklog, refineBacklogItem, assignStories, createIncrement, createSprintReview, createRetrospective, createDeliveryRecord, listDeliveryRecords, getDeliveryRecord
      3. Assert each method has TypeScript return type annotation
      4. Assert each method uses the same fetch pattern as existing methods
      5. Run `bun test`
    Expected Result: 12 new typed methods following existing pattern
    Failure Indicators: Missing methods, untyped returns, different fetch pattern
    Evidence: .sisyphus/evidence/task-28-api-client.txt
  ```

  **Commit**: YES (groups with Task 34)
  - Message: `feat(web): add API client methods and route registration for scrum/delivery pages`
  - Files: `packages/web/src/lib/api-client.ts`
  - Pre-commit: `bun test`

- [ ] 29. ProductGoalsPage + useProductGoals hook

  **What to do**:
  - Create `packages/web/src/hooks/useProductGoals.ts`:
    - Custom hook returning `{ goals, loading, error, createGoal, updateGoal }`
    - Uses WebApiClient.listProductGoals() on mount
    - createGoal calls WebApiClient.createProductGoal() then refreshes list
    - updateGoal calls WebApiClient.updateProductGoal() then refreshes list
    - Follow exact hook pattern from existing hooks (useEffect + cleanup + state)
  - Create `packages/web/src/pages/ProductGoalsPage.tsx`:
    - List all product goals for the current project
    - Show title, problemStatement, approvalStatus, successMeasures for each goal
    - Create form: title, problemStatement, targetUsers, successMeasures (comma-separated → array), businessConstraints, nonGoals
    - Update approvalStatus via PATCH (dropdown: draft/pending_approval/approved/rejected)
    - Inline styles only — follow existing page styling patterns
    - Use React Router useParams() for projectId

  **Must NOT do**:
  - Do NOT use any UI framework (MUI, Chakra, Tailwind)
  - Do NOT create separate component files — keep page self-contained like existing pages
  - Do NOT implement complex form validation — basic required field checks only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React page with forms, lists, and styling — UI-focused task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 30, 31, 32, 33
  - **Parallel Group**: Wave 4 (after Task 28)
  - **Blocks**: Task 34 (route registration)
  - **Blocked By**: Task 28

  **References**:

  **Pattern References**:
  - `packages/web/src/pages/ProjectPage.tsx` — PRIMARY UI pattern: page structure, inline styles, data fetching, form handling
  - `packages/web/src/pages/SprintViewerPage.tsx` — List display pattern, card-style layouts
  - `packages/web/src/hooks/` — Existing hook files for data fetching pattern (if any exist)

  **API/Type References**:
  - `packages/web/src/lib/api-client.ts` — WebApiClient.createProductGoal(), listProductGoals(), updateProductGoal() (from Task 28)

  **WHY Each Reference Matters**:
  - ProjectPage shows exactly how to structure a page with data fetching + forms + inline styles
  - Must follow same styling approach (backgroundColor, padding, borderRadius, etc.) — no CSS classes

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test` → PASS (≥850 tests, 0 failures)

  **QA Scenarios:**

  ```
  Scenario: Create and view product goals via API
    Tool: Bash (curl)
    Preconditions: Server running, user authenticated, project exists
    Steps:
      1. POST /api/projects/{projectId}/product-goal with body: {"title":"MVP Authentication","problemStatement":"Users need secure login","targetUsers":"Internal team members","successMeasures":["Login success rate > 99%"],"businessConstraints":["Must use existing LDAP"],"nonGoals":["Social login"]}
      2. Assert response status 201
      3. Assert response JSON contains title="MVP Authentication", approvalStatus="draft"
      4. GET /api/projects/{projectId}/product-goal
      5. Assert response contains array with at least 1 goal with title="MVP Authentication"
    Expected Result: Goal created via API and retrievable in list
    Failure Indicators: 400/500 error, goal not in list
    Evidence: .sisyphus/evidence/task-29-create-goal.txt

  Scenario: Update goal approval status via API
    Tool: Bash (curl)
    Preconditions: Product goal exists with id={goalId}
    Steps:
      1. PATCH /api/product-goals/{goalId} with body: {"approvalStatus":"approved"}
      2. Assert response status 200
      3. Assert response JSON contains approvalStatus="approved"
    Expected Result: Approval status updated
    Failure Indicators: Status not changing, 400/500 error
    Evidence: .sisyphus/evidence/task-29-update-status.txt

  Scenario: ProductGoalsPage exports a renderable component
    Tool: Bash (bun test)
    Preconditions: ProductGoalsPage.tsx exists
    Steps:
      1. Create minimal test file `packages/web/src/pages/ProductGoalsPage.test.tsx` following the App.test.tsx pattern:
         - import { describe, expect, it } from 'bun:test';
         - import ProductGoalsPage from './ProductGoalsPage';
         - it('exports a renderable component', () => { expect(typeof ProductGoalsPage).toBe('function'); });
      2. Run `bun test packages/web/src/pages/ProductGoalsPage.test.tsx`
      3. Assert test passes
    Expected Result: Component exports verified, test passes
    Evidence: .sisyphus/evidence/task-29-component-test.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add ProductGoalsPage with create and status management`
  - Files: `packages/web/src/pages/ProductGoalsPage.tsx`, `packages/web/src/hooks/useProductGoals.ts`
  - Pre-commit: `bun test`

- [ ] 30. BacklogPage + useBacklog hook

  **What to do**:
  - Create `packages/web/src/hooks/useBacklog.ts`:
    - Custom hook returning `{ stories, loading, error, refineStory }`
    - Uses WebApiClient.getBacklog(projectId) on mount — returns stories ordered by sortOrder
    - refineStory(storyId, { sortOrder?, readiness? }) calls WebApiClient.refineBacklogItem()
    - Support readiness filter state
  - Create `packages/web/src/pages/BacklogPage.tsx`:
    - Display stories as an ordered list (sorted by sortOrder)
    - Each story shows: title, state, storyPoints, readiness badge (not_ready/refinement_needed/ready)
    - Readiness filter: buttons to show all / not_ready / refinement_needed / ready
    - Click on story → show inline detail + ability to change readiness and sortOrder
    - Inline styles only

  **Must NOT do**:
  - Do NOT implement drag-and-drop reordering — use manual sortOrder input
  - Do NOT add story creation — backlog displays existing stories
  - Do NOT use UI framework

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: List display with filtering, badges, and inline editing — UI-focused
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 29, 31, 32, 33
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 34
  - **Blocked By**: Task 28

  **References**:

  **Pattern References**:
  - `packages/web/src/pages/ProjectPage.tsx` — Page structure, inline styles
  - `packages/web/src/pages/SprintViewerPage.tsx` — List display with status indicators

  **API/Type References**:
  - `packages/web/src/lib/api-client.ts` — WebApiClient.getBacklog(), refineBacklogItem() (from Task 28)

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Backlog API returns ordered stories with readiness filter
    Tool: Bash (curl)
    Preconditions: 5 stories exist with various sortOrder and readiness values
    Steps:
      1. GET /api/projects/{projectId}/backlog
      2. Assert response status 200
      3. Assert stories array is ordered by sortOrder ASC
      4. Assert each story object contains readiness field
      5. GET /api/projects/{projectId}/backlog?readiness=ready
      6. Assert only stories with readiness="ready" returned
    Expected Result: Ordered list with working readiness filter at API level
    Failure Indicators: Wrong order, filter not working, missing readiness field
    Evidence: .sisyphus/evidence/task-30-backlog-api.txt

  Scenario: Refine story readiness via API
    Tool: Bash (curl)
    Preconditions: Story exists with readiness="not_ready"
    Steps:
      1. POST /api/projects/{projectId}/backlog/refine with body: {"storyId":"{storyId}","readiness":"ready"}
      2. Assert response status 200
      3. Assert response contains readiness="ready"
      4. GET /api/projects/{projectId}/backlog?readiness=ready
      5. Assert refined story appears in filtered results
    Expected Result: Story readiness updated via API
    Evidence: .sisyphus/evidence/task-30-refine-api.txt

  Scenario: BacklogPage exports a renderable component
    Tool: Bash (bun test)
    Preconditions: BacklogPage.tsx exists
    Steps:
      1. Create minimal test file `packages/web/src/pages/BacklogPage.test.tsx` following App.test.tsx pattern:
         - import { describe, expect, it } from 'bun:test';
         - import BacklogPage from './BacklogPage';
         - it('exports a renderable component', () => { expect(typeof BacklogPage).toBe('function'); });
      2. Run `bun test packages/web/src/pages/BacklogPage.test.tsx`
      3. Assert test passes
    Expected Result: Component exports verified, test passes
    Evidence: .sisyphus/evidence/task-30-component-test.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add BacklogPage with readiness filtering and refinement`
  - Files: `packages/web/src/pages/BacklogPage.tsx`, `packages/web/src/hooks/useBacklog.ts`
  - Pre-commit: `bun test`

- [ ] 31. SprintBacklogView (extend SprintViewer)

  **What to do**:
  - Edit `packages/web/src/pages/SprintViewerPage.tsx` to add a "Sprint Planning" section:
    - When sprint is in 'planning' status, show:
      - List of stories currently assigned to this sprint (via sprintId)
      - "Add Stories" section showing stories with readiness='ready' that are NOT yet assigned to any sprint
      - Button to assign selected stories to this sprint (calls WebApiClient.assignStories())
      - Sprint goal input field
    - When sprint is in other statuses, show read-only view of assigned stories
  - Create `packages/web/src/hooks/useSprintBacklog.ts` if needed for sprint-specific data fetching

  **Must NOT do**:
  - Do NOT create a separate page — extend existing SprintViewerPage
  - Do NOT implement capacity calculation
  - Do NOT use UI framework

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Extending existing page with interactive sprint planning UI
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 29, 30, 32, 33
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 34
  - **Blocked By**: Task 28

  **References**:

  **Pattern References**:
  - `packages/web/src/pages/SprintViewerPage.tsx` — CRITICAL: Read entire file. This is the page being extended — understand its current structure, data fetching, and styling before adding

  **API/Type References**:
  - `packages/web/src/lib/api-client.ts` — WebApiClient.assignStories(), getBacklog() (from Task 28)

  **WHY Each Reference Matters**:
  - Must extend, not replace — existing sprint viewing functionality must remain intact
  - Planning section only shows when sprint status is 'planning'

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Assign stories to sprint via API
    Tool: Bash (curl)
    Preconditions: Sprint in 'planning' status, 3 stories with readiness='ready'
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/assign-stories with body: {"storyIds":["story-1","story-2"],"sprintGoal":"Complete auth"}
      2. Assert response status 200
      3. Assert assignedStories array has 2 entries
      4. Verify stories assigned via the POST response body (which returns { sprint, assignedStories }) — no separate sprint GET endpoint exists
      5. GET /api/projects/{projectId}/backlog?readiness=ready — verify remaining unassigned stories
    Expected Result: Stories assigned to sprint, goal set
    Failure Indicators: Assignment fails, stories not linked to sprint
    Evidence: .sisyphus/evidence/task-31-assign-stories.txt

  Scenario: SprintViewerPage still exports a renderable component after extension
    Tool: Bash (bun test)
    Preconditions: SprintViewerPage.tsx modified with sprint planning section
    Steps:
      1. Run existing `bun test packages/web/src/pages/SprintViewerPage` (if test exists) or verify `bun test` full suite still passes (≥850 tests)
      2. Verify no TypeScript errors: `bunx tsc --noEmit` from packages/web
    Expected Result: Existing tests still pass, no type errors introduced
    Evidence: .sisyphus/evidence/task-31-component-test.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add sprint planning section to SprintViewerPage`
  - Files: `packages/web/src/pages/SprintViewerPage.tsx`, optional hook file
  - Pre-commit: `bun test`

- [ ] 32. IncrementPage + SprintReviewPage + RetrospectivePage

  **What to do**:
  - Create `packages/web/src/pages/IncrementPage.tsx`:
    - Form to create increment for a sprint: select completed stories, list demonstrable features, note technical debt
    - Display existing increments for the sprint
    - Uses WebApiClient.createIncrement()
  - Create `packages/web/src/pages/SprintReviewPage.tsx`:
    - Form to create sprint review: select increment, rate goal alignment (0-100 slider/input), add stakeholder feedback entries, list action items
    - Display existing reviews
    - Uses WebApiClient.createSprintReview()
  - Create `packages/web/src/pages/RetrospectivePage.tsx`:
    - Form with sections: What Went Well (add items), What Didn't Go Well (add items), Improvements (structured: description + priority + optional assignee), Team Sentiment (1-5 rating)
    - Display existing retrospectives
    - Uses WebApiClient.createRetrospective()
  - All pages use inline styles, React Router params, and WebApiClient
  - Create supporting hooks as needed (useIncrement, useSprintReview, useRetrospective or a combined useSprintArtifacts)

  **Must NOT do**:
  - Do NOT use UI framework
  - Do NOT implement complex form state management — simple useState per field
  - Do NOT couple pages — each page operates independently

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 3 React pages with forms and data display — UI-heavy task
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 29, 30, 31, 33
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 34
  - **Blocked By**: Task 28

  **References**:

  **Pattern References**:
  - `packages/web/src/pages/ProjectPage.tsx` — Form + list display pattern
  - `packages/web/src/pages/ProductGoalsPage.tsx` — Sibling page (Task 29) for similar form/list pattern

  **API/Type References**:
  - `packages/web/src/lib/api-client.ts` — createIncrement(), createSprintReview(), createRetrospective() (from Task 28)
  - `packages/db/src/schemas/artifact-payloads.ts` — Payload structures (from Task 12) — use these as reference for form fields

  **WHY Each Reference Matters**:
  - The Zod payload schemas define exactly which fields each form needs
  - Sprint Review form must clearly indicate it's evaluation-only (not a release gate)

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Create increment via API
    Tool: Bash (curl)
    Preconditions: Sprint with completed stories exists
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/increment with body: {"sprintId":"{sprintId}","completedStoryIds":["story-1","story-2"],"incompleteStoryIds":[],"demonstrableFeatures":["User authentication flow"],"technicalDebt":[],"notes":"Sprint 1 increment"}
      2. Assert response status 201
      3. Assert response contains artifactType="increment"
      4. Assert completedStoryIds has 2 entries
    Expected Result: Increment artifact created with correct payload
    Evidence: .sisyphus/evidence/task-32-increment-api.txt

  Scenario: Create retrospective with structured improvements via API
    Tool: Bash (curl)
    Steps:
      1. POST /api/projects/{projectId}/sprints/{sprintId}/retrospective with body: {"sprintId":"{sprintId}","whatWentWell":["CI pipeline stable"],"whatDidntGoWell":["Flaky tests"],"improvements":[{"description":"Fix flaky tests","priority":"high"}],"teamSentiment":4}
      2. Assert response status 201
      3. Assert response contains artifactType="retrospective"
      4. Assert improvements array has 1 entry with priority="high"
      5. Assert teamSentiment=4
    Expected Result: Retrospective with structured data, not freeform
    Evidence: .sisyphus/evidence/task-32-retrospective-api.txt

  Scenario: Increment/Review/Retro page components export renderable functions
    Tool: Bash (bun test)
    Steps:
      1. Create minimal test files following `packages/web/src/App.test.tsx` pattern:
         - `packages/web/src/pages/IncrementPage.test.tsx` — import IncrementPage, assert typeof === 'function'
         - `packages/web/src/pages/SprintReviewPage.test.tsx` — import SprintReviewPage, assert typeof === 'function'
         - `packages/web/src/pages/RetrospectivePage.test.tsx` — import RetrospectivePage, assert typeof === 'function'
      2. Run `bun test packages/web/src/pages/IncrementPage.test.tsx packages/web/src/pages/SprintReviewPage.test.tsx packages/web/src/pages/RetrospectivePage.test.tsx`
      3. Assert all tests pass
    Expected Result: All 3 pages export valid function components
    Evidence: .sisyphus/evidence/task-32-component-tests.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add increment, sprint review, and retrospective pages`
  - Files: `packages/web/src/pages/IncrementPage.tsx`, `SprintReviewPage.tsx`, `RetrospectivePage.tsx`, hook files
  - Pre-commit: `bun test`

- [ ] 33. DeliveryRecordsPage + useDeliveryRecords hook

  **What to do**:
  - Create `packages/web/src/hooks/useDeliveryRecords.ts`:
    - Custom hook returning `{ records, loading, error, createRecord }`
    - Uses WebApiClient.listDeliveryRecords() on mount
    - Support environment filter
  - Create `packages/web/src/pages/DeliveryRecordsPage.tsx`:
    - List delivery records for the project with environment and status indicators
    - Each record shows: environment, deployedVersion, deploymentResult status badge, createdAt
    - Environment filter (staging/production/all)
    - Create form: environment (select), deployedVersion, releaseCandidateId (optional), deploymentWindow (start/end datetime inputs), evidenceReferences (comma-separated IDs)
    - Click record → detail view showing full record with evidence references
    - Inline styles only

  **Must NOT do**:
  - Do NOT show SBOM/Attestation/PostDeliveryReview data — those are separate admin concerns
  - Do NOT implement deployment triggering — just record management
  - Do NOT use UI framework

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: React page with list, filter, form, and detail view — UI-focused
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Tasks 29, 30, 31, 32
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 34
  - **Blocked By**: Task 28

  **References**:

  **Pattern References**:
  - `packages/web/src/pages/ProjectPage.tsx` — Page pattern
  - `packages/web/src/pages/BacklogPage.tsx` — Sibling page (Task 30) with filtering

  **API/Type References**:
  - `packages/web/src/lib/api-client.ts` — createDeliveryRecord(), listDeliveryRecords(), getDeliveryRecord() (from Task 28)

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Create and list delivery records with environment filter via API
    Tool: Bash (curl)
    Preconditions: User authenticated, project exists
    Steps:
      1. POST /api/projects/{projectId}/delivery-records with body: {"environment":"staging","deployedVersion":"1.2.0","deploymentWindow":{"start":"2025-03-26T10:00:00Z","end":"2025-03-26T11:00:00Z"}}
      2. Assert response status 201
      3. Assert response contains environment="staging", deploymentResult="pending"
      4. POST /api/projects/{projectId}/delivery-records with body: {"environment":"production","deployedVersion":"1.3.0","deploymentWindow":{"start":"2025-03-27T10:00:00Z","end":"2025-03-27T11:00:00Z"}}
      5. Assert response status 201
      6. GET /api/projects/{projectId}/delivery-records?environment=staging
      7. Assert only staging records returned
    Expected Result: Records created, filterable by environment at API level
    Failure Indicators: Filter not working, missing deploymentResult field
    Evidence: .sisyphus/evidence/task-33-delivery-records-api.txt

  Scenario: DeliveryRecordsPage exports a renderable component
    Tool: Bash (bun test)
    Preconditions: DeliveryRecordsPage.tsx exists
    Steps:
      1. Create minimal test file `packages/web/src/pages/DeliveryRecordsPage.test.tsx` following App.test.tsx pattern:
         - import { describe, expect, it } from 'bun:test';
         - import DeliveryRecordsPage from './DeliveryRecordsPage';
         - it('exports a renderable component', () => { expect(typeof DeliveryRecordsPage).toBe('function'); });
      2. Run `bun test packages/web/src/pages/DeliveryRecordsPage.test.tsx`
      3. Assert test passes
    Expected Result: Component exports verified, test passes
    Evidence: .sisyphus/evidence/task-33-component-test.txt
  ```

  **Commit**: YES
  - Message: `feat(web): add DeliveryRecordsPage with environment filtering`
  - Files: `packages/web/src/pages/DeliveryRecordsPage.tsx`, `packages/web/src/hooks/useDeliveryRecords.ts`
  - Pre-commit: `bun test`

- [ ] 34. Route registration in App.tsx

  **What to do**:
  - Edit `packages/web/src/App.tsx` to add React Router routes for all new pages:
    - `/projects/:projectId/product-goals` → `<ProductGoalsPage />`
    - `/projects/:projectId/backlog` → `<BacklogPage />`
    - `/projects/:projectId/sprints/:sprintId/increment` → `<IncrementPage />`
    - `/projects/:projectId/sprints/:sprintId/review` → `<SprintReviewPage />`
    - `/projects/:projectId/sprints/:sprintId/retrospective` → `<RetrospectivePage />`
    - `/projects/:projectId/delivery-records` → `<DeliveryRecordsPage />`
  - All routes should be wrapped in `<ProtectedRoute>` (same as existing routes)
  - Add imports for all new page components
  - Add navigation links to ProductGoalsPage, BacklogPage, and DeliveryRecordsPage from ProjectPage (if it has navigation)

  **Must NOT do**:
  - Do NOT change existing routes
  - Do NOT modify ProtectedRoute component
  - Do NOT add lazy loading unless existing routes use it

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding routes to existing file — simple additions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — must wait for all page tasks (Tasks 29-33)
  - **Parallel Group**: Wave 4 (final)
  - **Blocks**: Tasks 35, 36 (integration tests need navigable pages)
  - **Blocked By**: Tasks 29, 30, 31, 32, 33

  **References**:

  **Pattern References**:
  - `packages/web/src/App.tsx` — CRITICAL: Read entire file. Understand Route nesting, ProtectedRoute wrapping, import pattern

  **WHY Each Reference Matters**:
  - Routes must nest correctly under existing layout/route structure
  - ProtectedRoute wrapper ensures auth is enforced on all new pages

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: All new routes are registered in App.tsx
    Tool: Bash (bun test + grep)
    Preconditions: App.tsx updated with new routes
    Steps:
      1. Read packages/web/src/App.tsx
      2. Assert it imports ProductGoalsPage, BacklogPage, IncrementPage, SprintReviewPage, RetrospectivePage, DeliveryRecordsPage
      3. Assert Route elements exist for: /projects/:projectId/product-goals, /projects/:projectId/backlog, /projects/:projectId/sprints/:sprintId/increment, /projects/:projectId/sprints/:sprintId/review, /projects/:projectId/sprints/:sprintId/retrospective, /projects/:projectId/delivery-records
      4. Assert each new route is wrapped in ProtectedRoute (same as existing routes)
      5. Run `bun test` to verify no import errors or build failures
    Expected Result: All 6 routes registered with ProtectedRoute wrapping, build passes
    Failure Indicators: Missing imports, routes not wrapped in ProtectedRoute, build failure
    Evidence: .sisyphus/evidence/task-34-route-registration.txt

  Scenario: Web app builds without errors
    Tool: Bash (bun build)
    Steps:
      1. Run `bun test` from packages/web (or root)
      2. Assert 0 failures
      3. Assert no TypeScript errors related to missing page imports
    Expected Result: Build and tests pass with all new routes registered
    Evidence: .sisyphus/evidence/task-34-build-check.txt
  ```

  **Commit**: YES (groups with Task 28)
  - Message: `feat(web): add API client methods and route registration for scrum/delivery pages`
  - Files: `packages/web/src/App.tsx`
  - Pre-commit: `bun test`

### Wave 5 — Integration Pilot: Full Lifecycle Verification

- [ ] 35. Scrum lifecycle integration pilot test

  **What to do**:
  - Create `packages/api/src/routes/scrum-lifecycle.integration.test.ts`
  - Write a comprehensive integration test that exercises the full Scrum lifecycle in sequence:
    1. **Create Product Goal** → POST /api/projects/:projectId/product-goal → assert 201, get goalId
    2. **Create stories and refine** → POST existing story creation + POST /backlog/refine to set readiness='ready' and sortOrder
    3. **Verify backlog ordering** → GET /api/projects/:projectId/backlog → assert stories ordered by sortOrder, filtered by readiness
    4. **Assign stories to sprint** → POST /api/projects/:projectId/sprints/:sprintId/assign-stories → assign ready stories to sprint → assert 200
    5. **Create increment** → POST /api/projects/:projectId/sprints/:sprintId/increment → assert 201, verify completedStoryIds
    6. **Create sprint review** → POST /api/projects/:projectId/sprints/:sprintId/review → assert 201, verify goalAlignmentScore
    7. **Create retrospective** → POST /api/projects/:projectId/sprints/:sprintId/retrospective → assert 201, verify structured improvements
    8. **Verify lineage chain** → Check that artifact_lineage links connect: stories → increment → sprint_review → retrospective
    9. **Verify audit trail** → Check audit log contains entries for each operation
    10. **Verify Sprint Review does NOT change sprint status** → assert sprint status unchanged after review
  - Test should use mocked DbClient (following `packages/api/src/routes/auth.test.ts` pattern), NOT a real database
  - Each step should assert the response AND verify side effects (lineage, audit) by asserting the mock was called correctly

  **Must NOT do**:
  - Do NOT require a real PostgreSQL database — use DbClient mocks consistent with existing API tests
  - Do NOT skip any lifecycle step
  - Do NOT test UI — this is API-level integration testing with mocked DB

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex multi-step test with cross-concern assertions — requires deep understanding of all components
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 36
  - **Parallel Group**: Wave 5
  - **Blocks**: Final Verification (F1-F4)
  - **Blocked By**: Task 34

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/auth.test.ts` — Existing API test pattern: test setup, auth mocking, request construction
  - `packages/api/src/routes/sprints.ts` — Sprint-related route patterns for test construction
  - All route files from Tasks 16-21 — exact API contracts being tested

  **API/Type References**:
  - Every route handler created in Waves 2-3 — must know exact request/response shapes
  - `packages/db/src/repositories/artifact-lineage.repo.ts` — For verifying lineage chain
  - `packages/db/src/repositories/audit.repo.ts` — For verifying audit entries

  **WHY Each Reference Matters**:
  - This test verifies that ALL components work together, not just individually
  - Lineage chain verification proves artifacts are properly connected
  - Audit trail verification proves governance compliance

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test packages/api/src/routes/scrum-lifecycle.integration.test.ts` → PASS (≥10 assertions across lifecycle steps)
  - [ ] Full lifecycle completes without errors

  **QA Scenarios:**

  ```
  Scenario: Full Scrum lifecycle from goal to retrospective
    Tool: Bash (bun test)
    Preconditions: Mocked DbClient with test data
    Steps:
      1. Run `bun test packages/api/src/routes/scrum-lifecycle.integration.test.ts`
      2. Assert all tests pass
      3. Verify test output shows 10+ assertions covering:
         - Product goal creation
         - Backlog population and ordering
         - Sprint planning with ready stories
         - Increment creation with story references
         - Sprint review with goal alignment
         - Retrospective with improvements
         - Lineage chain connectivity
         - Audit trail completeness
         - Sprint status preservation (review doesn't change it)
    Expected Result: Complete Scrum lifecycle passes all assertions
    Failure Indicators: Any lifecycle step fails, missing lineage, missing audit entries
    Evidence: .sisyphus/evidence/task-35-scrum-integration.txt

  Scenario: Sprint Review does not trigger state changes
    Tool: Bash (bun test)
    Preconditions: Sprint in 'active' or 'completed' status
    Steps:
      1. Record sprint status before review
      2. Create sprint review
      3. Query sprint status after review
      4. Assert status unchanged
    Expected Result: Sprint status identical before and after review
    Failure Indicators: Sprint status changed to any other value
    Evidence: .sisyphus/evidence/task-35-review-no-state-change.txt
  ```

  **Commit**: YES
  - Message: `test(integration): add Scrum lifecycle integration pilot test`
  - Files: `packages/api/src/routes/scrum-lifecycle.integration.test.ts`
  - Pre-commit: `bun test`

- [ ] 36. Delivery Provenance lifecycle integration pilot test

  **What to do**:
  - Create `packages/api/src/routes/delivery-lifecycle.integration.test.ts`
  - Write a comprehensive integration test for the Delivery Provenance lifecycle:
    1. **Create delivery record** → POST /api/projects/:projectId/delivery-records → assert 201, verify environment and pending status
    2. **Attach SBOM** → POST /api/release-candidates/:id/sbom → assert 201, verify components stored
    3. **Attach attestation** → POST /api/release-candidates/:id/attest → assert 201, verify build provenance
    4. **Create post-delivery review** → POST /api/delivery-records/:deliveryId/post-review → assert 201, verify health checks
    5. **Verify lineage chain** → delivery_record → release_candidate (if linked), sbom → release_candidate (verified_by), attestation → release_candidate (verified_by), post_delivery_review → delivery_record (derived_from)
    6. **Verify evidence references** → delivery record's evidenceReferences contain artifact version IDs
    7. **Verify audit trail** → all operations logged
    8. **Test non-existent delivery record** → POST post-review for nonexistent ID → assert 404
  - Test should use mocked DbClient (following `packages/api/src/routes/auth.test.ts` pattern), NOT a real database

  **Must NOT do**:
  - Do NOT implement actual deployment — just test record creation
  - Do NOT require a real PostgreSQL database — use DbClient mocks consistent with existing API tests
  - Do NOT skip lineage verification — this is the core provenance value
  - Do NOT test UI — API-level integration testing with mocked DB only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Multi-step integration test with lineage chain assertions — requires understanding of all delivery components
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES — with Task 35
  - **Parallel Group**: Wave 5
  - **Blocks**: Final Verification (F1-F4)
  - **Blocked By**: Task 34

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/scrum-lifecycle.integration.test.ts` — Sibling integration test (Task 35) for test structure
  - `packages/api/src/routes/auth.test.ts` — Base test patterns

  **API/Type References**:
  - All route handlers from Wave 3 (Tasks 23-26) — exact API contracts
  - `packages/db/src/repositories/artifact-lineage.repo.ts` — Lineage verification
  - `packages/db/src/repositories/artifact-version.repo.ts` — Artifact version queries

  **WHY Each Reference Matters**:
  - Delivery provenance is evidence-oriented — lineage verification proves artifacts are connected
  - The 404 test for non-existent delivery records validates error handling

  **Acceptance Criteria**:

  **TDD:**
  - [ ] `bun test packages/api/src/routes/delivery-lifecycle.integration.test.ts` → PASS (≥8 assertions)

  **QA Scenarios:**

  ```
  Scenario: Full Delivery Provenance lifecycle
    Tool: Bash (bun test)
    Preconditions: Mocked DbClient with test data
    Steps:
      1. Run `bun test packages/api/src/routes/delivery-lifecycle.integration.test.ts`
      2. Assert all tests pass
      3. Verify test covers:
         - Delivery record creation with evidence references
         - SBOM attachment to release candidate
         - Provenance attestation
         - Post-delivery review with health checks
         - Lineage chain: delivery_record → sbom/attestation (via release candidate)
         - Audit trail for all operations
         - 404 for non-existent delivery record
    Expected Result: Complete delivery lifecycle with provenance chain verified
    Failure Indicators: Missing lineage links, health check data lost, audit gaps
    Evidence: .sisyphus/evidence/task-36-delivery-integration.txt

  Scenario: Delivery provenance is evidence-oriented
    Tool: Bash (bun test)
    Steps:
      1. Create delivery record
      2. Create post-delivery review with health checks and performance baselines
      3. Query the post-delivery review artifact
      4. Assert it contains structured healthChecks array (not freeform text)
      5. Assert it contains performanceBaseline with expected vs actual metrics
    Expected Result: Evidence-oriented data (structured, not narrative-only)
    Failure Indicators: Freeform text instead of structured data
    Evidence: .sisyphus/evidence/task-36-evidence-oriented.txt
  ```

  **Commit**: YES
  - Message: `test(integration): add Delivery Provenance lifecycle integration pilot test`
  - Files: `packages/api/src/routes/delivery-lifecycle.integration.test.ts`
  - Pre-commit: `bun test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. All verification uses `bun test` for component checks and `curl` for API contract checks. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Wave | Commit Message | Files | Pre-commit |
|------|---------------|-------|------------|
| 0 | `chore(db): generate catch-up migration for governance tables` | `packages/db/drizzle/0001_*.sql` | `bun test` |
| 0 | `feat(db): add repositories for artifact governance tables` | `packages/db/src/repositories/artifact-*.repo.ts, gate-definition.repo.ts, stage-transition.repo.ts, index.ts` | `bun test` |
| 1 | `feat(db): expand artifact type enum and add scrum/delivery schema` | `packages/db/src/schema/artifact_versions.ts, product_goals.ts, delivery_records.ts, stories.ts, index.ts` | `bun test` |
| 1 | `chore(db): generate migration for scrum product + delivery provenance tables` | `packages/db/drizzle/0002_*.sql` | `bun test` |
| 1 | `feat(api): add RBAC permissions for product goal, delivery record, artifact version` | `packages/api/src/auth/rbac.ts` | `bun test` |
| 1 | `feat(db): add Zod schemas for scrum and delivery artifact payloads` | `packages/db/src/schemas/artifact-payloads.ts` | `bun test` |
| 2 | `feat(api): add product goal CRUD routes` | `packages/api/src/routes/product-goals.ts`, `packages/db/src/repositories/product-goal.repo.ts` | `bun test` |
| 2 | `feat(api): add product backlog and sprint planning routes` | `packages/api/src/routes/backlog.ts, sprint-planning.ts` | `bun test` |
| 2 | `feat(api): add increment, sprint review, and retrospective routes` | `packages/api/src/routes/increments.ts, sprint-reviews.ts, retrospectives.ts` | `bun test` |
| 3 | `feat(api): add delivery record CRUD routes` | `packages/api/src/routes/delivery-records.ts`, `packages/db/src/repositories/delivery-record.repo.ts` | `bun test` |
| 3 | `feat(api): add SBOM, attestation, and post-delivery review seam routes` | `packages/api/src/routes/sbom.ts, attestations.ts, post-delivery-reviews.ts` | `bun test` |
| 3 | `feat(api): register all scrum and delivery routes in server.ts` | `packages/api/src/server.ts` | `bun test` |
| 4 | `feat(web): add product goal and backlog management pages` | `packages/web/src/pages/ProductGoalsPage.tsx, BacklogPage.tsx`, hooks, api-client | `bun test` |
| 4 | `feat(web): add sprint backlog, increment, review, and retro pages` | `packages/web/src/pages/Sprint*.tsx, IncrementPage.tsx, ...` | `bun test` |
| 4 | `feat(web): add delivery records page and route registration` | `packages/web/src/pages/DeliveryRecordsPage.tsx, App.tsx` | `bun test` |
| 5 | `test(integration): add scrum and delivery lifecycle integration pilot tests` | `packages/api/src/routes/*.integration.test.ts` | `bun test` |

---

## Success Criteria

### Verification Commands
```bash
bun test                                    # Expected: ≥850 tests, 0 failures
bunx drizzle-kit generate                   # Expected: clean migration generation (run from packages/db/)
curl -X POST localhost:3000/api/projects/{id}/product-goal  # Expected: 201 with product goal
curl localhost:3000/api/projects/{id}/backlog               # Expected: 200 with ordered stories
curl -X POST localhost:3000/api/projects/{id}/delivery-records  # Expected: 201 with delivery record
```

### Final Checklist
- [ ] All 15 API routes respond correctly
- [ ] All "Must Have" artifacts have schema contract, lineage rules, approval behavior, evaluation rules, audit events
- [ ] All "Must NOT Have" guardrails verified (no agent mods, no new story states, no UI framework, no hand-written SQL)
- [ ] 850+ tests pass with 0 failures
- [ ] Sprint Review is evaluation-only (no state transitions triggered)
- [ ] Delivery provenance includes evidence references (not narrative-only)
- [ ] Web UI pages render with inline styles only
