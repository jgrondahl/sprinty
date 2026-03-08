import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SprintOrchestrator } from './orchestrator';
import {
  AgentPersona,
  ResumeManager,
  StoryState,
  StorySource,
  WorkspaceManager,
  MockSandbox,
  makeSuccessResult,
  type ResumePoint,
  type Story,
  type LlmClient,
} from '@splinty/core';

const now = new Date().toISOString();

// ─── Story factories ───────────────────────────────────────────────────────────

function makeRawStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-orch',
    title: 'As a user, I want to log in',
    description: 'Login via JWT',
    acceptanceCriteria: ['Given valid creds, Then I get a JWT'],
    state: StoryState.RAW,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'auth',
    tags: ['auth'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeAudioStory(): Story {
  return makeRawStory({
    id: 'story-audio',
    title: 'As a user, I want pitch detection',
    domain: 'audio',
    tags: ['audio', 'ml'],
  });
}

// ─── Mock LlmClient ────────────────────────────────────────────────────────────
//
// The orchestrator passes this single client to ALL agents. Each agent's
// callLlm() will call client.complete(). We use a queue so successive calls
// return the right JSON for each pipeline stage.

type MockResponse = object;

function makeQueuedClient(queue: MockResponse[], callLog?: { calls: number }): LlmClient {
  let idx = 0;
  return {
    complete: async () => {
      if (callLog) callLog.calls++;
      const resp = queue[idx] ?? queue[queue.length - 1]!;
      idx++;
      return JSON.stringify(resp);
    },
  };
}

// ─── Canned agent responses ───────────────────────────────────────────────────

const bizResp = {
  businessGoals: 'Enable secure login for all users',
  successMetrics: '1000 DAU within 3 months',
  riskFactors: 'Token theft, brute-force attacks, token expiry edge cases',
  epicSummary: 'Build a JWT-based login system that allows users to authenticate securely.',
};

const poResp = {
  title: 'As a user, I want to log in so I can access my account',
  description: 'Secure JWT-based login',
  acceptanceCriteria: ['Given valid creds, When I submit, Then I receive JWT'],
  priority: 'MUST',
  storyPoints: 3,
  domain: 'auth',
  tags: ['auth'],
};

const archResp = {
  adr: '# ADR: Login Service\n\n## Decision\nUse JWT.',
  diagram: 'C4Context\n  title Login',
  techStack: 'TypeScript, Node.js, JWT',
  soundEngineerRequired: false,
  soundEngineerRationale: 'No audio features',
};

const archAudioResp = {
  adr: '# ADR: Audio Pipeline\n\n## Decision\nUse Librosa.',
  diagram: 'C4Context\n  title Audio',
  techStack: 'Python, Librosa',
  soundEngineerRequired: true,
  soundEngineerRationale: 'Audio ML requires Librosa',
};

const soundEngResp = {
  requiresPython: true,
  files: [{ path: 'audio_service.py', content: 'import librosa\n' }],
  audioDesign: '# Audio Design\n\nUse Librosa.',
  integrationInterface: 'HTTP POST /analyse',
};

const devResp = {
  files: [
    { path: 'auth/service.ts', content: 'export function login() { return "jwt"; }' },
    { path: 'auth/service.test.ts', content: 'import { describe, it, expect } from "bun:test";\ndescribe("login", () => { it("works", () => { expect(true).toBe(true); }); });' },
  ],
  testCommand: 'bun test',
  summary: 'Login service implemented',
};

const qaPassResp = {
  passedAC: ['Given valid creds, When I submit, Then I receive JWT'],
  failedAC: [],
  bugs: [],
  verdict: 'PASS',
  additionalTests: [],
  report: '# QA Report\n\nVerdict: PASS',
};

const readmeResp = {
  readme: '# Login Service\n\nA JWT-based login service.\n\n## Usage\n\n```bash\nbun run start\n```\n\n## Testing\n\n```bash\nbun test\n```',
  additionalDocs: [],
};

const qaFailResp = {
  passedAC: [],
  failedAC: ['Given valid creds, When I submit, Then I receive JWT'],
  bugs: [{ description: 'Missing error handling', severity: 'major' }],
  verdict: 'FAIL',
  additionalTests: [],
  report: '# QA Report\n\nVerdict: FAIL',
};

const qaBlockedResp = {
  passedAC: [],
  failedAC: ['Given valid creds, When I submit, Then I receive JWT'],
  bugs: [{ description: 'Source missing', severity: 'critical' }],
  verdict: 'BLOCKED',
  additionalTests: [],
  report: '# QA Report\n\nVerdict: BLOCKED',
};

// ─── Mock git factory ─────────────────────────────────────────────────────────

function makeMockGit() {
  return (_repoPath: string) => ({
    init: async () => {},
    checkoutLocalBranch: async () => {},
    add: async () => {},
    commit: async () => ({ commit: 'abc1234', summary: { changes: 1, insertions: 5, deletions: 0 }, author: null, root: false, branch: 'story/story-orch' }),
    push: async () => {},
  }) as never;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-orch-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Happy-path pipeline ──────────────────────────────────────────────────────

describe('SprintOrchestrator — happy path (RAW → PR_OPEN)', () => {
  it('runs full pipeline and returns AppBuilderResult', async () => {
    // Queue: biz, po, arch, dev, qa
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeRawStory()]);

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.storyId).toBe('story-orch');
    expect(result.gitBranch).toBe('story/story-orch');
    expect(result.testResults.failed).toBe(0);
  });

  it('story reaches PR_OPEN state in workspace', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    await orch.run([makeRawStory()]);

    // Read story.json from workspace (stories live under <projectId>/stories/<storyId>)
    const workspacePaths = fs.readdirSync(path.join(tmpDir, 'test-proj', 'stories'));
    const storyDir = workspacePaths.find((p) => p.includes('story-orch'));
    expect(storyDir).toBeTruthy();

    const storyJson = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'test-proj', 'stories', storyDir!, 'story.json'), 'utf-8')
    );
    expect(storyJson.state).toBe(StoryState.PR_OPEN);
  });

  it('AGENTS.md is created and contains the story', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    await orch.run([makeRawStory()]);

    const agentsMd = fs.readFileSync(path.join(tmpDir, 'test-proj', 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('story-orch');
  });

  it('commitSha is captured from Developer git commit', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.commitShas).toContain('abc1234');
  });

  it('calls createPullRequest hook and captures prUrl', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);
    let prCreated = false;

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      createPullRequest: async () => {
        prCreated = true;
        return 'https://github.com/owner/repo/pull/42';
      },
    });

    const results = await orch.run([makeRawStory()]);
    expect(prCreated).toBe(true);
    expect(results[0]!.prUrl).toBe('https://github.com/owner/repo/pull/42');
  });
});

// ─── Audio story — Sound Engineer invoked ────────────────────────────────────

describe('SprintOrchestrator — audio story', () => {
  it('invokes Sound Engineer when archResp.soundEngineerRequired is true', async () => {
    // Queue: biz, po, arch(audio), soundEng, dev, qa
    const callLog = { calls: 0 };
    const client = makeQueuedClient(
      [bizResp, poResp, archAudioResp, soundEngResp, devResp, qaPassResp, readmeResp],
      callLog
    );

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeAudioStory()]);
    expect(callLog.calls).toBe(7);
    expect(results[0]!.testResults.failed).toBe(0);
  });
});

// ─── Failure isolation ────────────────────────────────────────────────────────

describe('SprintOrchestrator — per-story isolation', () => {
  it('failed story does not block successful story', async () => {
    // story-A will always fail: every call for it throws (keyed on story title in prompt).
    // story-B will succeed via a queued-response client.
    // Both share the same client but the throw is deterministic: any message mentioning
    // "Failing story" triggers the error; everything else returns the next queued response.
    const storyBQueue = [bizResp, poResp, archResp, devResp, qaPassResp, readmeResp];
    let storyBIdx = 0;
    const client: LlmClient = {
      complete: async (req) => {
        const text = req.userMessage ?? '';
        if (text.includes('Failing story')) {
          throw new Error('LLM failure for story-A');
        }
        const resp = storyBQueue[storyBIdx] ?? storyBQueue[storyBQueue.length - 1]!;
        storyBIdx++;
        return JSON.stringify(resp);
      },
    };

    const storyA = makeRawStory({ id: 'story-fail', title: 'Failing story' });
    const storyB = makeRawStory({ id: 'story-ok', title: 'OK story' });

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([storyA, storyB]);

    expect(results).toHaveLength(2);
    // story-A failed
    const aResult = results.find((r) => r.storyId === 'story-fail');
    expect(aResult).toBeTruthy();
    expect(aResult!.testResults.failed).toBe(1);
    // story-B succeeded
    const bResult = results.find((r) => r.storyId === 'story-ok');
    expect(bResult).toBeTruthy();
    expect(bResult!.testResults.failed).toBe(0);
  });

  it('multiple stories in same batch all get results', async () => {
    // Two identical stories processed in parallel
    const client = makeQueuedClient([
      // story 1 pipeline
      bizResp, poResp, archResp, devResp, qaPassResp, readmeResp,
      // story 2 pipeline
      bizResp, poResp, archResp, devResp, qaPassResp, readmeResp,
    ]);

    const stories = [
      makeRawStory({ id: 'story-1', title: 'Story One' }),
      makeRawStory({ id: 'story-2', title: 'Story Two' }),
    ];

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run(stories);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.storyId)).toBe(true);
  });
});

// ─── QA rework loop ───────────────────────────────────────────────────────────

describe('SprintOrchestrator — QA rework loop', () => {
  it('handles QA BLOCKED verdict by returning failed result', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaBlockedResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(1);
  });

  it('QA FAIL triggers developer rework, then PASS succeeds', async () => {
    // biz, po, arch, dev(1st), qa(fail), dev(2nd rework), qa(pass)
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaFailResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(0);
  });
});

// ─── Init behavior ────────────────────────────────────────────────────────────

describe('SprintOrchestrator — ledger init', () => {
  it('creates AGENTS.md even if projectId directory does not exist', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'brand-new-project',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    await orch.run([makeRawStory()]);

    const agentsMd = path.join(tmpDir, 'brand-new-project', 'AGENTS.md');
    expect(fs.existsSync(agentsMd)).toBe(true);
  });
});

// ─── Sandbox pipeline integration ─────────────────────────────────────────────

describe('SprintOrchestrator — sandbox pipeline', () => {
  it('wires sandbox to DeveloperAgent and sandbox results flow through pipeline', async () => {
    const installResult = makeSuccessResult('npm install', 'added 50 packages');
    const buildResult = makeSuccessResult('npm run build', 'compiled successfully');
    const testResult = makeSuccessResult('npm test', '3 tests passed');
    const sandbox = new MockSandbox({ executeResults: [installResult, buildResult, testResult] });

    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      sandbox,
    });

    const results = await orch.run([makeRawStory()]);

    // Pipeline still completes successfully
    expect(results).toHaveLength(1);
    expect(results[0]!.testResults.failed).toBe(0);

    // Sandbox was used (files written, commands executed, cleaned up)
    expect(sandbox.cleanedUp).toBe(true);

    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls.length).toBe(3);
    expect(execCalls[0]!.command).toBe('npm install');
    expect(execCalls[1]!.command).toBe('npm run build');
    expect(execCalls[2]!.command).toBe('npm test');

    // Generated files were written to sandbox
    const writtenFiles = sandbox.getWrittenFiles();
    expect(writtenFiles.size).toBeGreaterThan(0);
  });

  it('pipeline succeeds even when sandbox is not provided (backwards compatible)', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      // No sandbox — should work exactly as before
    });

    const results = await orch.run([makeRawStory()]);
    expect(results).toHaveLength(1);
    expect(results[0]!.testResults.failed).toBe(0);
  });

  it('passes sandboxConfig to sandbox.init() when provided', async () => {
    const sandbox = new MockSandbox();
    const sandboxConfig = {
      image: 'node:20-slim@sha256:abc123',
      timeoutMs: 60000,
      memoryLimitMb: 1024,
      cpuLimit: 2,
      networkEnabled: false,
      workDir: '/workspace',
      maxDiskMb: 500,
    };

    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      sandbox,
      sandboxConfig,
    });

    await orch.run([makeRawStory()]);

    const initCall = sandbox.calls.find((c) => c.method === 'init');
    expect(initCall).toBeDefined();
    expect((initCall!.args[0] as { image: string }).image).toBe('node:20-slim@sha256:abc123');
  });
});

// ─── Resume points ─────────────────────────────────────────────────────────────

describe('SprintOrchestrator — resume points', () => {
  it('persists a resume point after major steps before a crash', async () => {
    let idx = 0;
    const queue = [bizResp, poResp, archResp, devResp, qaPassResp];
    const client: LlmClient = {
      complete: async () => {
        if (idx >= queue.length) {
          throw new Error('Simulated crash after QA pass');
        }
        const resp = queue[idx] ?? queue[queue.length - 1]!;
        idx++;
        return JSON.stringify(resp);
      },
    };

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(1);

    const workspaceMgr = new WorkspaceManager(tmpDir);
    const ws = workspaceMgr.createWorkspace('test-proj', 'story-orch');
    const resumeMgr = new ResumeManager(workspaceMgr);
    expect(resumeMgr.exists(ws)).toBe(true);

    const resume = resumeMgr.load(ws);
    expect(resume).toBeTruthy();
    expect(resume!.pipelineStep).toBe(6);
    expect(resume!.lastCompletedAgent).toBe(AgentPersona.QA_ENGINEER);
  });

  it('clears resume point on successful pipeline completion', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(0);

    const workspaceMgr = new WorkspaceManager(tmpDir);
    const ws = workspaceMgr.createWorkspace('test-proj', 'story-orch');
    const resumeMgr = new ResumeManager(workspaceMgr);
    expect(resumeMgr.exists(ws)).toBe(false);
  });

  it('resumes from saved point and skips completed early steps', async () => {
    const workspaceMgr = new WorkspaceManager(tmpDir);
    const ws = workspaceMgr.createWorkspace('test-proj', 'story-orch');
    const resumeMgr = new ResumeManager(workspaceMgr);

    const snapshot = makeRawStory({ state: StoryState.IN_PROGRESS });
    const resumePoint: ResumePoint = {
      storyId: snapshot.id,
      projectId: 'test-proj',
      lastCompletedAgent: AgentPersona.ARCHITECT,
      handoffId: `${snapshot.id}-ARCHITECT-seeded`,
      handoff: {
        fromAgent: AgentPersona.ARCHITECT,
        toAgent: AgentPersona.DEVELOPER,
        storyId: snapshot.id,
        status: 'OK',
        stateOfWorld: { soundEngineerRequired: 'false' },
        nextGoal: 'Implement the architecture',
        artifacts: [],
        timestamp: new Date().toISOString(),
      },
      storySnapshot: snapshot,
      timestamp: new Date().toISOString(),
      pipelineStep: 3,
    };
    resumeMgr.save(ws, resumePoint);

    const callLog = { calls: 0 };
    const client = makeQueuedClient([devResp, qaPassResp, readmeResp], callLog);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(0);
    expect(callLog.calls).toBe(3);
  });
});
