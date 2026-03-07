# Splinty

An AI-powered SCRUM sprint pipeline CLI. Feed Splinty a backlog of stories from a file, Jira, or GitHub Issues and it runs each story through a chain of AI agents — Business Owner → Product Owner → Architect → Developer → QA Engineer — committing code to a branch and opening a pull request automatically.

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
- [Story File Formats](#story-file-formats)
- [Pipeline Stages](#pipeline-stages)
- [Exit Codes](#exit-codes)
- [Development](#development)

---

## Prerequisites

- [Bun](https://bun.sh) v1.3+
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

```
To connect Splinty to GitHub Copilot:
  1. Open: https://github.com/login/device
  2. Enter code: ABCD-1234

Waiting for authorization...
GitHub Copilot authorization successful.
```

The resulting token is stored at `~/.splinty/copilot-token.json` and reused on all subsequent runs — you do not need to re-authenticate unless the token is revoked.

#### Step 2 — Use `GitHubCopilotClient` in your code

```typescript
import { GitHubCopilotClient } from '@splinty/agents';
import { SprintOrchestrator } from '@splinty/agents';

const copilot = new GitHubCopilotClient(); // reads token from ~/.splinty/copilot-token.json

const orch = new SprintOrchestrator({
  projectId: 'my-app',
  defaultClient: copilot,  // use Copilot for all agents
});
```

Per-agent overrides are also supported — e.g. run QA on Copilot and everything else on Anthropic:

```typescript
import { AgentPersona } from '@splinty/core';

const orch = new SprintOrchestrator({
  projectId: 'my-app',
  clients: {
    [AgentPersona.QA_ENGINEER]: new GitHubCopilotClient(),
  },
  // all other agents fall back to AnthropicClient (reads ANTHROPIC_API_KEY)
});
```

#### Re-authenticating

```bash
splinty auth          # no-op if already authenticated
splinty auth --force  # force a new device flow even if a token exists
splinty auth --logout # remove the stored token
```

#### Token storage

| Path | Contents |
|---|---|
| `~/.splinty/copilot-token.json` | Cached OAuth access token |

The token grants `read:user` scope. It does not expire on a fixed schedule, but GitHub can revoke it at any time (e.g. if you revoke the app in your [GitHub settings](https://github.com/settings/apps/authorizations)). If a request returns `401`, Splinty clears the cached token and tells you to run `splinty auth` again.

---

## Commands

### init

Create a project workspace. Must be run before `run` or `status`.

```
splinty init --name <project-name>
```

| Flag     | Required | Description                     |
|----------|----------|---------------------------------|
| `--name` | Yes      | Unique project identifier       |

**Example:**
```bash
splinty init --name my-app
```

Creates `.splinty/my-app/` and prints the env vars you need to set.

---

### run

Load stories from a source and run the full AI pipeline.

```
splinty run --source <file|jira|github> --input <path|board-id|owner/repo> [--project <id>]
```

| Flag        | Required | Description                                                       |
|-------------|----------|-------------------------------------------------------------------|
| `--source`  | Yes      | `file`, `jira`, or `github`                                       |
| `--input`   | Yes      | File path, Jira board ID, or GitHub `owner/repo`                  |
| `--project` | No       | Project ID to use (default: `"default"`)                          |

Stories are processed **concurrently**. A failure in one story does not block the others.

**Examples:**
```bash
# Run from a Markdown story file
splinty run --source file --input stories/sprint1.md --project my-app

# Run from a Jira board
splinty run --source jira --input PROJECT-123 --project my-app

# Run from GitHub Issues
splinty run --source github --input owner/my-repo --project my-app
```

**Output:**
```
Running pipeline for 3 story/stories...
  ✓ story-001  branch: story/story-001  PR: https://github.com/owner/repo/pull/42
  ✓ story-002  branch: story/story-002
  ✗ story-003  BLOCKED
```

---

### status

Print the current sprint board for a project.

```
splinty status [--project <id>]
```

| Flag        | Required | Description                          |
|-------------|----------|--------------------------------------|
| `--project` | No       | Project ID (default: `"default"`)    |

**Example:**
```bash
splinty status --project my-app
```

**Output:**
```
Sprint board — project: my-app

ID                    Title                                               State                 Updated
------------------------------------------------------------------------------------------------------
story-001             As a user, I want to log in...                      PR_OPEN               2026-03-07
story-002             As a user, I want to reset my password...           IN_REVIEW             2026-03-07
story-003             As a user, I want to view my profile...             BLOCKED               2026-03-07
```

**Story states:** `RAW` → `EPIC` → `USER_STORY` → `REFINED` → `SPRINT_READY` → `IN_PROGRESS` → `IN_REVIEW` → `DONE` → `PR_OPEN` → `MERGED`

---

## Story File Formats

### Markdown (`.md`)

One or more stories per file. Use `## Story: <title>` or `## <title>` as a heading.

```markdown
## Story: As a user, I want to log in so I can access my account
Allow users to authenticate with email and password using JWT tokens.

### Acceptance Criteria
- Given valid credentials, When I submit the login form, Then I receive a JWT token
- Given invalid credentials, When I submit, Then I see an error message
- Given an expired token, When I make a request, Then I am redirected to login
```

### JSON (`.json`)

An array of story objects. `id`, `title`, and `description` are required.

```json
[
  {
    "id": "story-001",
    "title": "User login",
    "description": "Allow users to authenticate with email and password.",
    "acceptanceCriteria": [
      "Given valid credentials, I receive a JWT token",
      "Given invalid credentials, I see an error"
    ]
  }
]
```

### YAML (`.yaml` / `.yml`)

An array of story objects in YAML format.

```yaml
- id: story-001
  title: User login
  description: Allow users to authenticate with email and password.
  acceptanceCriteria:
    - Given valid credentials, I receive a JWT token
    - Given invalid credentials, I see an error
```

---

## Pipeline Stages

Each story passes through a sequential chain of AI agents:

| Step | Agent           | Transition                           | Description                                                   |
|------|-----------------|--------------------------------------|---------------------------------------------------------------|
| 1    | BusinessOwner   | RAW → EPIC                           | Refines the raw idea into a well-scoped epic                  |
| 2    | ProductOwner    | EPIC → USER_STORY                    | Breaks the epic into actionable user stories                  |
| 3    | Orchestrator    | USER_STORY → REFINED → SPRINT_READY  | Automatic validation and sprint-readiness transitions         |
| 4    | Architect       | SPRINT_READY → IN_PROGRESS           | Produces a technical design and implementation plan           |
| 5    | SoundEngineer   | *(conditional)*                      | Runs only for audio-domain stories (when flagged by Architect)|
| 6    | Developer       | IN_PROGRESS → IN_REVIEW              | Writes code and commits it to a feature branch                |
| 7    | QA Engineer     | IN_REVIEW → DONE                     | Up to 3 QA cycles; `FAIL` triggers a Developer rework pass    |
| 8    | Orchestrator    | DONE → PR_OPEN                       | Opens a pull request (when GitHub integration is configured)  |

If QA returns `BLOCKED` after 3 attempts, the story is marked **BLOCKED** and the pipeline moves on to the next story.

---

## Exit Codes

| Code | Meaning                                                   |
|------|-----------------------------------------------------------|
| `0`  | All stories succeeded                                     |
| `1`  | One or more stories BLOCKED                               |
| `2`  | Fatal error (missing args, misconfiguration, unrecoverable failure) |

---

## Development

```bash
# Run all tests
bun test

# Run tests with coverage
bun test --coverage

# Build all packages
bun run build
```

Tests do not require a live LLM — all agent calls use mocked responses.
