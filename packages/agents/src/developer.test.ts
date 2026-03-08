import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DeveloperAgent } from './developer';
import {
  WorkspaceManager,
  HandoffManager,
  AgentPersona,
  StoryState,
  StorySource,
  MockSandbox,
  makeSuccessResult,
  makeFailResult,
  type DiffResult,
  type AgentConfig,
  type Story,
  type HandoffDocument,
  type WorkspaceState,
  type LlmClient,
  type LlmRequest,
  type SandboxResult,
  ArchitectureEnforcer,
  type EnforcementReport,
  type ArchitecturePlan,
  type ImplementationTask,
} from '@splinty/core';

const now = new Date().toISOString();

const agentConfig: AgentConfig = {
  persona: AgentPersona.DEVELOPER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Developer system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeInProgressStory(): Story {
  return {
    id: 'story-dev',
    title: 'As a user, I want to log in so that I can access my account',
    description: 'Secure login with JWT tokens',
    acceptanceCriteria: ['Given valid credentials, When I submit, Then I receive a JWT token'],
    state: StoryState.IN_PROGRESS,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'auth',
    tags: ['auth', 'security'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeArchitectHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.ARCHITECT,
    toAgent: AgentPersona.DEVELOPER,
    storyId: 'story-dev',
    status: 'completed',
    stateOfWorld: {
      techStack: 'TypeScript, Node.js, JWT',
      soundEngineerRequired: 'false',
      soundEngineerRationale: 'No audio features',
      architecturePath: 'artifacts/architecture.md',
      diagramPath: 'artifacts/diagram.mmd',
    },
    nextGoal: 'Implement login service',
    artifacts: ['artifacts/architecture.md'],
    timestamp: now,
  };
}

function makeQaFailHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.QA_ENGINEER,
    toAgent: AgentPersona.DEVELOPER,
    storyId: 'story-dev',
    status: 'completed',
    stateOfWorld: {
      techStack: 'TypeScript, Node.js, JWT',
      verdict: 'FAIL',
      generatedFiles: 'artifacts/src/auth/service.ts,artifacts/src/auth/service.test.ts',
      branchName: 'story/story-dev',
      commitSha: 'abc1234',
      testCommand: 'bun test',
    },
    nextGoal: 'Fix failing acceptance criteria',
    artifacts: [],
    timestamp: now,
  };
}

const validDevResponse = {
  files: [
    { path: 'auth/service.ts', content: 'export function login(email: string, password: string): string { return "jwt"; }' },
    { path: 'auth/service.test.ts', content: 'import { describe, it, expect } from "bun:test"; describe("login", () => { it("returns jwt", () => { expect(true).toBe(true); }); });' },
  ],
  testCommand: 'bun test',
  summary: 'Implemented JWT login service with unit tests',
};

function makeMockClient(response: object | Error): LlmClient {
  return {
    complete: async () => {
      if (response instanceof Error) throw response;
      return JSON.stringify(response);
    },
  };
}

function makeMultiCallClient(responses: Array<object | Error>): LlmClient {
  let callIndex = 0;
  return {
    complete: async () => {
      const response = responses[callIndex++];
      if (!response) throw new Error('No more mock responses');
      if (response instanceof Error) throw response;
      return JSON.stringify(response);
    },
  };
}

function makeTestPlan(): ArchitecturePlan {
  return {
    planId: 'plan-1',
    schemaVersion: 1,
    projectId: 'test-proj',
    level: 'sprint',
    scopeKey: 'sprint:sprint-1',
    sprintId: 'sprint-1',
    status: 'active',
    createdAt: new Date().toISOString(),
    revisionNumber: 0,
    techStack: {
      language: 'TypeScript',
      runtime: 'Node.js',
      framework: 'express',
      testFramework: 'bun:test',
      buildTool: 'tsc',
      rationale: 'Standard stack',
    },
    modules: [
      {
        name: 'auth',
        description: 'Authentication module',
        responsibility: 'Handle user auth',
        directory: 'auth',
        exposedInterfaces: ['AuthService', 'login'],
        dependencies: [],
        owningStories: ['story-dev'],
      },
    ],
    storyModuleMapping: [{ storyId: 'story-dev', modules: ['auth'], primaryModule: 'auth', estimatedFiles: ['auth/service.ts'] }],
    executionOrder: [{ groupId: 1, storyIds: ['story-dev'], rationale: 'Single story', dependsOn: [] }],
    decisions: [],
    constraints: [],
  };
}

function makeTestTask(): ImplementationTask {
  return {
    taskId: 'task-1',
    storyIds: ['story-dev'],
    module: 'auth',
    type: 'create',
    description: 'Implement auth service',
    targetFiles: ['auth/service.ts', 'auth/service.test.ts'],
    ownedFiles: ['auth/service.ts', 'auth/service.test.ts'],
    dependencies: [],
    inputs: [],
    expectedOutputs: ['AuthService'],
    acceptanceCriteria: ['Login returns JWT'],
  };
}

function makeMockEnforcer(reports: EnforcementReport[]): ArchitectureEnforcer {
  let callIndex = 0;
  const enforcer = new ArchitectureEnforcer();
  enforcer.validate = () => {
    const report = reports[callIndex] ?? reports[reports.length - 1]!;
    callIndex++;
    return report;
  };
  return enforcer;
}

function makePassReport(): EnforcementReport {
  return {
    taskId: 'task-1',
    planId: 'plan-1',
    timestamp: new Date().toISOString(),
    status: 'pass',
    violations: [],
    metrics: { totalConstraints: 3, satisfied: 3, violated: 0, warnings: 0 },
  };
}

function makeFailReport(): EnforcementReport {
  return {
    taskId: 'task-1',
    planId: 'plan-1',
    timestamp: new Date().toISOString(),
    status: 'fail',
    violations: [
      {
        constraintId: 'file-ownership-task-1',
        severity: 'error',
        file: 'auth/service.ts',
        description: "Task 'task-1' modified file outside ownership boundary.",
        suggestion: 'Restrict changes to owned files.',
      },
    ],
    metrics: { totalConstraints: 3, satisfied: 2, violated: 1, warnings: 0 },
  };
}

function makeWarnReport(): EnforcementReport {
  return {
    taskId: 'task-1',
    planId: 'plan-1',
    timestamp: new Date().toISOString(),
    status: 'warn',
    violations: [
      {
        constraintId: 'required-export-auth-AuthService',
        severity: 'warning',
        file: 'auth',
        description: "Exposed interface 'AuthService' is not exported by module 'auth'.",
        suggestion: "Export 'AuthService' from auth module.",
      },
    ],
    metrics: { totalConstraints: 3, satisfied: 2, violated: 0, warnings: 1 },
  };
}

// ─── Mock Git Factory ─────────────────────────────────────────────────────────

interface GitCall {
  method: string;
  args: unknown[];
}

function makeMockGit(calls: GitCall[]) {
  const commitResult = { commit: 'abc1234', summary: { changes: 1, insertions: 10, deletions: 0 }, author: null, root: false, branch: 'story/story-dev' };
  return (_repoPath: string) => ({
    init: async (...args: unknown[]) => { calls.push({ method: 'init', args }); },
    checkoutLocalBranch: async (...args: unknown[]) => { calls.push({ method: 'checkoutLocalBranch', args }); },
    add: async (...args: unknown[]) => { calls.push({ method: 'add', args }); },
    commit: async (...args: unknown[]) => { calls.push({ method: 'commit', args }); return commitResult; },
    push: async (...args: unknown[]) => { calls.push({ method: 'push', args }); },
  }) as never;
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-dev-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-dev');

  // Pre-create architecture artifacts
  wsMgr.writeFile(ws, 'artifacts/architecture.md', '# ADR: Login\n\n## Decision\nUse JWT.');
  wsMgr.writeFile(ws, 'artifacts/diagram.mmd', 'C4Context\n  title Login');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('DeveloperAgent', () => {
  it('writes generated source files to workspace artifacts/src/', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const serviceContent = wsMgr.readFile(ws, 'artifacts/src/auth/service.ts');
    expect(serviceContent).toContain('login');
    const testContent = wsMgr.readFile(ws, 'artifacts/src/auth/service.test.ts');
    expect(testContent).toContain('describe');
  });

  it('creates git branch story/{story.id}', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const branchCall = gitCalls.find((c) => c.method === 'checkoutLocalBranch');
    expect(branchCall).toBeTruthy();
    expect(branchCall!.args[0]).toBe('story/story-dev');
  });

  it('commits with correct message feat({id}): {title}', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const commitCall = gitCalls.find((c) => c.method === 'commit');
    expect(commitCall).toBeTruthy();
    expect(commitCall!.args[0]).toBe('feat(story-dev): As a user, I want to log in so that I can access my account');
  });

  it('does NOT call git.push', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const pushCall = gitCalls.find((c) => c.method === 'push');
    expect(pushCall).toBeUndefined();
  });

  it('handoff targets QA_ENGINEER', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.toAgent).toBe(AgentPersona.QA_ENGINEER);
    expect(handoff.fromAgent).toBe(AgentPersona.DEVELOPER);
  });

  it('handoff stateOfWorld contains branchName, commitSha, generatedFiles, testCommand', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['branchName']).toBe('story/story-dev');
    expect(handoff.stateOfWorld['commitSha']).toBe('abc1234');
    expect(handoff.stateOfWorld['generatedFiles']).toContain('artifacts/src/auth/service.ts');
    expect(handoff.stateOfWorld['testCommand']).toBe('bun test');
  });

  it('story transitions to IN_REVIEW', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.state).toBe(StoryState.IN_REVIEW);
  });

  it('throws when files array is empty', async () => {
    const emptyFiles = { ...validDevResponse, files: [] };
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(emptyFiles));
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeArchitectHandoff(), makeInProgressStory())).rejects.toThrow('at least one file');
  });

  it('throws on non-JSON response', async () => {
    const bad: LlmClient = {
      complete: async () => 'not json',
    };

    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, bad);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeArchitectHandoff(), makeInProgressStory())).rejects.toThrow();
  });

  it('handles fenced JSON from Claude', async () => {
    const fenced: LlmClient = {
      complete: async () => `\`\`\`json\n${JSON.stringify(validDevResponse)}\n\`\`\``,
    };

    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, fenced);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    expect(handoff.toAgent).toBe(AgentPersona.QA_ENGINEER);
  });
});

// ─── Fix Loop ─────────────────────────────────────────────────────────────────

describe('DeveloperAgent — compile→test→fix loop', () => {
  const fixResponse = {
    files: [
      { path: 'auth/service.ts', content: 'export function login(email: string, password: string): string { return "fixed-jwt"; }' },
      { path: 'auth/service.test.ts', content: 'import { describe, it, expect } from "bun:test"; describe("login", () => { it("returns jwt", () => { expect(true).toBe(true); }); });' },
    ],
    summary: 'Fixed type error in login function',
  };

  it('retries on build failure and succeeds on second attempt', async () => {
    const installOk = makeSuccessResult('npm install');
    const buildFail = makeFailResult('npm run build', 'TSError: type mismatch');
    const installOk2 = makeSuccessResult('npm install');
    const buildOk2 = makeSuccessResult('npm run build');
    const testOk2 = makeSuccessResult('npm test', '2 tests passed');

    const sandbox = new MockSandbox({
      executeResults: [installOk, buildFail, installOk2, buildOk2, testOk2],
    });

    const client = makeMultiCallClient([validDevResponse, fixResponse]);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.toAgent).toBe(AgentPersona.QA_ENGINEER);
    const execCalls = sandbox.getExecuteCalls();
    // Round 1: install, build (fail) → Round 2: install, build, test
    expect(execCalls.length).toBe(5);
  });

  it('retries on test failure and succeeds', async () => {
    const installOk = makeSuccessResult('npm install');
    const buildOk = makeSuccessResult('npm run build');
    const testFail = makeFailResult('npm test', 'FAIL: expected true got false');
    const installOk2 = makeSuccessResult('npm install');
    const buildOk2 = makeSuccessResult('npm run build');
    const testOk2 = makeSuccessResult('npm test', '2 tests passed');

    const sandbox = new MockSandbox({
      executeResults: [installOk, buildOk, testFail, installOk2, buildOk2, testOk2],
    });

    const client = makeMultiCallClient([validDevResponse, fixResponse]);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.toAgent).toBe(AgentPersona.QA_ENGINEER);
    const parsedTest = JSON.parse(handoff.stateOfWorld['sandboxTestResult']!) as SandboxResult;
    expect(parsedTest.exitCode).toBe(0);
    expect(parsedTest.stdout).toBe('2 tests passed');
  });

  it('exhausts max attempts (3) and passes failures to QA', async () => {
    // 4 rounds total: initial + 3 fix attempts, all fail at build
    const results: SandboxResult[] = [];
    for (let i = 0; i < 4; i++) {
      results.push(makeSuccessResult('npm install'));
      results.push(makeFailResult('npm run build', `TSError round ${i + 1}`));
    }

    const sandbox = new MockSandbox({ executeResults: results });

    const fixResp1 = { files: [{ path: 'auth/service.ts', content: 'fix1' }], summary: 'Fix 1' };
    const fixResp2 = { files: [{ path: 'auth/service.ts', content: 'fix2' }], summary: 'Fix 2' };
    const fixResp3 = { files: [{ path: 'auth/service.ts', content: 'fix3' }], summary: 'Fix 3' };
    const client = makeMultiCallClient([validDevResponse, fixResp1, fixResp2, fixResp3]);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    // Still hands off to QA even with failures
    expect(handoff.toAgent).toBe(AgentPersona.QA_ENGINEER);
    // Build should still be failing
    const parsedBuild = JSON.parse(handoff.stateOfWorld['sandboxBuildResult']!) as SandboxResult;
    expect(parsedBuild.exitCode).toBe(1);
  });

  it('does not enter fix loop when sandbox succeeds on first run', async () => {
    const installOk = makeSuccessResult('npm install');
    const buildOk = makeSuccessResult('npm run build');
    const testOk = makeSuccessResult('npm test', 'all pass');

    const sandbox = new MockSandbox({
      executeResults: [installOk, buildOk, testOk],
    });

    // Only one LLM call for initial generation — no fix call expected
    const client = makeMockClient(validDevResponse);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['fixAttempts']).toBeUndefined();
    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls.length).toBe(3); // Only one round
  });

  it('records fixAttempts count in handoff stateOfWorld', async () => {
    const installOk = makeSuccessResult('npm install');
    const buildFail = makeFailResult('npm run build', 'TSError');
    const installOk2 = makeSuccessResult('npm install');
    const buildOk2 = makeSuccessResult('npm run build');
    const testOk2 = makeSuccessResult('npm test');

    const sandbox = new MockSandbox({
      executeResults: [installOk, buildFail, installOk2, buildOk2, testOk2],
    });

    const client = makeMultiCallClient([validDevResponse, fixResponse]);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['fixAttempts']).toBe('1');
  });

  it('triggers sandboxConstraintRevision when same resource limit violated 2+ times', async () => {
    const memoryViolation = {
      limit: 'memory' as const,
      configured: 512,
      actual: 768,
      description: 'Memory limit exceeded',
    };

    const installOk = makeSuccessResult('npm install');
    const buildFailMem1: SandboxResult = {
      exitCode: 137,
      stdout: '',
      stderr: 'OOMKilled',
      durationMs: 100,
      command: 'npm run build',
      resourceLimitViolation: memoryViolation,
    };
    const installOk2 = makeSuccessResult('npm install');
    const buildFailMem2: SandboxResult = {
      exitCode: 137,
      stdout: '',
      stderr: 'OOMKilled again',
      durationMs: 100,
      command: 'npm run build',
      resourceLimitViolation: memoryViolation,
    };
    const installOk3 = makeSuccessResult('npm install');
    const buildOk3 = makeSuccessResult('npm run build');
    const testOk3 = makeSuccessResult('npm test');

    const sandbox = new MockSandbox({
      executeResults: [installOk, buildFailMem1, installOk2, buildFailMem2, installOk3, buildOk3, testOk3],
    });

    const fixResp1 = { files: [{ path: 'auth/service.ts', content: 'fix1' }, { path: 'auth/service.test.ts', content: 'test1' }], summary: 'Fix 1' };
    const fixResp2 = { files: [{ path: 'auth/service.ts', content: 'fix2' }, { path: 'auth/service.test.ts', content: 'test2' }], summary: 'Fix 2' };
    const client = makeMultiCallClient([validDevResponse, fixResp1, fixResp2]);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['sandboxConstraintRevision']).toBe('memory');
  });

  it('stops fix loop when LLM returns unusable fix (empty files)', async () => {
    const installOk = makeSuccessResult('npm install');
    const buildFail = makeFailResult('npm run build', 'TSError');

    const sandbox = new MockSandbox({
      executeResults: [installOk, buildFail],
    });

    // LLM returns empty files array for fix — should stop
    const emptyFixResponse = { files: [], summary: 'Could not fix' };
    const client = makeMultiCallClient([validDevResponse, emptyFixResponse]);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    // Should still produce handoff to QA
    expect(handoff.toAgent).toBe(AgentPersona.QA_ENGINEER);
    // Only one sandbox round — no retry after unusable fix
    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls.length).toBe(2); // install + build (fail), then stop
    expect(handoff.stateOfWorld['fixAttempts']).toBe('1');
  });

  it('writes fixed files to workspace on successful fix', async () => {
    const installOk = makeSuccessResult('npm install');
    const testFail = makeFailResult('npm test', 'assertion failed');
    const installOk2 = makeSuccessResult('npm install');
    const buildOk2 = makeSuccessResult('npm run build');
    const testOk2 = makeSuccessResult('npm test');

    // Build succeeds in round 1 but test fails
    const buildOk = makeSuccessResult('npm run build');
    const sandbox = new MockSandbox({
      executeResults: [installOk, buildOk, testFail, installOk2, buildOk2, testOk2],
    });

    const fixedContent = 'export function login(): string { return "fixed"; }';
    const fixResp = {
      files: [
        { path: 'auth/service.ts', content: fixedContent },
        { path: 'auth/service.test.ts', content: 'test fixed' },
      ],
      summary: 'Fixed test assertion',
    };
    const client = makeMultiCallClient([validDevResponse, fixResp]);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    // Workspace should have the fixed content
    const content = wsMgr.readFile(ws, 'artifacts/src/auth/service.ts');
    expect(content).toBe(fixedContent);
  });
});

// ─── Sandbox Integration ──────────────────────────────────────────────────────

describe('DeveloperAgent — sandbox integration', () => {
  it('runs sandbox install→build→test when sandbox is set', async () => {
    const sandbox = new MockSandbox();
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls.length).toBe(3);
    expect(execCalls[0]!.command).toBe('npm install');
    expect(execCalls[1]!.command).toBe('npm run build');
    expect(execCalls[2]!.command).toBe('npm test');
  });

  it('writes generated files to sandbox before executing commands', async () => {
    const sandbox = new MockSandbox();
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const writtenFiles = sandbox.getWrittenFiles();
    expect(writtenFiles.size).toBe(2);
    expect(writtenFiles.has('auth/service.ts')).toBe(true);
    expect(writtenFiles.has('auth/service.test.ts')).toBe(true);
  });

  it('serializes sandbox results into handoff stateOfWorld', async () => {
    const installResult = makeSuccessResult('npm install', 'added 100 packages');
    const buildResult = makeSuccessResult('npm run build', 'compiled');
    const testResult = makeSuccessResult('npm test', '2 tests passed');
    const sandbox = new MockSandbox({ executeResults: [installResult, buildResult, testResult] });
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['sandboxInstallResult']).toBeDefined();
    expect(handoff.stateOfWorld['sandboxBuildResult']).toBeDefined();
    expect(handoff.stateOfWorld['sandboxTestResult']).toBeDefined();

    const parsed = JSON.parse(handoff.stateOfWorld['sandboxTestResult']!) as SandboxResult;
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout).toBe('2 tests passed');
  });

  it('stops at install when install fails and fix loop exhausts', async () => {
    const failInstall = makeFailResult('npm install', 'ERR! missing package.json');
    // 4 rounds: initial + 3 fix attempts, all fail at install
    const sandbox = new MockSandbox({
      executeResults: [failInstall, failInstall, failInstall, failInstall],
    });
    const gitCalls: GitCall[] = [];
    const fixResp = { files: [{ path: 'auth/service.ts', content: 'fix' }], summary: 'Fix' };
    const client = makeMultiCallClient([validDevResponse, fixResp, fixResp, fixResp]);
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['sandboxInstallResult']).toBeDefined();
    expect(handoff.stateOfWorld['sandboxBuildResult']).toBeUndefined();
    expect(handoff.stateOfWorld['sandboxTestResult']).toBeUndefined();

    const parsedInstall = JSON.parse(handoff.stateOfWorld['sandboxInstallResult']!) as SandboxResult;
    expect(parsedInstall.exitCode).toBe(1);
  });

  it('stops at build when build fails and fix loop exhausts', async () => {
    const installOk = makeSuccessResult('npm install');
    const buildFail = makeFailResult('npm run build', 'TSError: type mismatch');
    // 4 rounds: initial + 3 fix attempts, all fail at build
    const sandbox = new MockSandbox({
      executeResults: [
        installOk, buildFail,
        installOk, buildFail,
        installOk, buildFail,
        installOk, buildFail,
      ],
    });
    const gitCalls: GitCall[] = [];
    const fixResp = { files: [{ path: 'auth/service.ts', content: 'fix' }], summary: 'Fix' };
    const client = makeMultiCallClient([validDevResponse, fixResp, fixResp, fixResp]);
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['sandboxInstallResult']).toBeDefined();
    expect(handoff.stateOfWorld['sandboxBuildResult']).toBeDefined();
    expect(handoff.stateOfWorld['sandboxTestResult']).toBeUndefined();

    const parsedBuild = JSON.parse(handoff.stateOfWorld['sandboxBuildResult']!) as SandboxResult;
    expect(parsedBuild.exitCode).toBe(1);
  });

  it('does not include sandbox results when no sandbox is set', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['sandboxInstallResult']).toBeUndefined();
    expect(handoff.stateOfWorld['sandboxBuildResult']).toBeUndefined();
    expect(handoff.stateOfWorld['sandboxTestResult']).toBeUndefined();
  });

  it('calls sandbox.cleanup() even when execution throws', async () => {
    const sandbox = new MockSandbox({ executeError: new Error('exec failed') });
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(sandbox.cleanedUp).toBe(true);
  });

  it('detects Python stack and uses pip/pytest commands', async () => {
    const pythonHandoff: HandoffDocument = {
      ...makeArchitectHandoff(),
      stateOfWorld: {
        ...makeArchitectHandoff().stateOfWorld,
        techStack: 'Python, Flask, pytest',
      },
    };

    const sandbox = new MockSandbox();
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    await agent.execute(pythonHandoff, makeInProgressStory());

    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls[0]!.command).toContain('pip install');
    expect(execCalls[2]!.command).toBe('pytest');
  });

  it('initializes sandbox with config when sandboxConfig is provided', async () => {
    const sandbox = new MockSandbox();
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const sandboxConfig = {
      image: 'node:20-slim@sha256:abc123',
      timeoutMs: 30000,
      memoryLimitMb: 512,
      cpuLimit: 1,
      networkEnabled: false,
      workDir: '/app',
      maxDiskMb: 500,
    };
    agent.setSandbox(sandbox, sandboxConfig);

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const initCall = sandbox.calls.find((c) => c.method === 'init');
    expect(initCall).toBeDefined();
    expect((initCall!.args[0] as { image: string }).image).toBe('node:20-slim@sha256:abc123');
  });
});

describe('DeveloperAgent — architecture enforcement', () => {
  it('skips enforcement when no enforcer is set', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    expect(handoff.stateOfWorld['enforcementReport']).toBeUndefined();
    expect(handoff.stateOfWorld['enforcementFixAttempts']).toBeUndefined();
  });

  it('passes enforcement report in handoff when enforcer is set and passes', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setEnforcer(makeMockEnforcer([makePassReport()]), makeTestPlan(), makeTestTask());

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    expect(handoff.stateOfWorld['enforcementReport']).toBeDefined();
    const parsed = JSON.parse(handoff.stateOfWorld['enforcementReport']!) as EnforcementReport;
    expect(parsed.status).toBe('pass');
  });

  it('runs architecture fix when enforcer fails, then passes on retry', async () => {
    const gitCalls: GitCall[] = [];
    const fixResponse = {
      files: validDevResponse.files,
      summary: 'Fixed architecture boundary violations',
    };
    const client = makeMultiCallClient([validDevResponse, fixResponse]);
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setEnforcer(makeMockEnforcer([makeFailReport(), makePassReport()]), makeTestPlan(), makeTestTask());

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    expect(handoff.stateOfWorld['enforcementFixAttempts']).toBe('1');
    const parsed = JSON.parse(handoff.stateOfWorld['enforcementReport']!) as EnforcementReport;
    expect(parsed.status).toBe('pass');
  });

  it('exhausts max architecture fix attempts and passes failures to QA', async () => {
    const gitCalls: GitCall[] = [];
    const fixResponse = { files: validDevResponse.files, summary: 'Tried architecture fix' };
    const client = makeMultiCallClient([validDevResponse, fixResponse, fixResponse, fixResponse]);
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setEnforcer(makeMockEnforcer([makeFailReport(), makeFailReport(), makeFailReport(), makeFailReport()]), makeTestPlan(), makeTestTask());

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    expect(handoff.stateOfWorld['enforcementFixAttempts']).toBe('3');
    const parsed = JSON.parse(handoff.stateOfWorld['enforcementReport']!) as EnforcementReport;
    expect(parsed.status).toBe('fail');
  });

  it('proceeds to sandbox after enforcement passes', async () => {
    const sandbox = new MockSandbox();
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);
    agent.setEnforcer(makeMockEnforcer([makePassReport()]), makeTestPlan(), makeTestTask());

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    expect(handoff.stateOfWorld['enforcementReport']).toBeDefined();
    expect(handoff.stateOfWorld['sandboxBuildResult']).toBeDefined();
  });

  it('enforcement warnings pass through to QA without triggering fix loop', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setEnforcer(makeMockEnforcer([makeWarnReport()]), makeTestPlan(), makeTestTask());

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    const parsed = JSON.parse(handoff.stateOfWorld['enforcementReport']!) as EnforcementReport;
    expect(parsed.status).toBe('warn');
    expect(handoff.stateOfWorld['enforcementFixAttempts']).toBeUndefined();
  });

  it('stops fix loop when architecture fix LLM returns empty files', async () => {
    const gitCalls: GitCall[] = [];
    const emptyFixResponse = { files: [], summary: 'No fix available' };
    const client = makeMultiCallClient([validDevResponse, emptyFixResponse]);
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setEnforcer(makeMockEnforcer([makeFailReport(), makeFailReport()]), makeTestPlan(), makeTestTask());

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    expect(handoff.stateOfWorld['enforcementFixAttempts']).toBe('1');
    const parsed = JSON.parse(handoff.stateOfWorld['enforcementReport']!) as EnforcementReport;
    expect(parsed.status).toBe('fail');
  });

  it('enforcement blocks sandbox when fix loop is exhausted', async () => {
    const sandbox = new MockSandbox({
      executeResults: [
        makeSuccessResult('npm install'),
        makeSuccessResult('npm run build'),
        makeSuccessResult('npm test'),
      ],
    });
    const gitCalls: GitCall[] = [];
    const fixResponse = { files: validDevResponse.files, summary: 'Tried architecture fix' };
    const client = makeMultiCallClient([validDevResponse, fixResponse, fixResponse, fixResponse]);
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);
    agent.setEnforcer(makeMockEnforcer([makeFailReport(), makeFailReport(), makeFailReport(), makeFailReport()]), makeTestPlan(), makeTestTask());

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());
    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls.length).toBe(0);
    expect(handoff.stateOfWorld['enforcementBlocked']).toBe('true');
    expect(handoff.stateOfWorld['enforcementReport']).toBeDefined();
  });
});

// ─── Rework with Diffs ──────────────────────────────────────────────────────

describe('DeveloperAgent — rework with diffs', () => {
  it('rework cycle generates diffs for modified files', async () => {
    wsMgr.writeFile(ws, 'artifacts/src/auth/service.ts', 'export function login(): string { return "old"; }');

    const reworkResponse = {
      files: [
        { path: 'auth/service.ts', content: 'export function login(): string { return "new"; }' },
      ],
      testCommand: 'bun test',
      summary: 'Adjusted login implementation',
    };

    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(reworkResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeQaFailHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['fileDiffs']).toBeDefined();
    const diffs = JSON.parse(handoff.stateOfWorld['fileDiffs']!) as DiffResult[];
    expect(diffs.length).toBe(1);
    expect(diffs[0]!.filePath).toBe('auth/service.ts');
    expect(diffs[0]!.hunks).toBeGreaterThan(0);
    expect(diffs[0]!.patch).toContain('@@');
  });

  it('rework with new files has no diffs for new files', async () => {
    wsMgr.writeFile(ws, 'artifacts/src/auth/service.ts', 'export function login(): string { return "old"; }');

    const reworkResponse = {
      files: [
        { path: 'auth/service.ts', content: 'export function login(): string { return "updated"; }' },
        { path: 'auth/new.ts', content: 'export const isNewFile = true;' },
      ],
      testCommand: 'bun test',
      summary: 'Updated existing file and added new file',
    };

    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(reworkResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeQaFailHandoff(), makeInProgressStory());

    const diffs = JSON.parse(handoff.stateOfWorld['fileDiffs']!) as DiffResult[];
    expect(diffs.length).toBe(1);
    expect(diffs[0]!.filePath).toBe('auth/service.ts');
  });

  it('non-rework cycle does not generate diffs', async () => {
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['fileDiffs']).toBeUndefined();
  });

  it('falls back to full regeneration when patch apply fails', async () => {
    wsMgr.writeFile(ws, 'artifacts/src/auth/service.ts', 'export function login(): string { return "old"; }');

    const reworkResponse = {
      files: [
        { path: 'auth/service.ts', content: 'export function login(): string { return "full-new"; }' },
      ],
      testCommand: 'bun test',
      summary: 'Reworked login',
    };

    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(reworkResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    // @ts-ignore
    agent['diffManager'].applyPatch = () => ({ success: false, content: 'ignored', failedHunks: 1 });

    await agent.execute(makeQaFailHandoff(), makeInProgressStory());

    const content = wsMgr.readFile(ws, 'artifacts/src/auth/service.ts');
    expect(content).toBe('export function login(): string { return "full-new"; }');
  });
});

// ─── Task Context Prompt Injection (Gap 3) ──────────────────────────────────

function makeCapturingClient(response: object): { client: LlmClient; getCapturedMessages: () => LlmRequest[] } {
  const captured: LlmRequest[] = [];
  const client: LlmClient = {
    complete: async (req: LlmRequest) => {
      captured.push(req);
      return JSON.stringify(response);
    },
  };
  return { client, getCapturedMessages: () => captured };
}

describe('DeveloperAgent — task context prompt injection', () => {
  it('injects task description into LLM user message when handoff has task ref', async () => {
    const { client, getCapturedMessages } = makeCapturingClient(validDevResponse);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff: HandoffDocument = {
      ...makeArchitectHandoff(),
      task: {
        taskId: 'task-auth-1',
        module: 'auth',
        type: 'create',
        description: 'Implement JWT login endpoint with bcrypt password hashing',
        targetFiles: ['auth/service.ts', 'auth/controller.ts'],
        expectedOutputs: ['AuthService', 'LoginController'],
        acceptanceCriteria: ['Returns signed JWT on valid credentials'],
        inputs: [{ fromTaskId: 'task-db-1', artifact: 'UserRepository' }],
      },
    };

    await agent.execute(handoff, makeInProgressStory());

    const messages = getCapturedMessages();
    expect(messages.length).toBeGreaterThanOrEqual(1);
    const userMessage = messages[0]!.userMessage;

    expect(userMessage).toContain('task-auth-1');
    expect(userMessage).toContain('auth');
    expect(userMessage).toContain('create');
    expect(userMessage).toContain('Implement JWT login endpoint with bcrypt password hashing');
    expect(userMessage).toContain('auth/service.ts');
    expect(userMessage).toContain('auth/controller.ts');
    expect(userMessage).toContain('AuthService');
    expect(userMessage).toContain('LoginController');
    expect(userMessage).toContain('Returns signed JWT on valid credentials');
    expect(userMessage).toContain('UserRepository');
    expect(userMessage).toContain('task-db-1');
  });

  it('injects relevant files section into LLM user message when projectContext has files', async () => {
    const { client, getCapturedMessages } = makeCapturingClient(validDevResponse);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff: HandoffDocument = {
      ...makeArchitectHandoff(),
      projectContext: {
        projectId: 'proj-1',
        relevantFiles: [
          { path: 'src/db/user-repository.ts', content: 'export class UserRepository { find() {} }' },
          { path: 'src/config/env.ts', content: 'export const JWT_SECRET = process.env.JWT_SECRET;' },
        ],
      },
    };

    await agent.execute(handoff, makeInProgressStory());

    const messages = getCapturedMessages();
    const userMessage = messages[0]!.userMessage;

    expect(userMessage).toContain('Existing Project Files (for context):');
    expect(userMessage).toContain('--- src/db/user-repository.ts ---');
    expect(userMessage).toContain('export class UserRepository');
    expect(userMessage).toContain('--- src/config/env.ts ---');
    expect(userMessage).toContain('JWT_SECRET');
  });

  it('does not inject task context section when handoff has no task ref', async () => {
    const { client, getCapturedMessages } = makeCapturingClient(validDevResponse);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const messages = getCapturedMessages();
    const userMessage = messages[0]!.userMessage;

    expect(userMessage).not.toContain('Task:');
    expect(userMessage).not.toContain('Task Description:');
    expect(userMessage).not.toContain('Target Files:');
    expect(userMessage).not.toContain('Expected Outputs:');
    expect(userMessage).not.toContain('Task Acceptance Criteria:');
    expect(userMessage).not.toContain('Upstream Inputs:');
  });

  it('does not inject relevant files section when projectContext is absent', async () => {
    const { client, getCapturedMessages } = makeCapturingClient(validDevResponse);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    const messages = getCapturedMessages();
    const userMessage = messages[0]!.userMessage;

    expect(userMessage).not.toContain('Existing Project Files (for context):');
  });

  it('injects only populated optional task fields and omits empty ones', async () => {
    const { client, getCapturedMessages } = makeCapturingClient(validDevResponse);
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));

    const handoff: HandoffDocument = {
      ...makeArchitectHandoff(),
      task: {
        taskId: 'task-minimal',
        module: 'auth',
        type: 'extend',
      },
    };

    await agent.execute(handoff, makeInProgressStory());

    const messages = getCapturedMessages();
    const userMessage = messages[0]!.userMessage;

    expect(userMessage).toContain('task-minimal');
    expect(userMessage).toContain('extend');
    expect(userMessage).not.toContain('Task Description:');
    expect(userMessage).not.toContain('Target Files:');
    expect(userMessage).not.toContain('Expected Outputs:');
    expect(userMessage).not.toContain('Task Acceptance Criteria:');
    expect(userMessage).not.toContain('Upstream Inputs:');
  });
});
