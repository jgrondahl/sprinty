import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SprintOrchestrator, executeRevisionLoop, OrchestratorConfig } from './orchestrator';
import { ArchitecturePlannerAgent } from './architecture-planner';
import { DeveloperAgent } from './developer';
import {
  BusinessOwnerAgent,
  ProductOwnerAgent,
  ArchitectAgent,
  SoundEngineerAgent,
  QAEngineerAgent,
  TechnicalWriterAgent,
  type AppBuilderResult,
  type HandoffDocument,
} from './index';
import {
  AgentPersona,
  ArchitecturePlanManager,
  ProjectMemoryManager,
  ResumeManager,
  StorySchema,
  StoryState,
  StorySource,
  TaskDecomposer,
  WorkspaceManager,
  MockSandbox,
  ArchitectureEnforcer,
  makeSuccessResult,
  type ArchitecturePlan,
  type HumanGate,
  type PlanRevisionTrigger,
  type PlannedSprintState,
  type ResumePoint,
  type SprintTaskPlan,
  type Story,
  type LlmClient,
  type PipelineConfig,
  type WorkspaceState,
} from '@splinty/core';

const now = new Date().toISOString();

// ─── Story factories ───────────────────────────────────────────────────────────

function makeRawStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-orch',
    title: 'As a user, I want to log in',
    description: 'Login via JWT',
    acceptanceCriteria: ['Given valid creds, Then I get a JWT'],
    dependsOn: [],
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

const makePlanForStories = (storyIds: string[], level: 'global' | 'sprint', id: string): ArchitecturePlan => ({
  planId: id,
  schemaVersion: 1,
  projectId: 'test-proj',
  level,
  scopeKey: level === 'global' ? 'global' : 'sprint:sprint-1',
  sprintId: level === 'sprint' ? 'sprint-1' : undefined,
  parentPlanId: level === 'sprint' ? 'global-plan-ps' : undefined,
  status: 'active',
  createdAt: now,
  revisionNumber: 0,
  techStack: {
    language: 'TypeScript',
    runtime: 'Node.js',
    framework: 'Bun',
    testFramework: 'bun:test',
    buildTool: 'bun',
    rationale: 'test',
  },
  modules: [
    {
      name: 'auth-module',
      description: 'auth',
      responsibility: 'auth',
      directory: 'src/auth',
      exposedInterfaces: ['AuthService'],
      dependencies: [],
      owningStories: storyIds,
    },
  ],
  storyModuleMapping: storyIds.map((storyId) => ({
    storyId,
    modules: ['auth-module'],
    primaryModule: 'auth-module',
    estimatedFiles: ['src/auth/auth-service.ts'],
  })),
  executionOrder: storyIds.map((storyId, index) => ({
    groupId: index + 1,
    storyIds: [storyId],
    rationale: 'ordered',
    dependsOn: index === 0 ? [] : [index],
  })),
  decisions: [
    {
      id: 'dec-ps-1',
      title: 'Use TS',
      context: 'test',
      decision: 'Use TypeScript',
      consequences: 'typed',
      status: 'accepted',
    },
  ],
  constraints: [
    {
      id: 'constraint-ps-1',
      type: 'boundary',
      description: 'module boundary',
      rule: 'import from public interfaces',
      severity: 'error',
    },
  ],
});

const makeTaskPlanForStories = (storyIds: string[]): SprintTaskPlan => ({
  sprintId: 'sprint-1',
  planId: 'sprint-plan-ps',
  parentGlobalPlanId: 'global-plan-ps',
  schemaVersion: 1,
  tasks: storyIds.map((storyId, index) => ({
    taskId: `task-${index + 1}`,
    storyIds: [storyId],
    module: 'auth-module',
    type: 'create',
    description: `implement ${storyId}`,
    targetFiles: [`src/auth/${storyId}.ts`],
    ownedFiles: [`src/auth/${storyId}.ts`],
    dependencies: index === 0 ? [] : [`task-${index}`],
    inputs: [],
    expectedOutputs: [`src/auth/${storyId}.ts`],
    acceptanceCriteria: ['Given valid creds, Then I get a JWT'],
  })),
  schedule: {
    groups: storyIds.map((_, index) => ({
      groupId: index + 1,
      taskIds: [`task-${index + 1}`],
      dependsOn: index === 0 ? [] : [index],
    })),
  },
  integrationTasks: [],
});

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

describe('Phase 2 orchestrator integration', () => {
  it('runs stories in topological order and creates project workspace', async () => {
    const storyA = makeRawStory({ id: 'story-A', title: 'Story A', dependsOn: [] });
    const storyB = makeRawStory({ id: 'story-B', title: 'Story B', dependsOn: ['story-A'] });
    const executionOrder: string[] = [];

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
    });

    (orch as unknown as { runStory: (story: Story) => Promise<{ storyId: string; gitBranch: string; commitShas: string[]; testResults: { passed: number; failed: number; skipped: number }; duration: number }> }).runStory = async (story) => {
      executionOrder.push(story.id);
      return {
        storyId: story.id,
        gitBranch: `story/${story.id}`,
        commitShas: [],
        testResults: { passed: 1, failed: 0, skipped: 0 },
        duration: 1,
      };
    };

    await orch.run([storyB, storyA]);

    expect(executionOrder).toEqual(['story-A', 'story-B']);
    expect(fs.existsSync(path.join(tmpDir, 'test-proj', 'project'))).toBe(true);
  });

  it('writes story manifest and promotes source files at PR_OPEN', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    await orch.run([makeRawStory({ id: 'story-manifest-promote' })]);

    const storyWorkspace = path.join(tmpDir, 'test-proj', 'stories', 'story-manifest-promote');
    const manifestPath = path.join(storyWorkspace, 'story-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { storyId: string };
    expect(manifest.storyId).toBe('story-manifest-promote');

    const promotedFile = path.join(tmpDir, 'test-proj', 'project', 'src', 'auth', 'service.ts');
    expect(fs.existsSync(promotedFile)).toBe(true);
  });

  it('injects ProjectContext into developer handoff in story pipeline', async () => {
    const workspaceMgr = new WorkspaceManager(tmpDir);
    workspaceMgr.createProjectWorkspace('test-proj');
    const memoryMgr = new ProjectMemoryManager(workspaceMgr);
    memoryMgr.initialize('test-proj', {
      language: 'TypeScript',
      runtime: 'Bun',
      additionalDeps: [],
    });

    const originalExecute = DeveloperAgent.prototype.execute;
    let sawProjectContext = false;

    DeveloperAgent.prototype.execute = async function (handoff, story) {
      sawProjectContext = Boolean(handoff?.projectContext);
      return originalExecute.call(this, handoff, story);
    };

    try {
      const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);
      const orch = new SprintOrchestrator({
        projectId: 'test-proj',
        workspaceBaseDir: tmpDir,
        defaultClient: client,
        gitFactory: makeMockGit(),
      });

      await orch.run([makeRawStory({ id: 'story-context' })]);
      expect(sawProjectContext).toBe(true);
    } finally {
      DeveloperAgent.prototype.execute = originalExecute;
    }
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

describe('SprintOrchestrator — configurable pipeline', () => {
  it('skips a step when condition returns false', async () => {
    const pipeline: PipelineConfig = {
      steps: [
        { agent: AgentPersona.BUSINESS_OWNER },
        { agent: AgentPersona.PRODUCT_OWNER },
        { agent: AgentPersona.ARCHITECT },
        { agent: AgentPersona.SOUND_ENGINEER, condition: () => false },
        { agent: AgentPersona.DEVELOPER },
        { agent: AgentPersona.QA_ENGINEER },
        { agent: AgentPersona.TECHNICAL_WRITER },
      ],
    };

    const originalSoundExecute = SoundEngineerAgent.prototype.execute;
    let soundCalls = 0;
    SoundEngineerAgent.prototype.execute = async function (handoff, story) {
      soundCalls += 1;
      return originalSoundExecute.call(this, handoff, story);
    };

    try {
      const client = makeQueuedClient([bizResp, poResp, archAudioResp, devResp, qaPassResp, readmeResp]);
      const orch = new SprintOrchestrator({
        projectId: 'test-proj',
        workspaceBaseDir: tmpDir,
        defaultClient: client,
        gitFactory: makeMockGit(),
        pipeline,
      });

      const results = await orch.run([makeAudioStory()]);
      expect(results[0]!.testResults.failed).toBe(0);
      expect(soundCalls).toBe(0);
    } finally {
      SoundEngineerAgent.prototype.execute = originalSoundExecute;
    }
  });

  it('runs agents in custom pipeline order', async () => {
    const pipeline: PipelineConfig = {
      steps: [
        { agent: AgentPersona.BUSINESS_OWNER },
        { agent: AgentPersona.PRODUCT_OWNER },
        { agent: AgentPersona.ARCHITECT },
        { agent: AgentPersona.DEVELOPER },
        { agent: AgentPersona.TECHNICAL_WRITER },
        { agent: AgentPersona.QA_ENGINEER },
      ],
    };
    const order: AgentPersona[] = [];

    const originalBusinessExecute = BusinessOwnerAgent.prototype.execute;
    const originalProductExecute = ProductOwnerAgent.prototype.execute;
    const originalArchitectExecute = ArchitectAgent.prototype.execute;
    const originalDeveloperExecute = DeveloperAgent.prototype.execute;
    const originalWriterExecute = TechnicalWriterAgent.prototype.execute;
    const originalQaExecute = QAEngineerAgent.prototype.execute;

    BusinessOwnerAgent.prototype.execute = async function (handoff, story) {
      order.push(AgentPersona.BUSINESS_OWNER);
      return originalBusinessExecute.call(this, handoff, story);
    };
    ProductOwnerAgent.prototype.execute = async function (handoff, story) {
      order.push(AgentPersona.PRODUCT_OWNER);
      return originalProductExecute.call(this, handoff, story);
    };
    ArchitectAgent.prototype.execute = async function (handoff, story) {
      order.push(AgentPersona.ARCHITECT);
      return originalArchitectExecute.call(this, handoff, story);
    };
    DeveloperAgent.prototype.execute = async function (handoff, story) {
      order.push(AgentPersona.DEVELOPER);
      return originalDeveloperExecute.call(this, handoff, story);
    };
    TechnicalWriterAgent.prototype.execute = async function (handoff, story) {
      order.push(AgentPersona.TECHNICAL_WRITER);
      return originalWriterExecute.call(this, handoff, story);
    };
    QAEngineerAgent.prototype.execute = async function (handoff, story) {
      order.push(AgentPersona.QA_ENGINEER);
      return originalQaExecute.call(this, handoff, story);
    };

    try {
      const client = makeQueuedClient([bizResp, poResp, archResp, devResp, readmeResp, qaPassResp]);
      const orch = new SprintOrchestrator({
        projectId: 'test-proj',
        workspaceBaseDir: tmpDir,
        defaultClient: client,
        gitFactory: makeMockGit(),
        pipeline,
      });

      const results = await orch.run([makeRawStory({ id: 'story-custom-order' })]);
      expect(results[0]!.testResults.failed).toBe(0);
      expect(order).toEqual([
        AgentPersona.BUSINESS_OWNER,
        AgentPersona.PRODUCT_OWNER,
        AgentPersona.ARCHITECT,
        AgentPersona.DEVELOPER,
        AgentPersona.TECHNICAL_WRITER,
        AgentPersona.QA_ENGINEER,
      ]);
    } finally {
      BusinessOwnerAgent.prototype.execute = originalBusinessExecute;
      ProductOwnerAgent.prototype.execute = originalProductExecute;
      ArchitectAgent.prototype.execute = originalArchitectExecute;
      DeveloperAgent.prototype.execute = originalDeveloperExecute;
      TechnicalWriterAgent.prototype.execute = originalWriterExecute;
      QAEngineerAgent.prototype.execute = originalQaExecute;
    }
  });

  it('honors retries override on QA step', async () => {
    const pipeline: PipelineConfig = {
      steps: [
        { agent: AgentPersona.BUSINESS_OWNER },
        { agent: AgentPersona.PRODUCT_OWNER },
        { agent: AgentPersona.ARCHITECT },
        { agent: AgentPersona.DEVELOPER },
        { agent: AgentPersona.QA_ENGINEER, retries: 1 },
      ],
    };

    const originalQaExecute = QAEngineerAgent.prototype.execute;
    let qaCalls = 0;
    QAEngineerAgent.prototype.execute = async function (handoff, story) {
      qaCalls += 1;
      return originalQaExecute.call(this, handoff, story);
    };

    try {
      const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaFailResp, devResp]);
      const orch = new SprintOrchestrator({
        projectId: 'test-proj',
        workspaceBaseDir: tmpDir,
        defaultClient: client,
        gitFactory: makeMockGit(),
        pipeline,
      });

      const results = await orch.run([makeRawStory({ id: 'story-qa-retries-override' })]);
      expect(results[0]!.testResults.failed).toBe(1);
      expect(qaCalls).toBe(1);
    } finally {
      QAEngineerAgent.prototype.execute = originalQaExecute;
    }
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

  it('accepts enforcer config without breaking story-mode pipeline', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      enforcer: new ArchitectureEnforcer(),
    });

    const results = await orch.run([makeRawStory()]);
    expect(results).toHaveLength(1);
    expect(results[0]!.testResults.failed).toBe(0);
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
    expect(resume!.pipelineStep).toBe(5);
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
      pipelineStep: 2,
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

describe('SprintOrchestrator — planned-sprint mode', () => {
  afterEach(() => {
    ArchitecturePlannerAgent.prototype.planSprint = originalPlanSprint;
    TaskDecomposer.prototype.decompose = originalDecompose;
  });

  const originalPlanSprint = ArchitecturePlannerAgent.prototype.planSprint;
  const originalDecompose = TaskDecomposer.prototype.decompose;

  it('happy path runs end-to-end planned sprint across two stories', async () => {
    const story1 = makeRawStory({ id: 'story-ps-1', title: 'Story PS One' });
    const story2 = makeRawStory({ id: 'story-ps-2', title: 'Story PS Two' });

    const globalPlan = makePlanForStories([story1.id, story2.id], 'global', 'global-plan-ps');
    const sprintPlan = makePlanForStories([story1.id, story2.id], 'sprint', 'sprint-plan-ps');
    const taskPlan = makeTaskPlanForStories([story1.id, story2.id]);

    ArchitecturePlannerAgent.prototype.planSprint = async function () {
      return {
        globalPlan,
        sprintPlan,
        globalScore: {
          cohesion: 95,
          dependencySanity: 95,
          stackConsistency: 95,
          overall: 95,
          status: 'pass',
          findings: [],
        },
        sprintScore: {
          cohesion: 94,
          dependencySanity: 94,
          stackConsistency: 94,
          overall: 94,
          status: 'pass',
          findings: [],
        },
      };
    };

    TaskDecomposer.prototype.decompose = function () {
      return taskPlan;
    };

    const client = makeQueuedClient([
      bizResp, poResp,
      bizResp, poResp,
      devResp, qaPassResp,
      devResp, qaPassResp,
      readmeResp, readmeResp,
    ]);

    let prCalls = 0;
    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      executionMode: 'planned-sprint',
      defaultClient: client,
      gitFactory: makeMockGit(),
      createPullRequest: async (_story, _branch, _sha) => {
        prCalls += 1;
        return `https://github.com/owner/repo/pull/${prCalls}`;
      },
    });

    const results = await orch.run([story1, story2]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.testResults.failed === 0)).toBe(true);
    expect(prCalls).toBe(2);

    const story1Json = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'test-proj', 'stories', 'story-ps-1', 'story.json'), 'utf-8')
    ) as Story;
    const story2Json = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'test-proj', 'stories', 'story-ps-2', 'story.json'), 'utf-8')
    ) as Story;

    expect(story1Json.state).toBe(StoryState.PR_OPEN);
    expect(story2Json.state).toBe(StoryState.PR_OPEN);
    expect(fs.existsSync(path.join(tmpDir, 'test-proj', 'stories', 'sprint', 'sprint-checkpoint.json'))).toBe(false);
  });

  it('routes by executionMode to planned-sprint or story pipeline', async () => {
    const plannedClient = makeQueuedClient([]);
    const planned = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      executionMode: 'planned-sprint',
      defaultClient: plannedClient,
      gitFactory: makeMockGit(),
    });

    let plannedCalled = 0;
    let storyCalledOnPlanned = 0;
    (planned as unknown as { runPlannedSprint: (stories: Story[]) => Promise<AppBuilderResult[]> }).runPlannedSprint = async (stories) => {
      plannedCalled += 1;
      return stories.map((s) => ({
        storyId: s.id,
        gitBranch: `story/${s.id}`,
        commitShas: [],
        testResults: { passed: 1, failed: 0, skipped: 0 },
        duration: 1,
      }));
    };
    (planned as unknown as { runStory: (story: Story) => Promise<AppBuilderResult> }).runStory = async (story) => {
      storyCalledOnPlanned += 1;
      return {
        storyId: story.id,
        gitBranch: `story/${story.id}`,
        commitShas: [],
        testResults: { passed: 1, failed: 0, skipped: 0 },
        duration: 1,
      };
    };

    await planned.run([makeRawStory({ id: 'routing-planned' })]);
    expect(plannedCalled).toBe(1);
    expect(storyCalledOnPlanned).toBe(0);

    const storyClient = makeQueuedClient([]);
    const storyMode = new SprintOrchestrator({
      projectId: 'test-proj-2',
      workspaceBaseDir: tmpDir,
      executionMode: 'story',
      defaultClient: storyClient,
      gitFactory: makeMockGit(),
    });

    let storyCalled = 0;
    let plannedCalledOnStory = 0;
    (storyMode as unknown as { runStory: (story: Story) => Promise<AppBuilderResult> }).runStory = async (story) => {
      storyCalled += 1;
      return {
        storyId: story.id,
        gitBranch: `story/${story.id}`,
        commitShas: [],
        testResults: { passed: 1, failed: 0, skipped: 0 },
        duration: 1,
      };
    };
    (storyMode as unknown as { runPlannedSprint: (stories: Story[]) => Promise<AppBuilderResult[]> }).runPlannedSprint = async (_stories) => {
      plannedCalledOnStory += 1;
      return [];
    };

    await storyMode.run([makeRawStory({ id: 'routing-story' })]);
    expect(storyCalled).toBe(1);
    expect(plannedCalledOnStory).toBe(0);
  });

  it('marks blocked task and continues remaining tasks', async () => {
    const story1 = makeRawStory({ id: 'story-block-1' });
    const story2 = makeRawStory({ id: 'story-block-2' });
    const globalPlan = makePlanForStories([story1.id, story2.id], 'global', 'global-plan-ps');
    const sprintPlan = makePlanForStories([story1.id, story2.id], 'sprint', 'sprint-plan-ps');
    const taskPlan = makeTaskPlanForStories([story1.id, story2.id]);

    ArchitecturePlannerAgent.prototype.planSprint = async function () {
      return {
        globalPlan,
        sprintPlan,
        globalScore: { cohesion: 90, dependencySanity: 90, stackConsistency: 90, overall: 90, status: 'pass', findings: [] },
        sprintScore: { cohesion: 90, dependencySanity: 90, stackConsistency: 90, overall: 90, status: 'pass', findings: [] },
      };
    };

    TaskDecomposer.prototype.decompose = function () {
      return taskPlan;
    };

    const client = makeQueuedClient([
      bizResp, poResp,
      bizResp, poResp,
      devResp, qaBlockedResp,
      devResp, qaPassResp,
      readmeResp,
    ]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      executionMode: 'planned-sprint',
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([story1, story2]);
    const blocked = results.find((r) => r.storyId === 'story-block-1');
    const passed = results.find((r) => r.storyId === 'story-block-2');
    expect(blocked).toBeTruthy();
    expect(blocked!.testResults.failed).toBe(1);
    expect(passed).toBeTruthy();
    expect(passed!.testResults.failed).toBe(0);
  });

  it('resumes from checkpoint by skipping completed groups', async () => {
    const story1 = makeRawStory({ id: 'story-resume-1' });
    const story2 = makeRawStory({ id: 'story-resume-2' });
    const workspaceMgr = new WorkspaceManager(tmpDir);
    const sprintWs = workspaceMgr.createWorkspace('test-proj', 'sprint');
    const planManager = new ArchitecturePlanManager(workspaceMgr);

    const globalPlan = makePlanForStories([story1.id, story2.id], 'global', 'global-plan-ps');
    const sprintPlan = makePlanForStories([story1.id, story2.id], 'sprint', 'sprint-plan-ps');
    planManager.save(sprintWs, globalPlan);
    planManager.save(sprintWs, sprintPlan);

    const taskPlan = makeTaskPlanForStories([story1.id, story2.id]);
    workspaceMgr.writeFile(sprintWs, 'artifacts/sprint-task-plan.json', JSON.stringify(taskPlan, null, 2));
    workspaceMgr.writeFile(
      sprintWs,
      'sprint-checkpoint.json',
      JSON.stringify({
        checkpointId: 'cp-1',
        sprintId: taskPlan.sprintId,
        runId: 'run-1',
        activeSprintPlanId: sprintPlan.planId,
        activeGlobalPlanId: globalPlan.planId,
        revisionCount: 0,
        completedTaskIds: ['task-1'],
        blockedTaskIds: [],
        remainingTaskSchedule: {
          groups: taskPlan.schedule.groups.filter((group) => group.groupId > 1),
        },
        lastCompletedGroupId: 1,
        createdAt: now,
      },
      null,
      2
      )
    );

    const callLog = { calls: 0 };
    const client = makeQueuedClient([devResp, qaPassResp, readmeResp, readmeResp], callLog);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      executionMode: 'planned-sprint',
      defaultClient: client,
      gitFactory: makeMockGit(),
    });

    const results = await orch.run([story1, story2]);
    expect(results).toHaveLength(2);
    expect(callLog.calls).toBe(4);
    expect(fs.existsSync(path.join(tmpDir, 'test-proj', 'stories', 'sprint', 'sprint-checkpoint.json'))).toBe(false);
  });
});

describe('SprintOrchestrator — revision loop and checkpoint', () => {
  const makeStories = (): Story[] => [
    StorySchema.parse({
      id: 'story-rev-1',
      title: 'Story revision test',
      description: 'Revision flow',
      acceptanceCriteria: ['works'],
      state: StoryState.SPRINT_READY,
      source: StorySource.FILE,
      sourceId: 'STORY-REV-1',
      storyPoints: 2,
      domain: 'core',
      tags: ['core'],
      workspacePath: '',
      createdAt: now,
      updatedAt: now,
    }),
  ];

  const makePlan = (id: string, level: 'global' | 'sprint'): ArchitecturePlan => ({
    planId: id,
    schemaVersion: 1,
    projectId: 'test-proj',
    level,
    scopeKey: level === 'global' ? 'global' : 'sprint:sprint-rev',
    sprintId: level === 'sprint' ? 'sprint-rev' : undefined,
    parentPlanId: level === 'sprint' ? 'global-plan-1' : undefined,
    status: 'active',
    createdAt: now,
    revisionNumber: 0,
    techStack: {
      language: 'TypeScript',
      runtime: 'Node.js',
      framework: 'Bun',
      testFramework: 'bun:test',
      buildTool: 'bun',
      rationale: 'consistency',
    },
    modules: [
      {
        name: 'core-module',
        description: 'core module',
        responsibility: 'core logic',
        directory: 'src/modules/core',
        exposedInterfaces: ['CoreService'],
        dependencies: [],
        owningStories: ['story-rev-1'],
      },
    ],
    storyModuleMapping: [
      {
        storyId: 'story-rev-1',
        modules: ['core-module'],
        primaryModule: 'core-module',
        estimatedFiles: ['src/modules/core/service.ts'],
      },
    ],
    executionOrder: [{ groupId: 1, storyIds: ['story-rev-1'], rationale: 'single group', dependsOn: [] }],
    decisions: [
      {
        id: 'dec-1',
        title: 'use ts',
        context: 'runtime',
        decision: 'ts on bun',
        consequences: 'typed',
        status: 'accepted',
      },
    ],
    constraints: [
      {
        id: 'constraint-1',
        type: 'dependency',
        description: 'boundaries',
        rule: 'only interfaces',
        severity: 'error',
      },
    ],
  });

  const makeTaskPlan = (planId: string): SprintTaskPlan => ({
    sprintId: 'sprint-rev',
    planId,
    parentGlobalPlanId: 'global-plan-1',
    schemaVersion: 1,
    tasks: [
      {
        taskId: 'task-rev-1',
        storyIds: ['story-rev-1'],
        module: 'core-module',
        type: 'create',
        description: 'implement',
        targetFiles: ['src/modules/core/service.ts'],
        ownedFiles: ['src/modules/core/service.ts'],
        dependencies: [],
        inputs: [],
        expectedOutputs: ['src/modules/core/service.ts'],
        acceptanceCriteria: ['works'],
      },
    ],
    schedule: {
      groups: [{ groupId: 1, taskIds: ['task-rev-1'], dependsOn: [] }],
    },
    integrationTasks: [],
  });

  const makeState = (): PlannedSprintState => ({
    currentSprintPlan: makePlan('sprint-plan-1', 'sprint'),
    currentGlobalPlanId: 'global-plan-1',
    taskPlan: makeTaskPlan('sprint-plan-1'),
    runId: 'run-1',
    revisionCount: 0,
    maxRevisions: 1,
    storyRevisionCounts: { 'story-rev-1': 0 },
    maxRevisionsPerStory: 1,
  });

  const makeTrigger = (overrides: Partial<PlanRevisionTrigger> = {}): PlanRevisionTrigger => ({
    reason: 'architecture-violation',
    description: 'revision needed',
    evidence: ['missing-interface'],
    timestamp: now,
    ...overrides,
  });

  class MockHumanGate implements HumanGate {
    public readonly calls: PlanRevisionTrigger[] = [];

    constructor(private readonly approved: boolean) {}

    async requestApproval(trigger: PlanRevisionTrigger): Promise<boolean> {
      this.calls.push(trigger);
      return this.approved;
    }
  }

  const makePlanner = (revisedPlan: ArchitecturePlan) => ({
    reviseSprint: async () => ({
      revisedPlan,
      score: {
        cohesion: 90,
        dependencySanity: 90,
        stackConsistency: 90,
        overall: 90,
        status: 'pass' as const,
        findings: [],
      },
      supersededPlanId: 'sprint-plan-1',
      newDecision: {
        id: 'dec-2',
        title: 'revise',
        context: 'triggered',
        decision: 'adjust interfaces',
        consequences: 'safer',
        status: 'accepted' as const,
      },
    }),
  });

  const makeDecomposer = (taskPlan: SprintTaskPlan): Pick<TaskDecomposer, 'decompose'> => ({
    decompose: () => taskPlan,
  });

  const createWorkspace = (): { ws: WorkspaceState; workspaceManager: WorkspaceManager; planManager: ArchitecturePlanManager } => {
    const workspaceManager = new WorkspaceManager(tmpDir);
    const ws = workspaceManager.createWorkspace('test-proj', 'story-revision');
    const planManager = new ArchitecturePlanManager(workspaceManager);
    return { ws, workspaceManager, planManager };
  };

  it('handleRevisionLoop applies sprint-level revision within limits', async () => {
    const state = makeState();
    const revisedPlan = {
      ...makePlan('sprint-plan-2', 'sprint'),
      revisionNumber: 1,
      supersedesPlanId: 'sprint-plan-1',
    };
    const revisedTaskPlan = makeTaskPlan('sprint-plan-2');
    const stories = makeStories();
    const gate = new MockHumanGate(true);
    const planner = makePlanner(revisedPlan);
    const decomposer = makeDecomposer(revisedTaskPlan);

    const { ws, planManager } = createWorkspace();
    planManager.save(ws, makePlan('global-plan-1', 'global'));

    const orch = new SprintOrchestrator({ projectId: 'test-proj', workspaceBaseDir: tmpDir, humanGate: gate });
    const method = (orch as unknown as {
      handleRevisionLoop: (
        wsArg: WorkspaceState,
        stateArg: PlannedSprintState,
        triggerArg: PlanRevisionTrigger,
        plannerArg: { reviseSprint: () => Promise<unknown> },
        decomposerArg: Pick<TaskDecomposer, 'decompose'>,
        storiesArg: Story[],
        humanGateArg: HumanGate
      ) => Promise<PlannedSprintState>;
    }).handleRevisionLoop;

    const updated = await method.call(orch, ws, state, makeTrigger(), planner, decomposer, stories, gate);
    expect(updated.currentSprintPlan.planId).toBe('sprint-plan-2');
    expect(updated.taskPlan.planId).toBe('sprint-plan-2');
    expect(updated.revisionCount).toBe(1);
    expect(updated.storyRevisionCounts['story-rev-1']).toBe(1);
    expect(gate.calls).toHaveLength(0);
  });

  it('handleRevisionLoop calls humanGate when sprint limit exceeded', async () => {
    const state = { ...makeState(), revisionCount: 1, maxRevisions: 1 };
    const revisedPlan = {
      ...makePlan('sprint-plan-2', 'sprint'),
      revisionNumber: 1,
      supersedesPlanId: 'sprint-plan-1',
    };
    const stories = makeStories();
    const gate = new MockHumanGate(true);
    const planner = makePlanner(revisedPlan);
    const decomposer = makeDecomposer(makeTaskPlan('sprint-plan-2'));

    const { ws, planManager } = createWorkspace();
    planManager.save(ws, makePlan('global-plan-1', 'global'));

    const orch = new SprintOrchestrator({ projectId: 'test-proj', workspaceBaseDir: tmpDir, humanGate: gate });
    const method = (orch as unknown as {
      handleRevisionLoop: (
        wsArg: WorkspaceState,
        stateArg: PlannedSprintState,
        triggerArg: PlanRevisionTrigger,
        plannerArg: { reviseSprint: () => Promise<unknown> },
        decomposerArg: Pick<TaskDecomposer, 'decompose'>,
        storiesArg: Story[],
        humanGateArg: HumanGate
      ) => Promise<PlannedSprintState>;
    }).handleRevisionLoop;

    const updated = await method.call(orch, ws, state, makeTrigger(), planner, decomposer, stories, gate);
    expect(gate.calls).toHaveLength(1);
    expect(updated.revisionCount).toBe(2);
  });

  it('handleRevisionLoop calls humanGate for global-level revision', async () => {
    const state = makeState();
    const revisedPlan = {
      ...makePlan('sprint-plan-2', 'sprint'),
      revisionNumber: 1,
      supersedesPlanId: 'sprint-plan-1',
    };
    const stories = makeStories();
    const gate = new MockHumanGate(true);
    const planner = makePlanner(revisedPlan);
    const decomposer = makeDecomposer(makeTaskPlan('sprint-plan-2'));

    const { ws, planManager } = createWorkspace();
    planManager.save(ws, makePlan('global-plan-1', 'global'));

    const orch = new SprintOrchestrator({ projectId: 'test-proj', workspaceBaseDir: tmpDir, humanGate: gate });
    const method = (orch as unknown as {
      handleRevisionLoop: (
        wsArg: WorkspaceState,
        stateArg: PlannedSprintState,
        triggerArg: PlanRevisionTrigger,
        plannerArg: { reviseSprint: () => Promise<unknown> },
        decomposerArg: Pick<TaskDecomposer, 'decompose'>,
        storiesArg: Story[],
        humanGateArg: HumanGate
      ) => Promise<PlannedSprintState>;
    }).handleRevisionLoop;

    const trigger = makeTrigger({ evidence: ['module-boundary-change'] });
    const updated = await method.call(orch, ws, state, trigger, planner, decomposer, stories, gate);
    expect(gate.calls).toHaveLength(1);
    expect(updated.revisionCount).toBe(1);
  });

  it('executeRevisionLoop returns unchanged state when humanGate denies approval', async () => {
    const state = makeState();
    const revisedPlan = {
      ...makePlan('sprint-plan-2', 'sprint'),
      revisionNumber: 1,
      supersedesPlanId: 'sprint-plan-1',
    };
    const planner = makePlanner(revisedPlan);
    const decomposer = makeDecomposer(makeTaskPlan('sprint-plan-2'));
    const gate = new MockHumanGate(false);

    const updated = await executeRevisionLoop({
      state,
      trigger: makeTrigger({ evidence: ['module-boundary-change'] }),
      planner,
      decomposer,
      stories: makeStories(),
      humanGate: gate,
      globalPlan: makePlan('global-plan-1', 'global'),
    });

    expect(updated).toEqual(state);
    expect(gate.calls).toHaveLength(1);
  });

  it('executeRevisionLoop proceeds when humanGate approves global escalation', async () => {
    const state = makeState();
    const revisedPlan = {
      ...makePlan('sprint-plan-2', 'sprint'),
      revisionNumber: 1,
      supersedesPlanId: 'sprint-plan-1',
    };
    const planner = makePlanner(revisedPlan);
    const decomposer = makeDecomposer(makeTaskPlan('sprint-plan-2'));
    const gate = new MockHumanGate(true);

    const updated = await executeRevisionLoop({
      state,
      trigger: makeTrigger({ evidence: ['module-boundary-change'] }),
      planner,
      decomposer,
      stories: makeStories(),
      humanGate: gate,
      globalPlan: makePlan('global-plan-1', 'global'),
    });

    expect(updated.currentSprintPlan.planId).toBe('sprint-plan-2');
    expect(updated.revisionCount).toBe(1);
    expect(gate.calls).toHaveLength(1);
  });

  it('checkpoint save and load roundtrip persists sprint checkpoint', () => {
    const state = makeState();
    const orch = new SprintOrchestrator({ projectId: 'test-proj', workspaceBaseDir: tmpDir });
    const workspaceManager = new WorkspaceManager(tmpDir);
    const ws = workspaceManager.createWorkspace('test-proj', 'story-revision-checkpoint');

    const saveCheckpoint = (orch as unknown as {
      saveCheckpoint: (wsArg: WorkspaceState, stateArg: PlannedSprintState) => void;
    }).saveCheckpoint;
    const loadCheckpoint = (orch as unknown as {
      loadCheckpoint: (wsArg: WorkspaceState) => unknown;
    }).loadCheckpoint;

    saveCheckpoint.call(orch, ws, state);
    const loaded = loadCheckpoint.call(orch, ws) as { activeSprintPlanId: string; activeGlobalPlanId: string } | null;
    expect(loaded).not.toBeNull();
    expect(loaded!.activeSprintPlanId).toBe('sprint-plan-1');
    expect(loaded!.activeGlobalPlanId).toBe('global-plan-1');
  });
});

describe('SprintOrchestrator — model config', () => {
  it('applies defaultModel to all agents when set', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      defaultModel: 'gpt-4o',
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(0);
  });

  it('applies defaultModel with temperature override to all agents', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      defaultModel: { model: 'gpt-4o', temperature: 0.3 },
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(0);
  });

  it('applies per-persona override via models config', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      defaultModel: 'gpt-4o',
      models: {
        [AgentPersona.QA_ENGINEER]: { model: 'gpt-4o-mini' },
      },
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(0);
  });

  it('lightModel backward compat applies to QA when models[QA] not set', async () => {
    const client = makeQueuedClient([bizResp, poResp, archResp, devResp, qaPassResp, readmeResp]);

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      workspaceBaseDir: tmpDir,
      defaultClient: client,
      gitFactory: makeMockGit(),
      defaultModel: 'gpt-4o',
      lightModel: 'claude-3-haiku-20240307',
    });

    const results = await orch.run([makeRawStory()]);
    expect(results[0]!.testResults.failed).toBe(0);
  });

  it('rejects empty projectId via Zod validation', () => {
    expect(() => {
      new SprintOrchestrator({
        projectId: '',
      });
    }).toThrow();
  });

  it('rejects invalid temperature via Zod validation', () => {
    expect(() => {
      new SprintOrchestrator({
        projectId: 'test-proj',
        defaultModel: { model: 'gpt-4o', temperature: 2 },
      });
    }).toThrow();
  });

  it('accepts writeBackStory optional hook in config', () => {
    const writeBackStory = async (story: Story, handoff: HandoffDocument, prUrl?: string) => {
      // Noop hook for testing
    };

    const orch = new SprintOrchestrator({
      projectId: 'test-proj',
      writeBackStory,
    });

    expect(orch).toBeDefined();
  });

  it('compiles with OrchestratorConfig type containing writeBackStory', () => {
    // Compile-time type check: OrchestratorConfig should accept writeBackStory field
    const config: OrchestratorConfig = {
      projectId: 'test-proj',
      writeBackStory: async (story: Story, handoff: HandoffDocument, prUrl?: string) => {
        // Type check passes if this compiles
      },
    };

    expect(config.projectId).toBe('test-proj');
  });
});
