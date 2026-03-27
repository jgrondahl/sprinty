# Enterprise Hardening: DB Resilience, Observability & Governance

## TL;DR

> **Quick Summary**: Harden Splinty for reliable internal team deployment by adding database resilience (connection pooling, retries, timeouts, transactions), lightweight observability (enhanced logging, Sentry, health checks), internal governance (audit retention, data export), and fixing critical security issues (exposed credentials, Docker root user, graceful shutdown).
> 
> **Deliverables**:
> - Database connection pooling with configurable pool size (20-50)
> - Retry utility with exponential backoff for transient DB errors
> - Query timeout enforcement and transaction wrappers
> - Enhanced Pino logging with correlation ID propagation
> - Sentry error tracking integration (API package)
> - Liveness/readiness health check separation with DB connectivity
> - Audit log retention policy with configurable TTL cleanup job
> - Audit data export endpoint (CSV/JSON)
> - Seed data script for development bootstrapping
> - Security fixes: credential cleanup, Docker non-root, graceful shutdown, resource limits
> 
> **Estimated Effort**: Medium (14 tasks across 4 waves)
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 → Task 5 → Task 6 → Task 9 → Task 12

---

## Context

### Original Request
Review the Splinty project and identify what would make it enterprise-ready, then create a work plan for the most important gaps.

### Interview Summary
**Key Discussions**:
- **Deployment target**: Internal team tool (not SaaS/public-facing). Lower security bar, simpler ops.
- **Priority areas**: User selected Database Resilience, Compliance/Governance, and Observability.
- **Observability stack**: Lightweight — enhanced Pino + Sentry error tracking. No Prometheus/Grafana/Datadog.
- **Compliance scope**: Internal governance only — audit retention, cleanup, export. No full GDPR/SOC2.
- **DB concurrency**: Medium (20-50 connections) with proper pooling, retries, timeouts.
- **Quick security wins**: Include .env.example credential leak, Docker root user, graceful shutdown.

**Research Findings**:
- **API package**: Already has Pino logger with redaction, request ID middleware, JWT auth, RBAC (4 roles, 14 permissions), rate limiting, security headers, Zod validation. Solid foundation.
- **DB package**: Drizzle ORM, 20+ tables, single monolithic migration (`0000_worried_silver_fox.sql`), 10 repositories. `createDb()` is 10 lines with zero pool config. `prepare: false` set, no retries, no timeouts, no transactions used anywhere.
- **Core package**: Architecture enforcer, sprint state, telemetry schemas. Workspace persistence is file-based (out of scope to migrate).
- **Docker**: oven/bun:1.3.10 base, runs as root, no health checks on API/web, no resource limits.
- **Tests**: 850 tests, 80% coverage threshold enforced via `bunfig.toml`. bun native test runner.
- **CI/CD**: 2 workflows — ci.yml (typecheck, test, build, docker validate) and pr-checks.yml (forbidden patterns, secret hygiene, bundle size).
- **CRITICAL FINDING**: `.env.example` line 4 contains a real Atlassian API token (`ATATT3x...`) and real email. Already committed to git history.

### Metis Review
**Identified Gaps** (addressed):
- Token is in git history — revoke + replace is sufficient for internal tool (no BFG needed)
- `withRetry()` should be a standalone utility, NOT baked into each repository
- Graceful shutdown must follow specific order: stop listener → clear heartbeat → close SSE → drain requests → close DB pool
- `EventStreamManager` heartbeat interval is never cleared — must handle on shutdown
- Bun.serve() shutdown API and Sentry Bun compatibility need verification during implementation
- `prepare: false` should stay for now (avoids pooling complications)
- Correlation IDs may need explicit passing (Bun's AsyncLocalStorage support is partial)
- Audit retention: hard delete with TTL (not archival — sufficient for internal governance)
- Pool exhaustion edge case: need `max_queue_size` or connect timeout to fail fast
- Transaction + retry interaction: `withRetryableTransaction()` retries entire callback, not individual queries

---

## Work Objectives

### Core Objective
Harden Splinty's database layer, observability, and governance capabilities to support reliable internal team deployment with proper error resilience, monitoring, and audit compliance.

### Concrete Deliverables
- `packages/db/src/db.ts` — Enhanced with connection pool configuration
- `packages/db/src/utils/retry.ts` — Retry utility with exponential backoff
- `packages/db/src/utils/timeout.ts` — Query timeout enforcement
- `packages/db/src/utils/transaction.ts` — Transaction wrapper utility
- `packages/db/src/jobs/audit-cleanup.ts` — Audit log retention cleanup job
- `packages/db/src/seed.ts` — Development seed data script
- `packages/api/src/lib/sentry.ts` — Sentry initialization and configuration
- `packages/api/src/middleware/correlation-id.ts` — Enhanced correlation ID propagation
- `packages/api/src/routes/health.ts` — Enhanced with liveness/readiness separation + DB check
- `packages/api/src/routes/audit.ts` — Enhanced with export endpoint
- `packages/api/src/index.ts` — Graceful shutdown handler
- `.env.example` — Credential cleanup
- `Dockerfile.api` / `Dockerfile.web` — Non-root user, health checks
- `docker-compose.yml` — Resource limits, health checks

### Definition of Done
- [ ] `grep -c 'ATATT3' .env.example` returns 0
- [ ] `docker compose exec api whoami` returns `appuser` (not `root`)
- [ ] `curl http://localhost:3000/api/health/live` returns `{"status":"ok"}`
- [ ] `curl http://localhost:3000/api/health/ready` returns `{"status":"ok","db":"connected"}`
- [ ] `bun test` passes with 0 failures (existing + new tests)
- [ ] All 14 tasks committed with passing pre-commit tests

### Must Have
- Connection pool config with max/idle/connect timeout tuning
- Retry utility that handles transient DB errors (connection refused, timeout) but NOT constraint violations
- Graceful shutdown that drains connections in correct order
- Audit retention with configurable TTL
- Health checks that verify DB connectivity
- .env.example credential removal

### Must NOT Have (Guardrails)
- **No PgBouncer or external connection proxy** — native postgres.js pooling only
- **No ORM migration from Drizzle** — keep existing stack
- **No OpenTelemetry, distributed tracing, or trace propagation headers** — correlation IDs via Pino only
- **No log shipping infrastructure** (ELK, CloudWatch, Loki) — stdout only
- **No Prometheus metrics endpoint** — Sentry + structured logs only
- **No multi-stage Docker builds** — just add non-root user and health checks
- **No Kubernetes, Helm, or IaC** — Docker Compose only
- **No dashboard or reporting UI for audit data** — API endpoint only
- **No new database tables, columns, or indexes** for the resilience features (client-side config only)
- **No modification to RBAC, rate limiting, or security headers** — already adequate
- **No Sentry performance monitoring or session replay** — error capture only
- **No integration retries** (Jira/GitHub) — DB retries only
- **No git history rewriting** (BFG/filter-branch) — revoke token + replace placeholder is sufficient

---

## Verification Strategy (MANDATORY)

> **Automated verification for repeatable technical checks** — agent-executed via bun test, curl, Playwright, grep.
> **Human review for final acceptance** — the Final Verification Wave presents consolidated results and requires explicit user approval before marking work complete.
> Individual task acceptance criteria must be agent-executable. Final sign-off is human.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after (write implementation, then add tests in same commit)
- **Framework**: bun test (native runner)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields
- **Library/Module**: Use Bash (bun REPL or test runner) — import, call functions, compare output
- **Docker**: Use Bash (docker commands) — exec, inspect, verify configuration
- **Config files**: Use Bash (grep/cat) — verify content matches expectations

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — security wins, zero dependencies):
├── Task 1: .env.example credential cleanup [quick]
├── Task 2: Docker non-root user for API and web [quick]
├── Task 3: Docker health checks and resource limits [quick]
└── Task 4: Graceful shutdown handler [unspecified-high]

Wave 2 (After Wave 1 — DB resilience foundation):
├── Task 5: Connection pool configuration [quick]
├── Task 6: Retry utility with exponential backoff [unspecified-high]
├── Task 7: Query timeout enforcement [quick]
└── Task 8: Transaction wrapper utility [unspecified-high]

Wave 3 (After Wave 2 — observability layer):
├── Task 9: Correlation ID propagation via Pino child loggers [unspecified-high]
├── Task 10: Sentry error tracking integration [quick]
└── Task 11: Enhanced health checks (liveness/readiness + DB) [unspecified-high]

Wave 4 (After Wave 3 — governance + data):
├── Task 12: Audit log retention with TTL cleanup [unspecified-high]
├── Task 13: Audit data export endpoint [quick]
└── Task 14: Seed data script [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Agent-executed end-to-end QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

**Critical Path**: Task 1 → Task 5 → Task 6 → Task 9 → Task 12 → F1-F4 → user okay
**Parallel Speedup**: ~60% faster than sequential
**Max Concurrent**: 4 (Waves 1 & 2)

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|------------|--------|------|
| 1 | — | — | 1 |
| 2 | — | — | 1 |
| 3 | 2 | — | 1 |
| 4 | — | 11 | 1 |
| 5 | 4 | 6, 7, 8, 11 | 2 |
| 6 | 5 | 8 | 2 |
| 7 | 5 | — | 2 |
| 8 | 5, 6 | 12 | 2 |
| 9 | — | — | 3 |
| 10 | — | — | 3 |
| 11 | 4, 5 | — | 3 |
| 12 | 8 | 13 | 4 |
| 13 | 12 | — | 4 |
| 14 | — | — | 4 |

### Agent Dispatch Summary

- **Wave 1**: **4** — T1 → `quick`, T2 → `quick`, T3 → `quick`, T4 → `unspecified-high`
- **Wave 2**: **4** — T5 → `quick`, T6 → `unspecified-high`, T7 → `quick`, T8 → `unspecified-high`
- **Wave 3**: **3** — T9 → `unspecified-high`, T10 → `quick`, T11 → `unspecified-high`
- **Wave 4**: **3** — T12 → `unspecified-high`, T13 → `quick`, T14 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (agent-executed E2E QA), F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [ ] 1. Replace real credentials in `.env.example` with placeholders

  **What to do**:
  - Replace line 3 (`JIRA_EMAIL=jgrondahldev@gmail.com`) with `JIRA_EMAIL=your-email@example.com`
  - Replace line 4 (`JIRA_API_TOKEN=ATATT3xFfGF0K6HnKf62Coyo1ike8fcn4DSWoy3DT2uyMnkJ9Nm36R-ofUSw3sVwppNmTTJ_imwi9bq9h4_E55TzCtL8UCJP0u7zvwbKIB5krfcgiHiwXloHaHr7TRxvSYzXop6DymhZmJfsp9jaYaNI9wR7VxpOLf3Wo1-MhqLgkc_lIZgyous=A2BA7E1F`) with `JIRA_API_TOKEN=your-jira-api-token-here`
  - Verify no other real credentials remain in the file

  **Must NOT do**:
  - Do NOT use BFG or git filter-branch to rewrite history
  - Do NOT modify any other files
  - Do NOT change the structure or ordering of the file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, two-line change, no logic involved
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `git-master`: Not needed — simple file edit, no git history manipulation

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: None
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `.env.example:1-6` — Full file content. Lines 3-4 contain the real credentials that must be replaced. Lines 1, 2, 5, 6 use placeholder format already — follow that same `your-X-here` pattern.

  **Acceptance Criteria**:

  ```
  Scenario: Credentials replaced with placeholders
    Tool: Bash (grep)
    Preconditions: .env.example exists at project root
    Steps:
      1. Run `grep -c 'ATATT3' .env.example`
      2. Run `grep -c 'jgrondahldev' .env.example`
      3. Run `grep 'JIRA_EMAIL' .env.example`
      4. Run `grep 'JIRA_API_TOKEN' .env.example`
    Expected Result:
      - Step 1: output is `0` (no real token)
      - Step 2: output is `0` (no real email)
      - Step 3: output is `JIRA_EMAIL=your-email@example.com`
      - Step 4: output is `JIRA_API_TOKEN=your-jira-api-token-here`
    Failure Indicators: Any grep returns the original real values
    Evidence: .sisyphus/evidence/task-1-credentials-replaced.txt

  Scenario: File structure preserved
    Tool: Bash (wc)
    Preconditions: After credential replacement
    Steps:
      1. Run `wc -l .env.example`
      2. Run `head -1 .env.example`
    Expected Result:
      - Step 1: `6` lines (same as before)
      - Step 2: `ANTHROPIC_API_KEY=sk-ant-...` (first line unchanged)
    Failure Indicators: Line count changed, or first line modified
    Evidence: .sisyphus/evidence/task-1-structure-preserved.txt
  ```

  **Commit**: YES
  - Message: `fix(security): replace real credentials in .env.example with placeholders`
  - Files: `.env.example`
  - Pre-commit: `grep -c 'ATATT3' .env.example` returns 0

- [ ] 2. Add non-root user to API and web Dockerfiles

  **What to do**:
  - In `Dockerfile.api`: After the `RUN bun install` line (line 8), add `RUN addgroup --system --gid 1001 appgroup && adduser --system --uid 1001 --ingroup appgroup appuser` and `USER appuser`
  - In `Dockerfile.web`: After the `RUN bun install` line (line 8), add the same non-root user setup and `USER appuser`
  - Ensure `USER appuser` is placed AFTER any commands that need root (install, copy) but BEFORE `EXPOSE` and `CMD`

  **Must NOT do**:
  - Do NOT add multi-stage builds
  - Do NOT change the base image (`oven/bun:1.3.10`)
  - Do NOT modify `COPY`, `WORKDIR`, or `CMD` directives
  - Do NOT add health checks here (that's Task 3)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two small Dockerfiles, adding 2-3 lines each. No complex logic.
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Task 3 (docker-compose health checks depend on working Dockerfiles)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `Dockerfile.api:1-11` — Current API Dockerfile: `FROM oven/bun:1.3.10`, installs deps, exposes 3000, runs `bun packages/api/src/index.ts`. Uses Debian-based oven/bun image so `addgroup`/`adduser` are available (not Alpine `addgroup -S`).
  - `Dockerfile.web:1-12` — Current web Dockerfile: Same base, installs deps, changes to `packages/web` workdir, exposes 5173, runs `bun run dev --host 0.0.0.0`.

  **External References**:
  - Docker best practices: https://docs.docker.com/build/building/best-practices/#user — official guidance on running as non-root

  **WHY Each Reference Matters**:
  - The base image is `oven/bun:1.3.10` which is Debian-based, so use `adduser --system` (not Alpine `adduser -S`). The `USER` directive must come after `RUN bun install` which needs root for writing to `/app/node_modules`.

  **Acceptance Criteria**:

  ```
  Scenario: Dockerfiles build successfully with non-root user
    Tool: Bash (docker)
    Preconditions: Docker daemon running, project root available
    Steps:
      1. Run `docker build -f Dockerfile.api -t splinty-api-test .`
      2. Run `docker build -f Dockerfile.web -t splinty-web-test .`
      3. Run `docker run --rm splinty-api-test whoami`
      4. Run `docker run --rm splinty-web-test whoami`
    Expected Result:
      - Steps 1-2: Build completes with exit code 0
      - Steps 3-4: Output is `appuser`
    Failure Indicators: Build fails, or whoami returns `root`
    Evidence: .sisyphus/evidence/task-2-docker-nonroot.txt

  Scenario: Dockerfile still contains correct CMD
    Tool: Bash (grep)
    Preconditions: Dockerfiles modified
    Steps:
      1. Run `grep 'USER appuser' Dockerfile.api`
      2. Run `grep 'USER appuser' Dockerfile.web`
      3. Run `grep 'CMD' Dockerfile.api`
      4. Run `grep 'CMD' Dockerfile.web`
    Expected Result:
      - Steps 1-2: Line found in each file
      - Step 3: `CMD ["bun", "packages/api/src/index.ts"]`
      - Step 4: `CMD ["bun", "run", "dev", "--host", "0.0.0.0"]`
    Failure Indicators: USER line missing, CMD changed
    Evidence: .sisyphus/evidence/task-2-dockerfile-structure.txt
  ```

  **Commit**: YES
  - Message: `fix(docker): add non-root user to API and web Dockerfiles`
  - Files: `Dockerfile.api`, `Dockerfile.web`
  - Pre-commit: `docker build -f Dockerfile.api -t splinty-api-test . && docker run --rm splinty-api-test whoami` returns `appuser`

- [ ] 3. Add health checks and resource limits to docker-compose.yml

  **What to do**:
  - Add `healthcheck` to `api` service: `test: ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"]`, interval 10s, timeout 5s, retries 5, start_period 15s
  - Add `healthcheck` to `web` service: `test: ["CMD-SHELL", "curl -f http://localhost:5173 || exit 1"]`, interval 10s, timeout 5s, retries 5, start_period 15s
  - Add `deploy.resources.limits` to `api`: memory `512M`, cpus `1.0`
  - Add `deploy.resources.limits` to `web`: memory `256M`, cpus `0.5`
  - Add `deploy.resources.limits` to `postgres`: memory `256M`, cpus `0.5`
  - Install `curl` in both Dockerfiles if not already present (oven/bun image may not include it — check first, add `RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*` before `USER appuser` if needed)

  **Must NOT do**:
  - Do NOT add Kubernetes, Helm, or IaC configuration
  - Do NOT modify the `postgres` healthcheck (it already works correctly)
  - Do NOT change ports, volumes, or environment variables
  - Do NOT add a reverse proxy or load balancer service

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration-only changes in docker-compose.yml, possibly minor Dockerfile additions
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (but ideally after Task 2 if Dockerfile changes needed for curl)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: None
  - **Blocked By**: Task 2 (if curl install needs to be added to Dockerfiles with non-root user)

  **References**:

  **Pattern References**:
  - `docker-compose.yml:4-18` — Existing `postgres` healthcheck pattern to follow: uses `test`, `interval`, `timeout`, `retries` format. Follow the same YAML structure.
  - `docker-compose.yml:20-34` — Current `api` service definition: port 3000, depends on postgres with `service_healthy` condition. Health check should target `/api/health` endpoint.
  - `docker-compose.yml:36-47` — Current `web` service definition: port 5173, depends on api. Health check should target the dev server root.
  - `Dockerfile.api:1` — Base image `oven/bun:1.3.10` — check if curl is available; if not, install before `USER appuser` line.

  **WHY Each Reference Matters**:
  - The postgres healthcheck shows the established YAML indentation and format. New healthchecks should match this exactly. The `deploy.resources.limits` section uses Docker Compose v3 format with `cpus` as string and `memory` with unit suffix.

  **Acceptance Criteria**:

  ```
  Scenario: Docker Compose config validates with health checks
    Tool: Bash (docker compose)
    Preconditions: docker-compose.yml modified
    Steps:
      1. Run `docker compose config --quiet`
      2. Run `docker compose config | grep -A5 'healthcheck' | head -30`
      3. Run `docker compose config | grep -A3 'limits' | head -20`
    Expected Result:
      - Step 1: Exit code 0 (valid config)
      - Step 2: Shows healthcheck blocks for api and web services
      - Step 3: Shows memory and cpu limits for api, web, and postgres
    Failure Indicators: Config validation fails, missing healthcheck or limits
    Evidence: .sisyphus/evidence/task-3-compose-config.txt

  Scenario: Services start and become healthy
    Tool: Bash (docker compose)
    Preconditions: Docker daemon running, images built
    Steps:
      1. Run `docker compose up -d`
      2. Wait 30 seconds: `sleep 30`
      3. Run `docker compose ps --format json`
    Expected Result:
      - All services show Status containing "healthy" or "running"
      - No services in "unhealthy" or "restarting" state
    Failure Indicators: Any service stuck in "unhealthy" or "starting"
    Evidence: .sisyphus/evidence/task-3-services-healthy.txt
  ```

  **Commit**: YES
  - Message: `fix(docker): add health checks and resource limits to docker-compose`
  - Files: `docker-compose.yml`, possibly `Dockerfile.api`, `Dockerfile.web`
  - Pre-commit: `docker compose config --quiet` exits 0

- [ ] 4. Add graceful shutdown handler with signal handling and connection draining

  **What to do**:
  - In `packages/api/src/index.ts`, add SIGTERM and SIGINT handlers that perform ordered shutdown:
    1. Log `"shutdown_started"` via Pino logger
    2. Stop accepting new connections: call `server.stop()` (Bun.serve's stop method)
    3. Clear the heartbeat interval: the `setInterval` in `server.ts:305-307` must be captured and cleared (refactor `createServer` to return the interval ID or store it externally)
    4. Close all SSE connections: call `eventStreamManager.closeAll()` — add a `closeAll()` method to `EventStreamManager` that iterates all channels, closes all clients, and clears the map
    5. Allow 5 seconds for in-flight requests to complete: `await new Promise(r => setTimeout(r, 5000))`
    6. Close DB pool: call `sql.end()` on the postgres.js client (requires exposing it from `createDb` — return both `db` and `sql` from `createDb`, or accept a shutdown callback)
    7. Log `"shutdown_complete"` and exit with code 0
  - Add `closeAll()` method to `EventStreamManager` class in `packages/api/src/services/event-stream.ts`
  - Refactor `createServer` in `packages/api/src/server.ts` to return the heartbeat interval ID (or store it on the server object) so it can be cleared
  - Modify `createDb` in `packages/db/src/db.ts` to expose the raw `postgres.js` `sql` client for shutdown. Return `{ db, sql }` or add a `close()` method.
  - Update all callers of `createDb` if the return signature changes (check `createServerFromEnv` in `server.ts:352-357`)
  - Write tests: test the `closeAll()` method on EventStreamManager, test that shutdown handler calls methods in correct order (mock-based)

  **Must NOT do**:
  - Do NOT add a health check degradation signal here (Task 11 handles health)
  - Do NOT change the HTTP routing or middleware stack
  - Do NOT add process.exit(1) on unhandled rejections (just shutdown on SIGTERM/SIGINT)
  - Do NOT modify any other middleware or route files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches 4 files across 2 packages, requires careful ordering logic, potential signature change ripple effects
  - **Skills**: `[]`
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed
    - `git-master`: Standard commit, no complex git operations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 11 (health readiness depends on shutdown being in place to understand server lifecycle)
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `packages/api/src/index.ts:1-6` — Current entry point: imports `createServerFromEnv` and `logger`, creates server and logs. This is where signal handlers will be added.
  - `packages/api/src/server.ts:304-349` — `createServer()` function: line 305-307 creates a `setInterval` for heartbeat that is never captured/cleared. The interval reference must be returned or stored so the shutdown handler can `clearInterval()` it.
  - `packages/api/src/server.ts:352-357` — `createServerFromEnv()`: calls `createDb(connectionString)` — if `createDb` signature changes, this must be updated.
  - `packages/api/src/services/event-stream.ts:15-97` — `EventStreamManager` class: has `channels` Map, `subscribe()`, `publish()`, `heartbeat()`. Missing `closeAll()` method. Add: iterate all channels, call `client.close()` on each, then `this.channels.clear()`.
  - `packages/db/src/db.ts:1-10` — `createDb()`: creates postgres client and drizzle instance. Currently discards the raw `sql` client after passing to drizzle. Must expose it for `sql.end()` on shutdown.

  **API/Type References**:
  - `packages/db/src/db.ts:10` — `DbClient` type: `ReturnType<typeof createDb>` — if `createDb` now returns `{ db, sql }`, this type and all usages must update.

  **Test References**:
  - `packages/db/src/repositories/audit.repo.test.ts:1-13` — Example of how DB package tests are structured: `describe` block, `bun:test` imports, mock with `{} as never`.

  **External References**:
  - Bun.serve() API: The `stop()` method on the returned server object stops accepting new connections.
  - postgres.js: `sql.end()` closes all connections in the pool gracefully.

  **WHY Each Reference Matters**:
  - `server.ts:305-307` is the heartbeat interval leak — it's created but never stored/cleared. This is the core bug this task fixes.
  - `event-stream.ts` needs a `closeAll()` because on shutdown, all SSE clients must be disconnected to prevent hanging connections.
  - `db.ts` signature change requires checking ALL callers — `createServerFromEnv` is the primary one, but grep for other `createDb` usages.

  **Acceptance Criteria**:

  ```
  Scenario: EventStreamManager.closeAll() works
    Tool: Bash (bun test)
    Preconditions: closeAll() method added to EventStreamManager
    Steps:
      1. Run `bun test packages/api/src/services/event-stream` (or the test file containing the new test)
    Expected Result: Test passes — closeAll() empties all channels
    Failure Indicators: Test fails or method not found
    Evidence: .sisyphus/evidence/task-4-closeall-test.txt

  Scenario: Graceful shutdown on SIGTERM
    Tool: interactive_bash (tmux)
    Preconditions: Docker Compose running (postgres healthy), or API server started with required env vars
    Steps:
      1. Start the API server with env: `DATABASE_URL=postgres://splinty:splinty_dev@localhost:5432/splinty bun packages/api/src/index.ts > /tmp/api-shutdown.log 2>&1 &`
      2. Capture PID: `API_PID=$!`
      3. Wait for startup: `sleep 3`
      4. Send SIGTERM: `kill -TERM $API_PID`
      5. Wait for shutdown: `sleep 6`
      6. Check process is gone: `kill -0 $API_PID 2>&1 || echo "process exited"`
      7. Check logs: `grep 'shutdown_started' /tmp/api-shutdown.log && grep 'shutdown_complete' /tmp/api-shutdown.log`
    Expected Result:
      - Step 6: Output contains "process exited" (process no longer exists)
      - Step 7: Both `shutdown_started` and `shutdown_complete` found in logs
    Failure Indicators: Server doesn't log shutdown messages, process hangs after 6s, immediate exit without draining
    Evidence: .sisyphus/evidence/task-4-graceful-shutdown.txt

  Scenario: createDb signature change doesn't break tests
    Tool: Bash (bun test)
    Preconditions: createDb return type updated
    Steps:
      1. Run `bun test packages/db`
      2. Run `bun test packages/api`
    Expected Result: All existing tests still pass
    Failure Indicators: Type errors or test failures from signature change
    Evidence: .sisyphus/evidence/task-4-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add graceful shutdown with signal handlers and connection draining`
  - Files: `packages/api/src/index.ts`, `packages/api/src/server.ts`, `packages/api/src/services/event-stream.ts`, `packages/db/src/db.ts`, test files
  - Pre-commit: `bun test packages/api && bun test packages/db`

- [ ] 5. Configure connection pool with max connections, timeouts, and idle settings

  **What to do**:
  - In `packages/db/src/db.ts`, add pool configuration options to the `postgres()` call:
    - `max: Number(process.env['DB_POOL_MAX'] ?? '30')` — configurable max connections
    - `idle_timeout: 20` — close idle connections after 20 seconds
    - `connect_timeout: 5` — fail fast if can't connect within 5 seconds
    - `max_lifetime: 60 * 30` — recycle connections after 30 minutes
    - Keep `prepare: false` (already set — avoids pooling complications)
  - Export the pool configuration as a named type/object so tests and other consumers can inspect defaults
  - Write tests: verify that `createDb` accepts a connection string and returns a valid object, verify default pool config values are applied

  **Must NOT do**:
  - Do NOT add PgBouncer or any external connection proxy
  - Do NOT change `prepare: false` to `prepare: true`
  - Do NOT add connection lifecycle hooks or middleware
  - Do NOT create new database tables, columns, or indexes

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file change, adding config options to an existing function call
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (starts after Wave 1 completes)
  - **Blocks**: Tasks 6, 7, 8, 11 (all DB utilities and health check depend on pool being configured)
  - **Blocked By**: Task 4 (if createDb signature changed in Task 4, this must account for it)

  **References**:

  **Pattern References**:
  - `packages/db/src/db.ts:1-10` — Current `createDb()`: creates `postgres(connectionString, { prepare: false })` with zero pool config. This is the exact function to modify — add pool options to the second argument object.

  **API/Type References**:
  - `packages/db/src/db.ts:10` — `DbClient` type definition — may need updating if Task 4 changed the return type

  **External References**:
  - postgres.js connection options: https://github.com/porsager/postgres#connection-options — documents `max`, `idle_timeout`, `connect_timeout`, `max_lifetime` options

  **WHY Each Reference Matters**:
  - `db.ts` is the single file to modify. The postgres.js options object already exists (has `prepare: false`), so pool config options are added alongside it. No new files needed.

  **Acceptance Criteria**:

  ```
  Scenario: Pool configuration is applied
    Tool: Bash (bun)
    Preconditions: db.ts modified with pool config
    Steps:
      1. Run `bun test packages/db`
      2. Run `grep 'max:' packages/db/src/db.ts`
      3. Run `grep 'idle_timeout' packages/db/src/db.ts`
      4. Run `grep 'connect_timeout' packages/db/src/db.ts`
    Expected Result:
      - Step 1: All DB tests pass
      - Steps 2-4: Each config option found in db.ts
    Failure Indicators: Tests fail, config options missing
    Evidence: .sisyphus/evidence/task-5-pool-config.txt

  Scenario: Environment variable override works
    Tool: Bash (grep)
    Preconditions: db.ts uses process.env for max
    Steps:
      1. Run `grep 'DB_POOL_MAX' packages/db/src/db.ts`
    Expected Result: Line found showing env var with fallback default
    Failure Indicators: Hardcoded value without env var override
    Evidence: .sisyphus/evidence/task-5-env-override.txt
  ```

  **Commit**: YES
  - Message: `feat(db): configure connection pool with max connections, timeouts, and idle settings`
  - Files: `packages/db/src/db.ts`, test file
  - Pre-commit: `bun test packages/db`

- [ ] 6. Add retry utility with exponential backoff for transient DB errors

  **What to do**:
  - Create `packages/db/src/utils/retry.ts` with a standalone `withRetry<T>()` utility:
    ```
    type RetryOptions = { maxAttempts?: number; baseDelayMs?: number; retryableError?: (err: unknown) => boolean };
    async function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>
    ```
  - Default: 3 attempts, 100ms base delay, exponential backoff (100ms → 200ms → 400ms)
  - Default `retryableError` function: returns `true` for connection errors (postgres error codes: `'08000'`, `'08001'`, `'08003'`, `'08006'`, `'57P01'`), connection refused, timeout errors. Returns `false` for constraint violations (`'23XXX'`), syntax errors, etc.
  - Each retry should log a warning (accept an optional logger, or just use console.warn with structured JSON)
  - On final failure, throw the original error (not a wrapped error)
  - Create `packages/db/src/utils/index.ts` barrel export if it doesn't exist
  - Export from `packages/db/src/index.ts`
  - Write thorough tests: success on first try, success on retry, all retries exhausted, non-retryable error throws immediately, custom options override defaults, backoff timing (approximate)

  **Must NOT do**:
  - Do NOT bake retry logic into individual repositories — keep it as a standalone utility
  - Do NOT add circuit breaker logic (out of scope for this plan)
  - Do NOT retry constraint violations (23XXX postgres error codes)
  - Do NOT add jitter to backoff (keep it simple for now)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New utility with non-trivial error classification logic and thorough test coverage needed
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, after Task 5)
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8)
  - **Blocks**: Task 8 (transaction wrapper uses retry)
  - **Blocked By**: Task 5 (needs pool config in place to understand error types)

  **References**:

  **Pattern References**:
  - `packages/db/src/repositories/audit.repo.ts:1-25` — Example of how DB utilities are consumed: class-based repos that accept `DbClient`. The retry utility should be usable as `await withRetry(() => repo.append(data))`.
  - `packages/db/src/index.ts:1-3` — Package barrel export: exports `./db`, `./schema`, `./repositories`. Add `./utils` export.
  - `packages/db/src/repositories/audit.repo.test.ts:1-13` — Test pattern: uses `describe`, `expect`, `it` from `bun:test`. Follow same structure.

  **External References**:
  - PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html — Class 08 = Connection Exception (retryable), Class 23 = Integrity Constraint Violation (NOT retryable), 57P01 = admin_shutdown (retryable)

  **WHY Each Reference Matters**:
  - The repo pattern shows how the utility will be called — wrapping `repo.method()` calls. Error codes from PostgreSQL docs define the retryable vs non-retryable boundary. The test pattern ensures consistent test style.

  **Acceptance Criteria**:

  ```
  Scenario: Retry succeeds after transient failure
    Tool: Bash (bun test)
    Preconditions: retry.ts created with tests
    Steps:
      1. Run `bun test packages/db/src/utils/retry`
    Expected Result: All tests pass including:
      - Success on first attempt (no retry)
      - Success on second attempt after connection error
      - All attempts exhausted → throws original error
      - Non-retryable error (constraint violation) → throws immediately without retry
      - Custom maxAttempts and baseDelayMs honored
    Failure Indicators: Any test fails
    Evidence: .sisyphus/evidence/task-6-retry-tests.txt

  Scenario: Retry utility is exported from package
    Tool: Bash (grep)
    Preconditions: utils/index.ts and db/src/index.ts updated
    Steps:
      1. Run `grep 'withRetry' packages/db/src/utils/index.ts`
      2. Run `grep 'utils' packages/db/src/index.ts`
    Expected Result: withRetry exported from utils barrel, utils exported from package barrel
    Failure Indicators: Export missing
    Evidence: .sisyphus/evidence/task-6-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add retry utility with exponential backoff for transient DB errors`
  - Files: `packages/db/src/utils/retry.ts`, `packages/db/src/utils/index.ts`, `packages/db/src/index.ts`, test file
  - Pre-commit: `bun test packages/db`

- [ ] 7. Add query timeout enforcement via postgres.js statement_timeout

  **What to do**:
  - Create `packages/db/src/utils/timeout.ts` with a `withTimeout<T>()` utility:
    ```
    async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T>
    ```
  - Implementation: use `AbortSignal.timeout(timeoutMs)` or `Promise.race` with a timeout promise that rejects with a custom `QueryTimeoutError`
  - Additionally, set `statement_timeout` as a postgres.js connection option in `db.ts`: `options: { statement_timeout: Number(process.env['DB_STATEMENT_TIMEOUT_MS'] ?? '30000') }` — this is the server-side safety net (30s default)
  - The `withTimeout` utility is the client-side timeout for individual operations that need shorter timeouts
  - Export `QueryTimeoutError` class for consumers to catch specifically
  - Export from `packages/db/src/utils/index.ts`
  - Write tests: timeout fires before query completes, query completes before timeout, custom timeout values, error is instanceof QueryTimeoutError

  **Must NOT do**:
  - Do NOT add query-level logging or tracing
  - Do NOT modify existing repository queries to use withTimeout (that's for consumers to opt into)
  - Do NOT add a global query interceptor

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility file + one config addition to db.ts, straightforward logic
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2, alongside Task 6)
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8)
  - **Blocks**: None directly
  - **Blocked By**: Task 5 (pool config must be in place first)

  **References**:

  **Pattern References**:
  - `packages/db/src/db.ts:5-8` — Current `createDb()` postgres options. Add `options: { statement_timeout: ... }` alongside existing `prepare: false`. Note: postgres.js uses `options` object for PostgreSQL runtime parameters.
  - `packages/db/src/utils/retry.ts` (from Task 6) — Follow same file structure: standalone function, typed options, exported from utils barrel.

  **External References**:
  - postgres.js connection options: The `options` field maps to PostgreSQL runtime parameters. `statement_timeout` is measured in milliseconds.
  - PostgreSQL docs on statement_timeout: https://www.postgresql.org/docs/current/runtime-config-client.html

  **WHY Each Reference Matters**:
  - `db.ts` is where the server-side `statement_timeout` is set as a connection parameter. The client-side `withTimeout` utility is separate — it's for when individual operations need a tighter timeout than the global default.

  **Acceptance Criteria**:

  ```
  Scenario: Timeout utility works correctly
    Tool: Bash (bun test)
    Preconditions: timeout.ts created with tests
    Steps:
      1. Run `bun test packages/db/src/utils/timeout`
    Expected Result: All tests pass including:
      - Fast operation completes before timeout
      - Slow operation triggers QueryTimeoutError
      - Custom timeout values honored
    Failure Indicators: Any test fails
    Evidence: .sisyphus/evidence/task-7-timeout-tests.txt

  Scenario: statement_timeout set in db.ts
    Tool: Bash (grep)
    Preconditions: db.ts modified
    Steps:
      1. Run `grep 'statement_timeout' packages/db/src/db.ts`
      2. Run `grep 'DB_STATEMENT_TIMEOUT_MS' packages/db/src/db.ts`
    Expected Result: Both found — server-side timeout with env var override
    Failure Indicators: Missing from db.ts
    Evidence: .sisyphus/evidence/task-7-statement-timeout.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add query timeout enforcement via postgres.js statement_timeout`
  - Files: `packages/db/src/utils/timeout.ts`, `packages/db/src/db.ts`, `packages/db/src/utils/index.ts`, test file
  - Pre-commit: `bun test packages/db`

- [ ] 8. Add transaction wrapper with retry support for atomic operations

  **What to do**:
  - Create `packages/db/src/utils/transaction.ts` with two utilities:
    1. `withTransaction<T>(db: DbClient, fn: (tx: DbClient) => Promise<T>): Promise<T>` — wraps callback in a Drizzle transaction using `db.transaction()`
    2. `withRetryableTransaction<T>(db: DbClient, fn: (tx: DbClient) => Promise<T>, retryOptions?: RetryOptions): Promise<T>` — wraps `withTransaction` inside `withRetry`, retrying the ENTIRE transaction (not individual queries) on transient errors
  - The `fn` callback receives a transactional `DbClient` — all queries inside use the same connection
  - On transient error inside the callback, the entire callback is re-executed (new transaction, fresh state)
  - Non-retryable errors propagate immediately (no retry)
  - Import `withRetry` from `./retry.ts` and `RetryOptions` type
  - Export from `packages/db/src/utils/index.ts`
  - Write tests: successful transaction commits, failed transaction rolls back, retryable transaction succeeds on retry, non-retryable error inside transaction propagates immediately

  **Must NOT do**:
  - Do NOT retry individual queries inside a transaction — retry the ENTIRE callback
  - Do NOT add savepoints or nested transactions
  - Do NOT add transaction isolation level configuration (use PostgreSQL default: Read Committed)
  - Do NOT modify existing repositories to use transactions (consumers opt in)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Combines retry + transaction logic, needs careful semantics around what gets retried
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 5 and 6)
  - **Parallel Group**: Wave 2 (sequential after Task 6)
  - **Blocks**: Task 12 (audit cleanup may use transactions)
  - **Blocked By**: Tasks 5 (pool config), 6 (retry utility)

  **References**:

  **Pattern References**:
  - `packages/db/src/utils/retry.ts` (from Task 6) — Import `withRetry` and `RetryOptions`. `withRetryableTransaction` is essentially `withRetry(() => withTransaction(db, fn), options)`.
  - `packages/db/src/db.ts:5-8` — `createDb()` returns a Drizzle instance. Drizzle's `db.transaction()` method accepts a callback with a transactional client.

  **API/Type References**:
  - `packages/db/src/db.ts:10` — `DbClient` type — the transaction callback receives the same type (Drizzle transaction type is compatible)

  **External References**:
  - Drizzle ORM transactions: `db.transaction(async (tx) => { ... })` — the `tx` object has the same query API as `db`
  - postgres.js transactions: Drizzle uses postgres.js transactions under the hood — connection is held for the duration

  **WHY Each Reference Matters**:
  - The retry utility from Task 6 provides the retry mechanism. The key insight is that `withRetryableTransaction` wraps the entire `withTransaction` call in `withRetry`, so on retry, a NEW transaction is started with a fresh callback execution.

  **Acceptance Criteria**:

  ```
  Scenario: Transaction wrapper works
    Tool: Bash (bun test)
    Preconditions: transaction.ts created with tests
    Steps:
      1. Run `bun test packages/db/src/utils/transaction`
    Expected Result: All tests pass including:
      - Successful transaction commits (callback result returned)
      - Failed transaction rolls back (error propagated)
      - Retryable transaction: transient error on first try, success on second
      - Non-retryable error: propagates immediately, no retry
    Failure Indicators: Any test fails
    Evidence: .sisyphus/evidence/task-8-transaction-tests.txt

  Scenario: Both utilities exported from package
    Tool: Bash (grep)
    Preconditions: utils barrel and package barrel updated
    Steps:
      1. Run `grep 'withTransaction' packages/db/src/utils/index.ts`
      2. Run `grep 'withRetryableTransaction' packages/db/src/utils/index.ts`
    Expected Result: Both functions exported
    Failure Indicators: Missing exports
    Evidence: .sisyphus/evidence/task-8-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add transaction wrapper with retry support for atomic operations`
  - Files: `packages/db/src/utils/transaction.ts`, `packages/db/src/utils/index.ts`, test file
  - Pre-commit: `bun test packages/db`

- [ ] 9. Enhance correlation ID propagation across request lifecycle via Pino child loggers

  **What to do**:
  - Create `packages/api/src/middleware/correlation-id.ts`:
    - Export `createCorrelationId()`: generates a UUID (can reuse `createRequestId` logic from `request-id.ts` or just call `crypto.randomUUID()`)
    - Export `createRequestLogger(requestId: string): pino.Logger`: creates a Pino child logger with `{ reqId: requestId }` bound to every log call
  - Modify `packages/api/src/lib/logger.ts`:
    - Export a `createChildLogger(bindings: Record<string, unknown>): pino.Logger` function that calls `logger.child(bindings)`
    - Keep the existing `logger` export unchanged (it's the root logger)
  - Modify `packages/api/src/server.ts` to use the request-scoped child logger:
    - In `createServer`'s `fetch` handler (line 311-344): after `createRequestId()`, create a child logger via `createRequestLogger(requestId)` and pass it through the request handling chain
    - Update `withLogging()` (line 298-302) to accept and use the child logger instead of the root logger
    - The child logger automatically includes `reqId` in every log line during that request
  - Use **explicit parameter passing** for the child logger — NOT AsyncLocalStorage (Bun's support is partial)
  - Write tests: verify child logger includes `reqId` in output, verify root logger still works without `reqId`

  **Must NOT do**:
  - Do NOT use AsyncLocalStorage — Bun support is partial and unreliable
  - Do NOT add OpenTelemetry, distributed tracing, or trace propagation headers
  - Do NOT modify route handler signatures to accept logger (keep changes in middleware/server layer only for now)
  - Do NOT add request body logging (security/privacy risk)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches 3 files with interconnected changes, needs careful integration with existing request pipeline
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Parallel Group**: Wave 3 (with Tasks 10, 11)
  - **Blocks**: None
  - **Blocked By**: None (no direct dependency on Wave 2, but Wave 3 starts after Wave 2 for ordering)

  **References**:

  **Pattern References**:
  - `packages/api/src/lib/logger.ts:1-26` — Root Pino logger: configured with redaction paths (password, token, apiKey, etc.), ISO timestamps, env-based log level. The `logger.child({reqId})` call creates a child that inherits all config but adds the binding.
  - `packages/api/src/middleware/request-id.ts:1-13` — `createRequestId()` generates UUID via `crypto.randomUUID()`, `withRequestId()` sets `X-Request-Id` header on response. The correlation ID middleware complements this — same UUID, but also bound to the logger.
  - `packages/api/src/server.ts:298-302` — `withLogging()` function: currently uses root `logger.info()` with `reqId` passed explicitly as a field: `logger.info({ reqId: requestId, method, path, statusCode, durationMs }, 'http_request')`. With child logger, the `reqId` is automatic — simplify to `reqLogger.info({ method, path, statusCode, durationMs }, 'http_request')`.
  - `packages/api/src/server.ts:310-344` — `fetch` handler in `createServer`: line 312 calls `createRequestId()`. This is where the child logger is created per-request and threaded through the response pipeline.

  **WHY Each Reference Matters**:
  - `logger.ts` is the source of truth for Pino config — child loggers inherit redaction and timestamp config from it. `request-id.ts` shows the existing request ID generation pattern. `server.ts:withLogging` is the function that currently manually passes reqId — with child loggers this becomes automatic and cleaner.

  **Acceptance Criteria**:

  ```
  Scenario: Child logger includes reqId in output
    Tool: Bash (bun test)
    Preconditions: correlation-id.ts created, logger.ts updated, server.ts updated
    Steps:
      1. Run `bun test packages/api/src/middleware/correlation-id`
      2. Run `bun test packages/api`
    Expected Result:
      - All tests pass
      - Child logger test verifies output JSON includes `reqId` field
    Failure Indicators: Tests fail, reqId not in log output
    Evidence: .sisyphus/evidence/task-9-correlation-tests.txt

  Scenario: Request logs contain correlation ID end-to-end
    Tool: Bash (curl + server output)
    Preconditions: API server running with DATABASE_URL set
    Steps:
      1. Start API server capturing stdout: `DATABASE_URL=postgres://splinty:splinty_dev@localhost:5432/splinty bun packages/api/src/index.ts 2>&1 | tee /tmp/api-log.txt &`
      2. Wait: `sleep 2`
      3. Send request: `curl -s http://localhost:3000/api/health`
      4. Check logs: `grep 'reqId' /tmp/api-log.txt`
      5. Kill server: `kill %1`
    Expected Result: Log line contains `"reqId":"<uuid>"` alongside `"msg":"http_request"`
    Failure Indicators: No reqId in log output, or reqId is undefined/null
    Evidence: .sisyphus/evidence/task-9-correlation-live.txt
  ```

  **Commit**: YES
  - Message: `feat(api): enhance correlation ID propagation across request lifecycle`
  - Files: `packages/api/src/middleware/correlation-id.ts`, `packages/api/src/lib/logger.ts`, `packages/api/src/server.ts`, test file
  - Pre-commit: `bun test packages/api`

- [ ] 10. Integrate Sentry error tracking for unhandled exceptions

  **What to do**:
  - Install Sentry: run `bun add @sentry/bun` in the `packages/api` directory. If `@sentry/bun` is unavailable or unstable, fall back to `bun add @sentry/node`.
  - Create `packages/api/src/lib/sentry.ts`:
    - Export `initSentry()` function that calls `Sentry.init()` with:
      - `dsn: process.env['SENTRY_DSN']` (no-op if DSN is empty/undefined — guard with `if (!dsn) return`)
      - `environment: process.env['NODE_ENV'] ?? 'development'`
      - `enabled: process.env['NODE_ENV'] !== 'test'` — disabled in tests
      - NO performance monitoring (`tracesSampleRate: 0` or omit entirely)
      - NO session replay, NO profiling — error capture only
    - Export `captureException(err: unknown): void` wrapper that calls `Sentry.captureException(err)` — no-op if Sentry wasn't initialized
    - Export `setRequestContext(requestId: string): void` that calls `Sentry.setTag('requestId', requestId)`
  - Modify `packages/api/src/server.ts`:
    - Import `{ captureException }` from `../lib/sentry`
    - In the `catch` block of the `fetch` handler (line 337-344): add `captureException(err)` BEFORE `mapError(err)` — we want to capture the raw error, not the mapped response
    - In the `error` callback (line 346-348): add `captureException(err)` before returning `mapError(err)`
  - Modify `packages/api/src/index.ts`:
    - Import and call `initSentry()` before `createServerFromEnv()` — Sentry must initialize before any requests are handled
  - Add `SENTRY_DSN=` placeholder to `.env.example` (append to end of file)
  - Add `SENTRY_DSN` to `docker-compose.yml` api service environment section (empty value, opt-in)
  - Write tests: verify `initSentry` doesn't throw when DSN is empty, verify `captureException` is callable without error, verify Sentry is NOT initialized when `NODE_ENV=test`

  **Must NOT do**:
  - Do NOT add Sentry to any package other than `packages/api` — API only
  - Do NOT enable Sentry performance monitoring (`tracesSampleRate`), tracing, or session replay
  - Do NOT add Sentry middleware that wraps every request — only capture in error handlers
  - Do NOT make Sentry a required dependency — gracefully skip if DSN not set
  - Do NOT add `@sentry/profiling-node` or any profiling integration

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Install package, create config file, add 2-3 lines to error handlers. Straightforward integration.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3)
  - **Parallel Group**: Wave 3 (with Tasks 9, 11)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/api/src/middleware/error-handler.ts:39-53` — `mapError()` function: catches `ApiError`, `ZodError`, `SyntaxError`, generic errors. Returns a Response. Sentry capture should happen BEFORE `mapError` processes the error — capture the raw thrown error, then map it to an HTTP response.
  - `packages/api/src/server.ts:337-344` — `catch` block in fetch handler: `catch (err) { const mapped = mapError(err); ... }`. Add `captureException(err)` as the first line of the catch block.
  - `packages/api/src/server.ts:346-348` — `error(err)` callback: catches truly unhandled errors from Bun.serve itself. Add `captureException(err)` before `return mapError(err)`.
  - `packages/api/src/lib/logger.ts:1-26` — Logger configuration pattern: env-based config, conditional behavior. Sentry config file should follow the same established style.
  - `packages/api/src/index.ts:1-6` — Server entry point: `initSentry()` call goes before `createServerFromEnv()` on line 4.

  **External References**:
  - Sentry Bun SDK: https://docs.sentry.io/platforms/javascript/guides/bun/ — check if `@sentry/bun` is production-ready
  - Sentry Node SDK (fallback): https://docs.sentry.io/platforms/javascript/guides/node/ — use if Bun SDK is unstable

  **WHY Each Reference Matters**:
  - `error-handler.ts` shows the error taxonomy — Sentry should capture the raw error before it's mapped to a generic response. The two integration points in `server.ts` (catch block + error callback) are the ONLY places where Sentry capture is needed — no request-level middleware. `index.ts` is the initialization point.

  **Acceptance Criteria**:

  ```
  Scenario: Sentry initializes gracefully without DSN
    Tool: Bash (bun test)
    Preconditions: sentry.ts created with tests
    Steps:
      1. Run `SENTRY_DSN= bun test packages/api/src/lib/sentry`
    Expected Result: Tests pass — initSentry() doesn't throw when SENTRY_DSN is undefined/empty
    Failure Indicators: Throws error on init without DSN
    Evidence: .sisyphus/evidence/task-10-sentry-tests.txt

  Scenario: Sentry DSN placeholder added to config files
    Tool: Bash (grep)
    Preconditions: .env.example and docker-compose.yml updated
    Steps:
      1. Run `grep 'SENTRY_DSN' .env.example`
      2. Run `grep 'SENTRY_DSN' docker-compose.yml`
    Expected Result:
      - Step 1: Line `SENTRY_DSN=` found in .env.example
      - Step 2: `SENTRY_DSN` found in api service environment
    Failure Indicators: Missing from either file
    Evidence: .sisyphus/evidence/task-10-env-placeholder.txt

  Scenario: Error handlers call captureException
    Tool: Bash (grep)
    Preconditions: server.ts modified
    Steps:
      1. Run `grep -n 'captureException' packages/api/src/server.ts`
    Expected Result: Found on at least 2 lines (fetch catch block + error callback)
    Failure Indicators: Not integrated into error flow, or only one integration point
    Evidence: .sisyphus/evidence/task-10-error-integration.txt

  Scenario: All existing tests still pass
    Tool: Bash (bun test)
    Preconditions: All changes applied
    Steps:
      1. Run `bun test packages/api`
    Expected Result: All tests pass (existing + new)
    Failure Indicators: Import errors, type errors, or broken tests
    Evidence: .sisyphus/evidence/task-10-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `feat(api): integrate Sentry error tracking for unhandled exceptions`
  - Files: `packages/api/src/lib/sentry.ts`, `packages/api/src/server.ts`, `packages/api/src/index.ts`, `.env.example`, `docker-compose.yml`, `packages/api/package.json`, test file
  - Pre-commit: `bun test packages/api`

- [ ] 11. Enhance health checks with liveness/readiness separation and DB connectivity verification

  **What to do**:
  - Rewrite `packages/api/src/routes/health.ts` to expose two endpoints:
    1. `getHealthLive()` → always returns `{ status: "ok" }` with HTTP 200. No dependencies checked. This is for container orchestration "is the process alive?"
    2. `getHealthReady(db: DbClient)` → checks DB connectivity by running `SELECT 1` via the db client, returns `{ status: "ok", db: "connected", uptime: process.uptime() }` with HTTP 200 on success, or `{ status: "degraded", db: "disconnected", error: "<message>" }` with HTTP 503 on DB failure
  - Modify `packages/api/src/server.ts` routing:
    - Change the existing `GET /api/health` route (line 61-63) to `GET /api/health/live` → calls `getHealthLive()`
    - Add new route `GET /api/health/ready` → calls `getHealthReady(context.db)`
    - Keep `GET /api/health` as an alias for `/api/health/live` (backward compatibility)
  - Update `docker-compose.yml`: change the `api` service healthcheck to use `/api/health/ready` instead of `/api/health` (so Docker knows the API is truly ready, not just alive)
  - The DB check should have a short timeout (2-3 seconds) — use `withTimeout` from Task 7 if available, or a simple `Promise.race`
  - Write tests: live endpoint always returns 200, ready endpoint returns 200 when DB is connected, ready endpoint returns 503 when DB is unreachable

  **Must NOT do**:
  - Do NOT add Prometheus metrics or a `/metrics` endpoint
  - Do NOT check external dependencies beyond the database (no Jira/GitHub health checks)
  - Do NOT add health check degradation for shutdown (keep it simple — up or down)
  - Do NOT add caching to health check responses

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches health route, server routing, docker-compose, and needs DB connectivity check logic with timeout handling
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 3, but depends on Wave 1-2 outputs)
  - **Parallel Group**: Wave 3 (with Tasks 9, 10)
  - **Blocks**: None
  - **Blocked By**: Task 4 (shutdown lifecycle understanding), Task 5 (pool config for DB client)

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/health.ts:1-9` — Current health endpoint: `getHealth()` returns `json({ status: 'ok', version: '0.1.0', uptime: process.uptime() })`. This is being split into `getHealthLive()` (minimal) and `getHealthReady(db)` (with DB check).
  - `packages/api/src/server.ts:61-63` — Current route: `if (req.method === 'GET' && path === '/api/health') { return getHealth(); }`. Change to handle `/api/health/live` and `/api/health/ready` separately.
  - `packages/api/src/utils/response.ts:1-13` — `json()` and `error()` response helpers. Use `json()` for success, `json(data, 503)` for degraded.
  - `docker-compose.yml:20-34` — API service section: add healthcheck here targeting `/api/health/ready`.
  - `packages/db/src/utils/timeout.ts` (from Task 7) — If available, use `withTimeout` for the DB connectivity check. Otherwise use `Promise.race` directly.

  **API/Type References**:
  - `packages/db/src/db.ts` — `DbClient` type. The ready check needs to execute a raw SQL query via Drizzle: `db.execute(sql\`SELECT 1\`)` (import `sql` from `drizzle-orm`).

  **WHY Each Reference Matters**:
  - The current `health.ts` is 9 lines and trivial — it's being replaced, not extended. The routing in `server.ts` shows the exact pattern for adding new routes. The `response.ts` helpers keep response format consistent. Docker compose healthcheck must target the ready endpoint so containers aren't marked healthy until DB is actually reachable.

  **Acceptance Criteria**:

  ```
  Scenario: Liveness endpoint always returns 200
    Tool: Bash (curl)
    Preconditions: API server running
    Steps:
      1. Run `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health/live`
      2. Run `curl -s http://localhost:3000/api/health/live`
    Expected Result:
      - Step 1: `200`
      - Step 2: `{"status":"ok"}`
    Failure Indicators: Non-200 status, missing status field
    Evidence: .sisyphus/evidence/task-11-liveness.txt

  Scenario: Readiness endpoint checks DB connectivity
    Tool: Bash (curl)
    Preconditions: API server running with DB available
    Steps:
      1. Run `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health/ready`
      2. Run `curl -s http://localhost:3000/api/health/ready`
    Expected Result:
      - Step 1: `200`
      - Step 2: JSON contains `"status":"ok"`, `"db":"connected"`, and numeric `"uptime"` field
    Failure Indicators: Non-200 status when DB is up, missing db field
    Evidence: .sisyphus/evidence/task-11-readiness.txt

  Scenario: Readiness returns 503 when DB is unreachable
    Tool: Bash (bun test)
    Preconditions: Test mocks DB failure
    Steps:
      1. Run `bun test packages/api/src/routes/health`
    Expected Result: Test passes — mocked DB error causes 503 response with `"status":"degraded"` and `"db":"disconnected"`
    Failure Indicators: Returns 200 when DB is down, or throws unhandled error
    Evidence: .sisyphus/evidence/task-11-readiness-failure.txt

  Scenario: Backward compatibility — /api/health still works
    Tool: Bash (curl)
    Preconditions: API server running
    Steps:
      1. Run `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health`
    Expected Result: `200` (aliases to /api/health/live)
    Failure Indicators: 404 on old path
    Evidence: .sisyphus/evidence/task-11-backward-compat.txt
  ```

  **Commit**: YES
  - Message: `feat(api): enhance health checks with liveness/readiness separation and DB connectivity`
  - Files: `packages/api/src/routes/health.ts`, `packages/api/src/server.ts`, `docker-compose.yml`, test file
  - Pre-commit: `bun test packages/api`

- [ ] 12. Add audit log retention policy with configurable TTL cleanup job

  **What to do**:
  - Create `packages/db/src/jobs/audit-cleanup.ts`:
    - Export `cleanupAuditLogs(db: DbClient, ttlDays?: number): Promise<{ deletedCount: number }>` function
    - Default TTL: `Number(process.env['AUDIT_RETENTION_DAYS'] ?? '90')` — 90 days
    - Implementation: use Drizzle query builder: `db.delete(auditLog).where(lt(auditLog.createdAt, cutoffDate))`
    - Compute `cutoffDate = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000)` in JS and pass to Drizzle
    - Return `{ deletedCount }` — the number of rows deleted (use `.returning()` and count the array length, or use raw SQL with `rowCount`)
    - This is a hard delete (not archival) — per Metis review, sufficient for internal governance
    - Log the cleanup result (deletedCount, ttlDays) using structured JSON via console or accept an optional logger
  - Create `packages/db/src/jobs/index.ts` barrel export
  - Export from `packages/db/src/index.ts`
  - Write tests: cleanup deletes old rows beyond TTL, cleanup preserves recent rows, custom TTL works, empty table returns `deletedCount: 0`

  **Must NOT do**:
  - Do NOT archive deleted records — hard delete only
  - Do NOT create new database tables or columns — uses existing `audit_log` table and `created_at` column
  - Do NOT add a cron scheduler or periodic execution — this is a standalone callable function (caller decides when to run it)
  - Do NOT add batch/chunked deletion (single DELETE statement is fine for internal tool scale)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Needs careful date arithmetic, Drizzle query builder usage for DELETE with WHERE clause, and thorough test coverage
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Parallel Group**: Wave 4 (with Tasks 13, 14)
  - **Blocks**: Task 13 (export endpoint may reference cleanup job in docs/API)
  - **Blocked By**: Task 8 (transaction utility available for potential use)

  **References**:

  **Pattern References**:
  - `packages/db/src/schema/audit_log.ts:1-16` — `auditLog` table schema: has `createdAt` column (`timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`). The cleanup deletes rows where `createdAt < cutoffDate`.
  - `packages/db/src/repositories/audit.repo.ts:1-25` — `AuditRepository` class shows how Drizzle queries are written against the audit_log table: `db.select().from(auditLog).where(...)` pattern. The cleanup uses `db.delete(auditLog).where(lt(auditLog.createdAt, cutoff))`.
  - `packages/db/src/repositories/audit.repo.test.ts:1-13` — Test pattern for DB package: `describe/it/expect` from `bun:test`, mock DB as `{} as never`.

  **API/Type References**:
  - `packages/db/src/db.ts` — `DbClient` type used as first parameter
  - `packages/db/src/schema/audit_log.ts:15` — `createdAt` column definition — the column used for TTL comparison

  **External References**:
  - Drizzle ORM delete: `db.delete(table).where(condition)` — returns deleted rows if `.returning()` is chained
  - Drizzle ORM operators: import `lt` from `drizzle-orm` for less-than comparison

  **WHY Each Reference Matters**:
  - The `audit_log` schema confirms the `createdAt` column exists and its type (timestamp with timezone). The existing repo shows the established Drizzle query pattern. This is a new `jobs/` directory — separate from repositories because it's a maintenance operation, not a CRUD repository.

  **Acceptance Criteria**:

  ```
  Scenario: Cleanup job deletes old records and preserves recent ones
    Tool: Bash (bun test)
    Preconditions: audit-cleanup.ts created with tests
    Steps:
      1. Run `bun test packages/db/src/jobs/audit-cleanup`
    Expected Result: All tests pass including:
      - Deletes rows older than TTL
      - Preserves rows newer than TTL
      - Custom TTL (e.g., 7 days) is honored
      - Empty table returns deletedCount: 0
      - Default TTL is 90 days when env var not set
    Failure Indicators: Any test fails
    Evidence: .sisyphus/evidence/task-12-cleanup-tests.txt

  Scenario: Job is exported from package
    Tool: Bash (grep)
    Preconditions: Barrel exports updated
    Steps:
      1. Run `grep 'cleanupAuditLogs' packages/db/src/jobs/index.ts`
      2. Run `grep 'jobs' packages/db/src/index.ts`
    Expected Result: Function exported from jobs barrel, jobs exported from package barrel
    Failure Indicators: Missing exports
    Evidence: .sisyphus/evidence/task-12-exports.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add audit log retention policy with configurable TTL cleanup job`
  - Files: `packages/db/src/jobs/audit-cleanup.ts`, `packages/db/src/jobs/index.ts`, `packages/db/src/index.ts`, test file
  - Pre-commit: `bun test packages/db`

- [ ] 13. Add audit data export endpoint with CSV and JSON formats

  **What to do**:
  - Add a new route handler `exportAudit` in `packages/api/src/routes/audit.ts`:
    - `GET /api/audit/export?format=csv|json&from=<ISO-date>&to=<ISO-date>`
    - Permission-gated: `requirePermission(auth, Permission.AUDIT_READ)` (same as `listAudit`)
    - Validate query params with Zod schema: `format` required (enum: `csv`, `json`), `from` and `to` optional ISO date strings (coerce to Date)
    - Query audit_log via `AuditRepository` — add a new method `listByDateRange(orgId: string, from?: Date, to?: Date): Promise<...>` to the repo
    - For JSON format: return `json({ records: rows })` with standard `application/json` content type
    - For CSV format: build CSV string with headers `id,action,entity_type,entity_id,user_id,created_at,diff` and return with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="audit-export.csv"` header
  - Add route in `packages/api/src/server.ts`:
    - Add before the existing `/api/audit` route: `if (path === '/api/audit/export' && req.method === 'GET')` → authenticated → `exportAudit(req, context.db, auth)`
    - IMPORTANT: must be before `/api/audit` to avoid path matching conflicts
  - Add `listByDateRange` method to `AuditRepository` in `packages/db/src/repositories/audit.repo.ts` using `gte`/`lte` operators on `createdAt`
  - Write tests: JSON export returns correct format, CSV export has correct headers and Content-Type, date range filtering works, permission check enforced, invalid format returns 400

  **Must NOT do**:
  - Do NOT add a dashboard or reporting UI — API endpoint only
  - Do NOT add pagination to export (return all matching rows — internal tool scale)
  - Do NOT add streaming/chunked transfer — simple Response body is fine for internal use
  - Do NOT modify the existing `listAudit` handler or its route

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: One new route handler following the exact existing pattern from `listAudit`, plus simple CSV string building
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Parallel Group**: Wave 4 (with Tasks 12, 14)
  - **Blocks**: None
  - **Blocked By**: Task 12 (audit cleanup establishes the job pattern; export is logically paired)

  **References**:

  **Pattern References**:
  - `packages/api/src/routes/audit.ts:1-28` — Existing `listAudit` handler: imports `AuditRepository` and `Permission.AUDIT_READ`, uses Zod schema `AuditQuerySchema` for query param validation, calls `requirePermission(auth, Permission.AUDIT_READ)`. The export handler follows the EXACT same pattern — same imports, same permission check, different query params and response format.
  - `packages/api/src/server.ts:291-293` — Existing audit route: `if (path === '/api/audit' && req.method === 'GET') { return authMiddleware(req).then((auth) => listAudit(req, context.db, auth)); }`. Add a similar block for `/api/audit/export` BEFORE this route.
  - `packages/db/src/repositories/audit.repo.ts:1-25` — `AuditRepository`: has `listByOrg(orgId, offset, limit)` and `listByEntity(orgId, type, id)`. Add `listByDateRange(orgId, from?, to?)` method using Drizzle `gte`/`lte` operators on `auditLog.createdAt`.
  - `packages/api/src/utils/response.ts:1-13` — `json()` helper for JSON responses. For CSV, use `new Response(csvString, { headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="audit-export.csv"' } })`.

  **API/Type References**:
  - `packages/api/src/auth/rbac.ts:12` — `Permission.AUDIT_READ` — the permission to gate this endpoint
  - `packages/db/src/schema/audit_log.ts:1-16` — Audit log columns: `id`, `orgId`, `userId`, `action`, `entityType`, `entityId`, `diff`, `createdAt`. CSV headers should match these column names.

  **WHY Each Reference Matters**:
  - The existing `listAudit` is the template — same permission, same imports, same Zod validation pattern, different response format. The CSV column headers come directly from the schema column names. The routing in `server.ts` shows exactly how to wire up the new endpoint — just follow the same `authMiddleware(req).then((auth) => ...)` pattern.

  **Acceptance Criteria**:

  ```
  Scenario: JSON export returns correct format
    Tool: Bash (bun test)
    Preconditions: exportAudit handler created with tests
    Steps:
      1. Run `bun test packages/api/src/routes/audit`
    Expected Result: Tests pass including:
      - JSON format: returns `{ "records": [...] }` structure with 200
      - CSV format: returns correct Content-Type `text/csv` and Content-Disposition header
      - Invalid format (e.g., `xml`): returns 400 (Zod rejects)
      - Missing AUDIT_READ permission: returns 403
      - Date range filtering: `from`/`to` params filter correctly
    Failure Indicators: Any test fails
    Evidence: .sisyphus/evidence/task-13-export-tests.txt

  Scenario: CSV export response has correct headers
    Tool: Bash (bun test)
    Preconditions: exportAudit handler tests include CSV header verification
    Steps:
      1. Run `bun test packages/api/src/routes/audit` (same test suite)
    Expected Result: Test verifies CSV response includes:
      - `Content-Type: text/csv`
      - `Content-Disposition: attachment; filename="audit-export.csv"`
      - First line of body is `id,action,entity_type,entity_id,user_id,created_at,diff`
    Failure Indicators: Wrong Content-Type, missing Content-Disposition, malformed CSV headers
    Evidence: .sisyphus/evidence/task-13-csv-headers.txt

  Scenario: Live endpoint smoke test (requires Task 14 seed data)
    Tool: Bash (curl)
    Preconditions: API server running, Task 14 seed data inserted (admin@splinty.dev / password123)
    Steps:
      1. Get JWT: `TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@splinty.dev","password":"password123"}' | bun -e "const d=await Bun.stdin.json();console.log(d.token)")`
      2. Run `curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/audit/export?format=json'`
    Expected Result:
      - Step 1: Login succeeds with seeded admin credentials, JWT printed
      - Step 2: HTTP 200
    Failure Indicators: 401/403 on login, 404 on endpoint
    Evidence: .sisyphus/evidence/task-13-live-smoke.txt
    Note: This scenario is optional — only executable if Task 14 seed data is available. The bun test scenarios above are the primary verification.
  ```

  **Commit**: YES
  - Message: `feat(api): add audit data export endpoint with CSV and JSON formats`
  - Files: `packages/api/src/routes/audit.ts`, `packages/api/src/server.ts`, `packages/db/src/repositories/audit.repo.ts`, test file
  - Pre-commit: `bun test packages/api`

- [ ] 14. Add seed data script for development environment bootstrapping

  **What to do**:
  - Create `packages/db/src/seed.ts`:
    - Export `seed(db: DbClient): Promise<void>` function
    - Also make it runnable as a standalone script: `if (import.meta.main) { ... }` pattern — reads `DATABASE_URL` from env, calls `createDb`, runs `seed(db)`, then closes connection
    - Insert minimal seed data (all with fixed UUIDs for idempotency):
      1. **1 Organization**: `{ name: 'Splinty Dev', slug: 'splinty-dev' }`
      2. **1 Admin User**: `{ email: 'admin@splinty.dev', name: 'Admin User', role: 'admin', passwordHash: <bcrypt hash of 'password123'> }` — linked to org
      3. **1 Project**: `{ name: 'Demo Project', description: 'Seed project for development' }` — linked to org
      4. **3 Stories**: Basic stories with different states (`backlog`, `in_progress`, `done`) — linked to project and org. Use realistic titles like "Set up authentication", "Add user dashboard", "Write API documentation"
    - Use fixed UUIDs (e.g., `'00000000-0000-0000-0000-000000000001'`) so the script is idempotent — use `INSERT ... ON CONFLICT DO NOTHING` via Drizzle's `.onConflictDoNothing()`
    - Hash the password using `Bun.password.hash('password123', 'bcrypt')` (Bun built-in)
  - Add `"seed"` script to `packages/db/package.json`: `"seed": "bun src/seed.ts"`
  - Add seed command to `docker-compose.yml` as a profile service (similar to existing `migrate` service)
  - Write a minimal test: verify `seed()` function is callable and doesn't throw with a mocked DB

  **Must NOT do**:
  - Do NOT generate large amounts of data (keep it minimal — 1 org, 1 user, 1 project, 3 stories)
  - Do NOT insert real credentials or sensitive data
  - Do NOT create new tables or modify the schema
  - Do NOT make the seed destructive (use `ON CONFLICT DO NOTHING` for idempotency)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file with straightforward insert operations following existing schema
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Parallel Group**: Wave 4 (with Tasks 12, 13)
  - **Blocks**: None
  - **Blocked By**: None (can run independently)

  **References**:

  **Pattern References**:
  - `packages/db/src/schema/organizations.ts:1-15` — Organization table: `id` (uuid), `name` (text), `slug` (text, unique index). Seed must provide `name` and `slug`.
  - `packages/db/src/schema/users.ts:1-23` — Users table: `id`, `orgId`, `email` (unique per org), `passwordHash`, `name`, `role` (enum: admin/member/viewer/service-account). Seed admin user with `role: 'admin'`.
  - `packages/db/src/schema/projects.ts:1-14` — Projects table: `id`, `orgId`, `name`, `description`, `specYaml`. Seed with `name` and `description`.
  - `packages/db/src/schema/stories.ts:1-37` — Stories table: `id` (text PK, not uuid!), `title`, `description`, `state` (enum from `@splinty/core` StoryState), `source` (enum from StorySource), `workspacePath`, `orgId`, `projectId`, `createdAt`, `updatedAt`. Note: `id` is text not uuid, and `createdAt`/`updatedAt` are NOT defaulted — must be provided explicitly.
  - `packages/db/src/db.ts` — `createDb()` function. The seed script uses this to create a DB client from `DATABASE_URL`.
  - `docker-compose.yml:49-60` — Existing `migrate` service pattern: same Dockerfile, different command, same DB URL, `service_healthy` condition, `setup` profile. Clone this pattern for seed.

  **API/Type References**:
  - `packages/db/src/schema/stories.ts:1` — Imports `StoryState` and `StorySource` from `@splinty/core`. Seed must use valid enum values from these types.

  **WHY Each Reference Matters**:
  - The story schema is the most complex to seed: text PK (not uuid), requires explicit `createdAt`/`updatedAt`, needs valid `StoryState` and `StorySource` enum values from `@splinty/core`, and has `workspacePath` as a required field. The existing `migrate` docker-compose service shows the exact pattern for a seed service.

  **Acceptance Criteria**:

  ```
  Scenario: Seed script runs without errors
    Tool: Bash (bun)
    Preconditions: Database running and migrated
    Steps:
      1. Run `DATABASE_URL=postgres://splinty:splinty_dev@localhost:5432/splinty bun packages/db/src/seed.ts`
    Expected Result: Script completes with exit code 0, logs inserted records
    Failure Indicators: Throws error, constraint violation, missing required field
    Evidence: .sisyphus/evidence/task-14-seed-run.txt

  Scenario: Seed is idempotent (can run twice)
    Tool: Bash (bun)
    Preconditions: Seed already run once
    Steps:
      1. Run `DATABASE_URL=postgres://splinty:splinty_dev@localhost:5432/splinty bun packages/db/src/seed.ts`
      2. Run it again: `DATABASE_URL=postgres://splinty:splinty_dev@localhost:5432/splinty bun packages/db/src/seed.ts`
    Expected Result: Both runs succeed with exit code 0 (ON CONFLICT DO NOTHING)
    Failure Indicators: Second run fails with duplicate key error
    Evidence: .sisyphus/evidence/task-14-seed-idempotent.txt

  Scenario: Seeded data is queryable
    Tool: Bash (curl)
    Preconditions: API server running, seed data inserted
    Steps:
      1. Login with seeded admin: `TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@splinty.dev","password":"password123"}' | bun -e "const d=await Bun.stdin.json();console.log(d.token)")`
      2. List projects: `curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/projects`
    Expected Result:
      - Step 1: Login succeeds, JWT returned
      - Step 2: Returns array containing the seed project "Demo Project"
    Failure Indicators: Login fails with seeded credentials, project not found
    Evidence: .sisyphus/evidence/task-14-seed-queryable.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add seed data script for development environment bootstrapping`
  - Files: `packages/db/src/seed.ts`, `packages/db/package.json`, `docker-compose.yml`, test file
  - Pre-commit: `bun test packages/db`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify all new code follows existing patterns from adjacent files.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Agent-Executed End-to-End QA** — `unspecified-high`
  Start from clean state (`docker compose down -v && docker compose up -d`). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (health check uses pool config, Sentry captures retry exhaustion errors). Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Task | Commit Message | Key Files | Pre-commit Test |
|------|---------------|-----------|-----------------|
| 1 | `fix(security): replace real credentials in .env.example with placeholders` | `.env.example` | `grep -c 'ATATT3' .env.example` returns 0 |
| 2 | `fix(docker): add non-root user to API and web Dockerfiles` | `Dockerfile.api`, `Dockerfile.web` | `docker compose build` succeeds |
| 3 | `fix(docker): add health checks and resource limits to docker-compose` | `docker-compose.yml` | `docker compose config` validates |
| 4 | `feat(api): add graceful shutdown with signal handlers and connection draining` | `packages/api/src/index.ts`, test file | `bun test packages/api` |
| 5 | `feat(db): configure connection pool with max connections, timeouts, and idle settings` | `packages/db/src/db.ts`, test file | `bun test packages/db` |
| 6 | `feat(db): add retry utility with exponential backoff for transient DB errors` | `packages/db/src/utils/retry.ts`, test file | `bun test packages/db` |
| 7 | `feat(db): add query timeout enforcement via postgres.js statement_timeout` | `packages/db/src/utils/timeout.ts`, test file | `bun test packages/db` |
| 8 | `feat(db): add transaction wrapper with retry support for atomic operations` | `packages/db/src/utils/transaction.ts`, test file | `bun test packages/db` |
| 9 | `feat(api): enhance correlation ID propagation across request lifecycle` | `packages/api/src/middleware/correlation-id.ts`, `packages/api/src/lib/logger.ts`, test file | `bun test packages/api` |
| 10 | `feat(api): integrate Sentry error tracking for unhandled exceptions` | `packages/api/src/lib/sentry.ts`, `packages/api/src/server.ts`, test file | `bun test packages/api` |
| 11 | `feat(api): enhance health checks with liveness/readiness separation and DB connectivity` | `packages/api/src/routes/health.ts`, test file | `bun test packages/api` |
| 12 | `feat(db): add audit log retention policy with configurable TTL cleanup job` | `packages/db/src/jobs/audit-cleanup.ts`, test file | `bun test packages/db` |
| 13 | `feat(api): add audit data export endpoint with CSV and JSON formats` | `packages/api/src/routes/audit.ts`, test file | `bun test packages/api` |
| 14 | `feat(db): add seed data script for development environment bootstrapping` | `packages/db/src/seed.ts` | `bun test packages/db` |

---

## Success Criteria

### Verification Commands
```bash
# Security
grep -c 'ATATT3' .env.example                          # Expected: 0
docker compose exec api whoami                          # Expected: appuser

# Health checks
curl -s http://localhost:3000/api/health/live             # Expected: {"status":"ok"}
curl -s http://localhost:3000/api/health/ready            # Expected: {"status":"ok","db":"connected","uptime":...}

# Tests
bun test                                                # Expected: 850+ tests, 0 failures

# Docker
docker compose config --quiet                           # Expected: exit 0 (valid config)
docker compose up -d && sleep 5 && docker compose ps    # Expected: all services healthy
```

### Final Checklist
- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (grep for forbidden patterns)
- [ ] All 14 tasks committed with atomic commits
- [ ] All tests pass (existing + new)
- [ ] Docker Compose starts cleanly with health checks passing
- [ ] No credentials in .env.example
