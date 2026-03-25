MASTER PLAN — SPLINTY ENTERPRISE SDLC PLATFORM

Objective

Transform Splinty from a CLI-centered multi-agent executor into a production-grade enterprise SDLC platform that can take an idea, convert it into governed delivery artifacts, and drive bounded, observable, evaluable execution toward a viable enterprise-ready application. The system must be defensible under executive, operational, and regulatory scrutiny. “Production-ready” does not mean feature-complete UI plus infrastructure hardening. It means the system has explicit authority boundaries, measurable artifact quality, enforced stage gates, runtime containment, auditability, rollback paths, and a release control model that prevents unsafe or low-quality agent output from reaching delivery.

Core Position

Do not replace the current system wholesale. Preserve the existing execution pipeline where it provides leverage, but move it under a formal control plane, add a canonical artifact model, impose quality scoring and approval gates, isolate runtime execution, and introduce an explicit promotion pipeline. The system must separate governance from execution. The user-facing promise is not “autonomous coding.” The promise is “governed enterprise software delivery with bounded agent assistance.”

Architectural Target

The target architecture is two-plane.

The Control Plane owns projects, organizations, users, auth, RBAC, backlog hierarchy, roadmap import, artifact state, stage transitions, audit logs, evaluation policies, approval workflows, release readiness, reporting, and observability dashboards.

The Execution Plane owns agent orchestration, run state, workspaces, tool invocation, repository operations, test execution, patch generation, delivery packaging, and sandboxed runtime behavior.

This separation is mandatory. The Control Plane decides what may happen, who may approve it, what evidence is required, and whether a stage may advance. The Execution Plane performs scoped work inside controlled runtime boundaries and reports evidence back to the Control Plane. Execution must never self-authorize promotion.

Non-Negotiable Principles

Bounded autonomy is mandatory. No agent is autonomous by default. Every agent capability must be explicitly scoped and revocable. Agents may propose, analyze, generate, and verify inside their assigned authority boundaries. They may not silently self-escalate.

Observability comes before scale. Every run, decision, artifact mutation, tool invocation, approval, and failure must be traceable end to end.

Evaluation is a first-class feature. No artifact progresses on agent confidence alone. Every major stage must define required evidence and passing criteria before promotion is allowed.

Failure is expected and must be contained. Every execution pathway must define stop conditions, rollback behavior, escalation rules, retry rules, and kill-switch mechanisms.

Local-first iteration, cloud-explicit deployment. Development and validation can be local-first, but all cloud use must be explicit, justified, and governed.

Canonical Product Scope

Splinty must support this governed path: Idea Intake → Initiative / Project creation → Epic decomposition → Story decomposition → Requirements package → Architecture package → Build-ready work item set → Bounded execution runs → Verification and quality scoring → Release candidate formation → Human approval → Delivery.

The platform must support multiple projects, roadmap import, sprint planning, artifact lineage, audit, role-based access, and concurrent runs. But concurrency is secondary to governance. Do not optimize for volume until stage control is reliable.

Master Workstreams

Workstream 1 — Platform Foundation and Control Plane

Build the persistent application backbone first. Introduce a StorageAdapter abstraction and migrate all durable state behind it. Filesystem persistence may remain only as a transitional development backend; it must not remain the production source of truth. Add relational persistence for organizations, projects, initiatives, epics, stories, runs, artifacts, approvals, audit events, and evaluation results. Establish a versioned API surface for all control-plane operations. Add authentication, RBAC, org scoping, project scoping, and user action auditing. Add a web UI only after the control-plane contracts are stable enough to avoid binding the UI to unstable internals. The UI is not the system. The API and state model are the system.

Key output of this workstream: a stable control-plane schema and API that can govern all future execution.

Workstream 2 — Canonical Artifact Model

Define a canonical internal schema for every major artifact. Input flexibility is acceptable only at ingestion. Once data enters Splinty, it must be normalized into a strict internal model. This includes Idea, Project, Epic, Story, Requirement Set, Architecture Decision Set, Implementation Plan, Test Plan, Risk Register, Evidence Bundle, Verification Result, Release Candidate, and Delivery Record. Every artifact must carry provenance, version history, author or producer identity, timestamps, status, evaluation scores, linked upstream artifacts, linked downstream artifacts, and approval state. Imported YAML or roadmap content may be tolerant at the boundary, but ambiguous imports must be flagged explicitly and represented as structured uncertainty, not silently accepted as fact.

Key output of this workstream: a canonical artifact graph with lineage and provenance.

Workstream 3 — Roadmap and Intake Normalization

Retain flexible roadmap import, but formalize the importer. Import must produce a validation report with accepted fields, rejected fields, inferred fields, missing required fields, and ambiguity warnings. Introduce a normalized intake contract that converts external plans into internal Projects, Epics, Stories, constraints, acceptance signals, risk assumptions, and architectural unknowns. Every inference made during import must be recorded so downstream agents and users can see which facts were supplied and which were assumed.

Key output of this workstream: a deterministic intake and normalization process that avoids silently corrupting planning state.

Workstream 4 — Agent Governance and Authority Matrix

This is the missing workstream and must be added immediately. Define every agent by role, inputs, outputs, tools, approval requirements, failure modes, and authority limits. At minimum define roles for Intake Analyst, Product Structurer, Requirements Author, Architect, Implementation Planner, Developer, QA Verifier, Security Reviewer, Delivery Preparer, and Run Orchestrator. For each role specify whether it is advisory-only, generation-capable, mutation-capable, or execution-capable. Define which artifacts each agent may read, write, propose, or update. Define which stage transitions require human approval and which may proceed automatically if evaluation thresholds pass.

Minimum enterprise-safe policy: intake acceptance, requirements approval, architecture approval, release approval, and any autonomy expansion must be human-gated. Code generation and test execution may be bounded-autonomy if sandboxed and fully observable. Delivery may prepare artifacts automatically but must not finalize outward release without explicit approval.

Key output of this workstream: an authority matrix that makes agent behavior governed rather than emergent.

Workstream 5 — Stage Gates and Promotion Pipeline

Add an explicit lifecycle state model for all delivery work. Recommended progression: Draft → Planned → Requirements Ready → Architecture Ready → Build Ready → In Execution → Built → Verified → Release Candidate → Approved for Delivery → Delivered → Post-Delivery Review. No stage may advance without required evidence and passing rules. A “working run” is not the same as a promotable release candidate. Promote only through explicit gates. Every gate must specify required artifacts, required scores, required approvals, and disqualifying conditions.

Key output of this workstream: a defensible release promotion pipeline.

Workstream 6 — Artifact Evaluation and Readiness Scoring

Every major artifact must be scored before the next stage may begin. Requirements must be evaluated for completeness, clarity, testability, dependency identification, business objective traceability, and unresolved ambiguity. Architecture must be evaluated for boundary clarity, tradeoff explicitness, deployment realism, security implications, failure handling, observability plan, and implementation feasibility. Build outputs must be evaluated for compile success, test results, dependency risk, code policy compliance, and runtime sanity. Verification outputs must include objective evidence, not narrative claims. Introduce configurable thresholds per project or organization. Store historical scores so the system can show whether quality is improving or decaying.

Key output of this workstream: machine-enforced readiness scoring that blocks garbage artifacts from advancing.

Workstream 7 — Execution Plane Isolation and Runtime Contracts

Define execution as a controlled service, not an implicit side effect. Every run must execute inside an isolated workspace with strict resource boundaries. Define sandboxing rules for filesystem access, network access, process execution, tool invocation, secret access, repository mutation, and artifact export. Every run must have a run contract containing inputs, allowed tools, execution budget, workspace path, time limits, retry policy, stop conditions, escalation path, and cleanup policy. Secret injection must be ephemeral and scoped per run. No workspace may inherit broad host privileges. Any tool capable of repository mutation, command execution, network egress, or package installation must be explicitly whitelisted and audited.

Key output of this workstream: a hardened execution model with containment and predictable failure behavior.

Workstream 8 — Tool Contracts and Agentic Security

Extend security beyond standard web application concerns. Define every tool by schema, allowed parameters, expected outputs, failure contract, and trust classification. Treat all tool outputs and external content as potentially adversarial. Add validation and sanitization for repository content, issue content, imported docs, generated prompts, and tool-returned text. Separate untrusted external data from trusted control-plane instructions. Prevent silent tool chaining from creating privileged flows. Require provenance for tool results. Add controls for command execution, dependency installation, external calls, prompt injection resistance, and installer integrity. The system must assume that connected tools and imported content can be malicious or compromised.

Key output of this workstream: a secure tool invocation model suitable for agentic systems.

Workstream 9 — Observability, Audit, and Forensics

Implement structured logging, distributed correlation IDs, artifact lineage tracking, run event streams, stage transition logs, approval logs, tool call logs, evaluation logs, and security events. All records must be queryable by run, artifact, project, user, and time window. Add health and readiness endpoints separately. Add metrics for run success rate, time in stage, gate failure rate, retry frequency, rollback frequency, tool failure rate, approval latency, evaluation score distributions, and escaped defects. Add immutable or integrity-protected audit storage for sensitive governance events.

Key output of this workstream: end-to-end traceability and post-incident diagnosability.

Workstream 10 — Conventional Platform Hardening

Retain and execute the application hardening plan: strict CORS policy, rate limiting, auth enforcement, security headers, structured exceptions, request validation, secure cookie and token practices, container hardening, non-root images, CI security scanning, dependency scanning, health checks, readiness checks, backup and restore strategy, and broader test coverage. This work remains necessary, but it is not sufficient to define enterprise readiness. It supports the platform; it does not govern the agent core.

Key output of this workstream: production-grade application hygiene.

Workstream 11 — Human Workflow and Approval UX

Design the human interaction model around review and control, not “chat with AI.” Approvers need clear side-by-side artifact diffs, evaluation results, unresolved risks, provenance, and the exact basis for any recommendation. Users must be able to reject, request revision, override with justification, or pause execution. Approval UX must expose what changed, why it changed, what evidence exists, and what risk remains. Never hide uncertainty behind polished wording. Silence and ambiguity are failure modes.

Key output of this workstream: human-in-the-loop oversight that is operationally usable.

Workstream 12 — Reporting, Governance, and Organizational Controls

Add reporting for project health, throughput, gate failures, release readiness, score trends, approval bottlenecks, defect escape indicators, and agent performance by role. Add organization-level policies for required approvals, minimum thresholds, allowed tools, execution budgets, and delivery constraints. This is necessary if the platform is intended for real enterprise use rather than single-operator experimentation.

Key output of this workstream: governance controls at organization scale.

Phased Implementation Order

Phase 0 — Freeze the Target Model

Before adding new features, document the target system boundaries. Produce the control-plane versus execution-plane split. Produce the agent authority matrix draft. Produce the canonical artifact model draft. Produce the promotion pipeline draft. If these are not fixed first, implementation will drift.

Phase 1 — Persistent Foundation

Implement StorageAdapter, migrate durable state to relational persistence, define core entities, introduce API contracts, add auth and RBAC, add project and org scoping, and establish audit logging. Do not implement advanced UI workflows before these contracts exist.

Exit criteria: control-plane state is no longer filesystem-dependent; entities are versioned and auditable.

Phase 2 — Canonical Artifacts and Intake

Implement the canonical artifact graph and roadmap normalization pipeline. Add provenance and import validation reporting. Ensure every imported plan becomes structured internal artifacts with known uncertainty.

Exit criteria: all intake becomes normalized, queryable artifacts with lineage.

Phase 3 — Governance and Stage Control

Implement the authority matrix, stage transitions, approval gates, release pipeline, and rejection or revision flows. Add explicit state progression rules. Integrate human approvals where required.

Exit criteria: no uncontrolled stage advancement; no execution without a run contract; no release promotion without required approvals and evidence.

Phase 4 — Evaluation Engine

Implement artifact scoring, quality thresholds, rule configuration, evidence bundles, and gate checks. Connect scores to stage promotion logic. Store historical results for trend analysis.

Exit criteria: artifact advancement is blocked by failing scores; evidence is persisted and reviewable.

Phase 5 — Execution Isolation

Move the current agent pipeline behind execution-plane services with run contracts, workspace isolation, sandboxing, tool whitelisting, secret scoping, budget controls, and cleanup rules. The existing pipeline may remain logically intact, but it must now operate inside governed runtime boundaries.

Exit criteria: agent runs are isolated, observable, revocable, and bounded.

Phase 6 — UI and Operator Experience

Build or refine the UI around project navigation, artifact review, evaluation display, approval workflows, run monitoring, and audit inspection. The UI must reflect control-plane truth, not become an alternate logic layer.

Exit criteria: operators can govern the full lifecycle without resorting to filesystem inspection or undocumented commands.

Phase 7 — Platform Hardening and Security Expansion

Complete app hardening, CI/CD checks, dependency scanning, security headers, health and readiness, backup and restore, disaster recovery basics, installer integrity, external content sanitization, and tool trust boundaries.

Exit criteria: the system is operationally and agentically hardened enough for controlled pilot use.

Phase 8 — Pilot Readiness and Controlled Rollout

Use real but bounded internal projects. Disable any autonomy not supported by evidence. Measure gate failure rates, artifact score stability, review burden, and rollback frequency. Expand only after evidence shows control is holding.

Exit criteria: pilot outcomes demonstrate controlled value rather than uncontrolled productivity theater.

Required Deliverables

The implementation effort must produce these concrete artifacts, not just code. Produce a control-plane versus execution-plane architecture description. Produce an agent authority matrix. Produce a canonical artifact schema set. Produce a stage and promotion state machine. Produce evaluation policies and scoring rules. Produce run contract schemas. Produce tool contract schemas. Produce an observability and audit event catalog. Produce a security boundary model. Produce a release approval model. Produce a rollback and escalation policy. Produce a deployment topology for local-first and production environments. Produce operator runbooks for failed runs, blocked approvals, and rollback scenarios.

Required Gate Definitions

Requirements Ready gate requires: normalized project and story artifacts, unresolved ambiguity count below threshold or explicitly accepted, acceptance criteria defined, dependency assumptions listed, evaluation score above minimum, and human approval.

Architecture Ready gate requires: system boundaries defined, major tradeoffs documented, deployment approach stated, observability plan stated, failure modes identified, security-impacting decisions reviewed, evaluation score above minimum, and human approval.

Build Ready gate requires: implementation plan linked to requirements and architecture, tasks scoped, tooling declared, run contract defined, repository target confirmed, test approach defined, and policy checks passed.

Verified gate requires: build evidence, test evidence, policy evidence, dependency and security scan results, artifact diffs, evaluation result summary, and verifier approval or configured auto-pass criteria for low-risk internal work.

Release Candidate gate requires: all required upstream approvals complete, unresolved risk log within acceptable tolerance, rollback plan present, deployment metadata present, and promotion approved.

Approved for Delivery gate requires: explicit human signoff from authorized role, not merely successful execution.

Agent Authority Model

The Intake Analyst may parse, normalize, and highlight ambiguity but may not approve project creation on behalf of a human owner.

The Product Structurer may propose initiatives, epics, and stories, but may not mark them approved.

The Requirements Author may draft requirement sets and acceptance criteria, but may not claim completeness without evaluation and approval.

The Architect may produce architecture packages, tradeoff logs, and boundary definitions, but may not self-approve architecture.

The Implementation Planner may generate work breakdowns and run contracts, but may not authorize execution for high-risk work.

The Developer may generate patches, scaffolds, and implementation changes only inside bounded workspaces and only through approved run contracts.

The QA Verifier may execute validation and score evidence, but may not override failing policy gates without explicit approval.

The Security Reviewer may approve or block security-impacting work per policy and must be included on flows involving external exposure, secrets, network changes, auth changes, or package installation risk.

The Delivery Preparer may assemble release candidates and deployment artifacts but may not finalize outward release.

The Run Orchestrator may coordinate stage-constrained execution only. It is not an autonomous decision authority.

Data and Persistence Requirements

All artifact and run state must be durable, queryable, and versioned. All mutations must be attributable to a user or agent role. Soft deletes should be explicit and auditable. Optimistic concurrency or equivalent safeguards should prevent silent overwrites. Backups and restore tests are required before production claim. The system must be able to reconstruct the full history of a project and answer: who changed what, why, based on which artifact, under what policy, with what evidence, and with what approval.

Execution Model Requirements

Every execution run must declare: initiating artifact, triggering user or system action, target repository or workspace, allowed tools, secret scopes, network policy, timeout, retry count, expected outputs, stop conditions, and cleanup rules. Runs must emit heartbeat and completion events. Abandoned or stalled runs must surface clearly and terminate safely. Partial outputs must be marked as such. No run may silently continue after losing policy compliance or approval validity.

Testing and Validation Strategy

Define testing as layered. Unit tests cover state transitions, policy rules, import normalization, score calculations, and API contracts. Integration tests cover end-to-end artifact progression, approval workflows, execution contracts, tool invocation, and audit generation. UI tests cover approval workflows, review clarity, failure visibility, and role-based views. Security tests cover auth, privilege isolation, tool misuse, external content sanitization, sandbox boundaries, secret leakage, and dependency risks. Pilot validation must include real scenario walkthroughs from idea to verified release candidate with deliberate failure injection.

Readiness Definition

The platform is not production-ready when the UI loads, the API responds, and the agents can write code. It is production-ready only when a controlled pilot demonstrates that artifact quality is measurable, stage progression is enforced, unsafe behavior is containable, approvals are reviewable, rollbacks are practical, and the system can explain every significant decision and action through audit and evidence.

What to Keep from Existing Plans

Keep the StorageAdapter migration, SQL persistence, auth/RBAC, API surface, roadmap hierarchy, sprint planning, audit, UI, and CI direction. Keep the conventional hardening items: CORS tightening, rate limiting, security headers, structured logging, health and readiness, non-root containers, CI security checks, and expanded test coverage. Those remain valid and necessary.

What to Change from Existing Plans

Do not describe “enterprise ready” primarily as UI plus backend plus database plus ops polish. Reframe it around governed promotion and artifact quality control. Do not preserve the current 12-agent pipeline “untouched” as a terminal target. Preserve it temporarily, but subordinate it to run contracts and authority rules. Do not allow flexible imported YAML to remain flexible after ingestion. Normalize it. Do not merge manual QA, automated verification, and production signoff into a single concept. Separate them explicitly. Do not let execution imply approval.

What to Add Immediately

Add the Agent Governance and Authority Matrix workstream. Add the Canonical Artifact Model. Add the Stage Gate and Promotion Pipeline. Add the Artifact Evaluation Engine. Add the Execution Isolation and Run Contract model. Add the Tool Contract and Agentic Security model.

Decision Rule for OpenCode Review

OpenCode should review this plan for internal consistency, missing schemas, implementation sequencing risk, and contradictions between governance and runtime assumptions. It should not simplify the plan by removing approval gates, canonical schemas, or execution containment for the sake of speed. Any proposed reduction in governance must be justified with explicit risk acceptance and constrained scope.

Final Target Statement

Splinty must become a governed SDLC operating system, not just a multi-agent coding tool. Its differentiator is not that it can generate software artifacts autonomously. Its differentiator is that it can convert ideas into controlled, reviewable, evidence-backed delivery flows that are credible for enterprise use. If a proposed change increases speed but weakens bounded autonomy, observability, evaluation, or release control, reject it.