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
  type AgentConfig,
  type Story,
  type HandoffDocument,
  type WorkspaceState,
  type LlmClient,
  type SandboxResult,
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

  it('stops at install when install fails', async () => {
    const failInstall = makeFailResult('npm install', 'ERR! missing package.json');
    const sandbox = new MockSandbox({ executeResults: [failInstall] });
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
    agent.setWorkspace(ws);
    agent.setGitFactory(makeMockGit(gitCalls));
    agent.setSandbox(sandbox);

    const handoff = await agent.execute(makeArchitectHandoff(), makeInProgressStory());

    expect(handoff.stateOfWorld['sandboxInstallResult']).toBeDefined();
    expect(handoff.stateOfWorld['sandboxBuildResult']).toBeUndefined();
    expect(handoff.stateOfWorld['sandboxTestResult']).toBeUndefined();

    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls.length).toBe(1);
  });

  it('stops at build when build fails', async () => {
    const installOk = makeSuccessResult('npm install');
    const buildFail = makeFailResult('npm run build', 'TSError: type mismatch');
    const sandbox = new MockSandbox({ executeResults: [installOk, buildFail] });
    const gitCalls: GitCall[] = [];
    const agent = new DeveloperAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validDevResponse));
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
