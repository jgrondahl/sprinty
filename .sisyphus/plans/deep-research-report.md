# Splinty Enterprise SDLC Multi-Agent Scrum Tool Design Research

## Current Splinty baseline from the uploaded code

Based on inspection of your uploaded `packages.zip`, Splinty is already structured like a serious enterprise platform foundation (not a toy agent demo). You have a TypeScript monorepo split into clear “platform layers”:

- **Core domain + orchestration** (`@splinty/core`): state machines, architecture planning/enforcement primitives, sandbox abstractions, project memory, telemetry, and governance-like service guards.
- **Persona agents** (`@splinty/agents`): explicit agent personas (Business Owner, Product Owner, Architect, Developer, QA, etc.) and provider clients.
- **API layer** (`@splinty/api`): Bun server, JWT auth, RBAC enforcement, SSE sprint streaming, audit/webhooks, and hardened middleware patterns.
- **Persistence** (`@splinty/db`): Postgres + Drizzle, repositories, and schema modules that already include governance-adjacent tables like `artifact_versions`, `artifact_evaluations`, `artifact_lineage`, and promotion stage transition primitives.
- **Web UI** (`@splinty/web`): React + Vite with authenticated pages (dashboard, analytics, project views, sprint viewer).
- **Integrations** (`@splinty/integrations`): Jira/GitHub/file adapters.

This is consistent with the “two-plane” architecture you’ve been emphasizing: a **Control Plane** (governance, contracts, approvals, auditability) and an **Execution Plane** (agents running constrained work). That separation is the correct direction for enterprise adoption because it enables strong controls without rewriting the entire execution engine.

The gap between “already strong” and “convert ANY idea into a production-ready enterprise application” is not primarily “more agents.” It is: **stronger contract artifacts, better evaluation evidence, stronger supply-chain/security defaults, and operational readiness (runbooks, observability, rollback, provenance).** The rest of this report defines the exact component design needed to make each SDLC phase reliably deliverable at enterprise quality.

## What Scrum is and what your system must do to implement Scrum correctly

Scrum is formally defined in **entity["book","The Scrum Guide","november 2020 edition"]** by **entity["people","Ken Schwaber","scrum co-creator"]** and **entity["people","Jeff Sutherland","scrum co-creator"]**. In that definition, Scrum is a lightweight framework for generating value through adaptive solutions to complex problems, built on empiricism and lean thinking, and structured around a small Scrum Team with specific accountabilities and events. citeturn13view0

Scrum has:
- **Three accountabilities**: Product Owner, Scrum Master, Developers. citeturn13view0  
- **Five events**: Sprint (container), Sprint Planning, Daily Scrum, Sprint Review, Sprint Retrospective. citeturn13view0  
- **Three artifacts**: Product Backlog, Sprint Backlog, Increment. citeturn14view0  
- **Artifact commitments** (2020 update): Product Goal (for Product Backlog), Sprint Goal (for Sprint Backlog), Definition of Done (for Increment). citeturn14view0  

A key point many SDLC tools get subtly wrong: **Sprint Review is not a release gate.** The Scrum Guide explicitly states: “The Sprint Review should never be considered a gate to releasing value.” citeturn14view0  
That does *not* mean enterprises never have gates. It means:
- Scrum’s empirical cycle must remain intact (inspect/adapt each sprint).
- Release governance (security, compliance, approvals) should be implemented as a **separate overlay** that can run continuously, not as “Scrum itself.”

This aligns with what **entity["company","Atlassian","software company"]** teaches in its Scrum guidance: the cadence (planning → daily alignment → review → retro) exists to reinforce transparency, inspection, and continuous improvement. citeturn0search1turn0search9turn0search10

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Scrum framework diagram sprint planning daily scrum sprint review retrospective","Scrum artifacts product backlog sprint backlog increment diagram","Jira scrum board sprint workflow diagram"],"num_per_query":1}

## Multi-agent systems: the power, the pain points, and what enterprise controls are non-negotiable

A multi-agent system is not “one smart prompt.” It is an orchestrated architecture where multiple specialized agents (separate roles, separate contexts, separate tool permissions) collaborate via explicit handoffs and shared artifacts.

The *best* evidence for what multi-agent systems are good at and where they break comes from entity["company","Anthropic","ai company"]’s write-up of how they built a multi-agent research system:
- Multi-agent systems help primarily by increasing “capacity” (tokens, tool calls, parallelism) beyond what one agent can hold at once. citeturn2search6  
- They can be dramatically more expensive: Anthropic reports multi-agent systems often use **~15× more tokens than chats** (and agents in general ~4× more than chats). citeturn2search6  
- Coordination is a real weakness: in practice they note many domains (including most coding tasks) have fewer truly parallelizable tasks, and real-time delegation/coordination remains hard. citeturn2search6  

Those pain points map directly to enterprise concerns:
- **Cost predictability** must be enforced with token budgets, iteration caps, and stop conditions.
- **Non-determinism** must be controlled with structured outputs and reproducible evals.
- **Tool risk** must be controlled with allowlists, sandboxing, and approvals.
- **Prompt injection** is not hypothetical; it is a routinely tested and measured threat. Anthropic reports prompt-injection blocking improvements with safety systems, showing this is a first-class risk category. citeturn1search0  

Modern agent platform guidance converges on the same core controls:
- **Don’t let untrusted text directly drive tool actions.** Extract and validate structured fields first. citeturn2search0  
- **Use tool approvals for high-risk operations** (human-in-the-loop), especially when tools can cause side effects. citeturn2search0  
- **Use sandboxing / isolation boundaries** to reduce the blast radius of tool execution and prompt injection. citeturn1search6turn2search8  

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["multi-agent system architecture diagram orchestrator specialized agents","LLM agent tool use sandboxing diagram","stage gate governance pipeline diagram for software delivery"],"num_per_query":1}

## Exact component design required for each SDLC phase to be enterprise-deliverable

This section is the “master blueprint”: what each component must produce, what it consumes, and what evidence proves it’s done. The design uses Scrum correctly (empirical iteration), while adding an enterprise governance overlay (security/compliance/provenance) that does not distort Scrum.

### The core architectural principle

Split Splinty into three interacting planes:

- **Product Plane (Scrum plane):** backlog → sprint planning → increments → retrospective learning
- **Governance Plane (enterprise overlay):** policy, approvals, evaluations, stage promotions, rollback, audit
- **Execution Plane:** constrained agent work, tools, sandboxes, CI runners

This separation is how you reconcile “Scrum is not a release gate” with “enterprise delivery needs gated governance.” citeturn14view0turn8search11

### Component-by-component design contract

The following table is the exact contract you want (each row is a “must exist” component). Where relevant, the design explicitly bakes in modern agent reliability practices: structured outputs, trace grading, evaluator loops, and strong security controls. citeturn2search1turn12search5turn1search3turn1search5

| SDLC / Scrum phase | Component (system responsibility) | Inputs | Outputs (must be versioned artifacts) | “Done” evidence (enterprise) |
|---|---|---|---|---|
| Intake → Product Goal | **Idea Intake + Discovery** (Affective Interviewer + Constraint Extractor) | User idea + org constraints + domain context | Problem statement, success metrics, personas, risk register, initial Product Goal | Structured requirement capture; explicit assumptions; trace-grade “clarity” & “constraints captured” |
| Product Backlog | **Backlog & Roadmap Manager** | Product Goal + discovered requirements | Epics, stories, acceptance criteria, dependencies, prioritization rationale | Backlog items are refined enough for selection; ownership/accountability set (PO) citeturn14view0 |
| Sprint Planning | **Sprint Planner + Decomposer** | Prioritized backlog, capacity/velocity, dependency graph | Sprint Goal + sprint backlog + task plan; run-contract templates per task | Sprint backlog traceable to goals; task boundaries defined; max retries/timeouts specified citeturn14view0 |
| Architecture / Design | **Architecture Authority** (Architect + Architecture Planner agents + ADR generator) | Requirements + constraints + existing system context | Architecture Plan, ADRs, API spec, data model, threat model | Architecture meets org standards; threat model & security requirements included (SSDF/SAMM alignment) citeturn8search11turn10search11 |
| Implementation | **Execution Orchestrator** (role agents + workspace isolation) | Task plans + run contracts + tool allowlists | Code changes, tests, docs, migration scripts | Reproducible tool traces; strict tool permissions; sandboxed execution boundaries citeturn2search0turn1search6turn2search8 |
| Verification | **Evidence & Verification Engine** | Build logs, test results, scans, eval outputs | Evidence bundles, verification reports, security posture report | Tests pass; security scans run; evidence attached to artifacts; trace grading pinpoints failures citeturn12search5turn1search5 |
| Release governance | **Promotion Pipeline / Stage Gates** | Verified artifacts + evidence bundles | Stage transition records, approvals, rollback points | Human approvals for high-risk gates; auto-pass allowed only when thresholds met; audit trail complete citeturn8search11turn10search11 |
| Delivery | **Release Packaging & Provenance** | Release candidate + build outputs | Signed artifacts, SBOMs, provenance attestations | SBOM (CycloneDX/SPDX) + provenance (SLSA) + signing (Sigstore) verified citeturn10search2turn10search10turn8search14turn9search5 |
| Operate & Learn | **Observability + Retrospective Learning** | Runtime telemetry + incidents + user feedback | Dashboards, postmortems, updated standards/policies | Traces/metrics/log correlation via OpenTelemetry; retro outputs feed backlog and policy updates citeturn8search2turn8search0 |

### What this implies for Splinty’s artifact model

To “turn any idea into an enterprise app,” Splinty must treat *everything* as versioned artifacts with lineage, including non-code artifacts. This is not optional; it’s how you get reproducibility and auditability.

Minimum canonical artifacts:
- Product Goal, Epics, Stories, Sprint Backlog, Increment
- Requirements Set + Non-Functional Requirements (NFRs)
- Architecture Plan + ADRs + Threat Model
- Implementation Plan (task graph) + Run Contracts
- Evidence Bundle (tests, scans, approvals, evals)
- Release Candidate + Delivery Record + Post-delivery Review

This design cleanly aligns with secure SDLC frameworks. For example, entity["organization","NIST","us standards agency"]’s SSDF exists specifically because many SDLC models do not address security in detail, and the practices must be integrated into any SDLC implementation. citeturn8search11turn8search5  

### What “enterprise production ready” requires beyond passing tests

Enterprise-grade delivery increasingly requires supply-chain transparency and provenance:
- **SBOM formats** such as CycloneDX and SPDX exist specifically to communicate component inventories and related provenance/license/security information. citeturn10search2turn10search10  
- **SLSA provenance** exists to describe where/when/how artifacts were produced as part of a secure supply chain. citeturn8search14turn8search13  
- **Sigstore’s model** (short-lived certs + transparency log) is a widely adopted pattern for auditable signing without long-lived key management. citeturn9search5turn9search2  

This is exactly the kind of evidence bundle that a promotion gate should require when you want “enterprise-grade” to mean something measurable.

## Best practices for effective agents and affective models

### Effective agent design patterns you should hard-require

Modern platform guidance converges on a handful of practices that matter more than “which model is smartest.”

**Use structured outputs for all irreversible steps.**  
When an agent is deciding: “what tasks exist,” “what routes are required,” “what permissions do I need,” you want schema-constrained outputs, not free-form text. OpenAI’s structured outputs are designed explicitly to constrain model outputs to developer-supplied schemas, improving reliability for tool interoperability. citeturn2search1

**Instrument everything and evaluate with traces, not vibes.**  
Trace grading exists specifically to score the end-to-end trace (tool calls, decisions) so you can pinpoint where agents fail and improve the orchestration. citeturn12search5turn2search3  
This is central to making Splinty improvable over time instead of “works in demo, drifts in reality.”

**Use evaluator-optimizer loops in narrowly scoped places.**  
DecodingAI’s workflows highlight an evaluator-optimizer loop as the closest reliable “agent-like” feedback loop, while warning about infinite loops and the need for stop conditions. citeturn1search3turn1search5  
In Splinty, evaluator loops belong in:
- story refinement quality
- architecture plan critique
- test plan completeness
- security report interpretation  
…but only with hard retry caps and deterministic stop rules.

**Specialize agents and limit tool access aggressively.**  
Anthropic’s subagent guidance explicitly recommends focused subagents, detailed prompts, and limiting tool access to only what is needed. citeturn2search2  
This is strongly aligned with enterprise safety: smaller blast radius, more predictable behavior.

**Sandbox execution and isolate network/filesystem.**  
Anthropic’s Claude Code sandboxing write-up shows why filesystem and network isolation reduce risk from prompt injection and can reduce permission prompts while maintaining safety. citeturn1search6  
OpenAI similarly describes a hosted container “computer environment” for agent loops, including bounded outputs and parallel command execution as a way to keep runs fast and context-efficient. citeturn2search8

**Treat prompt injection as a design constraint, not an edge case.**  
OpenAI’s agent safety guidance emphasizes keeping tool approvals on, using guardrails, and designing workflows so untrusted data never directly drives agent behavior. citeturn2search0  
Anthropic’s transparency reporting explicitly treats prompt injection as a measured risk category. citeturn1search0  

### Affective models: why they matter in your specific product

“Convert ANY idea into an enterprise application” fails most often at **human requirement elicitation**, not at writing code. Ideas start ambiguous, emotional, contradictory, and incomplete.

This is where affective design helps: reduce user frustration, detect confusion, and adapt the interaction so the user can clarify intent without feeling punished.

The foundational argument comes from entity["organization","MIT Media Lab","cambridge ma us"] and entity["people","Rosalind W. Picard","affective computing researcher"]’s affective computing work: emotional signals influence decision making and effective interaction; systems can improve interaction by sensing affective cues and responding respectfully. citeturn1search4turn1search11turn1search1  

**How this applies to Splinty (without creepy sensing):**
- Use *textual* affect cues only (uncertainty, frustration, urgency) unless the user explicitly opts into more.
- Convert affect into *process adaptations*: ask clarifying questions, propose smaller first increment, surface assumptions, offer “two-option” decisions.
- Log affect-driven adaptations as explainable events (so operators can see why the system changed strategy).

This makes your “Business Owner / Product Owner” agents materially better at turning an idea into a backlog that can actually be sprinted.

## Best tech stack by architecture layer for an SDLC multi-agent Scrum platform

This is a “best current practice” stack design for Splinty-like platforms in 2026. It emphasizes enterprise controls, reproducibility, and extensibility.

### Agent integration and enterprise tool connectivity

Adopt **Model Context Protocol (MCP)** as a first-class integration mechanism. Anthropic describes MCP as an open protocol for standardizing how applications provide context/tools to LLMs (a “USB‑C port” analogy). citeturn11search3  
This matters because enterprise SDLC tools live and die by connectors (Jira, GitHub/GitLab, CI/CD, security scanners, observability, docs).

### Observability and auditability as a platform guarantee

Standardize on **OpenTelemetry** for traces/metrics/logs so operator workflows are correlated by trace context across the entire platform. entity["organization","OpenTelemetry","cncf observability project"]’s spec emphasizes correlation of logs with traces via trace/span IDs and unified signal pipelines. citeturn8search0turn8search2  
This is especially important in agentic systems because “what happened” is the product.

### Secure SDLC and supply chain defaults

Hard-wire secure SDLC practices into Splinty’s gates:
- Use SSDF as the baseline secure-SDLC vocabulary and add AI-specific controls using NIST’s generative AI SSDF profile. citeturn8search11turn8search5  
- Use OWASP SAMM to structure software assurance maturity across governance/design/implementation/verification/operations. citeturn10search11  
- Require SBOM generation and provenance attestations at release gates, using CycloneDX or SPDX. citeturn10search2turn10search10  
- Sign releases with a transparency-backed model like Sigstore (keyless or hybrid). citeturn9search5turn9search10  

### Recommended “golden path” generated-app stack

If Splinty is going to produce enterprise apps, you want **one default stack** that is extremely well supported with templates, tests, and policies (then expand later). Most agent platforms fail because they try to support 10 stacks early and master none.

A strong default template family:
- **Frontend:** React + TypeScript (optionally Next.js for SSR/security headers/edge caching if needed).
- **Backend:** TypeScript (Fastify/Nest-style modular monolith first; microservices only with explicit justification).
- **Data:** Postgres; migrations; event outbox for integrations.
- **Auth:** OIDC (enterprise), plus local dev JWT.
- **Observability:** OpenTelemetry + structured logs.
- **CI/CD:** pipeline that produces SBOM + provenance + signed artifacts.
- **Security:** SAST + dependency scanning + IaC scanning, enforced by promotion gates.

Splinty can still be Bun/TypeScript internally; the generated “golden path” apps can be TypeScript too, which reduces cognitive load and improves the platform’s ability to automatically validate and patch.

## How to use OpenCode to develop Splinty into a production-ready application

entity["company","OpenCode","open source ai coding agent"] is directly relevant to your workflow because it provides agent sessions, permissions, plugins, and MCP connectivity as a development harness. citeturn5search5turn5search6  

### Configuration and guardrails

OpenCode supports project and global config (`opencode.json` / `opencode.jsonc`) with schema validation and model/provider selection. citeturn5search0turn5search2  
For enterprise-grade development, your default stance should be:
- **Plan agent:** “ask” or “deny” for edits and bash until a patch is reviewed.
- **Build agent:** allow edits but gate destructive bash (rm, git push) behind explicit approval prompts.

OpenCode’s permission system supports allow/ask/deny, wildcard matching, and per-agent overrides. citeturn6search0turn6search1  

### Plugins as enforcement tools

OpenCode plugins can hook into tool execution and other events (sessions, messages, permissions, tool hooks). The plugin docs provide explicit event names (e.g., `tool.execute.before`, `permission.asked`, `session.compacted`) and show examples like `.env` protection. citeturn7view0  
This is ideal for Splinty development because you can enforce:
- “never read `.env`”
- “never run `git push`”
- “run tests before marking a task complete”
- “auto-capture evidence artifacts into a folder”

### MCP servers for enterprise integrations in the dev harness

OpenCode supports configuring MCP servers and warns about context/token costs, which is critical as integrations grow. citeturn11search0  
It also documents OAuth handling for remote MCP servers, including automatic flows and token storage. citeturn11search0  
This is the cleanest way to make Splinty development “integration-real” without hardcoding credentials into agent prompts.

### Orchestration layer

entity["organization","Oh My OpenCode","opencode orchestration layer"] positions itself as an orchestration layer that wraps OpenCode with opinionated agents/hooks/MCP configuration for more reliable multi-agent workflows. citeturn6search8  
That suggests an effective “meta-stack” for building Splinty:
- OpenCode = runtime + permissions + plugin/events + MCP
- Oh My OpenCode = multi-agent orchestration behavior
- Splinty = the product you’re shipping (its own governance + SDLC engine)

## What you may be missing or wrongfully assuming

The most important correction: **no system can be “100% accurate” at SDLC delivery** because SDLC includes irreducible uncertainty (requirements change, users disagree, dependencies break, environments differ). What you *can* do is make Splinty:
- **correct by construction** for contracts,
- **measurable** via evaluations and evidence,
- **fail-safe** via gates and rollback,
- **auditable** via traceability and provenance.

Here are the most common hidden gaps in “idea → enterprise app” agent platforms, mapped to concrete fixes:

**Assuming LLM-based evaluation is equivalent to quality.**  
Structured outputs and LLM evals improve format reliability and speed, but models can still be wrong “inside the schema.” OpenAI’s structured outputs announcement explicitly notes that schema correctness does not prevent value-level mistakes. citeturn2search1  
Fix: use LLM evals as *one* signal, alongside deterministic tests, security scans, and policy checks.

**Assuming multi-agent automatically means better.**  
Anthropic’s data shows multi-agent systems are far more token-expensive and not always a fit when work isn’t parallelizable (frequent in coding). citeturn2search6  
Fix: hybrid architecture: workflow patterns (sequential + parallel subsets) by default, full agent autonomy only where value justifies cost. citeturn1search17turn1search3  

**Assuming governance is only approvals.**  
Enterprise governance is also: secure SDLC practices, supply-chain policy, auditability, and operational readiness. NIST explicitly frames SSDF as necessary because typical SDLC models omit security detail. citeturn8search11  
Fix: bake SSDF/SAMM-aligned checks into your stage gates. citeturn10search11  

**Assuming Scrum and gates are the same thing.**  
They are not. Scrum Guide explicitly rejects Sprint Review as a release gate. citeturn14view0  
Fix: keep Scrum empirical; implement governance as a separate promotion overlay.

**Assuming integrations are “nice to have.”**  
Real enterprise SDLC is systems work (Jira/GitHub/CI/Security/Observability). MCP exists to standardize tool connectivity across many systems. citeturn11search3turn11search0  
Fix: treat integrations as first-class tools with explicit contracts, costs, and permissions.

**Assuming “production-ready” ends at deployment.**  
Production readiness includes ongoing observability, correlation, incident response, and runbooks. OpenTelemetry’s spec emphasizes unified correlation and standardized context propagation across logs/traces/metrics because fragmented telemetry makes operations fragile. citeturn8search0turn8search2  
Fix: mandate OpenTelemetry signals and produce operator runbooks as artifacts tied to release gates.

**Assuming your platform can claim enterprise trust without provenance.**  
Modern expectations increasingly include SBOMs and provenance. SPDX and CycloneDX exist to standardize SBOM communication, and SLSA provenance exists specifically to trace how artifacts were produced. citeturn10search10turn10search2turn8search14  
Fix: require SBOM + provenance + signing at release promotion gates. citeturn9search5