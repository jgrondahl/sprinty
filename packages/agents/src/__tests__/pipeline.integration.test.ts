/**
 * T19 — Pipeline Integration Test
 *
 * Tests the full pipeline using real infrastructure (WorkspaceManager,
 * LedgerManager, HandoffManager, StoryStateMachine, FileConnector) with
 * only the LLM client, simple-git, and HTTP mocked.
 *
 * Scenario: parse sample-story.md → orchestrator.run() → story reaches PR_OPEN
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SprintOrchestrator } from '../orchestrator';
import { StoryState } from '@splinty/core';
import { FileConnector } from '@splinty/integrations';

// ─── Queued mock Anthropic client (same pattern as orchestrator.test.ts) ──────

type MockResponse = object;

function makeQueuedClient(queue: MockResponse[]) {
  let idx = 0;
  return {
    messages: {
      create: async () => {
        const resp = queue[idx] ?? queue[queue.length - 1]!;
        idx++;
        return { content: [{ type: 'text', text: JSON.stringify(resp) }] };
      },
    },
  };
}

// ─── Mock git factory ─────────────────────────────────────────────────────────

function makeMockGit() {
  return (_repoPath: string) =>
    ({
      init: async () => {},
      checkoutLocalBranch: async () => {},
      add: async () => {},
      commit: async () => ({
        commit: 'deadbeef',
        summary: { changes: 2, insertions: 10, deletions: 0 },
        author: null,
        root: false,
        branch: 'story/story-001',
      }),
      push: async () => {},
    }) as never;
}

// ─── Canned agent responses ───────────────────────────────────────────────────

const bizResp = {
  businessGoals: 'Enable secure authentication for all users',
  successMetrics: '500 DAU within 1 month',
  riskFactors: 'Token theft, brute-force, expiry edge cases',
  epicSummary: 'Build JWT-based login so users can authenticate securely.',
};

const poResp = {
  title: 'As a user, I want to log in so I can access my account',
  description: 'Secure JWT-based login via email + password',
  acceptanceCriteria: [
    'Given valid credentials, When I submit the login form, Then I receive a JWT token',
    'Given invalid credentials, When I submit, Then I see an error message',
  ],
  priority: 'MUST',
  storyPoints: 3,
  domain: 'auth',
  tags: ['auth'],
};

const archResp = {
  adr: '# ADR: Login Service\n\n## Decision\nUse JWT with RS256.',
  diagram: 'C4Context\n  title Auth System',
  techStack: 'TypeScript, Node.js, JWT',
  soundEngineerRequired: false,
  soundEngineerRationale: 'No audio features required',
};

const devResp = {
  files: [
    {
      path: 'auth/service.ts',
      content: 'export function login() { return "jwt-token"; }',
    },
    {
      path: 'auth/service.test.ts',
      content:
        'import { describe, it, expect } from "bun:test";\ndescribe("login", () => { it("works", () => { expect(true).toBe(true); }); });',
    },
  ],
  testCommand: 'bun test',
  summary: 'JWT login service implemented',
};

const qaPassResp = {
  passedAC: [
    'Given valid credentials, When I submit the login form, Then I receive a JWT token',
    'Given invalid credentials, When I submit, Then I see an error message',
  ],
  failedAC: [],
  bugs: [],
  verdict: 'PASS',
  additionalTests: [],
  report: '# QA Report\n\nVerdict: PASS — all acceptance criteria met.',
};

// ─── Fixture path ─────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.resolve(__dirname, 'fixtures', 'sample-story.md');

// ─── Test setup ───────────────────────────────────────────────────────────────

let tmpDir: string;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-pipeline-'));
  originalEnv = { ...process.env };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

// ─── T19 tests ────────────────────────────────────────────────────────────────

describe('Pipeline Integration — FileConnector → SprintOrchestrator', () => {
  it('FileConnector parses sample-story.md into Story[]', () => {
    const connector = new FileConnector();
    const stories = connector.parse(FIXTURE_PATH);

    expect(stories.length).toBe(1);
    expect(stories[0]!.title).toBe('As a user, I want to log in so I can access my account');
    expect(stories[0]!.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);
    expect(stories[0]!.state).toBe(StoryState.RAW);
  });

  it('full pipeline: story reaches PR_OPEN state', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp]);

    const connector = new FileConnector();
    const stories = connector.parse(FIXTURE_PATH);

    const orch = new SprintOrchestrator({
      projectId: 'pipeline-test',
      workspaceBaseDir: tmpDir,
      anthropicClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run(stories);

    expect(results).toHaveLength(1);
    expect(results[0]!.testResults.failed).toBe(0);

    // Verify story.json on disk has PR_OPEN state
    const storiesDir = path.join(tmpDir, 'pipeline-test', 'stories');
    const storyFolders = fs.readdirSync(storiesDir);
    expect(storyFolders.length).toBe(1);

    const storyJson = JSON.parse(
      fs.readFileSync(path.join(storiesDir, storyFolders[0]!, 'story.json'), 'utf-8')
    );
    expect(storyJson.state).toBe(StoryState.PR_OPEN);
  });

  it('workspace directory structure is created (handoffs/, artifacts/, agent.log)', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp]);

    const connector = new FileConnector();
    const stories = connector.parse(FIXTURE_PATH);

    const orch = new SprintOrchestrator({
      projectId: 'pipeline-test',
      workspaceBaseDir: tmpDir,
      anthropicClient: client,
      gitFactory: makeMockGit(),
    });

    await orch.run(stories);

    const storiesDir = path.join(tmpDir, 'pipeline-test', 'stories');
    const storyFolders = fs.readdirSync(storiesDir);
    const storyDir = path.join(storiesDir, storyFolders[0]!);

    // Workspace creates: handoffs/, artifacts/, agent.log, errors.log, story.json
    expect(fs.existsSync(path.join(storyDir, 'handoffs'))).toBe(true);
    expect(fs.existsSync(path.join(storyDir, 'artifacts'))).toBe(true);
    expect(fs.existsSync(path.join(storyDir, 'agent.log'))).toBe(true);
    expect(fs.existsSync(path.join(storyDir, 'story.json'))).toBe(true);

    // agent.log should have pipeline activity entries from each agent
    const agentLog = fs.readFileSync(path.join(storyDir, 'agent.log'), 'utf-8');
    expect(agentLog.length).toBeGreaterThan(0);
  });

  it('AGENTS.md is created and contains the story entry', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp]);

    const connector = new FileConnector();
    const stories = connector.parse(FIXTURE_PATH);

    const orch = new SprintOrchestrator({
      projectId: 'pipeline-test',
      workspaceBaseDir: tmpDir,
      anthropicClient: client,
      gitFactory: makeMockGit(),
    });

    await orch.run(stories);

    const agentsMd = path.join(tmpDir, 'pipeline-test', 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(true);

    const content = fs.readFileSync(agentsMd, 'utf-8');
    // Should contain the story id from the parsed fixture
    const storyId = stories[0]!.id;
    expect(content).toContain(storyId);
  });

  it('result contains commitSha from Developer git commit', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp]);

    const connector = new FileConnector();
    const stories = connector.parse(FIXTURE_PATH);

    const orch = new SprintOrchestrator({
      projectId: 'pipeline-test',
      workspaceBaseDir: tmpDir,
      anthropicClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run(stories);
    expect(results[0]!.commitShas).toContain('deadbeef');
  });

  it('createPullRequest hook is called and prUrl is non-empty', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp]);

    const connector = new FileConnector();
    const stories = connector.parse(FIXTURE_PATH);

    let hookCalled = false;
    const orch = new SprintOrchestrator({
      projectId: 'pipeline-test',
      workspaceBaseDir: tmpDir,
      anthropicClient: client,
      gitFactory: makeMockGit(),
      createPullRequest: async () => {
        hookCalled = true;
        return 'https://github.com/owner/splinty/pull/1';
      },
    });

    const results = await orch.run(stories);

    expect(hookCalled).toBe(true);
    expect(results[0]!.prUrl).toBeTruthy();
    expect(results[0]!.prUrl).toBe('https://github.com/owner/splinty/pull/1');
  });
});
