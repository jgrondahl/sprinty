# Deferred Platform Roadmap

> Source: Gap analysis of deep-research-report.md against unified-governance.md
> Created: 2026-03-15
> Status: Deferred from current plan iteration — tracked for future waves

---

## D1. Intake / Product Goal Workflow + Affective Interviewer

| Field | Value |
|---|---|
| **Category** | Subsystem (new) |
| **Why deferred** | Major new subsystem requiring agent pipeline additions. Current plan focuses on governance overlay for *existing* agent pipeline — intake is a net-new product surface. |
| **Blocking dependency** | `product_goal` artifact type (being added to enum now). Once the type is valid vocabulary, the intake workflow can produce and version Product Goal artifacts. |
| **Existing schema** | `product_goal` will be in `artifactTypeEnum` after contract amendment. No intake service, no affective interviewer agent, no constraint extractor. |
| **Earliest entry** | Wave 10+ (post-current plan) or a dedicated plan iteration |
| **Exit criteria** | 1. Affective interviewer agent exists with textual affect cue detection. 2. Constraint extractor produces structured org/domain constraints. 3. Intake flow produces a versioned `product_goal` artifact with lineage. 4. Trace-grade "clarity" and "constraints captured" evidence attached. |
| **Risk of not doing it** | Splinty assumes requirements already exist. Users with raw ideas will get no structured discovery, leading to poor downstream artifacts. This is the #1 user-facing gap per the research report. |

---

## D2. Backlog Manager Service

| Field | Value |
|---|---|
| **Category** | Subsystem (new) |
| **Why deferred** | Major new service. Current plan handles artifact versioning/lineage generically — a dedicated backlog manager with prioritization, refinement tracking, and PO workflows is a separate product concern. |
| **Blocking dependency** | `sprint_backlog` artifact type (being added now). Also needs a stable artifact versioning service (T12) to version backlog state. |
| **Existing schema** | `epic`, `story`, `sprint_backlog` (after amendment) in `artifactTypeEnum`. Lineage service (T13) tracks parent-child. No prioritization engine, no refinement workflow. |
| **Earliest entry** | After Wave 3 (when artifact services are stable) |
| **Exit criteria** | 1. Backlog manager service exists. 2. Can create/reorder/refine backlog items. 3. Tracks ownership and refinement status. 4. Outputs are versioned artifacts with lineage. |
| **Risk of not doing it** | Backlog management happens outside Splinty (manual or in Jira). No end-to-end traceability from backlog to deployment. Acceptable for initial launch if Jira integration covers it. |

---

## D3. Sprint Planner Component

| Field | Value |
|---|---|
| **Category** | Subsystem (new) |
| **Why deferred** | Sprint planning as a first-class Scrum event requires capacity/velocity modeling, dependency resolution, and sprint goal tracking — none of which are in the current plan. Run contracts (T15) partially cover task-level planning. |
| **Blocking dependency** | `sprint_backlog`, `increment` artifact types (being added now). Also needs backlog manager (D2) to select from. |
| **Existing schema** | Run contract schema (T15), `sprint_backlog` and `increment` (after amendment). Existing TaskDecomposer in packages/agents — but 11 failing tests indicate instability. |
| **Earliest entry** | After D2 (Backlog Manager) is implemented |
| **Exit criteria** | 1. Sprint planner produces sprint goals + sprint backlogs. 2. Task decomposition integrates with run contract factory. 3. Sprint backlogs are traceable to product goals/epics. 4. Capacity and velocity modeled. |
| **Risk of not doing it** | Sprint planning happens ad-hoc. Tasks get generated without sprint structure. Acceptable if users manage sprints externally. |

---

## D4. SBOM / SLSA / Sigstore — Supply-Chain Provenance

| Field | Value |
|---|---|
| **Category** | Security / Delivery |
| **Why deferred** | High-value but requires significant infrastructure: SBOM generation tooling (CycloneDX/SPDX), SLSA provenance attestation pipeline, Sigstore integration for signing. Each is a standalone integration effort. |
| **Blocking dependency** | `delivery_record` artifact type (being added now). Also needs CI pipeline (Wave 5, T30-35) as integration point. |
| **Existing schema** | `release_candidate` and `delivery_record` (after amendment) in artifact enum. `delivered` and `post_delivery_review` stages in promotion pipeline. No SBOM/SLSA/Sigstore tooling. |
| **Earliest entry** | After Wave 5 (CI/Docker hardening provides integration surface) |
| **Exit criteria** | 1. SBOM generated at build time (CycloneDX or SPDX format). 2. SLSA provenance attestation attached to release candidates. 3. Sigstore signing of release artifacts. 4. Promotion gate at `release_candidate` → `approved_for_delivery` requires SBOM + provenance. 5. All attestations stored as evidence bundles with lineage. |
| **Risk of not doing it** | Cannot claim "enterprise-grade delivery" without supply-chain transparency. Increasingly expected by enterprise buyers. Medium-term competitive risk. |

---

## D5. OpenTelemetry Integration

| Field | Value |
|---|---|
| **Category** | Observability |
| **Why deferred** | Infrastructure-level change requiring: OTel SDK integration, trace context propagation across agent calls, metrics exporter, log correlation. Touches every service layer. |
| **Blocking dependency** | Pino logger (T1, done). OTel can integrate with Pino but requires SDK setup and collector configuration. |
| **Existing schema** | Pino structured logging with request IDs. No trace context, no spans, no metrics, no OTel collector. |
| **Earliest entry** | After Wave 2 (when core services exist to instrument) |
| **Exit criteria** | 1. OTel SDK integrated into API server. 2. Trace context propagated across agent execution. 3. Spans created for: HTTP requests, agent tool calls, promotion transitions, evaluations. 4. Metrics exported: request rate, agent execution time, gate pass/fail rates. 5. Logs correlated via trace/span IDs. |
| **Risk of not doing it** | "What happened" is opaque. Debugging agent failures requires log archaeology. Cannot do trace grading (D7). Significant operational risk for production use. |

---

## D6. Retrospective Learning Loop

| Field | Value |
|---|---|
| **Category** | Observability / Learning |
| **Why deferred** | Depends on observability (D5) and post-delivery review workflow. Retrospective outputs need to feed back into governance policies, evaluation thresholds, and agent capability profiles. |
| **Blocking dependency** | OpenTelemetry (D5), `post_delivery_review` artifact type (being added now), evaluation service (T17-19). |
| **Existing schema** | `post_delivery_review` promotion stage exists. No feedback loop service, no policy update mechanism. |
| **Earliest entry** | After D5 (OpenTelemetry) is implemented |
| **Exit criteria** | 1. Retro process captures lessons learned as versioned artifacts. 2. Lessons feed into evaluation threshold adjustments. 3. Lessons feed into agent capability profile updates. 4. Policy changes are audited. 5. Dashboards show improvement trends. |
| **Risk of not doing it** | Platform doesn't learn from its own outputs. Same mistakes recur. No continuous improvement loop. Acceptable for initial launch but critical for long-term platform value. |

---

## D7. Trace Grading

| Field | Value |
|---|---|
| **Category** | Observability / Evaluation |
| **Why deferred** | Requires OpenTelemetry (D5) to provide trace data. Trace grading scores end-to-end traces to pinpoint where agents fail. Current LLM evaluation (T17) judges artifact quality, not execution path quality. |
| **Blocking dependency** | OpenTelemetry integration (D5). Cannot grade traces that don't exist. |
| **Existing schema** | LLM evaluation service (T17), evaluation thresholds (T18). No trace-level evaluation. |
| **Earliest entry** | After D5 (OpenTelemetry) is implemented |
| **Exit criteria** | 1. Traces are scored for: tool call correctness, decision quality, retry behavior. 2. Trace grades feed into evaluation aggregation. 3. Low-grade traces flagged for review. 4. Historical grade trends visible. |
| **Risk of not doing it** | Evaluation remains artifact-focused, not execution-focused. Cannot distinguish "good output from bad process" vs "good output from good process." |

---

## D8. MCP Integration Security

| Field | Value |
|---|---|
| **Category** | Security / Integration |
| **Why deferred** | Requires MCP adoption as a platform pattern first. Security controls (version pinning, signature checks, namespace isolation) can only be built once MCP servers are in use. |
| **Blocking dependency** | MCP server configuration in the platform. Currently no MCP usage beyond the dev harness (OpenCode's MCP). |
| **Existing schema** | Jira integration exists via REST API (not MCP). Tool blacklist (T16) and capability profiles (T8) provide tool-level governance but not MCP-specific controls. |
| **Earliest entry** | When MCP servers are adopted for enterprise integrations (GitHub, CI, security scanners) |
| **Exit criteria** | 1. MCP server configs support version pinning. 2. Signature verification for MCP server packages. 3. Namespace isolation prevents MCP servers from accessing other servers' data. 4. MCP tool calls governed by existing capability profiles and tool blacklist. |
| **Risk of not doing it** | If MCP is adopted without security controls, tool servers become an unmonitored attack surface. Low immediate risk since MCP isn't yet adopted. |

---

## D9. Security Scan Integration (Deterministic Verification)

| Field | Value |
|---|---|
| **Category** | Security / Verification |
| **Why deferred** | Current evaluation is LLM-based (T17). Research requires deterministic test/scan result aggregation alongside LLM evaluation. Adding SAST, dependency scanning, and IaC scanning as first-class gate inputs. |
| **Blocking dependency** | CI scanning jobs (T33, T34 in Wave 5). Evaluation service (T17-19). |
| **Existing schema** | CI dependency audit (T33), container scanning (T34), LLM evaluation service (T17). No aggregation of scan results into gate decisions. |
| **Earliest entry** | After Wave 5 (CI scanning) and Wave 3 (evaluation integration) |
| **Exit criteria** | 1. SAST scan results fed into gate evaluation. 2. Dependency audit results block promotion if critical CVEs found. 3. Gate evaluation aggregates: LLM scores + test results + scan results. 4. Security posture report generated per release candidate. |
| **Risk of not doing it** | Gates are LLM-only. A release can pass LLM evaluation but have known critical CVEs. Compliance risk for enterprise customers. |

---

## D10. Architecture Authority Agent + ADR Generator

| Field | Value |
|---|---|
| **Category** | Subsystem (enhancement) |
| **Why deferred** | `adr` and `threat_model` artifact types are being added to the enum. But the agent that *produces* these artifacts (Architecture Authority) doesn't exist yet. Requires new agent with architecture analysis, ADR template generation, and threat modeling capabilities. |
| **Blocking dependency** | `adr`, `threat_model` artifact types (being added now). Existing agent pipeline in packages/agents (DO NOT MODIFY agents directly). |
| **Existing schema** | `architecture_plan` artifact type (existing). `adr`, `threat_model` (after amendment). Authority matrix (T20). No architecture authority agent. |
| **Earliest entry** | After Wave 3 (when authority matrix enforcement exists) |
| **Exit criteria** | 1. Architecture authority agent exists. 2. Produces ADRs as versioned artifacts with lineage to requirements. 3. Produces threat models as versioned artifacts. 4. ADRs follow a standard template (status, context, decision, consequences). 5. Threat models aligned with SSDF/SAMM categories. |
| **Risk of not doing it** | Architecture decisions are informal. No threat model generation. Acceptable if architects document externally, but breaks the "everything is a versioned artifact" principle. |

---

## D11. Pre-existing TaskDecomposer Test Failures (11 failures)

| Field | Value |
|---|---|
| **Category** | Technical debt |
| **Why deferred** | 11 pre-existing test failures in TaskDecomposer suite. Not introduced by governance work. Fixing may require modifying agent pipeline code (which is constrained by "no agent pipeline modifications" rule). |
| **Blocking dependency** | Clarification on whether fixing test assertions (not agent logic) counts as "modifying agent pipeline." |
| **Existing schema** | Test files exist. Failures are in packages/agents test suite. |
| **Earliest entry** | Can be addressed anytime as a standalone fix |
| **Exit criteria** | 1. All 11 TaskDecomposer tests pass. 2. No agent pipeline execution logic modified. 3. `bun test` shows 0 failures. |
| **Risk of not doing it** | Test suite is noisy — real failures may be masked. CI signals are unreliable. Should be fixed before Wave 9 integration tests. |

---

## Dependency Chain

```
D1 (Intake)     → needs: product_goal enum ← contract amendment
D2 (Backlog)    → needs: sprint_backlog enum ← contract amendment + T12 (versioning)
D3 (Sprint)     → needs: D2 + increment enum ← contract amendment
D4 (Supply Chain) → needs: delivery_record enum ← contract amendment + Wave 5 CI
D5 (OTel)       → needs: T1 (done) + core services (Wave 2-3)
D6 (Retro Loop) → needs: D5 + post_delivery_review enum ← contract amendment
D7 (Trace Grade) → needs: D5
D8 (MCP Security) → needs: MCP adoption (external dependency)
D9 (Scan Integration) → needs: Wave 5 CI + Wave 3 eval
D10 (Arch Agent) → needs: adr/threat_model enum ← contract amendment + Wave 3 authority
D11 (Test Fixes) → standalone
```

---

## Review Schedule

This backlog should be reviewed:
1. After current plan execution completes (Waves 2-9 + Final)
2. When planning the next iteration
3. If new research or requirements emerge that affect priorities
