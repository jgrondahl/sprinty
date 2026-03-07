/**
 * T21 — CLI e2e Test
 *
 * Uses Bun.spawn to invoke the CLI script (packages/cli/src/index.ts) as a
 * subprocess. Tests focus on CLI input/output behavior — NOT pipeline execution.
 *
 * Scenarios:
 *   - `splinty init --name e2e-project`  → workspace + AGENTS.md created
 *   - `splinty status`                   → table output with story rows
 *   - `splinty --help`                   → usage text with init, run, status
 *   - `splinty run --source jira`        → exit code 2, helpful error (no env vars)
 *   - `splinty run --source github`      → exit code 2, helpful error (no GITHUB_TOKEN)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Helper: resolve CLI script path ─────────────────────────────────────────

const CLI_SCRIPT = path.resolve(__dirname, '..', 'index.ts');
const BUN_BIN = 'C:\\Users\\jgron\\.bun\\bin\\bun.exe';

// ─── Helper: run CLI via Bun.spawn ────────────────────────────────────────────

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCLI(
  args: string[],
  env: Record<string, string> = {}
): Promise<SpawnResult> {
  const proc = Bun.spawn([BUN_BIN, 'run', CLI_SCRIPT, ...args], {
    env: {
      ...process.env,
      PATH: process.env['PATH'] ?? '',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  return { exitCode, stdout, stderr };
}

// ─── Temp dir setup ───────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-e2e-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── e2e tests ────────────────────────────────────────────────────────────────

describe('CLI e2e — splinty init', () => {
  it('creates workspace directory and AGENTS.md', async () => {
    const result = await runCLI(
      ['init', '--name', 'e2e-project'],
      { SPLINTY_WORKSPACE_DIR: tmpDir }
    );

    expect(result.exitCode).toBe(0);

    const agentsMd = path.join(tmpDir, 'e2e-project', 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(true);
  });

  it('stdout contains "Workspace initialized"', async () => {
    const result = await runCLI(
      ['init', '--name', 'my-e2e-proj'],
      { SPLINTY_WORKSPACE_DIR: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Workspace initialized');
  });

  it('stdout contains env var guidance (ANTHROPIC_API_KEY)', async () => {
    const result = await runCLI(
      ['init', '--name', 'guided-proj'],
      { SPLINTY_WORKSPACE_DIR: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANTHROPIC_API_KEY');
  });

  it('returns exit code 2 when --name flag is missing', async () => {
    const result = await runCLI(['init'], { SPLINTY_WORKSPACE_DIR: tmpDir });
    expect(result.exitCode).toBe(2);
  });
});

describe('CLI e2e — splinty status', () => {
  it('returns 0 on project with no stories (empty ledger)', async () => {
    // First init the project
    await runCLI(['init', '--name', 'status-e2e'], { SPLINTY_WORKSPACE_DIR: tmpDir });

    const result = await runCLI(
      ['status', '--project', 'status-e2e'],
      { SPLINTY_WORKSPACE_DIR: tmpDir }
    );

    expect(result.exitCode).toBe(0);
  });

  it('renders table with story rows from AGENTS.md', async () => {
    // Init project then manually append story rows to AGENTS.md
    await runCLI(['init', '--name', 'table-proj'], { SPLINTY_WORKSPACE_DIR: tmpDir });

    const agentsMd = path.join(tmpDir, 'table-proj', 'AGENTS.md');
    const existing = fs.readFileSync(agentsMd, 'utf-8');
    fs.writeFileSync(
      agentsMd,
      existing +
        '| e2e-story-001 | E2E login feature | DONE | QA_ENGINEER | 2026-03-01 |\n' +
        '| e2e-story-002 | E2E profile page  | IN_PROGRESS | DEVELOPER | 2026-03-02 |\n',
      'utf-8'
    );

    const result = await runCLI(
      ['status', '--project', 'table-proj'],
      { SPLINTY_WORKSPACE_DIR: tmpDir }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('e2e-story-001');
    expect(result.stdout).toContain('e2e-story-002');
    expect(result.stdout).toContain('E2E login feature');
    expect(result.stdout).toContain('E2E profile page');
  });

  it('returns exit code 2 when project does not exist', async () => {
    const result = await runCLI(
      ['status', '--project', 'nonexistent-proj'],
      { SPLINTY_WORKSPACE_DIR: tmpDir }
    );

    expect(result.exitCode).toBe(2);
  });
});

describe('CLI e2e — splinty --help', () => {
  it('prints usage text containing init, run, status', async () => {
    const result = await runCLI(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('init');
    expect(result.stdout).toContain('run');
    expect(result.stdout).toContain('status');
  });

  it('prints EXIT CODES section', async () => {
    const result = await runCLI(['--help']);
    expect(result.stdout).toContain('EXIT CODES');
  });

  it('prints ANTHROPIC_API_KEY in env vars section', async () => {
    const result = await runCLI(['--help']);
    expect(result.stdout).toContain('ANTHROPIC_API_KEY');
  });
});

describe('CLI e2e — splinty run error paths', () => {
  it('exits with code 2 when JIRA env vars are missing', async () => {
    const result = await runCLI(
      ['run', '--source', 'jira', '--input', 'BOARD-1'],
      {
        SPLINTY_WORKSPACE_DIR: tmpDir,
        // Explicitly unset Jira vars
        JIRA_BASE_URL: '',
        JIRA_EMAIL: '',
        JIRA_API_TOKEN: '',
      }
    );

    expect(result.exitCode).toBe(2);
    // stderr should contain a helpful error about Jira env vars
    const output = result.stderr + result.stdout;
    expect(output).toContain('JIRA');
  });

  it('exits with code 2 when GITHUB_TOKEN is missing', async () => {
    const result = await runCLI(
      ['run', '--source', 'github', '--input', 'owner/repo'],
      {
        SPLINTY_WORKSPACE_DIR: tmpDir,
        GITHUB_TOKEN: '',
      }
    );

    expect(result.exitCode).toBe(2);
    const output = result.stderr + result.stdout;
    expect(output).toContain('GITHUB_TOKEN');
  });

  it('exits with code 2 when --source and --input are missing', async () => {
    const result = await runCLI(['run'], { SPLINTY_WORKSPACE_DIR: tmpDir });
    expect(result.exitCode).toBe(2);
  });

  it('exits with code 2 for unknown source type', async () => {
    const result = await runCLI(
      ['run', '--source', 'linear', '--input', 'board-1'],
      { SPLINTY_WORKSPACE_DIR: tmpDir }
    );
    expect(result.exitCode).toBe(2);
  });

  it('exits with code 2 when GitHub input missing slash (invalid format)', async () => {
    const result = await runCLI(
      ['run', '--source', 'github', '--input', 'noslash'],
      {
        SPLINTY_WORKSPACE_DIR: tmpDir,
        GITHUB_TOKEN: 'fake-token',
      }
    );
    expect(result.exitCode).toBe(2);
  });
});
