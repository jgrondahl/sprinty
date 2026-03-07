#!/usr/bin/env bun
/**
 * Splinty CLI — sprint orchestrator command-line interface
 *
 * Commands:
 *   splinty init --name <project-name>
 *   splinty run --source <file|jira|github> --input <path|board-id|repo>
 *   splinty status [--project <project-id>]
 *   splinty --help
 *
 * Exit codes:
 *   0  success
 *   1  any story BLOCKED
 *   2  fatal error
 */

import * as path from 'path';
import * as fs from 'fs';
import { LedgerManager } from '@splinty/core';
import { SprintOrchestrator, GitHubCopilotClient } from '@splinty/agents';
import { FileConnector, JiraConnector, GitHubConnector } from '@splinty/integrations';

// ─── ANSI colors ──────────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const RESET  = '\x1b[0m';

function green(s: string)  { return `${GREEN}${s}${RESET}`; }
function yellow(s: string) { return `${YELLOW}${s}${RESET}`; }
function red(s: string)    { return `${RED}${s}${RESET}`; }

function colorState(state: string): string {
  const upper = state.toUpperCase();
  if (['DONE', 'MERGED', 'PR_OPEN'].includes(upper)) return green(state);
  if (['IN_PROGRESS', 'IN_REVIEW', 'SPRINT_READY', 'REFINED'].includes(upper)) return yellow(state);
  if (['BLOCKED', 'ERROR'].includes(upper)) return red(state);
  return state;
}

// ─── Arg parsing helpers ──────────────────────────────────────────────────────

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  // argv[0] = 'bun' or binary path, argv[1] = script path, argv[2+] = user args
  const userArgs = argv.slice(2);
  const command = userArgs[0] ?? 'help';
  const flags: Record<string, string> = {};

  for (let i = 1; i < userArgs.length; i++) {
    const arg = userArgs[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = userArgs[i + 1] && !userArgs[i + 1]!.startsWith('--')
        ? userArgs[++i]!
        : 'true';
      flags[key] = value;
    }
  }

  return { command, flags };
}

// ─── Base workspace dir (env override or default) ─────────────────────────────

function workspaceBaseDir(): string {
  return process.env['SPLINTY_WORKSPACE_DIR'] ?? '.splinty';
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * splinty init --name <project-name>
 */
export function cmdInit(flags: Record<string, string>): number {
  const name = flags['name'];
  if (!name) {
    console.error(red('Error: --name is required\n  Usage: splinty init --name <project-name>'));
    return 2;
  }

  const baseDir = workspaceBaseDir();
  const ledger = new LedgerManager(baseDir);

  try {
    ledger.init(name);
  } catch (err) {
    // Already initialised is fine — check if AGENTS.md exists
    const agentsMd = path.join(baseDir, name, 'AGENTS.md');
    if (!fs.existsSync(agentsMd)) {
      console.error(red(`Error: failed to initialize workspace: ${(err as Error).message}`));
      return 2;
    }
  }

  const agentsMd = path.join(baseDir, name, 'AGENTS.md');
  console.log(green(`✓ Workspace initialized`));
  console.log(`  Project : ${name}`);
  console.log(`  Ledger  : ${agentsMd}`);
  console.log(`\nNext steps:`);
  console.log(`  Set required env vars:`);
  console.log(`    ANTHROPIC_API_KEY  — Claude API key`);
  console.log(`    JIRA_BASE_URL      — Jira instance URL (if using Jira source)`);
  console.log(`    JIRA_EMAIL         — Jira account email`);
  console.log(`    JIRA_API_TOKEN     — Jira API token`);
  console.log(`    GITHUB_TOKEN       — GitHub personal access token (if using GitHub source)`);
  return 0;
}

/**
 * splinty run --source <file|jira|github> --input <path|board-id|repo>
 */
export async function cmdRun(flags: Record<string, string>): Promise<number> {
  const source = flags['source'];
  const input  = flags['input'];
  const project = flags['project'] ?? 'default';

  if (!source || !input) {
    console.error(red('Error: --source and --input are required'));
    console.error('  Usage: splinty run --source <file|jira|github> --input <path|board-id|repo>');
    return 2;
  }

  // ── Load stories ───────────────────────────────────────────────────────────
  let stories;
  try {
    if (source === 'file') {
      const connector = new FileConnector();
      stories = connector.parse(path.resolve(input));
    } else if (source === 'jira') {
      const jiraBaseUrl  = process.env['JIRA_BASE_URL'];
      const jiraEmail    = process.env['JIRA_EMAIL'];
      const jiraApiToken = process.env['JIRA_API_TOKEN'];
      if (!jiraBaseUrl || !jiraEmail || !jiraApiToken) {
        console.error(red('Error: JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN env vars are required for Jira source'));
        return 2;
      }
      const connector = new JiraConnector({ baseUrl: jiraBaseUrl, email: jiraEmail, apiToken: jiraApiToken });
      stories = await connector.fetchStories(input);
    } else if (source === 'github') {
      const token = process.env['GITHUB_TOKEN'];
      if (!token) {
        console.error(red('Error: GITHUB_TOKEN env var is required for GitHub source'));
        return 2;
      }
      const [owner, repo] = input.split('/');
      if (!owner || !repo) {
        console.error(red('Error: --input for GitHub source must be in <owner/repo> format'));
        return 2;
      }
      const connector = new GitHubConnector({ owner: owner!, repo: repo!, token });
      stories = await connector.fetchIssues();
    } else {
      console.error(red(`Error: unknown source "${source}". Must be file, jira, or github`));
      return 2;
    }
  } catch (err) {
    console.error(red(`Error loading stories: ${(err as Error).message}`));
    return 2;
  }

  if (!stories || stories.length === 0) {
    console.error(yellow('Warning: no stories found in source'));
    return 0;
  }

  console.log(`Running pipeline for ${stories.length} story/stories...`);

  // ── Run orchestrator ───────────────────────────────────────────────────────
  const baseDir = workspaceBaseDir();
  const orch = new SprintOrchestrator({
    projectId: project,
    workspaceBaseDir: baseDir,
  });

  let results;
  try {
    results = await orch.run(stories);
  } catch (err) {
    console.error(red(`Fatal error: ${(err as Error).message}`));
    return 2;
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  let blocked = false;
  for (const result of results) {
    if (result.testResults.failed > 0) {
      console.log(red(`  ✗ ${result.storyId}  BLOCKED`));
      blocked = true;
    } else {
      const prLine = result.prUrl ? `  PR: ${result.prUrl}` : '';
      console.log(green(`  ✓ ${result.storyId}  branch: ${result.gitBranch}${prLine}`));
    }
  }

  return blocked ? 1 : 0;
}

/**
 * splinty status [--project <project-id>]
 */
export function cmdStatus(flags: Record<string, string>): number {
  const project = flags['project'] ?? 'default';
  const baseDir = workspaceBaseDir();
  const ledger  = new LedgerManager(baseDir);

  let rows: Array<{ id: string; title: string; state: string; updatedAt: string }>;
  try {
    rows = ledger.load(project);
  } catch (err) {
    console.error(red(`Error: ${(err as Error).message}`));
    console.error(`  Run: splinty init --name ${project}`);
    return 2;
  }

  if (rows.length === 0) {
    console.log(yellow('No stories found in sprint ledger.'));
    return 0;
  }

  console.log(`\nSprint board — project: ${project}\n`);
  const COL_ID    = 20;
  const COL_TITLE = 50;
  const COL_STATE = 20;
  const COL_DATE  = 12;

  const header = `${'ID'.padEnd(COL_ID)}  ${'Title'.padEnd(COL_TITLE)}  ${'State'.padEnd(COL_STATE)}  ${'Updated'.padEnd(COL_DATE)}`;
  const divider = '-'.repeat(header.length);

  console.log(header);
  console.log(divider);

  for (const row of rows) {
    const idCol    = row.id.padEnd(COL_ID);
    const titleCol = row.title.slice(0, COL_TITLE).padEnd(COL_TITLE);
    const stateCol = colorState(row.state);
    const dateCol  = row.updatedAt.slice(0, COL_DATE);
    console.log(`${idCol}  ${titleCol}  ${stateCol.padEnd(COL_STATE + 10)}  ${dateCol}`);
  }

  console.log();
  return 0;
}

/**
 * splinty auth [--force] [--logout]
 *
 * Runs the GitHub OAuth device flow to authenticate with GitHub Copilot.
 * Stores the resulting token at ~/.splinty/copilot-token.json.
 *
 * Flags:
 *   --force   Re-run device flow even if a token is already cached
 *   --logout  Remove the cached token
 */
export async function cmdAuth(flags: Record<string, string>): Promise<number> {
  const client = new GitHubCopilotClient();

  if (flags['logout'] === 'true') {
    client.logout();
    return 0;
  }

  const force = flags['force'] === 'true';
  try {
    await client.login(force);
  } catch (err) {
    console.error(red(`Error: ${(err as Error).message}`));
    return 2;
  }
  return 0;
}

/**
 * splinty --help
 */
export function cmdHelp(): number {
  console.log(`
Splinty — AI-powered SCRUM sprint pipeline

USAGE
  splinty <command> [options]

COMMANDS
  auth    Authenticate with GitHub Copilot (device flow)
  init    Create a new project workspace
  run     Load stories and run the full pipeline
  status  Print the current sprint board
  --help  Show this help

AUTH
  splinty auth [--force] [--logout]

  Options:
    --force     Re-run device flow even if already authenticated
    --logout    Remove the cached GitHub Copilot token

  Token is stored at: ~/.splinty/copilot-token.json
  Requires a paid GitHub Copilot subscription (Pro, Pro+, Business, or Enterprise).

INIT
  splinty init --name <project-name>

  Options:
    --name <project-name>   Unique project identifier

RUN
  splinty run --source <file|jira|github> --input <path|board-id|repo>

  Options:
    --source file     Load stories from a .md/.json/.yaml file
    --source jira     Load stories from a Jira board
    --source github   Load stories from GitHub Issues
    --input <value>   File path, Jira board ID, or GitHub owner/repo
    --project <id>    Project ID to use (default: "default")

  Required env vars (set before running):
    ANTHROPIC_API_KEY        Claude API key
    JIRA_BASE_URL            Jira instance URL  (--source jira)
    JIRA_EMAIL               Jira account email (--source jira)
    JIRA_API_TOKEN           Jira API token     (--source jira)
    GITHUB_TOKEN             GitHub token       (--source github)

STATUS
  splinty status [--project <id>]

  Options:
    --project <id>    Project ID (default: "default")

EXAMPLES
  splinty init --name my-app
  splinty run --source file --input stories/sprint1.md --project my-app
  splinty run --source github --input owner/my-repo --project my-app
  splinty status --project my-app

EXIT CODES
  0  All stories succeeded
  1  One or more stories BLOCKED
  2  Fatal error (misconfiguration, missing args, unrecoverable failure)
`);
  return 0;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, flags } = parseArgs(Bun.argv);

  let exitCode: number;

  if (command === 'auth') {
    exitCode = await cmdAuth(flags);
  } else if (command === 'init') {
    exitCode = cmdInit(flags);
  } else if (command === 'run') {
    exitCode = await cmdRun(flags);
  } else if (command === 'status') {
    exitCode = cmdStatus(flags);
  } else if (command === '--help' || command === 'help' || command === '-h') {
    exitCode = cmdHelp();
  } else {
    console.error(red(`Unknown command: ${command}`));
    cmdHelp();
    exitCode = 2;
  }

  process.exit(exitCode);
}

// Only run main when executed directly (not when imported in tests)
if (import.meta.main) {
  main().catch((err) => {
    console.error(red(`Unhandled error: ${(err as Error).message}`));
    process.exit(2);
  });
}
