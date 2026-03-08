# Splinty

An AI-powered SCRUM sprint pipeline CLI. Feed Splinty a backlog of stories from a file, Jira, or GitHub Issues and it runs each story through a chain of AI agents — from Architecture Planning to QA and Documentation — committing code to a branch and opening a pull request automatically.

---

## Table of Contents

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
