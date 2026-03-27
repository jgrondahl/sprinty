# Draft: Splinty Full Platform Gap Analysis

## What the User Asked
"Anything else needed to make this splinty app a fully functional SCRUM team that can deliver any type of enterprise ready application when asked?"

## Research Completed
- Agent implementation maturity audit (all 12 agents)
- Sandbox & execution model audit
- Integration & external system maturity audit
- Industry research on production AI coding platforms

## What Splinty Has Today (Verified)

### PRODUCTION-READY ✅
- **SprintOrchestrator**: 1,752 LOC, 188 tests, full lifecycle, checkpoint/resume, plan revision, telemetry
- **ArchitecturePlannerAgent**: 875 LOC, 38 tests, 3-pass structured planning, validation, scoring
- **DeveloperAgent**: 636 LOC, 139 tests, sandbox loops, enforcement, git, diffs
- **QAEngineerAgent**: 313 LOC, 43 tests, verdict state machine, rework cycles
- **Docker Sandbox**: Real Docker via dockerode, resource limits, timeout, multi-service compose
- **Architecture Enforcer**: 4 deterministic rules (dependency-boundary, required-export, file-ownership, tech-compliance)
- **Diff/Patch System**: LCS-based, fuzzy matching, atomic fallback
- **Sprint State Machine**: Formal graph, validated transitions, responsible agents
- **Workspace Manager**: File-based, sandboxed per project/story, path-traversal protection
- **Jira Integration**: 422 LOC, full CRUD, ADF formatting, rate limiting, retry
- **GitHub Integration**: 155 LOC, Octokit, PR creation, branch management
- **Anthropic LLM Client**: SDK wrapper, model/temp/token config
- **GitHub Copilot Client**: 372 LOC, full RFC 8628 OAuth, token caching, multi-model
- **CLI**: 495 LOC, all 5 commands, source loading, provider detection
- **API**: 19 routes, RBAC, audit, webhooks, Zod validation

### FUNCTIONAL (NEEDS HARDENING) 🟡
- **MigrationEngineerAgent**: 152 LOC, 5 tests, no SQL validation, no retry loop
- **InfrastructureEngineerAgent**: 152 LOC, 4 tests, no YAML linting, no retry loop
- **IntegrationTestEngineerAgent**: 152 LOC, 4 tests, stub sandbox execution, no script validation

### PROTOTYPE ⚠️
- **Web UI**: 16 source files, 1 test, placeholder components, no design system

### NOT IMPLEMENTED ❌
- Token counting / cost tracking (schema exists, never populated)
- Streaming LLM responses
- Provider fallback (Anthropic → Copilot → error)
- AST-based code analysis (uses regex-only)
- Security scanning of generated code (SAST/DAST)
- Deterministic replay / action recording
- Confidence scoring / quality metrics per agent output
- Best-of-N candidate selection
- Semantic code search / RAG for large codebases
- Model capability detection / feature matrix
- Enterprise model governance (whitelists, per-stage routing with cost)
- BYOK / key management beyond env vars
- Self-fix / diagnosis agent
- Human escalation triggers based on confidence
- Setup scripts / workspace hooks
- Git pre-commit hooks in sandbox
- PR automation not wired in CLI (GitHubConnector exists but not connected)

## Industry Research Findings

### What separates "demo" from "production" (OpenHands, AutoCodeRover, SWE-Agent):
1. Sandboxed reproducibility with setup scripts + git hooks
2. Plugin/skill loading with org/project precedence
3. Model capability detection and per-stage routing
4. Cost tracking as a first-class artifact
5. Deterministic meta-orchestrator with immutable action-state records
6. Best-of-N candidate selection with reviewer agents
7. AST-based validation (tree-sitter) + test execution in sandbox
8. Security analyzer integration with confirmation policies
9. Self-fix/replay loops from failure points
10. Structured code search APIs (search_method, search_class) vs raw file context

## Open Questions
- What kind of applications does the user want Splinty to deliver? (web apps, APIs, CLI tools, mobile?)
- What languages/runtimes beyond TypeScript/Node?
- What scale of codebases? (greenfield vs 100K+ LOC existing repos?)
- What's the deployment target? (Docker, K8s, serverless, VMs?)
- What's the team size and who operates Splinty?
- What level of human oversight is expected?

## Scope Boundaries
- INCLUDE: Platform capabilities needed for autonomous enterprise app delivery
- EXCLUDE: Specific application domain knowledge (Splinty shouldn't know about accounting, healthcare, etc.)
