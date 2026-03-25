# Splinty Production Readiness Hardening

## TL;DR

> **Quick Summary**: Harden Splinty from "Internal Pilot Ready" to "Production Ready" by closing security gaps (CORS, rate limiting, security headers), adding observability (Pino structured logging), improving infrastructure (Docker security, health checks, graceful shutdown), expanding test coverage (~40-60 new tests), and strengthening CI/CD security gates.
> 
> **Deliverables**:
> - CORS locked to environment-specific allowed origins
> - Per-user token bucket rate limiting on all API endpoints
> - Pino structured JSON logging with request IDs and correlation IDs
> - Hardened Docker builds (non-root, multi-stage, health checks, resource limits)
> - Deep health endpoint (DB + external service checks, liveness/readiness)
> - Security headers middleware (HSTS, CSP, X-Content-Type-Options, X-Frame-Options)
> - Graceful shutdown with connection draining
> - Comprehensive API route tests (happy + error + auth boundary)
> - Web UI component tests for all major views
> - CI security gates (dependency audit, container scanning)
> - Complete .env.example with all required variables
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 5 waves
> **Critical Path**: Task 1 (Pino) → Task 5 (request logging) → Task 10 (graceful shutdown) → Task 18 (integration tests) → Final Verification

---

## Context

### Original Request
Take Splinty from "Conditional GO — Internal Pilot Ready" (all 28 enterprise SDLC tasks implemented) to full "Production Ready" status. Create one comprehensive plan covering both operational hardening and quality improvements.

### Interview Summary
**Key Discussions**:
- **Deployment target**: Not decided yet — keep deployment-agnostic (no K8s manifests, support probe patterns)
- **Logging**: Pino structured JSON logger (user-confirmed)
- **Rate limiting**: Per-user token bucket, in-memory (no Redis dependency initially)
- **Test coverage**: Comprehensive — ~40-60 new tests across API routes and Web UI components

**Research Findings**:
- Audit identified 2 CRITICAL gaps (CORS wildcard, zero rate limiting), 4 HIGH gaps (Docker security), 4 MEDIUM gaps (health, logging, tests, CI)
- CORS in `packages/api/src/middleware/cors.ts:8` uses `origins: ['*']`
- Zero rate limiting middleware exists anywhere in codebase
- Only 2x `console.info()` calls in entire API — no structured logging
- Dockerfiles have no `USER` directive — containers run as root
- Health endpoint returns `{status:"ok"}` without checking DB connectivity
- Web package has exactly 1 test file (`App.test.tsx`)
- CI missing dependency vulnerability scanning and container image scanning
- `.env.example` missing `DATABASE_URL`, `JWT_SECRET`, `PORT` variables

### Metis Review
**Identified Gaps** (addressed in plan):
- Graceful shutdown not in original scope — added as Task 10
- Security headers (Helmet-equivalent) missing from scope — added as Task 4
- No input validation hardening mentioned — addressed in API route tests
- Token expiry/refresh not covered — noted as guardrail (out of scope, JWT-only per original constraints)
- Error response standardization — covered in security headers + route tests

---

## Work Objectives

### Core Objective
Close all CRITICAL and HIGH production readiness gaps, add comprehensive observability, expand test coverage to production-grade levels, and harden CI/CD pipeline with security gates.

### Concrete Deliverables
- `packages/api/src/middleware/cors.ts` — environment-aware CORS with explicit origin allowlisting
- `packages/api/src/middleware/rate-limiter.ts` — per-user token bucket rate limiting
- `packages/api/src/middleware/security-headers.ts` — production security headers
- `packages/api/src/lib/logger.ts` — Pino logger instance with environment-aware configuration
- `packages/api/src/middleware/request-logger.ts` — HTTP request/response logging middleware
- `packages/api/src/routes/health.ts` — enhanced with DB connectivity and readiness checks
- `packages/api/src/lib/shutdown.ts` — graceful shutdown handler
- `Dockerfile.api` — multi-stage build with non-root user
- `Dockerfile.web` — multi-stage build with non-root user
- `docker-compose.yml` — health checks, resource limits, production profiles
- `.env.example` — complete with all required variables
- `.dockerignore` — hardened with security-sensitive patterns
- `packages/api/src/routes/*.test.ts` — comprehensive route tests (~30 new tests)
- `packages/web/src/**/*.test.tsx` — component tests for all views (~15-20 new tests)
- `.github/workflows/ci.yml` — dependency audit + container scanning jobs
- `.github/workflows/pr-checks.yml` — enhanced security patterns

### Definition of Done
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `bun test` passes all tests (existing + new) with zero failures
- [ ] `bun run build` succeeds for all packages
- [ ] CORS rejects requests from unlisted origins (verified via curl)
- [ ] Rate limiter returns 429 after threshold exceeded (verified via curl)
- [ ] Health endpoint returns degraded status when DB unavailable
- [ ] Pino logs emit as JSON with request IDs on every request
- [ ] Docker containers run as non-root user (verified via `docker exec whoami`)
- [ ] Security headers present on all API responses (verified via curl -I)
- [ ] CI pipeline includes dependency audit job

### Must Have
- Environment-variable-driven CORS origins (not hardcoded)
- Rate limiting on `/api/auth/login` and `/api/auth/register` (stricter: 5 req/min)
- Rate limiting on all other authenticated endpoints (standard: 100 req/min)
- Pino logger with JSON output, request IDs, and log levels
- Non-root Docker containers
- Multi-stage Docker builds
- DB connectivity in health check
- Security headers on all responses
- Graceful shutdown on SIGTERM
- Auth boundary tests verifying HTTP 401/403 status codes
- Web component tests for auth, dashboard, sprint, and analytics pages

### Must NOT Have (Guardrails)
- **No new npm runtime dependencies beyond Pino** — rate limiting, security headers, graceful shutdown must be implemented with zero additional runtime dependencies (custom middleware using built-in APIs). Test-only devDependencies (`@testing-library/react`, `@testing-library/jest-dom`, `happy-dom`) are ALLOWED for web component testing.
- **No Redis/external cache** — rate limiting uses in-memory Map with TTL cleanup
- **No agent pipeline modifications** — do NOT touch `packages/agents/src/*.ts` agent logic
- **No Kubernetes manifests** — keep deployment-agnostic
- **No token refresh/rotation logic** — JWT-only per original constraints
- **No GraphQL** — REST only
- **No SSO/SAML** — JWT with email/password only
- **No over-engineering rate limiter** — simple token bucket, not distributed rate limiting
- **No Winston/Bunyan** — Pino only (user confirmed)
- **No changes to existing passing tests** — only ADD new tests
- **TypeScript strict mode** — no `any`, no `@ts-ignore`, no `@ts-expect-error`
- **No console.log in production code** — Pino for all logging (existing CI check enforces this)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: YES (`bun test` for both API and Web)
- **Automated tests**: YES (Tests-after — implement feature, then write tests)
- **Framework**: `bun test` for ALL packages. Web tests use `bun:test` imports + `@testing-library/react` (devDependency) + `happy-dom` (devDependency) for DOM rendering
- **Coverage target**: ~40-60 new tests total

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **API endpoints**: Use Bash (curl) — Send requests, assert status + response fields + headers
- **Middleware**: Use Bash (bun test) — Unit tests for middleware functions
- **Docker**: Use Bash (docker build/run/exec) — Verify builds, non-root user, health
- **Web UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **CI**: Use Bash (act or YAML parse) — Validate workflow syntax and job definitions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — logging, security primitives, env config):
├── Task 1: Pino structured logger setup [quick]
├── Task 2: CORS environment hardening [quick]
├── Task 3: Security headers middleware [quick]
├── Task 4: Rate limiter middleware [unspecified-high]
├── Task 5: .env.example completion + env validation [quick]
└── Task 6: .dockerignore hardening [quick]

Wave 2 (Infrastructure — Docker, health, shutdown):
├── Task 7: Dockerfile.api multi-stage + non-root [unspecified-high]
├── Task 8: Dockerfile.web multi-stage + non-root [unspecified-high]
├── Task 9: docker-compose hardening (health checks, limits, profiles) [unspecified-high]
├── Task 10: Health endpoint deep checks (DB, readiness) [unspecified-high]
├── Task 11: Graceful shutdown handler [deep]
└── Task 12: Request logging middleware (Pino integration) [quick] (depends: Task 1)

Wave 3 (API Test Coverage — route tests + auth boundary):
├── Task 13: Auth route tests (login/register happy + error + rate limit) [unspecified-high]
├── Task 14: Sprint route tests (CRUD + RBAC boundary) [unspecified-high]
├── Task 15: Project/roadmap route tests (CRUD + RBAC boundary) [unspecified-high]
├── Task 16: Audit/webhook/security route tests [unspecified-high]
├── Task 17: Metrics/reports route tests [unspecified-high]
└── Task 18: Middleware unit tests (rate-limiter, security-headers, CORS) [unspecified-high]

Wave 4 (Web UI Tests + CI Hardening):
├── Task 19: Web auth component tests (login, register forms) [unspecified-high]
├── Task 20: Web dashboard + sprint viewer component tests [unspecified-high]
├── Task 21: Web analytics/burndown component tests [unspecified-high]
├── Task 22: CI dependency audit job [quick]
├── Task 23: CI container scanning job [quick]
└── Task 24: PR checks enhancement (security pattern expansion) [quick]

Wave 5 (Integration Verification):
├── Task 25: End-to-end API smoke test suite [deep]
├── Task 26: Docker compose full stack smoke test [unspecified-high]
└── Task 27: Jira API token rotation documentation [writing]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 12 → Task 25 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Waves 1, 3, 4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 12, 25 | 1 |
| 2 | — | 13, 18, 25 | 1 |
| 3 | — | 18, 25 | 1 |
| 4 | — | 13, 18, 25 | 1 |
| 5 | — | 9, 25 | 1 |
| 6 | — | 7, 8 | 1 |
| 7 | 6 | 9, 26 | 2 |
| 8 | 6 | 9, 26 | 2 |
| 9 | 5, 7, 8 | 26 | 2 |
| 10 | — | 25 | 2 |
| 11 | 1 | 25 | 2 |
| 12 | 1 | 25 | 2 |
| 13 | 2, 4 | 25 | 3 |
| 14 | — | 25 | 3 |
| 15 | — | 25 | 3 |
| 16 | — | 25 | 3 |
| 17 | — | 25 | 3 |
| 18 | 2, 3, 4 | — | 3 |
| 19 | — | 20, 21 | 4 |
| 20 | 19 | — | 4 |
| 21 | 19 | — | 4 |
| 22 | — | — | 4 |
| 23 | 7, 8 | — | 4 |
| 24 | — | — | 4 |
| 25 | 1-4, 10-12 | F1-F4 | 5 |
| 26 | 7-9 | F1-F4 | 5 |
| 27 | — | — | 5 |
| F1-F4 | ALL | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **6 tasks** — T1-T3,T5,T6 → `quick`, T4 → `unspecified-high`
- **Wave 2**: **6 tasks** — T7-T9 → `unspecified-high`, T10-T11 → `unspecified-high`/`deep`, T12 → `quick`
- **Wave 3**: **6 tasks** — T13-T18 → `unspecified-high`
- **Wave 4**: **6 tasks** — T19-T21 → `unspecified-high`, T22-T24 → `quick`
- **Wave 5**: **3 tasks** — T25 → `deep`, T26 → `unspecified-high`, T27 → `writing`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

### Wave 1 — Foundation (All start immediately, no dependencies)

- [ ] 1. Pino Structured Logger Setup

  **What to do**:
  - Install `pino` as a dependency in `packages/api`
  - Create `packages/api/src/lib/logger.ts` exporting a configured Pino instance
  - Configure: JSON format, log level from `LOG_LEVEL` env var (default: `info`), `timestamp: pino.stdTimeFunctions.isoTime`
  - Add `requestId` and `correlationId` as default serializers
  - Export helper functions: `createChildLogger(context: Record<string, unknown>)` for per-request loggers
  - Replace both `console.info()` calls in `packages/api/src/server.ts:298` and `packages/api/src/index.ts:5` with Pino logger calls
  - Add `LOG_LEVEL` to `.env.example`

  **Must NOT do**:
  - Do NOT install Winston, Bunyan, or any other logging library
  - Do NOT add `console.log` anywhere
  - Do NOT change log output in test mode (keep quiet for test runner)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file library setup with straightforward Pino config — well-documented, small scope
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed
    - `frontend-ui-ux`: Backend-only task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 11, 12, 25
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/api/src/server.ts:298` — Current `console.info()` call to replace (request logging location)
  - `packages/api/src/index.ts:5` — Current `console.info()` startup message to replace
  - `packages/api/src/middleware/cors.ts` — Example middleware pattern showing how middleware exports are structured

  **API/Type References**:
  - `packages/api/package.json` — Where to add `pino` dependency

  **External References**:
  - Pino official docs: `https://getpino.io/` — Configuration, serializers, child loggers

  **WHY Each Reference Matters**:
  - `server.ts:298` — This is the exact line to replace with `logger.info({...requestData})` — the executor needs to see the current format to know what data to log
  - `index.ts:5` — Startup message location — replace with `logger.info({port}, 'Server started')`

  **Acceptance Criteria**:
  - [ ] `pino` added to `packages/api/package.json` dependencies
  - [ ] `packages/api/src/lib/logger.ts` exists and exports `logger` instance + `createChildLogger`
  - [ ] `bun test packages/api` passes (no regressions)
  - [ ] `npx tsc --noEmit` passes
  - [ ] Zero `console.info` or `console.log` calls remain in `packages/api/src/server.ts` and `packages/api/src/index.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Logger module exports correctly
    Tool: Bash (bun)
    Preconditions: packages/api dependencies installed
    Steps:
      1. Run: bun -e "const { logger, createChildLogger } = require('./packages/api/src/lib/logger'); console.log(typeof logger.info, typeof createChildLogger)"
      2. Assert output contains: "function function"
    Expected Result: Both exports are functions
    Failure Indicators: "undefined" in output, import errors
    Evidence: .sisyphus/evidence/task-1-logger-exports.txt

  Scenario: No console.info/console.log in API source
    Tool: Bash (grep)
    Preconditions: Task implementation complete
    Steps:
      1. Run: grep -rn "console\.\(log\|info\)" packages/api/src/server.ts packages/api/src/index.ts
      2. Assert: exit code 1 (no matches found)
    Expected Result: Zero matches — all console calls replaced with Pino
    Failure Indicators: Any grep matches
    Evidence: .sisyphus/evidence/task-1-no-console.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(api): add Pino structured logger`
  - Files: `packages/api/src/lib/logger.ts`, `packages/api/src/server.ts`, `packages/api/src/index.ts`, `packages/api/package.json`
  - Pre-commit: `bun test packages/api && npx tsc --noEmit`

- [ ] 2. CORS Environment Hardening

  **What to do**:
  - Modify `packages/api/src/middleware/cors.ts` to read allowed origins from `CORS_ORIGINS` environment variable
  - Parse `CORS_ORIGINS` as comma-separated string (e.g., `http://localhost:5173,https://app.splinty.com`)
  - Default to `http://localhost:5173` in development (NOT `*`)
  - If `CORS_ORIGINS` is explicitly set to `*`, allow it (for dev convenience) but log a warning via Pino (if available) or console.warn
  - Update `allowOrigin()` function to check incoming `Origin` header against allowlist
  - Return `null` (no ACAO header) for disallowed origins instead of echoing
  - Add `CORS_ORIGINS` to `.env.example`
  - Write tests for the updated CORS middleware

  **Must NOT do**:
  - Do NOT hardcode production origins in source code — must come from env var
  - Do NOT remove the `OPTIONS` preflight handler
  - Do NOT add any npm dependencies for CORS

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-file middleware modification with clear requirements and existing code to modify
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser interaction needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Tasks 13, 18, 25
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/api/src/middleware/cors.ts:1-30` — Current CORS implementation with `origins: ['*']` default, `CorsConfig` type, `allowOrigin()` function, `withCorsHeaders()` and `handlePreflight()` exports — this is the EXACT file to modify
  - `packages/api/src/server.ts` — Where CORS middleware is wired into the server (shows how config is passed)

  **API/Type References**:
  - `packages/api/src/middleware/cors.ts:1-5` — `CorsConfig` interface: `{ origins: string[], methods: string[], headers: string[] }`

  **Test References**:
  - `packages/api/src/routes/health.test.ts` — Example test structure using Bun test runner

  **WHY Each Reference Matters**:
  - `cors.ts:1-30` — The executor must understand the current `CorsConfig` type, `defaultCorsConfig`, and `allowOrigin()` logic to correctly modify environment-based origin checking
  - `server.ts` — Shows how `withCorsHeaders()` and `handlePreflight()` are used so the executor knows the integration point

  **Acceptance Criteria**:
  - [ ] `CORS_ORIGINS` env var controls allowed origins
  - [ ] Default is `http://localhost:5173` (not `*`)
  - [ ] Unlisted origins get no `Access-Control-Allow-Origin` header
  - [ ] `bun test packages/api` passes
  - [ ] `npx tsc --noEmit` passes
  - [ ] New test file `packages/api/src/middleware/cors.test.ts` exists with ≥4 test cases

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Allowed origin gets ACAO header
    Tool: Bash (curl)
    Preconditions: API server running on port 3000 with CORS_ORIGINS=http://localhost:5173
    Steps:
      1. Run: curl -s -I -H "Origin: http://localhost:5173" http://localhost:3000/api/health
      2. Assert: response contains "access-control-allow-origin: http://localhost:5173"
    Expected Result: ACAO header echoes the allowed origin
    Failure Indicators: Missing ACAO header, or ACAO is "*"
    Evidence: .sisyphus/evidence/task-2-cors-allowed.txt

  Scenario: Disallowed origin gets NO ACAO header
    Tool: Bash (curl)
    Preconditions: API server running on port 3000 with CORS_ORIGINS=http://localhost:5173
    Steps:
      1. Run: curl -s -I -H "Origin: https://evil.com" http://localhost:3000/api/health
      2. Assert: response does NOT contain "access-control-allow-origin"
    Expected Result: No ACAO header — origin is blocked
    Failure Indicators: ACAO header present with any value
    Evidence: .sisyphus/evidence/task-2-cors-blocked.txt

  Scenario: Preflight OPTIONS request works for allowed origin
    Tool: Bash (curl)
    Preconditions: API server running
    Steps:
      1. Run: curl -s -I -X OPTIONS -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST" http://localhost:3000/api/health
      2. Assert: 204 status, ACAO header present, Access-Control-Allow-Methods includes POST
    Expected Result: Preflight succeeds with correct headers
    Failure Indicators: Non-204 status, missing headers
    Evidence: .sisyphus/evidence/task-2-cors-preflight.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(api): harden CORS with environment-based origin allowlist`
  - Files: `packages/api/src/middleware/cors.ts`, `packages/api/src/middleware/cors.test.ts`
  - Pre-commit: `bun test packages/api && npx tsc --noEmit`

- [ ] 3. Security Headers Middleware

  **What to do**:
  - Create `packages/api/src/middleware/security-headers.ts`
  - Implement a middleware function that adds these headers to ALL responses:
    - `X-Content-Type-Options: nosniff`
    - `X-Frame-Options: DENY`
    - `X-XSS-Protection: 0` (modern best practice — rely on CSP instead)
    - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (only when `NODE_ENV=production`)
    - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'` (configurable via env var `CSP_DIRECTIVES`)
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - Wire middleware into `packages/api/src/server.ts` router (apply to all routes)
  - Write tests verifying each header is present

  **Must NOT do**:
  - Do NOT install `helmet` or any npm package — implement as pure middleware
  - Do NOT add HSTS header in non-production environments

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single middleware file creation with well-defined header values — no complex logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Tasks 18, 25
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/api/src/middleware/cors.ts` — Existing middleware pattern showing function signature and how middleware modifies Response objects
  - `packages/api/src/server.ts` — Router where middleware is wired (shows middleware chain order)
  - `packages/api/src/middleware/error-handler.ts` — Another middleware example showing error class pattern

  **External References**:
  - OWASP Secure Headers: `https://owasp.org/www-project-secure-headers/` — Authoritative header values

  **WHY Each Reference Matters**:
  - `cors.ts` — Shows the exact middleware function signature pattern to follow (how to wrap a Response with additional headers)
  - `server.ts` — Shows WHERE to insert the security headers middleware in the chain (should be early, before route handlers)

  **Acceptance Criteria**:
  - [ ] `packages/api/src/middleware/security-headers.ts` exists
  - [ ] Middleware wired in `server.ts`
  - [ ] All 7 security headers present on API responses
  - [ ] HSTS only present when `NODE_ENV=production`
  - [ ] `bun test packages/api` passes
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Security headers present on all responses
    Tool: Bash (curl)
    Preconditions: API server running on port 3000
    Steps:
      1. Run: curl -s -I http://localhost:3000/api/health
      2. Assert: response contains "x-content-type-options: nosniff"
      3. Assert: response contains "x-frame-options: DENY"
      4. Assert: response contains "referrer-policy: strict-origin-when-cross-origin"
      5. Assert: response contains "permissions-policy: camera=(), microphone=(), geolocation=()"
    Expected Result: All security headers present
    Failure Indicators: Any security header missing
    Evidence: .sisyphus/evidence/task-3-security-headers.txt

  Scenario: HSTS absent in non-production
    Tool: Bash (curl)
    Preconditions: API running with NODE_ENV=development (or unset)
    Steps:
      1. Run: curl -s -I http://localhost:3000/api/health
      2. Assert: response does NOT contain "strict-transport-security"
    Expected Result: No HSTS header in dev
    Failure Indicators: HSTS header present
    Evidence: .sisyphus/evidence/task-3-no-hsts-dev.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(api): add security headers middleware`
  - Files: `packages/api/src/middleware/security-headers.ts`, `packages/api/src/server.ts`
  - Pre-commit: `bun test packages/api && npx tsc --noEmit`

- [ ] 4. Rate Limiter Middleware

  **What to do**:
  - Create `packages/api/src/middleware/rate-limiter.ts`
  - Implement per-user token bucket algorithm using in-memory `Map<string, { tokens: number, lastRefill: number }>`
  - Configuration interface: `RateLimitConfig { maxTokens: number, refillRate: number, refillInterval: number }`
  - Two preset configurations:
    - `authRateLimit`: 5 requests/minute (for `/api/auth/login`, `/api/auth/register`)
    - `standardRateLimit`: 100 requests/minute (for all other authenticated endpoints)
  - Rate limit key: authenticated user ID from JWT, falling back to IP address for unauthenticated requests
  - On limit exceeded: return `429 Too Many Requests` with JSON body `{ error: "Rate limit exceeded", retryAfter: <seconds> }`
  - Add standard rate limit headers to all responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
  - Implement TTL cleanup: sweep stale entries every 5 minutes to prevent memory leak
  - Wire into `packages/api/src/server.ts` at appropriate route groups

  **Must NOT do**:
  - Do NOT install any npm rate limiting packages (express-rate-limit, etc.)
  - Do NOT use Redis or any external store — in-memory Map only
  - Do NOT make the rate limiter distributed — single-process only
  - Do NOT rate limit health/readiness endpoints

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Token bucket algorithm requires careful implementation — timing, cleanup, edge cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 5, 6)
  - **Blocks**: Tasks 13, 18, 25
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `packages/api/src/middleware/cors.ts` — Middleware function signature pattern
  - `packages/api/src/server.ts` — Router structure showing where to wire middleware per route group
  - `packages/api/src/auth/middleware.ts` — Auth middleware showing how `user` is extracted from JWT (the rate limit key source)

  **API/Type References**:
  - `packages/api/src/auth/middleware.ts` — JWT payload shape containing user ID used as rate limit key
  - `packages/api/src/middleware/error-handler.ts:21-25` — Error class pattern for custom HTTP errors

  **WHY Each Reference Matters**:
  - `auth/middleware.ts` — The executor MUST understand how the JWT user ID is extracted to use it as the rate limit key; the middleware runs AFTER auth for authenticated routes
  - `server.ts` — Shows the route group structure so the executor knows WHERE to apply `authRateLimit` (auth routes) vs `standardRateLimit` (other routes)

  **Acceptance Criteria**:
  - [ ] `packages/api/src/middleware/rate-limiter.ts` exists with token bucket implementation
  - [ ] Auth endpoints rate limited at 5 req/min
  - [ ] Standard endpoints rate limited at 100 req/min
  - [ ] 429 response with `retryAfter` on exceeded
  - [ ] Rate limit headers on all responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
  - [ ] TTL cleanup interval running (no memory leak)
  - [ ] `bun test packages/api` passes
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rate limit headers present on normal request
    Tool: Bash (curl)
    Preconditions: API server running, valid JWT token available
    Steps:
      1. Run: curl -s -I -H "Authorization: Bearer <valid-token>" http://localhost:3000/api/projects
      2. Assert: response contains "x-ratelimit-limit: 100"
      3. Assert: response contains "x-ratelimit-remaining:" (any number)
      4. Assert: response contains "x-ratelimit-reset:" (unix timestamp)
    Expected Result: Rate limit headers present with correct values
    Failure Indicators: Missing rate limit headers
    Evidence: .sisyphus/evidence/task-4-ratelimit-headers.txt

  Scenario: Auth endpoint returns 429 after threshold
    Tool: Bash (curl loop)
    Preconditions: API server running, clean rate limit state
    Steps:
      1. Run 6 rapid POST requests to http://localhost:3000/api/auth/login with body {"email":"test@test.com","password":"wrong"}
      2. Assert: 6th request returns HTTP 429
      3. Assert: response body contains "Rate limit exceeded"
      4. Assert: response contains "retryAfter" field
    Expected Result: 429 after 5 requests within 1 minute
    Failure Indicators: 6th request returns non-429 status
    Evidence: .sisyphus/evidence/task-4-ratelimit-429.txt

  Scenario: Health endpoint is NOT rate limited
    Tool: Bash (curl loop)
    Preconditions: API server running
    Steps:
      1. Run 20 rapid GET requests to http://localhost:3000/api/health
      2. Assert: all 20 return HTTP 200
      3. Assert: no rate limit headers on health responses
    Expected Result: Health endpoint always responds 200
    Failure Indicators: Any 429 response on health endpoint
    Evidence: .sisyphus/evidence/task-4-health-no-ratelimit.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(api): add per-user token bucket rate limiter`
  - Files: `packages/api/src/middleware/rate-limiter.ts`, `packages/api/src/server.ts`
  - Pre-commit: `bun test packages/api && npx tsc --noEmit`

- [ ] 5. .env.example Completion + Environment Validation

  **What to do**:
  - Update `.env.example` to include ALL required environment variables with descriptive comments:
    - `DATABASE_URL=postgresql://splinty:splinty_dev@localhost:5432/splinty` (add)
    - `JWT_SECRET=change-me-in-production-min-32-chars` (add)
    - `PORT=3000` (add)
    - `LOG_LEVEL=info` (add, from Task 1)
    - `CORS_ORIGINS=http://localhost:5173` (add, from Task 2)
    - `CSP_DIRECTIVES=` (add, from Task 3 — empty means use defaults)
    - `NODE_ENV=development` (add)
    - Keep existing: `ANTHROPIC_API_KEY`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `GITHUB_TOKEN`, `SPLINTY_WORKSPACE_DIR`
  - Create `packages/api/src/lib/env.ts` — environment validation module
    - Validate required vars at startup: `DATABASE_URL`, `JWT_SECRET`
    - Warn on missing optional vars: `LOG_LEVEL`, `CORS_ORIGINS`
    - Throw clear error message with var name if required var is missing
  - Import and call validation in `packages/api/src/index.ts` at startup

  **Must NOT do**:
  - Do NOT use `zod` or `joi` for env validation — simple `process.env` checks with `throw`
  - Do NOT put real credentials in .env.example

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small file updates with clear requirements — env var documentation and basic validation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 6)
  - **Blocks**: Tasks 9, 25
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.env.example` — Current 6-line file to extend (must preserve existing entries exactly)
  - `packages/api/src/index.ts` — Startup entry point where env validation should be called early
  - `docker-compose.yml:22-30` — Environment section showing which vars are set for Docker (must match)

  **WHY Each Reference Matters**:
  - `.env.example` — Must preserve existing entries while adding new ones; executor needs to see current format
  - `docker-compose.yml:22-30` — Docker env vars must be consistent with .env.example — executor should verify alignment

  **Acceptance Criteria**:
  - [ ] `.env.example` contains all 12+ environment variables with comments
  - [ ] `packages/api/src/lib/env.ts` exists with validation function
  - [ ] Missing `DATABASE_URL` at startup causes clear error message
  - [ ] Missing `JWT_SECRET` at startup causes clear error message
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All env vars documented in .env.example
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep -c "=" .env.example
      2. Assert: count ≥ 12
      3. Run: grep "DATABASE_URL" .env.example && grep "JWT_SECRET" .env.example && grep "PORT" .env.example && grep "LOG_LEVEL" .env.example && grep "CORS_ORIGINS" .env.example
      4. Assert: all greps succeed (exit 0)
    Expected Result: All required env vars present
    Failure Indicators: Any grep returns exit 1
    Evidence: .sisyphus/evidence/task-5-env-complete.txt

  Scenario: Startup fails with clear error when DATABASE_URL missing
    Tool: Bash
    Preconditions: No DATABASE_URL in environment
    Steps:
      1. Run: DATABASE_URL= JWT_SECRET=test bun run packages/api/src/lib/env.ts 2>&1
      2. Assert: output contains "DATABASE_URL" and "required"
    Expected Result: Clear error message naming the missing variable
    Failure Indicators: Silent failure, generic error, or successful startup
    Evidence: .sisyphus/evidence/task-5-env-validation-error.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(api): complete .env.example and add env validation`
  - Files: `.env.example`, `packages/api/src/lib/env.ts`, `packages/api/src/index.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 6. .dockerignore Security Hardening

  **What to do**:
  - Update `.dockerignore` to add security-sensitive patterns:
    - `.env` and `.env.*` (prevent secrets from being copied into image)
    - `*.key`, `*.pem`, `*.cert` (TLS certificates/keys)
    - `secrets/`, `credentials/`
    - `.sisyphus/` (planning artifacts)
    - `*.log`
    - `.github/` (workflows not needed in container)
    - `docs/` (documentation not needed in container)
    - `**/*.test.ts`, `**/*.test.tsx`, `**/*.spec.ts` (test files not needed in production)
  - Preserve existing entries: `node_modules`, `dist`, `.git`, `logs`, `coverage`

  **Must NOT do**:
  - Do NOT remove existing valid entries
  - Do NOT ignore `bun.lockb` (needed for reproducible installs)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit with clear list of patterns to add
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3, 4, 5)
  - **Blocks**: Tasks 7, 8
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `.dockerignore` — Current 8-line file to extend

  **WHY Each Reference Matters**:
  - `.dockerignore` — Executor must see current entries to avoid duplicates and preserve existing patterns

  **Acceptance Criteria**:
  - [ ] `.dockerignore` contains `.env`, `.env.*`, `*.key`, `*.pem`, `.sisyphus/`, `.github/`, `docs/`
  - [ ] Existing entries preserved
  - [ ] `bun.lockb` NOT in .dockerignore

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Security patterns present in .dockerignore
    Tool: Bash (grep)
    Preconditions: Task complete
    Steps:
      1. Run: grep ".env" .dockerignore && grep "*.key" .dockerignore && grep "*.pem" .dockerignore && grep ".sisyphus" .dockerignore && grep ".github" .dockerignore
      2. Assert: all greps succeed
      3. Run: grep "bun.lockb" .dockerignore
      4. Assert: exit code 1 (bun.lockb NOT ignored)
    Expected Result: All security patterns present, lockfile not ignored
    Failure Indicators: Missing patterns or lockfile ignored
    Evidence: .sisyphus/evidence/task-6-dockerignore.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `chore(docker): harden .dockerignore with security patterns`
  - Files: `.dockerignore`
  - Pre-commit: none

### Wave 2 — Infrastructure (depends on Wave 1 foundation)

- [ ] 7. Dockerfile.api Multi-Stage Build + Non-Root User

  **What to do**:
  - Rewrite `Dockerfile.api` as a multi-stage build:
    - **Stage 1 (install)**: `FROM oven/bun:1.3.10 AS install` — copy package.json + bun.lockb, run `bun install --frozen-lockfile --production`
    - **Stage 2 (build)**: `FROM oven/bun:1.3.10 AS build` — copy source, build API bundle
    - **Stage 3 (runtime)**: `FROM oven/bun:1.3.10-slim AS runtime` — copy only built artifacts + production node_modules
  - Add `USER bun` directive in runtime stage (oven/bun images include a `bun` user)
  - Add `HEALTHCHECK` instruction using bun-native check: `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD bun -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1))"`
  - Set `EXPOSE 3000`
  - Use `LABEL` for metadata (maintainer, version)

  **Must NOT do**:
  - Do NOT change the base image vendor (stay with oven/bun)
  - Do NOT install curl in runtime — use bun-native health check

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-stage Docker builds require careful dependency handling and layer ordering
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 10, 11, 12)
  - **Blocks**: Tasks 9, 23, 26
  - **Blocked By**: Task 6 (.dockerignore must be ready)

  **References**:
  - `Dockerfile.api` — Current 11-line single-stage Dockerfile to rewrite
  - `.dockerignore` — Updated ignore patterns (from Task 6) that affect COPY behavior
  - `packages/api/package.json` — Dependencies needed in production
  - `packages/api/src/index.ts` — Entry point that the Dockerfile CMD should execute

  **WHY Each Reference Matters**:
  - `Dockerfile.api` — Executor sees the current simple Dockerfile and understands what needs to change
  - `packages/api/package.json` — Must understand which dependencies are prod vs dev for multi-stage optimization

  **Acceptance Criteria**:
  - [ ] Multi-stage build with ≥2 stages
  - [ ] `USER bun` directive present in runtime stage
  - [ ] `HEALTHCHECK` instruction present
  - [ ] `docker build -f Dockerfile.api .` succeeds
  - [ ] `docker run --rm <image> whoami` outputs `bun` (not `root`)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker image builds successfully
    Tool: Bash (docker)
    Preconditions: Docker daemon running, .dockerignore updated
    Steps:
      1. Run: docker build -f Dockerfile.api -t splinty-api-test .
      2. Assert: exit code 0
    Expected Result: Image builds without errors
    Failure Indicators: Non-zero exit code, build errors
    Evidence: .sisyphus/evidence/task-7-docker-build.txt

  Scenario: Container runs as non-root user
    Tool: Bash (docker)
    Preconditions: Image built from previous scenario
    Steps:
      1. Run: docker run --rm splinty-api-test whoami
      2. Assert: output is "bun" (not "root")
    Expected Result: Process runs as bun user
    Failure Indicators: Output is "root"
    Evidence: .sisyphus/evidence/task-7-nonroot.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(docker): multi-stage API build with non-root user`
  - Files: `Dockerfile.api`
  - Pre-commit: `docker build -f Dockerfile.api .`

- [ ] 8. Dockerfile.web Multi-Stage Build + Non-Root User

  **What to do**:
  - Rewrite `Dockerfile.web` as a multi-stage build:
    - **Stage 1 (install)**: Install all dependencies (including devDependencies for Vite build)
    - **Stage 2 (build)**: Run `bun run --cwd packages/web build` to generate static assets in `packages/web/dist/`
    - **Stage 3 (runtime)**: Use `nginx:alpine` to serve static files — copy built `dist/` into nginx html dir
  - Use `USER nginx` (nginx alpine already runs as non-root)
  - Add nginx config for SPA routing: `try_files $uri $uri/ /index.html`
  - Add `HEALTHCHECK` for nginx
  - Set `EXPOSE 80`

  **Must NOT do**:
  - Do NOT run Vite dev server in production — serve built static files only
  - Do NOT include source code in runtime stage

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Frontend Docker builds need Vite build step + nginx static serving — more nuanced than API
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 10, 11, 12)
  - **Blocks**: Tasks 9, 23, 26
  - **Blocked By**: Task 6

  **References**:
  - `Dockerfile.web` — Current 12-line Dockerfile running `bun run --cwd packages/web dev --host 0.0.0.0`
  - `packages/web/package.json` — Build script and dependencies
  - `packages/web/vite.config.ts` — Vite configuration (output directory)

  **WHY Each Reference Matters**:
  - `Dockerfile.web` — Current file runs dev server; executor must replace with static build + serve
  - `vite.config.ts` — Shows where Vite outputs built files so the runtime stage can COPY from correct path

  **Acceptance Criteria**:
  - [ ] Multi-stage build with build + runtime stages
  - [ ] No Vite dev server in production
  - [ ] Non-root user in runtime stage
  - [ ] `docker build -f Dockerfile.web .` succeeds
  - [ ] Container serves static files (GET / returns HTML)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Web Docker image builds and serves static content
    Tool: Bash (docker)
    Preconditions: Docker daemon running
    Steps:
      1. Run: docker build -f Dockerfile.web -t splinty-web-test .
      2. Assert: exit code 0
      3. Run: docker run --rm -d -p 8080:80 --name web-test splinty-web-test
      4. Run: curl -s http://localhost:8080/ | head -5
      5. Assert: output contains "<!DOCTYPE html>" or "<html"
      6. Run: docker stop web-test
    Expected Result: Static HTML served from built Vite app
    Failure Indicators: Build failure, no HTML response
    Evidence: .sisyphus/evidence/task-8-web-docker.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(docker): multi-stage web build with static serving`
  - Files: `Dockerfile.web`
  - Pre-commit: `docker build -f Dockerfile.web .`

- [ ] 9. docker-compose Hardening (Health Checks, Limits, Profiles)

  **What to do**:
  - Add health checks for `api` and `web` services:
    - API: `test: ["CMD", "bun", "-e", "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1))"]`
    - Web: `test: ["CMD", "curl", "-f", "http://localhost:80/"]`
  - Add resource limits to all services:
    ```yaml
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
    ```
  - Add `restart: unless-stopped` to api and web services
  - Replace hardcoded `splinty:splinty_dev` with `${POSTGRES_PASSWORD:-splinty_dev}` env var substitution
  - Add logging driver: `logging: { driver: "json-file", options: { max-size: "10m", max-file: "3" } }`
  - Ensure `depends_on` uses health check condition: `condition: service_healthy`

  **Must NOT do**:
  - Do NOT add Kubernetes manifests
  - Do NOT add Redis/Memcached services
  - Do NOT change the Postgres version (16-alpine)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: docker-compose with health checks and env substitution requires careful YAML
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 7, 8 for correct service images)
  - **Parallel Group**: Wave 2 (sequential after 7, 8)
  - **Blocks**: Task 26
  - **Blocked By**: Tasks 5, 7, 8

  **References**:
  - `docker-compose.yml` — Current 63-line file with postgres, api, web, migrate services
  - `.env.example` — Updated env vars (from Task 5) for alignment

  **WHY Each Reference Matters**:
  - `docker-compose.yml` — Executor must understand ALL existing services to modify without breaking
  - `.env.example` — New env vars must align between compose and .env.example

  **Acceptance Criteria**:
  - [ ] Health checks on api and web services
  - [ ] Resource limits on all services
  - [ ] `restart: unless-stopped` on api and web
  - [ ] Postgres password uses env var substitution
  - [ ] `docker compose config` validates without errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: docker-compose config validates
    Tool: Bash
    Preconditions: docker compose installed
    Steps:
      1. Run: docker compose config --quiet
      2. Assert: exit code 0
    Expected Result: Valid YAML
    Failure Indicators: Parse errors
    Evidence: .sisyphus/evidence/task-9-compose-validate.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(docker): harden compose with health checks, limits, and profiles`
  - Files: `docker-compose.yml`
  - Pre-commit: `docker compose config --quiet`

- [ ] 10. Health Endpoint Deep Checks (DB Connectivity, Readiness)

  **What to do**:
  - Enhance `packages/api/src/routes/health.ts` with two endpoints:
    - `GET /api/health` (liveness) — current behavior, always returns 200 if process is alive
    - `GET /api/health/ready` (readiness) — checks DB connectivity and returns 200 or 503
  - Readiness check implementation:
    - Execute `SELECT 1` query against the database
    - Return `{ status: "ok", checks: { database: "connected" }, version: "0.1.0", uptime: ... }` on success
    - Return `{ status: "degraded", checks: { database: "disconnected", error: "<message>" } }` with HTTP 503 on failure
  - Add timeout on DB check (5 seconds) — don't hang forever
  - Register new route in `packages/api/src/server.ts`
  - Update existing health test and add readiness test

  **Must NOT do**:
  - Do NOT change existing liveness endpoint behavior (backwards compatible)
  - Do NOT check external services (Jira, GitHub) — only DB

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: DB connectivity check with timeout + error handling requires careful implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 11, 12)
  - **Blocks**: Task 25
  - **Blocked By**: None

  **References**:
  - `packages/api/src/routes/health.ts` — Current 9-line health handler to extend
  - `packages/api/src/routes/health.test.ts` — Existing basic health test to extend
  - `packages/api/src/server.ts` — Route registration pattern
  - `packages/db/src/index.ts` — Database client/pool export for connectivity check

  **WHY Each Reference Matters**:
  - `health.ts` — Current handler returns `{status, version, uptime}` — must preserve this for liveness while adding readiness
  - `packages/db/src/index.ts` — Shows how to import and use the DB client for the `SELECT 1` check

  **Acceptance Criteria**:
  - [ ] `GET /api/health` returns 200 (unchanged behavior)
  - [ ] `GET /api/health/ready` returns 200 with DB connected
  - [ ] `GET /api/health/ready` returns 503 with DB disconnected
  - [ ] Response includes `checks.database` field
  - [ ] `bun test packages/api` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Liveness endpoint returns 200
    Tool: Bash (curl)
    Preconditions: API running
    Steps:
      1. Run: curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
      2. Assert: "200"
    Expected Result: Liveness always returns 200
    Evidence: .sisyphus/evidence/task-10-liveness.txt

  Scenario: Readiness endpoint checks database
    Tool: Bash (curl)
    Preconditions: API running with DB connected
    Steps:
      1. Run: curl -s http://localhost:3000/api/health/ready | jq .checks.database
      2. Assert: output is "connected"
    Expected Result: DB check passes
    Failure Indicators: "disconnected" or missing field
    Evidence: .sisyphus/evidence/task-10-readiness.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(api): add readiness endpoint with DB health check`
  - Files: `packages/api/src/routes/health.ts`, `packages/api/src/routes/health.test.ts`, `packages/api/src/server.ts`
  - Pre-commit: `bun test packages/api && npx tsc --noEmit`

- [ ] 11. Graceful Shutdown Handler

  **What to do**:
  - Create `packages/api/src/lib/shutdown.ts`
  - **Prerequisite**: Modify `packages/db/src/db.ts` to expose a `closeDb()` helper — the current `createDb()` function creates a `postgres()` client internally but doesn't return it. Add a `closeDb(db)` export that calls `client.end()` on the underlying postgres client (store the client reference in a module-scoped variable, or have `createDb` return `{ db, close }` tuple)
  - Register `SIGTERM` and `SIGINT` signal handlers
  - On signal:
    1. Log shutdown initiation via Pino logger (from Task 1)
    2. Stop accepting new connections (call `server.stop()` on the Bun.serve instance)
    3. Wait for in-flight requests to complete (configurable timeout, default 30s)
    4. Close database connection via the new `closeDb()` helper (calls underlying `postgres()` client's `.end()` method)
    5. Log shutdown complete
    6. Exit with code 0
  - Export `registerShutdownHandlers(server: Server, closeDb: () => Promise<void>)` function
  - Call from `packages/api/src/index.ts` after server starts
  - Handle double-signal (second SIGTERM forces immediate exit)

  **Must NOT do**:
  - Do NOT install any graceful shutdown libraries
  - Do NOT change Bun.serve() call signature

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Signal handling with connection draining and resource cleanup requires careful async orchestration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10, 12)
  - **Blocks**: Task 25
  - **Blocked By**: Task 1 (needs Pino logger)

  **References**:
  - `packages/api/src/index.ts` — Where shutdown handler should be registered (after server creation)
  - `packages/api/src/server.ts` — `Bun.serve()` return value (Server object with `.stop()` method)
  - `packages/api/src/lib/logger.ts` — Pino logger (from Task 1) for shutdown logging
  - `packages/db/src/db.ts` — Database factory function `createDb()` that creates a `postgres()` client and wraps it in Drizzle — must be modified to expose a `closeDb()` helper that calls `client.end()` on the underlying postgres client

  **WHY Each Reference Matters**:
  - `index.ts` — Shows the server creation flow; shutdown handler hooks in AFTER `Bun.serve()` returns the server instance
  - `server.ts` — Must understand what `Bun.serve()` returns to call `.stop()` correctly
  - `db.ts` — The `postgres()` client created at line 6 has an `.end()` method for clean shutdown, but it's not currently exposed; this task must modify `createDb` or add a `closeDb` export to enable pool cleanup

  **Acceptance Criteria**:
  - [ ] `packages/api/src/lib/shutdown.ts` exists
  - [ ] SIGTERM handler registered
  - [ ] Server stops accepting new connections on signal
  - [ ] DB connection pool closed on shutdown
  - [ ] Double-signal forces immediate exit
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Graceful shutdown on SIGTERM
    Tool: interactive_bash (tmux)
    Preconditions: API server running
    Steps:
      1. Start API server in tmux session: bun run packages/api/src/index.ts
      2. Send SIGTERM: kill -TERM <pid>
      3. Wait 5 seconds
      4. Assert: process exited with code 0
      5. Assert: log output contains "shutdown" or "graceful"
    Expected Result: Clean shutdown with log messages
    Failure Indicators: Process hangs, non-zero exit, no log messages
    Evidence: .sisyphus/evidence/task-11-graceful-shutdown.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(api): add graceful shutdown with connection draining`
  - Files: `packages/api/src/lib/shutdown.ts`, `packages/api/src/index.ts`
  - Pre-commit: `npx tsc --noEmit`

- [ ] 12. Request Logging Middleware (Pino Integration)

  **What to do**:
  - Create `packages/api/src/middleware/request-logger.ts`
  - On each request:
    1. Generate unique request ID (crypto.randomUUID())
    2. Create child Pino logger with `{ reqId, method, url, userAgent }`
    3. Set `X-Request-Id` response header
    4. Log at request start: `logger.info({ reqId, method, url }, 'request started')`
    5. Log at response complete: `logger.info({ reqId, method, url, statusCode, durationMs }, 'request completed')`
    6. Log errors: `logger.error({ reqId, err }, 'request failed')`
  - Wire middleware into `packages/api/src/server.ts` as first middleware in chain
  - Honor incoming `X-Request-Id` header (use it instead of generating if present — enables correlation)

  **Must NOT do**:
  - Do NOT log request bodies (may contain sensitive data)
  - Do NOT log Authorization header values
  - Do NOT use `console.log` or `console.info`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Standard request logging pattern with clear Pino API
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (after Task 1)
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 10, 11)
  - **Blocks**: Task 25
  - **Blocked By**: Task 1 (Pino logger must exist)

  **References**:
  - `packages/api/src/lib/logger.ts` — Pino logger instance (from Task 1) and `createChildLogger()`
  - `packages/api/src/middleware/cors.ts` — Middleware pattern showing how to wrap requests/responses
  - `packages/api/src/server.ts` — Router chain where middleware is inserted

  **WHY Each Reference Matters**:
  - `logger.ts` — Must use the Pino instance and `createChildLogger` from Task 1, not create a new logger
  - `cors.ts` — Shows the middleware wrapping pattern for modifying both request context and response

  **Acceptance Criteria**:
  - [ ] Every API request generates a log line with `reqId`, `method`, `url`, `statusCode`, `durationMs`
  - [ ] `X-Request-Id` header set on all responses
  - [ ] Incoming `X-Request-Id` honored for correlation
  - [ ] No request body or auth header logged
  - [ ] `bun test packages/api` passes
  - [ ] `npx tsc --noEmit` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Request ID header returned
    Tool: Bash (curl)
    Preconditions: API running with request logger middleware
    Steps:
      1. Run: curl -s -I http://localhost:3000/api/health
      2. Assert: response contains "x-request-id:" header with UUID value
    Expected Result: X-Request-Id header present
    Failure Indicators: Missing header
    Evidence: .sisyphus/evidence/task-12-request-id.txt

  Scenario: Incoming request ID is honored
    Tool: Bash (curl)
    Preconditions: API running
    Steps:
      1. Run: curl -s -I -H "X-Request-Id: test-correlation-123" http://localhost:3000/api/health
      2. Assert: response "x-request-id: test-correlation-123"
    Expected Result: Custom request ID echoed back
    Failure Indicators: Different request ID returned
    Evidence: .sisyphus/evidence/task-12-correlation.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `feat(api): add request logging middleware with correlation IDs`
  - Files: `packages/api/src/middleware/request-logger.ts`, `packages/api/src/server.ts`
  - Pre-commit: `bun test packages/api && npx tsc --noEmit`

### Wave 3 — API Test Coverage (route tests + auth boundary)

- [ ] 13. Auth Route Tests (Login/Register + Rate Limiting + Error Paths)

  **What to do**:
  - Create or extend `packages/api/src/routes/auth.test.ts` with comprehensive tests:
    - Successful registration → 201 with user object
    - Successful login → 200 with JWT token
    - Duplicate registration → 409 Conflict
    - Invalid credentials login → 401 Unauthorized
    - Missing fields → 400 Bad Request with validation message
    - Rate limit enforcement: 6th login attempt within 1 minute → 429
    - JWT token format: valid JWT with expected claims
  - Mock the database layer

  **Must NOT do**:
  - Do NOT modify existing passing tests
  - Do NOT require a running database

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-18)
  - **Blocks**: Task 25
  - **Blocked By**: Tasks 2 (CORS), 4 (rate limiter)

  **References**:
  - `packages/api/src/routes/auth.ts` — Auth route handlers to test
  - `packages/api/src/routes/auth.test.ts` — Existing auth tests to extend
  - `packages/api/src/auth/middleware.ts` — JWT validation logic
  - `packages/api/src/middleware/rate-limiter.ts` — Rate limiter (Task 4) to verify
  - `packages/api/src/routes/health.test.ts` — Test pattern for mock setup conventions

  **Acceptance Criteria**:
  - [ ] ≥7 test cases covering happy + error + rate limit
  - [ ] 401, 409, 400, 429 status codes explicitly asserted
  - [ ] All pass: `bun test packages/api/src/routes/auth.test.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Auth tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/api/src/routes/auth.test.ts
      2. Assert: exit code 0, ≥7 tests pass
    Expected Result: All auth tests green
    Evidence: .sisyphus/evidence/task-13-auth-tests.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(api): comprehensive auth route tests`
  - Files: `packages/api/src/routes/auth.test.ts`
  - Pre-commit: `bun test packages/api`

- [ ] 14. Sprint Route Tests (CRUD + RBAC Boundary)

  **What to do**:
  - Create `packages/api/src/routes/sprints.test.ts`:
    - CRUD happy paths: Create, read, update, delete sprint → correct status codes
    - RBAC boundary: Viewer → 403 on create/update/delete
    - RBAC boundary: Member → allowed to create (has SPRINT_WRITE), 403 on ORG_MANAGE actions
    - Not found: Get non-existent sprint → 404
    - Invalid input: Missing required fields → 400
    - Org isolation: Sprint from org A not accessible by user in org B

  **Must NOT do**:
  - Do NOT modify existing test files
  - Do NOT require running database

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 25
  - **Blocked By**: None

  **References**:
  - `packages/api/src/routes/sprints.ts` — Sprint route handlers
  - `packages/api/src/auth/rbac.ts` — RBAC permission matrix (4 roles × 14 permissions)
  - `packages/api/src/routes/security.test.ts` — Role enforcement test pattern
  - `packages/db/src/repositories/` — Sprint repository interface for mock shape

  **Acceptance Criteria**:
  - [ ] ≥8 test cases covering CRUD + RBAC + error paths
  - [ ] 403 status asserted for unauthorized role actions
  - [ ] All pass: `bun test packages/api/src/routes/sprints.test.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Sprint tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/api/src/routes/sprints.test.ts
      2. Assert: exit code 0, ≥8 tests pass
    Expected Result: All sprint tests green
    Evidence: .sisyphus/evidence/task-14-sprint-tests.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(api): sprint route tests with RBAC boundary`
  - Files: `packages/api/src/routes/sprints.test.ts`
  - Pre-commit: `bun test packages/api`

- [ ] 15. Project/Roadmap Route Tests (CRUD + RBAC Boundary)

  **What to do**:
  - Create `packages/api/src/routes/projects.test.ts`:
    - CRUD happy paths: Create, read, update, list projects
    - RBAC boundary: Viewer → 403 on create/update
    - Roadmap import: POST roadmap → 200 with imported items
    - Invalid input → 400 with validation messages
    - Org isolation: Project in org A not accessible from org B

  **Must NOT do**:
  - Do NOT test Jira integration

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 25
  - **Blocked By**: None

  **References**:
  - `packages/api/src/routes/projects.ts` — Project route handlers
  - `packages/api/src/routes/roadmap-import.ts` — Roadmap import handler (exports `importRoadmap`)
  - `packages/api/src/auth/rbac.ts` — Permission matrix

  **Acceptance Criteria**:
  - [ ] ≥7 test cases
  - [ ] RBAC 403 assertions
  - [ ] All pass: `bun test packages/api/src/routes/projects.test.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Project tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/api/src/routes/projects.test.ts
      2. Assert: exit code 0, ≥7 tests pass
    Expected Result: All project tests green
    Evidence: .sisyphus/evidence/task-15-project-tests.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(api): project and roadmap route tests`
  - Files: `packages/api/src/routes/projects.test.ts`
  - Pre-commit: `bun test packages/api`

- [ ] 16. Audit/Webhook/Security Route Tests

  **What to do**:
  - Create tests for:
    - `packages/api/src/routes/audit.test.ts` — Audit trail query (list, filter by date, pagination)
    - `packages/api/src/routes/webhooks.test.ts` — Webhook CRUD + HMAC signature verification
    - Extend `packages/api/src/routes/security.test.ts` — Security scan trigger + report retrieval + RBAC
  - Test audit immutability: verify no update/delete endpoints exist
  - Test webhook HMAC-SHA256 signature generation

  **Must NOT do**:
  - Do NOT modify existing passing security tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 25
  - **Blocked By**: None

  **References**:
  - `packages/api/src/routes/audit.ts` — Audit trail handlers
  - `packages/api/src/routes/webhooks.ts` — Webhook CRUD handlers
  - `packages/api/src/routes/security.ts` — Security scan handlers
  - `packages/api/src/routes/security.test.ts` — Existing security tests to extend
  - `packages/api/src/services/webhook-dispatcher.ts` — HMAC-SHA256 signature generation

  **Acceptance Criteria**:
  - [ ] ≥6 test cases across audit/webhook/security
  - [ ] HMAC signature tested
  - [ ] Audit immutability verified
  - [ ] All pass: `bun test packages/api/src/routes/audit.test.ts packages/api/src/routes/webhooks.test.ts packages/api/src/routes/security.test.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Audit/webhook/security tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/api/src/routes/audit.test.ts packages/api/src/routes/webhooks.test.ts packages/api/src/routes/security.test.ts
      2. Assert: exit code 0, ≥6 tests pass
    Expected Result: All tests green
    Evidence: .sisyphus/evidence/task-16-audit-webhook-security-tests.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(api): audit, webhook, and security route tests`
  - Files: `packages/api/src/routes/audit.test.ts`, `packages/api/src/routes/webhooks.test.ts`, `packages/api/src/routes/security.test.ts`
  - Pre-commit: `bun test packages/api`

- [ ] 17. Metrics/Reports Route Tests

  **What to do**:
  - Create `packages/api/src/routes/metrics.test.ts`:
    - Get project metrics → 200 with velocity, cost, LLM data
    - Get org metrics → 200 with aggregate totals
    - RBAC: Viewer can read, only admin can access org-wide
  - Extend `packages/api/src/routes/reports.test.ts`:
    - Project report → includes health status (GREEN/YELLOW/RED)
    - Org report → aggregates across projects
    - Health computation: ≥80% → GREEN, 50-80% → YELLOW, <50% → RED

  **Must NOT do**:
  - Do NOT modify existing passing reports tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 25
  - **Blocked By**: None

  **References**:
  - `packages/api/src/routes/metrics.ts` — Metrics handlers
  - `packages/api/src/routes/reports.ts` — Reports handlers
  - `packages/api/src/routes/reports.test.ts` — Existing reports tests to extend
  - `packages/api/src/services/metrics-aggregator.ts` — `getProjectMetrics`, `getOrgMetrics` signatures
  - `packages/api/src/services/executive-report.ts` — `computeHealth()` thresholds (80%/50%)

  **Acceptance Criteria**:
  - [ ] ≥6 test cases across metrics and reports
  - [ ] Health status thresholds tested (GREEN/YELLOW/RED)
  - [ ] All pass: `bun test packages/api/src/routes/metrics.test.ts packages/api/src/routes/reports.test.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Metrics and reports tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/api/src/routes/metrics.test.ts packages/api/src/routes/reports.test.ts
      2. Assert: exit code 0, ≥6 tests pass
    Expected Result: All tests green
    Evidence: .sisyphus/evidence/task-17-metrics-reports-tests.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(api): metrics and reports route tests`
  - Files: `packages/api/src/routes/metrics.test.ts`, `packages/api/src/routes/reports.test.ts`
  - Pre-commit: `bun test packages/api`

- [ ] 18. Middleware Unit Tests (Rate Limiter, Security Headers, CORS)

  **What to do**:
  - Create `packages/api/src/middleware/rate-limiter.test.ts`:
    - Token bucket refills correctly after interval
    - Different configs for auth vs standard endpoints
    - TTL cleanup removes stale entries
    - Rate limit headers have correct values
    - 429 response shape with retryAfter
  - Create `packages/api/src/middleware/security-headers.test.ts`:
    - All 7 headers present
    - HSTS conditional on NODE_ENV=production
    - CSP configurable via env var
  - Create or extend `packages/api/src/middleware/cors.test.ts`:
    - Allowed origin gets ACAO header
    - Disallowed origin gets no ACAO
    - Preflight OPTIONS handling

  **Must NOT do**:
  - Do NOT test with real HTTP server — test middleware functions directly

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 3, 4

  **References**:
  - `packages/api/src/middleware/rate-limiter.ts` — Token bucket implementation (Task 4)
  - `packages/api/src/middleware/security-headers.ts` — Security headers (Task 3)
  - `packages/api/src/middleware/cors.ts` — Updated CORS (Task 2)
  - `packages/api/src/auth/rbac.test.ts` — Unit test pattern for middleware-like code

  **Acceptance Criteria**:
  - [ ] ≥12 test cases across 3 middleware test files
  - [ ] Token bucket timing tested
  - [ ] HSTS conditional tested
  - [ ] CORS allowlist tested
  - [ ] All pass: `bun test packages/api/src/middleware/`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All middleware tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/api/src/middleware/
      2. Assert: exit code 0, ≥12 tests pass
    Expected Result: All middleware tests green
    Evidence: .sisyphus/evidence/task-18-middleware-tests.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `test(api): middleware unit tests`
  - Files: `packages/api/src/middleware/rate-limiter.test.ts`, `packages/api/src/middleware/security-headers.test.ts`, `packages/api/src/middleware/cors.test.ts`
  - Pre-commit: `bun test packages/api`

### Wave 4 — Web UI Tests + CI Hardening

- [ ] 19. Web Auth Component Tests (Login, Register Forms)

  **What to do**:
  - **First**: Install test devDependencies in `packages/web`: `bun add -d @testing-library/react @testing-library/jest-dom happy-dom`
  - **Then**: Add `happy-dom` as the test environment in `bunfig.toml` (create at `packages/web/bunfig.toml` with `[test]\npreload = ["happy-dom/global"]`) OR configure via `--preload happy-dom/global` in the test script
  - Create `packages/web/src/pages/Login.test.tsx`:
    - Import from `bun:test` (NOT vitest) and `@testing-library/react`
    - Renders login form with email and password fields
    - Submit with valid credentials → calls API and redirects
    - Submit with empty fields → shows validation error
    - Submit with invalid credentials → shows error message
    - Loading state during submission
  - Create `packages/web/src/pages/Register.test.tsx`:
    - Renders registration form
    - Submit with valid data → calls API and redirects
    - Password mismatch → shows validation error
    - Email already exists → shows error from API
  - Use `bun test` with `@testing-library/react` + `happy-dom` (NOT vitest)
  - **IMPORTANT**: Existing `App.test.tsx` uses `bun:test` — all new tests MUST also use `bun:test` imports (`describe`, `expect`, `it` from `'bun:test'`)

  **Must NOT do**:
  - Do NOT make real API calls — mock fetch/API client
  - Do NOT modify `App.test.tsx`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: React component testing requires testing-library patterns and mock setup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 20-24)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `packages/web/src/pages/` — Login and Register page components
  - `packages/web/src/App.test.tsx` — Existing test using `bun:test` (imports `describe`, `expect`, `it` from `'bun:test'`). Does NOT use @testing-library/react — new tests must add it as devDependency first
  - `packages/web/package.json` — Test script and testing dependencies
  - `packages/web/vite.config.ts` — Vitest configuration

  **WHY Each Reference Matters**:
  - `App.test.tsx` — Shows that `bun:test` is the test runner (NOT vitest). New tests must follow this pattern but ADD `@testing-library/react` for DOM rendering + `happy-dom` for DOM environment
  - `pages/` — Executor must read the actual component code to know what to query and assert

  **Acceptance Criteria**:
  - [ ] ≥8 test cases across Login and Register
  - [ ] Validation error rendering tested
  - [ ] API call mocked
  - [ ] All pass: `bun test packages/web`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Web auth tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/web
      2. Assert: exit code 0, ≥9 tests pass (1 existing + 8 new)
    Expected Result: All web tests green
    Evidence: .sisyphus/evidence/task-19-web-auth-tests.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `test(web): auth component tests for login and register`
  - Files: `packages/web/src/pages/Login.test.tsx`, `packages/web/src/pages/Register.test.tsx`
  - Pre-commit: `bun test packages/web`

- [ ] 20. Web Dashboard + Sprint Viewer Component Tests

  **What to do**:
  - Create `packages/web/src/pages/Dashboard.test.tsx`:
    - Renders dashboard with project list
    - Shows loading state
    - Shows empty state when no projects
    - Clicking project navigates to detail view
  - Create `packages/web/src/pages/SprintViewer.test.tsx`:
    - Renders sprint with task list
    - Shows sprint dates and status
    - Task completion status displayed correctly
    - Empty sprint state handled
  - Mock API data with realistic shapes from API type definitions
  - Use `bun:test` imports + `@testing-library/react` (installed by Task 19)

  **Must NOT do**:
  - Do NOT make real API calls
  - Do NOT test routing (test component rendering only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19, 21-24)
  - **Blocks**: None
  - **Blocked By**: Task 19 (installs test devDependencies)

  **References**:
  - `packages/web/src/pages/` — Dashboard and Sprint viewer components
  - `packages/web/src/App.test.tsx` — Test setup pattern (uses `bun:test`)
  - `packages/core/src/types/` — Shared type definitions for mock data shapes

  **Acceptance Criteria**:
  - [ ] ≥6 test cases across Dashboard and Sprint viewer
  - [ ] Loading and empty states tested
  - [ ] All pass: `bun test packages/web`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dashboard and sprint tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/web
      2. Assert: exit code 0, ≥15 tests pass (cumulative with Task 19)
    Expected Result: All web tests green
    Evidence: .sisyphus/evidence/task-20-web-dashboard-tests.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `test(web): dashboard and sprint viewer component tests`
  - Files: `packages/web/src/pages/Dashboard.test.tsx`, `packages/web/src/pages/SprintViewer.test.tsx`
  - Pre-commit: `bun test packages/web`

- [ ] 21. Web Analytics/Burndown Component Tests

  **What to do**:
  - Create `packages/web/src/pages/Analytics.test.tsx`:
    - Renders analytics page with metrics data
    - Shows velocity chart data (or placeholder)
    - Shows cost metrics
    - Empty state when no data available
  - Create `packages/web/src/components/BurndownChart.test.tsx` (if component exists):
    - Renders with valid sprint data
    - Handles empty data gracefully
    - Shows correct label/axis data
  - Mock metrics API responses
  - Use `bun:test` imports + `@testing-library/react` (installed by Task 19)

  **Must NOT do**:
  - Do NOT test canvas/SVG rendering details — test data flow and DOM presence

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Task 19 (installs test devDependencies)

  **References**:
  - `packages/web/src/pages/` — Analytics page component
  - `packages/web/src/components/` — BurndownChart if it exists
  - `packages/api/src/services/metrics-aggregator.ts` — Response shapes for mock data

  **Acceptance Criteria**:
  - [ ] ≥4 test cases for analytics components
  - [ ] Empty state handled
  - [ ] All pass: `bun test packages/web`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Analytics tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/web
      2. Assert: exit code 0, ≥19 tests pass (cumulative)
    Expected Result: All web tests green
    Evidence: .sisyphus/evidence/task-21-web-analytics-tests.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `test(web): analytics and burndown component tests`
  - Files: `packages/web/src/pages/Analytics.test.tsx`, `packages/web/src/components/BurndownChart.test.tsx`
  - Pre-commit: `bun test packages/web`

- [ ] 22. CI Dependency Audit Job

  **What to do**:
  - Add `dependency-audit` job to `.github/workflows/ci.yml`:
    - Run `bun audit` (or `npm audit --audit-level=high` if bun audit unavailable)
    - Fail build on HIGH or CRITICAL vulnerabilities
    - Allow known/accepted vulnerabilities via `.audit-exceptions.json` (create if needed)
  - Run after `test` job completes

  **Must NOT do**:
  - Do NOT fail on LOW or MODERATE vulnerabilities (too noisy)
  - Do NOT install Snyk or other paid tools

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding a CI job with a single command — small YAML change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 19-21, 23, 24)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `.github/workflows/ci.yml` — Existing CI workflow to add job to
  - `.github/workflows/pr-checks.yml` — PR checks workflow for reference on job structure

  **Acceptance Criteria**:
  - [ ] `dependency-audit` job defined in ci.yml
  - [ ] Job runs `bun audit` or equivalent
  - [ ] YAML valid: `cat .github/workflows/ci.yml | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)"`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CI YAML valid with audit job
    Tool: Bash
    Steps:
      1. Run: cat .github/workflows/ci.yml | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)" && echo "VALID"
      2. Assert: output contains "VALID"
      3. Run: grep "dependency-audit" .github/workflows/ci.yml
      4. Assert: exit code 0
    Expected Result: Valid YAML with audit job
    Evidence: .sisyphus/evidence/task-22-ci-audit.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `ci: add dependency audit job`
  - Files: `.github/workflows/ci.yml`
  - Pre-commit: `cat .github/workflows/ci.yml | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)"`

- [ ] 23. CI Container Scanning Job

  **What to do**:
  - Add `container-scan` job to `.github/workflows/ci.yml`:
    - Depends on `build-api` and `build-web` (needs built images)
    - Use `aquasecurity/trivy-action@master` to scan Docker images
    - Scan `Dockerfile.api` and `Dockerfile.web` builds
    - Fail on CRITICAL severity findings
    - Upload scan results as artifact
  - Alternative: If Trivy action is too complex, use `docker scout cves` or a simple `grype` scan

  **Must NOT do**:
  - Do NOT add paid container scanning services
  - Do NOT fail on LOW/MEDIUM/HIGH (start conservative)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CI YAML addition with existing action template
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: Tasks 7, 8 (Docker images must be buildable)

  **References**:
  - `.github/workflows/ci.yml` — CI workflow
  - `Dockerfile.api` — API image to scan (from Task 7)
  - `Dockerfile.web` — Web image to scan (from Task 8)

  **Acceptance Criteria**:
  - [ ] `container-scan` job defined in ci.yml
  - [ ] Scans both API and web images
  - [ ] YAML valid

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Container scan job defined
    Tool: Bash (grep)
    Steps:
      1. Run: grep "container-scan" .github/workflows/ci.yml
      2. Assert: exit code 0
      3. Run: grep -c "trivy\|grype\|scout" .github/workflows/ci.yml
      4. Assert: count ≥ 1
    Expected Result: Container scanning job with scanner tool
    Evidence: .sisyphus/evidence/task-23-container-scan.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `ci: add container vulnerability scanning`
  - Files: `.github/workflows/ci.yml`
  - Pre-commit: `cat .github/workflows/ci.yml | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)"`

- [ ] 24. PR Checks Enhancement (Security Pattern Expansion)

  **What to do**:
  - Enhance `.github/workflows/pr-checks.yml` forbidden-patterns job:
    - Add check for `eval(` usage (code injection risk)
    - Add check for `new Function(` (dynamic code execution)
    - Add check for `innerHTML` assignment in API code (XSS risk, shouldn't be in API anyway)
    - Add check for hardcoded `localhost` URLs in non-test/non-config files
    - Add check for `TODO:.*HACK` or `FIXME:.*HACK` (tech debt tracking)
  - Add `license-check` job:
    - Verify no GPL-licensed dependencies are introduced
    - Use `bun pm ls` or `license-checker` to audit
    - Fail if copyleft licenses detected in production dependencies

  **Must NOT do**:
  - Do NOT make existing checks more restrictive (don't break current PRs)
  - Do NOT install paid tools

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: YAML additions with grep patterns — straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `.github/workflows/pr-checks.yml` — Existing PR checks to extend (3 jobs: forbidden-patterns, secret-hygiene, bundle-size)

  **Acceptance Criteria**:
  - [ ] ≥3 new forbidden patterns added (eval, new Function, innerHTML)
  - [ ] YAML valid
  - [ ] Existing patterns preserved

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Enhanced PR checks YAML valid
    Tool: Bash
    Steps:
      1. Run: cat .github/workflows/pr-checks.yml | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)" && echo "VALID"
      2. Assert: "VALID"
      3. Run: grep "eval(" .github/workflows/pr-checks.yml
      4. Assert: exit code 0 (pattern is being checked for)
    Expected Result: Valid YAML with new patterns
    Evidence: .sisyphus/evidence/task-24-pr-checks.txt
  ```

  **Commit**: YES (groups with Wave 4)
  - Message: `ci: expand PR checks with security patterns and license audit`
  - Files: `.github/workflows/pr-checks.yml`
  - Pre-commit: `cat .github/workflows/pr-checks.yml | python3 -c "import yaml,sys; yaml.safe_load(sys.stdin)"`

### Wave 5 — Integration Verification

- [ ] 25. End-to-End API Smoke Test Suite

  **What to do**:
  - Create `packages/api/src/__tests__/e2e-smoke.test.ts` — integration smoke tests:
    - Start API server → health returns 200
    - Register user → login → get JWT → access protected endpoint
    - CORS: allowed origin gets ACAO, disallowed origin doesn't
    - Security headers present on all responses
    - Rate limit: rapid auth requests → eventually 429
    - Request ID: `X-Request-Id` header returned on all responses
    - Readiness: `/api/health/ready` returns DB check result
    - Invalid auth: missing/expired token → 401
    - Forbidden: wrong role → 403
  - These tests can use either a real running server or Bun.serve() inline
  - Create a test helper that starts/stops the server for integration tests

  **Must NOT do**:
  - Do NOT require external services (Jira, GitHub) — only DB
  - Do NOT make these tests slow (< 30s total)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Integration tests requiring server lifecycle management and multi-layer assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (but only after Waves 1-3)
  - **Parallel Group**: Wave 5 (with Tasks 26, 27)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1-4, 10-12

  **References**:
  - `packages/api/src/server.ts` — Server creation function
  - `packages/api/src/index.ts` — Server startup
  - `packages/api/src/middleware/cors.ts` — CORS config (Task 2)
  - `packages/api/src/middleware/rate-limiter.ts` — Rate limiter (Task 4)
  - `packages/api/src/middleware/security-headers.ts` — Security headers (Task 3)
  - `packages/api/src/middleware/request-logger.ts` — Request logging (Task 12)
  - `packages/api/src/routes/health.ts` — Health endpoints (Task 10)

  **WHY Each Reference Matters**:
  - `server.ts` — Must understand how to programmatically start/stop the server for test isolation
  - All middleware files — Tests verify cross-cutting middleware behavior on real requests

  **Acceptance Criteria**:
  - [ ] ≥9 smoke test cases covering all hardening features
  - [ ] All pass: `bun test packages/api/src/__tests__/e2e-smoke.test.ts`
  - [ ] Total test duration < 30s

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: E2E smoke tests pass
    Tool: Bash (bun test)
    Steps:
      1. Run: bun test packages/api/src/__tests__/e2e-smoke.test.ts
      2. Assert: exit code 0, ≥9 tests pass
      3. Assert: duration < 30s
    Expected Result: All integration tests green within time budget
    Evidence: .sisyphus/evidence/task-25-e2e-smoke.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `test(api): end-to-end smoke test suite for production hardening`
  - Files: `packages/api/src/__tests__/e2e-smoke.test.ts`
  - Pre-commit: `bun test packages/api`

- [ ] 26. Docker Compose Full Stack Smoke Test

  **What to do**:
  - Create `scripts/docker-smoke-test.sh`:
    - Run `docker compose build` (verify images build)
    - Run `docker compose up -d` (start all services)
    - Wait for health checks to pass (poll with timeout)
    - Run smoke tests:
      - `curl http://localhost:3000/api/health` → 200
      - `curl http://localhost:3000/api/health/ready` → 200 with DB connected
      - `curl http://localhost:80/` → HTML from web service
      - Verify security headers on API response
      - Verify CORS headers
    - Run `docker compose down -v` (cleanup)
    - Report PASS/FAIL
  - Make script idempotent and safe to run multiple times
  - Add `docker:smoke` script to root `package.json`

  **Must NOT do**:
  - Do NOT leave containers running after test
  - Do NOT require manual intervention

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Docker compose orchestration with service dependencies and health polling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 25, 27)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 7, 8, 9

  **References**:
  - `docker-compose.yml` — Service definitions (from Task 9)
  - `Dockerfile.api` — API image (from Task 7)
  - `Dockerfile.web` — Web image (from Task 8)
  - `package.json` — Root scripts

  **Acceptance Criteria**:
  - [ ] `scripts/docker-smoke-test.sh` exists and is executable
  - [ ] Script builds, starts, tests, and tears down cleanly
  - [ ] `docker:smoke` script in package.json
  - [ ] Script exits 0 on success, 1 on failure

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Docker smoke test script exists and is valid
    Tool: Bash
    Preconditions: Script created
    Steps:
      1. Run: test -x scripts/docker-smoke-test.sh && echo "EXECUTABLE"
      2. Assert: output contains "EXECUTABLE"
      3. Run: bash -n scripts/docker-smoke-test.sh && echo "VALID_SYNTAX"
      4. Assert: output contains "VALID_SYNTAX"
    Expected Result: Script exists, is executable, and has valid bash syntax
    Failure Indicators: Not executable, syntax errors
    Evidence: .sisyphus/evidence/task-26-docker-smoke.txt

  Scenario: Docker smoke test runs successfully (requires Docker)
    Tool: Bash
    Preconditions: Docker daemon running
    Steps:
      1. Run: bash scripts/docker-smoke-test.sh
      2. Assert: exit code 0
      3. Assert: output contains "PASS" or "All checks passed"
    Expected Result: Full stack smoke test passes
    Failure Indicators: Non-zero exit, "FAIL" in output
    Evidence: .sisyphus/evidence/task-26-docker-smoke-run.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `test(docker): add full-stack Docker compose smoke test`
  - Files: `scripts/docker-smoke-test.sh`, `package.json`
  - Pre-commit: `bash -n scripts/docker-smoke-test.sh`

- [ ] 27. Jira API Token Rotation Documentation

  **What to do**:
  - Create `docs/security/credential-rotation.md`:
    - **Jira API Token**: Step-by-step rotation procedure
      - Where tokens are used (`.env`, CI secrets)
      - How to generate a new Jira API token
      - Where to update (local .env, CI environment variables)
      - How to verify rotation worked
    - **JWT Secret**: Rotation procedure and impact (invalidates all existing sessions)
    - **Database Password**: Rotation with zero-downtime approach
    - **General**: Rotation schedule recommendation (quarterly)
  - Add note about the previously exposed token in `.env.example` (sanitized in prior work)
  - Link from main README.md security section

  **Must NOT do**:
  - Do NOT include actual credentials in documentation
  - Do NOT automate rotation (documentation only)

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Pure documentation task — no code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (with Tasks 25, 26)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `README.md` — Security section to link from
  - `.env.example` — Shows which credentials exist

  **Acceptance Criteria**:
  - [ ] `docs/security/credential-rotation.md` exists
  - [ ] Covers Jira, JWT, and DB credential rotation
  - [ ] Linked from README.md
  - [ ] No real credentials in documentation

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rotation docs exist and are linked
    Tool: Bash (grep)
    Steps:
      1. Run: test -f docs/security/credential-rotation.md && echo "EXISTS"
      2. Assert: "EXISTS"
      3. Run: grep "credential-rotation" README.md
      4. Assert: exit code 0
      5. Run: grep -i "jira" docs/security/credential-rotation.md && grep -i "jwt" docs/security/credential-rotation.md
      6. Assert: exit code 0
    Expected Result: Docs exist, linked, cover key topics
    Evidence: .sisyphus/evidence/task-27-rotation-docs.txt

  Scenario: No real credentials in docs
    Tool: Bash (grep)
    Steps:
      1. Run: grep -iE "ATATT3|sk-ant-|ghp_|real.*password" docs/security/credential-rotation.md
      2. Assert: exit code 1 (no matches)
    Expected Result: Zero real credential patterns
    Evidence: .sisyphus/evidence/task-27-no-secrets.txt
  ```

  **Commit**: YES (groups with Wave 5)
  - Message: `docs: add credential rotation procedures`
  - Files: `docs/security/credential-rotation.md`, `README.md`
  - Pre-commit: none

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify Pino is used consistently (no console.* in new code).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (rate limiter + CORS + security headers working together). Test edge cases: empty state, invalid input, rapid requests. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Verify no new dependencies added beyond Pino.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(api): add production security middleware (CORS, rate-limiter, security-headers)` — cors.ts, rate-limiter.ts, security-headers.ts, logger.ts, .env.example, .dockerignore
- **Wave 2**: `feat(infra): harden Docker builds and add deep health checks` — Dockerfile.api, Dockerfile.web, docker-compose.yml, health.ts, shutdown.ts, request-logger.ts
- **Wave 3**: `test(api): add comprehensive route and middleware tests` — all new *.test.ts files in packages/api/
- **Wave 4**: `test(web): add component tests and CI security gates` — all new *.test.tsx in packages/web/, ci.yml, pr-checks.yml
- **Wave 5**: `test(e2e): add integration smoke tests and rotation docs` — smoke test files, docs

---

## Success Criteria

### Verification Commands
```bash
npx tsc --noEmit                    # Expected: zero errors
bun test                            # Expected: all tests pass (existing + ~50 new)
bun run build                       # Expected: all 7 packages build successfully
curl -I http://localhost:3000/api/health  # Expected: security headers present + JSON health response
curl -X POST http://localhost:3000/api/auth/login -d '{}' -H 'Content-Type: application/json'  # Expected: rate limit headers in response
curl -H "Origin: https://evil.com" http://localhost:3000/api/health  # Expected: no Access-Control-Allow-Origin header
docker compose build                # Expected: successful multi-stage builds
docker compose run --rm api whoami  # Expected: NOT "root"
```

### Final Checklist
- [ ] All "Must Have" items present and verified
- [ ] All "Must NOT Have" items absent (grep verified)
- [ ] All existing tests still pass (zero regressions)
- [ ] All new tests pass
- [ ] CORS rejects unknown origins
- [ ] Rate limiter returns 429 after threshold
- [ ] Pino JSON logs emitted on every request
- [ ] Security headers on all responses
- [ ] Health endpoint checks DB connectivity
- [ ] Docker containers run as non-root
- [ ] Graceful shutdown drains connections on SIGTERM
- [ ] CI has dependency audit job
- [ ] No new dependencies beyond Pino
