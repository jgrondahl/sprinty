import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { QAEngineerAgent } from './qa-engineer';
import {
  WorkspaceManager,
  HandoffManager,
  AgentPersona,
  StoryState,
  StorySource,
  type AgentConfig,
  type Story,
  type HandoffDocument,
  type WorkspaceState,
} from '@splinty/core';

const now = new Date().toISOString();

const agentConfig: AgentConfig = {
  persona: AgentPersona.QA_ENGINEER,
  model: 'claude-3-haiku-20240307',
  systemPrompt: 'QA engineer system prompt',
  maxRetries: 3,
  temperature: 0.2,
};

function makeInReviewStory(): Story {
  return {
    id: 'story-qa',
    title: 'As a user, I want to log in so that I can access my account',
    description: 'Secure login with JWT tokens',
    acceptanceCriteria: [
      'Given valid credentials, When I submit, Then I receive a JWT token',
      'Given invalid credentials, When I submit, Then I see an error message',
    ],
    state: StoryState.IN_REVIEW,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'auth',
    tags: ['auth', 'security'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeDeveloperHandoff(reworkCount = 0): HandoffDocument {
  return {
    fromAgent: AgentPersona.DEVELOPER,
    toAgent: AgentPersona.QA_ENGINEER,
    storyId: 'story-qa',
    status: 'completed',
    stateOfWorld: {
      branchName: 'story/story-qa',
      commitSha: 'abc1234',
      generatedFiles: 'artifacts/src/auth/service.ts,artifacts/src/auth/service.test.ts',
      testCommand: 'bun test',
      summary: 'Implemented JWT login service',
      reworkCount: String(reworkCount),
    },
    nextGoal: 'Run QA on the login service',
    artifacts: ['artifacts/src/auth/service.ts', 'artifacts/src/auth/service.test.ts'],
    timestamp: now,
  };
}

const passVerdict = {
  passedAC: [
    'Given valid credentials, When I submit, Then I receive a JWT token',
    'Given invalid credentials, When I submit, Then I see an error message',
  ],
  failedAC: [],
  bugs: [],
  verdict: 'PASS',
  additionalTests: [
    {
      path: 'edge-cases.test.ts',
      content: 'import { describe, it, expect } from "bun:test";\ndescribe("edge cases", () => { it("handles empty credentials", () => { expect(true).toBe(true); }); });\n',
    },
  ],
  report: '# QA Report\n\n## Verdict: PASS\n\nAll acceptance criteria met.',
};

const failVerdict = {
  passedAC: ['Given valid credentials, When I submit, Then I receive a JWT token'],
  failedAC: ['Given invalid credentials, When I submit, Then I see an error message'],
  bugs: [{ description: 'Missing error handling for invalid credentials', severity: 'major' }],
  verdict: 'FAIL',
  additionalTests: [],
  report: '# QA Report\n\n## Verdict: FAIL\n\nError handling missing.',
};

const blockedVerdict = {
  passedAC: [],
  failedAC: ['Given valid credentials, When I submit, Then I receive a JWT token'],
  bugs: [{ description: 'Source files missing — cannot test', severity: 'critical' }],
  verdict: 'BLOCKED',
  additionalTests: [],
  report: '# QA Report\n\n## Verdict: BLOCKED\n\nSource files not found.',
};

function makeMockClient(response: object | Error, callCount?: { n: number }) {
  return {
    messages: {
      create: async () => {
        if (callCount) callCount.n++;
        if (response instanceof Error) throw response;
        return { content: [{ type: 'text', text: JSON.stringify(response) }] };
      },
    },
  } as never;
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-qa-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-qa');

  // Pre-populate source files
  wsMgr.writeFile(
    ws,
    'artifacts/src/auth/service.ts',
    'export function login(email: string, password: string): string {\n  if (!email || !password) throw new Error("Invalid credentials");\n  return "jwt-token";\n}\n'
  );
  wsMgr.writeFile(
    ws,
    'artifacts/src/auth/service.test.ts',
    'import { describe, it, expect } from "bun:test";\nimport { login } from "./service";\ndescribe("login", () => { it("returns token", () => { expect(login("a@b.com", "pass")).toBe("jwt-token"); }); });\n'
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── PASS verdict ─────────────────────────────────────────────────────────────

describe('QAEngineerAgent — PASS verdict', () => {
  it('transitions story to DONE on PASS', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(passVerdict));
    agent.setWorkspace(ws);

    await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.state).toBe(StoryState.DONE);
  });

  it('handoff targets ORCHESTRATOR on PASS', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(passVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
    expect(handoff.fromAgent).toBe(AgentPersona.QA_ENGINEER);
  });

  it('stateOfWorld.verdict === PASS', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(passVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    expect(handoff.stateOfWorld['verdict']).toBe('PASS');
  });

  it('writes QA report to artifacts/qa-report.md on PASS', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(passVerdict));
    agent.setWorkspace(ws);

    await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    const report = wsMgr.readFile(ws, 'artifacts/qa-report.md');
    expect(report).toContain('PASS');
  });

  it('writes additional test files to artifacts/src/__tests__/', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(passVerdict));
    agent.setWorkspace(ws);

    await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    const testFile = wsMgr.readFile(ws, 'artifacts/src/__tests__/qa-edge-cases.test.ts');
    expect(testFile).toContain('edge cases');
  });

  it('stateOfWorld contains branchName on PASS', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(passVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    expect(handoff.stateOfWorld['branchName']).toBe('story/story-qa');
  });
});

// ─── FAIL verdict — rework ────────────────────────────────────────────────────

describe('QAEngineerAgent — FAIL verdict (rework)', () => {
  it('transitions story back to IN_PROGRESS on FAIL', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(failVerdict));
    agent.setWorkspace(ws);

    await agent.execute(makeDeveloperHandoff(0), makeInReviewStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.state).toBe(StoryState.IN_PROGRESS);
  });

  it('handoff targets DEVELOPER on FAIL (first rework)', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(failVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(0), makeInReviewStory());

    expect(handoff.toAgent).toBe(AgentPersona.DEVELOPER);
    expect(handoff.stateOfWorld['verdict']).toBe('FAIL');
  });

  it('increments reworkCount in stateOfWorld', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(failVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(0), makeInReviewStory());

    expect(handoff.stateOfWorld['reworkCount']).toBe('1');
  });

  it('stateOfWorld contains failedAC on FAIL', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(failVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(0), makeInReviewStory());

    expect(handoff.stateOfWorld['failedAC']).toContain('invalid credentials');
  });

  it('escalates to BLOCKED after exceeding max rework cycles', async () => {
    // reworkCount=2 means we have already done 2 reworks — next fail should block
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(failVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(2), makeInReviewStory());

    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
    expect(handoff.stateOfWorld['verdict']).toBe('BLOCKED');
    expect(handoff.stateOfWorld['reason']).toContain('rework cycles');
  });

  it('story stays in IN_REVIEW when max rework cycles exceeded', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(failVerdict));
    agent.setWorkspace(ws);

    await agent.execute(makeDeveloperHandoff(2), makeInReviewStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.state).toBe(StoryState.IN_REVIEW);
  });
});

// ─── BLOCKED verdict ──────────────────────────────────────────────────────────

describe('QAEngineerAgent — BLOCKED verdict', () => {
  it('story stays IN_REVIEW on BLOCKED', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(blockedVerdict));
    agent.setWorkspace(ws);

    await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.state).toBe(StoryState.IN_REVIEW);
  });

  it('handoff targets ORCHESTRATOR on BLOCKED', async () => {
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(blockedVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(), makeInReviewStory());

    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
    expect(handoff.stateOfWorld['verdict']).toBe('BLOCKED');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('QAEngineerAgent — error handling', () => {
  it('throws on non-JSON response', async () => {
    const bad = {
      messages: {
        create: async () => ({ content: [{ type: 'text', text: 'not json' }] }),
      },
    } as never;

    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, bad);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeDeveloperHandoff(), makeInReviewStory())).rejects.toThrow(
      'non-JSON'
    );
  });

  it('throws when verdict is invalid', async () => {
    const badVerdict = { ...passVerdict, verdict: 'UNKNOWN' };
    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(badVerdict));
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeDeveloperHandoff(), makeInReviewStory())).rejects.toThrow(
      'verdict must be PASS'
    );
  });

  it('handles fenced JSON from Claude', async () => {
    const fenced = {
      messages: {
        create: async () => ({
          content: [{ type: 'text', text: `\`\`\`json\n${JSON.stringify(passVerdict)}\n\`\`\`` }],
        }),
      },
    } as never;

    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, fenced);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeDeveloperHandoff(), makeInReviewStory());
    expect(handoff.stateOfWorld['verdict']).toBe('PASS');
  });

  it('works when no source files listed in handoff', async () => {
    const handoffNoFiles: HandoffDocument = {
      ...makeDeveloperHandoff(),
      stateOfWorld: { ...makeDeveloperHandoff().stateOfWorld, generatedFiles: '' },
    };

    const agent = new QAEngineerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(passVerdict));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(handoffNoFiles, makeInReviewStory());
    expect(handoff.stateOfWorld['verdict']).toBe('PASS');
  });
});
