# Splinty

An AI-powered SCRUM sprint pipeline CLI. Feed Splinty a backlog of stories from a file, Jira, or GitHub Issues and it runs each story through a chain of AI agents — from Architecture Planning to QA and Documentation — committing code to a branch and opening a pull request automatically.

---

## Table of Contents

- [Getting Started: Enterprise Application Walkthrough](#getting-started-enterprise-application-walkthrough)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [LLM Providers](#llm-providers)
  - [Anthropic (default)](#anthropic-default)
  - [GitHub Copilot](#github-copilot)
- [Commands](#commands)
  - [init](#init)
  - [run](#run)
  - [status](#status)
  - [auth](#auth)
  - [export](#export)
- [Story File Formats](#story-file-formats)
- [Pipeline Stages](#pipeline-stages)
- [Enterprise Features](#enterprise-features)
- [Architecture](#architecture)
- [Exit Codes](#exit-codes)
- [Development](#development)

---

## Prerequisites

- [Bun](https://bun.sh) v1.3+
- [Docker](https://www.docker.com/) (required for sandbox execution)
- An [Anthropic API key](https://console.anthropic.com/) (required — all agents use Claude)
- Jira credentials (only for `--source jira`)
- A GitHub personal access token (only for `--source github`)

---

## Installation

```bash
git clone <repo-url>
cd splinty
bun install
```

Bun runs TypeScript directly — no build step is required to use the CLI.

**Run via Bun:**
```bash
bun run packages/cli/src/index.ts <command> [options]
```

**Or link as a global `splinty` binary:**
```bash
bun link
splinty <command>
```

---

## Configuration

Copy `.env.example` to `.env` and fill in the values for your environment:

```bash
cp .env.example .env
```

| Variable              | Required             | Description                                      |
|-----------------------|----------------------|--------------------------------------------------|
| `ANTHROPIC_API_KEY`   | Always               | Claude API key (`sk-ant-...`)                    |
| `JIRA_BASE_URL`       | `--source jira`      | Jira instance URL (e.g. `https://company.atlassian.net`) |
| `JIRA_EMAIL`          | `--source jira`      | Jira account email                               |
| `JIRA_API_TOKEN`      | `--source jira`      | Jira API token                                   |
| `GITHUB_TOKEN`        | `--source github`    | GitHub personal access token (`ghp_...`)         |
| `SPLINTY_WORKSPACE_DIR` | No                 | Where workspaces and the sprint ledger are stored (default: `.splinty`) |

---

## LLM Providers

Splinty supports two LLM backends. The default is Anthropic (Claude). GitHub Copilot is an alternative that uses your existing paid Copilot subscription — no separate API key required.

### Anthropic (default)

Set `ANTHROPIC_API_KEY` in your `.env`. No further setup needed — all agents use Claude by default.

### GitHub Copilot

Splinty authenticates to the GitHub Copilot API using the same **OAuth device flow** as OpenCode and the GitHub CLI. This requires a paid Copilot subscription (Pro, Pro+, Business, or Enterprise).

#### Step 1 — Authenticate

Run the auth flow once. Splinty will print a URL and a one-time code:

```bash
splinty auth
```

The resulting token is stored at `~/.splinty/copilot-token.json` and reused on all subsequent runs.

#### Step 2 — Configure Orchestrator

```typescript
import { GitHubCopilotClient, SprintOrchestrator } from '@splinty/agents';

const orch = new SprintOrchestrator({
  projectId: 'my-app',
  defaultClient: new GitHubCopilotClient(),
});
```

---

## Commands

### init

Create a project workspace. Must be run before `run` or `status`.

```bash
splinty init --name <project-name>
```

### run

Load stories from a source and run the full AI pipeline.

```bash
splinty run --source <file|jira|github> --input <path|board-id|owner/repo> [--project <id>]
```

Stories are processed concurrently according to their `dependsOn` graph.

### status

Print the current sprint board for a project.

```bash
splinty status [--project <id>]
```

### auth

Manage GitHub Copilot authentication.

```bash
splinty auth [--force] [--logout]
```

### export

Export sprint telemetry and metrics for analysis.

```bash
splinty export --format=json --sprint=<id>
```

---

## Getting Started: Enterprise Application Walkthrough

This section walks through building a real enterprise application end-to-end with Splinty.

### 1. Prerequisites

- **Bun** v1.3+ (`curl -fsSL https://bun.sh/install | bash`)
- **Docker** (running) — required for sandbox execution
- An **Anthropic API key** (`sk-ant-...`) or a paid **GitHub Copilot** subscription

### 2. Install

```bash
git clone <repo-url>
cd splinty
bun install
bun link          # exposes `splinty` as a global command
```

### 3. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
# Optional: SPLINTY_WORKSPACE_DIR=.splinty
```

If you prefer GitHub Copilot instead of Anthropic, run the one-time auth flow:

```bash
splinty auth
```

### 4. Initialize a Project

```bash
splinty init --name my-enterprise-app
```

This creates a workspace and sprint ledger under `.splinty/`.

### 5. Write Your Stories

Create a YAML (or Markdown/JSON) backlog file. Use `dependsOn` to express ordering:

```yaml
# backlog.yaml
- id: auth-db-schema
  title: Auth database schema
  description: Create users and sessions tables with indexes.
  acceptanceCriteria:
    - Schema includes users(id, email, password_hash, created_at)
    - Schema includes sessions(id, user_id, token, expires_at)

- id: auth-api
  title: Auth REST API
  description: Implement /register and /login endpoints using JWT.
  dependsOn: ["auth-db-schema"]
  acceptanceCriteria:
    - POST /register returns 201 with a JWT on success
    - POST /login returns 200 with a JWT on valid credentials

- id: product-catalog
  title: Product catalog service
  description: CRUD API for products with Postgres persistence.
  acceptanceCriteria:
    - GET /products returns paginated list
    - POST /products creates a product
```

Stories with no `dependsOn` run concurrently. Dependent stories wait automatically.

### 6. Run the Pipeline

```bash
splinty run --source file --input backlog.yaml --project my-enterprise-app
```

Each story passes through the full 12-agent pipeline (see [Pipeline Stages](#pipeline-stages)).

### 7. Enterprise Customization (Optional)

**Custom pipeline** — restrict which agents run and configure retries/timeouts:

```typescript
const pipeline: PipelineConfig = {
  steps: [
    { agent: 'ARCHITECT', timeout: 300_000 },
    { agent: 'DEVELOPER', retries: 2 },
    { agent: 'QA_ENGINEER' }
  ]
};
```

**Human-in-the-loop gates** — pause for manual approval before critical steps:

```typescript
const gate: GateConfig = {
  after: 'ARCHITECT',
  requireApproval: 'on-cross-service',
  notifyVia: 'cli-prompt'
};
```

**Multi-service support** — manage up to 4 services per project:

```typescript
const service: ServiceDefinition = {
  name: 'auth-api',
  path: './services/auth',
  guardrails: { maxServicesPerProject: 4 }
};
```

**Jira or GitHub Issues as source** instead of a local file:

```bash
splinty run --source jira --input your-board-id
splinty run --source github --input owner/repo
```

### 8. Monitor and Export

```bash
splinty status --project my-enterprise-app      # live sprint board
splinty export --format=json --sprint=<id>      # telemetry: token usage, cost, durations
```

### What Splinty Produces

For each story, the pipeline outputs:

| Artifact | Description |
|---|---|
| Source code | Committed to a feature branch via incremental diff patches |
| SQL migrations | `.up.sql`, `.down.sql`, and optional seed files |
| Dockerfiles | Per-service container definitions |
| `docker-compose.yml` | Multi-service local orchestration |
| GitHub Actions CI | Ready-to-use workflow file |
| Integration tests | Cross-service test scripts |
| Documentation | Updated READMEs and technical docs |
| Sprint telemetry | JSON artifact with cost, duration, and token metrics |

---

## Story File Formats

Splinty supports Markdown, JSON, and YAML. Stories can define dependencies to ensure correct execution order.

```yaml
- id: story-001
  title: User login
  description: Allow users to authenticate with email and password.
  dependsOn: ["auth-provider-setup"]
  acceptanceCriteria:
    - Given valid credentials, I receive a JWT token
```

---

## Pipeline Stages

Each story passes through a chain of AI agents. The sequence is configurable via `PipelineConfig`.

| Step | Agent | Description |
|------|-------|-------------|
| 1 | `ORCHESTRATOR` | Manages the overall lifecycle and state transitions. |
| 2 | `ARCHITECTURE_PLANNER` | Generates global L0 and sprint L2 architecture plans. |
| 3 | `BUSINESS_OWNER` | Refines raw ideas into well-scoped epics. |
| 4 | `PRODUCT_OWNER` | Breaks epics into actionable user stories. |
| 5 | `ARCHITECT` | Produces technical designs and implementation plans. |
| 6 | `MIGRATION_ENGINEER` | Generates SQL migrations (up/down) and seed data. |
| 7 | `INFRASTRUCTURE_ENGINEER` | Generates Dockerfiles, CI configs, and deploy manifests. |
| 8 | `DEVELOPER` | Writes code using incremental diff patches in a Docker sandbox. |
| 9 | `SOUND_ENGINEER` | Handles specialized audio-domain tasks when required. |
| 10 | `QA_ENGINEER` | Verifies implementation via automated tests in the sandbox. |
| 11 | `INTEGRATION_TEST_ENGINEER` | Generates and executes cross-service integration tests. |
| 12 | `TECHNICAL_WRITER` | Updates documentation and READMEs based on changes. |

---

## Enterprise Features

### Config-Driven Pipeline
Define custom agent sequences, retry logic, and timeouts.

```typescript
const pipeline: PipelineConfig = {
  steps: [
    { agent: 'ARCHITECT', timeout: 300000 },
    { agent: 'DEVELOPER', retries: 2, condition: (context) => !context.isBlocked }
  ]
};
```

### Multi-Service Support
Manage complex architectures with up to 4 services per project.

```typescript
const service: ServiceDefinition = {
  name: 'auth-api',
  path: './services/auth',
  guardrails: { maxServicesPerProject: 4 }
};
```

### Human-in-the-Loop Gates
Insert approval steps for critical transitions like cross-service changes.

```typescript
const gate: GateConfig = {
  after: 'ARCHITECT',
  requireApproval: 'on-cross-service',
  notifyVia: 'cli-prompt'
};
```

### Infrastructure & Migration Agents
Automated generation of operational assets:
- **MigrationEngineer**: SQL files, seeds, and rollback scripts.
- **InfrastructureEngineer**: Dockerfiles, `docker-compose.yml`, and GitHub Actions.

### Multi-Container Integration Sandbox
Execute tests across multiple services using `DockerComposeIntegrationSandbox`. It handles orchestration, health checks, and cleanup automatically.

### Observability & Telemetry
Track performance with `StoryMetrics` including duration, token usage, and cost estimates. Sprints generate detailed telemetry artifacts.

```typescript
// Default retention: 5 sprints, no auto-archive
const retention: RetentionConfig = { maxSprints: 5, archiveExpired: false };
```

---

## Architecture

Splinty uses a **planned-sprint execution model**. Unlike simple story-by-story processing, the `ArchitecturePlannerAgent` creates a global technical vision and detailed sprint plans before implementation begins. This ensures that individual stories align with the overall project structure. The `ArchitectureEnforcer` module applies deterministic rules (dependency boundaries, file ownership) to prevent architectural drift without relying on LLM calls for every check.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | All stories succeeded |
| `1`  | One or more stories BLOCKED |
| `2`  | Fatal error or unrecoverable failure |

---

## Development

```bash
bun test           # Run all tests
bun test --coverage # Run tests with coverage
bun run build      # Build all packages
```

Tests use mocked LLM responses and do not require API keys.
