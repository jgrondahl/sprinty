# Draft: Polish Analysis — Unified Governance Plan

## Purpose
Map the 10 polish dimensions against current plan coverage to identify what's already addressed,
what's partially covered, and what's missing entirely.

## Coverage Matrix

### 1. Contract Cleanliness
- **MOSTLY COVERED** by recent correction rounds
- Canonical API routes frozen (promotion, evaluation, governance, audit)
- Canonical stage enum frozen (12 values)
- Canonical schema columns frozen (Task 6 source of truth)
- **GAP**: No explicit "API vocabulary document" — contracts are scattered across task definitions
- **GAP**: File/module naming convention not formally documented (implicit from examples)

### 2. Operator-Grade UX
- **PARTIALLY COVERED** — Tasks 41-45 build governance UI pages
- Task 41: Approval queue page
- Task 42: Artifact diff viewer (side-by-side)
- Task 43: Evaluation score display
- Task 44: Stage pipeline visualization
- Task 45: Run contract viewer
- **GAP**: No "why is this blocked" explanation in approval queue
- **GAP**: No evidence/diff/score combined view for approvals
- **GAP**: No failed-run diagnostics beyond viewing contract/violations
- **GAP**: No escalation or rollback UX (only API-level rollback exists)
- **PENDING**: Explore agent results on current UI quality baseline

### 3. Decision Transparency
- **PARTIALLY COVERED** — audit log captures governance events
- Task 23: Audit event catalog with structured events
- Task 27: Audit event API routes
- **GAP**: No UI for "why did this happen" trace (audit log is raw events, not narrative)
- **GAP**: No linkage from approval to evidence+score+policy in a single view

### 4. Strong Default Policies
- **MINIMALLY COVERED**
- Task 18: Evaluation thresholds with project/org/global hierarchy + defaults
- Task 8: Agent capability profiles with config-driven allow-lists
- **GAP**: No explicit default threshold values defined in the plan
- **GAP**: No "secure by default" gate definitions shipped out of the box
- **GAP**: No default rollback/stop conditions

### 5. Production-Grade Runbooks
- **NOT COVERED** — zero runbook tasks in the plan
- No failed-run triage procedure
- No stuck-approval handling
- No rollback procedure
- No secret exposure response
- No corrupted artifact recovery
- No migration failure recovery
- No degraded-provider mode guide

### 6. Real Pilot Package
- **PARTIALLY COVERED** — pilot slice section exists (lines 132-176)
- Pilot defines 12 tasks and a success workflow
- **GAP**: No seeded demo data or bootstrap script
- **GAP**: No reference project template
- **GAP**: No pilot operating policy document
- **GAP**: No explicit feedback capture mechanism
- **GAP**: No success/failure criteria beyond the 7-step workflow test

### 7. Quality of Writing and Naming
- **MOSTLY COVERED** after correction rounds
- Stage names canonical
- Route names canonical
- Placeholder syntax normalized
- **GAP**: Some task descriptions still have "or equivalent" / "or similar" hedging language
- **PENDING**: Full scan for ambiguous language

### 8. Test Evidence Matching Promise
- **WELL COVERED** — Task 50 (promotion E2E), Task 48 (Playwright E2E), Task 52 (authority enforcement)
- Tests specifically verify: gate blocking, capability enforcement, audit trails, rollback
- **GAP**: No test for "imported roadmap ambiguity is surfaced, not buried"
- **GAP**: No test for "approval latency is acceptable" (performance)
- **MINOR GAP**: Some test scenarios could be more specific about governance-differentiating assertions

### 9. Performance and Burden Awareness
- **MINIMALLY COVERED**
- No approval queue load management
- No evaluation latency targets
- No "common workflow click count" optimization
- No noisy-alert prevention
- Rate limiting exists (Task 3) but for API protection, not operator burden

### 10. Post-Implementation Restraint
- **WELL COVERED** — Must NOT Have section is explicit
- No multi-tenant complexity
- No agent marketplace
- No mobile app
- No WebSocket
- **GAP**: No explicit deferral list in the plan (what's consciously deferred vs. forgotten)

## Research Findings

### API Layer Baseline (Explore Agent — correct Splinty repo)
- **Route naming**: A — kebab-case throughout, consistent URLs ✓
- **Error response format**: A — Standardized `{error, code}` schema, centralized mapError() ✓
- **Logging quality**: F — Only 2 console.info lines, no structured logging, no request context
- **Validation patterns**: A — Zod everywhere, consistent schema-then-parse pattern ✓
- **Response shapes**: C — Inconsistent envelopes (some wrap in `{data}`, some raw, some `{entityName: []}`)
- **Operational endpoints**: C — Health check exists but shallow (no DB check, no readiness probe)
- **Test quality**: D — 54% route coverage, mostly authorization tests, thin happy paths
- **Config management**: D — No startup validation, DATABASE_URL defaults to empty string

**Plan coverage of API gaps**:
- Logging → Task 3 (Pino structured logging) ✅
- Health probes → Task 4 (deep health checks) ✅
- Config validation → Task 2 ✅
- Tests → TDD mandate across all governance tasks ✅
- Response shapes → ⚠️ NOT explicitly in plan (only gap not covered)

### Web UI Baseline
- **NOT ASSESSED** — Explore agent investigated OpenCode's app (wrong project), not Splinty
- Splinty web UI was built during enterprise-sdlc plan: React, basic pages (Login, Dashboard, etc.)
- UI quality will be assessed organically during Wave 7-8 (Tasks 41-48) when governance UI is built

## User Decisions (Final)

### Execution Verdict
- **Start development**: YES — plan is approved for execution ✅
- **Starting point**: Wave 1 (Tasks 1-8) — correct because it establishes contracts
- **Polish scope**: Reference only, NOT execution scope. Follow-on after governance is built.

### Wave 1 Contract Discipline Rule (User-Mandated)
> "Execute Wave 1 in parallel, but treat Tasks 6, 7, and 8 as contract-authoring tasks.
> Do not allow downstream implementation to redefine schema fields, enums, route vocabulary,
> or capability names outside those task outputs. Tasks 1-5 must conform to existing repo
> patterns; Tasks 6-8 establish the canonical governance vocabulary for later waves."

**Task classification within Wave 1:**
- Tasks 1-5: Infrastructure tasks — must conform to existing repo patterns
- Tasks 6-8: Contract-authoring tasks — freeze governance vocabulary for all subsequent waves
- Parallelism is safe for 1-5; Tasks 6-8 need stricter review because they freeze:
  - Schema fields (Task 6: artifact schema)
  - Promotion/stage enum vocabulary (Task 7: promotion schema)
  - Capability names and authority model (Task 8: capability profiles)

## Open Questions (RESOLVED)
1. ~~Should polish items go into the EXISTING plan?~~ → **No. Reference only. Implement governance first.**
2. ~~Which polish dimensions are highest priority?~~ → **Addressed by plan already (logging, health, config, tests). Response shape is the only uncovered gap.**
3. ~~Pilot package audience?~~ → **Deferred to later waves.**
4. ~~Runbook audience?~~ → **Deferred — zero runbook tasks, acknowledged as post-implementation concern.**
