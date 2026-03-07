import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TechnicalWriterAgent } from './technical-writer';
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
  type LlmClient,
} from '@splinty/core';

const now = new Date().toISOString();

const agentConfig: AgentConfig = {
  persona: AgentPersona.TECHNICAL_WRITER,
  model: 'claude-3-haiku-20240307',
  systemPrompt: 'Technical writer system prompt',
  maxRetries: 3,
  temperature: 0.2,
};

function makeDoneStory(): Story {
  return {
    id: 'story-tech-writer',
    title: 'As a user, I want to log in so that I can access my account',
    description: 'Secure login with JWT tokens',
    acceptanceCriteria: [
      'Given valid credentials, When I submit, Then I receive a JWT token',
      'Given invalid credentials, When I submit, Then I see an error message',
    ],
    state: StoryState.DONE,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'auth',
    tags: ['auth', 'security'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeQAPassHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.QA_ENGINEER,
    toAgent: AgentPersona.ORCHESTRATOR,
    storyId: 'story-tech-writer',
    status: 'completed',
    stateOfWorld: {
      verdict: 'PASS',
      branchName: 'story/story-tech-writer',
      commitSha: 'abc1234',
      generatedFiles: 'artifacts/src/auth/service.ts',
      qaReportPath: 'artifacts/qa-report.md',
      techStack: 'TypeScript, Node.js, JWT',
    },
    nextGoal: 'Story is DONE — open pull request',
    artifacts: ['artifacts/src/auth/service.ts', 'artifacts/qa-report.md'],
    timestamp: now,
  };
}

const readmeResp = {
  readme: '# Login Service\n\nA JWT-based login service.\n\n## Usage\n\n```bash\nbun run start\n```',
  additionalDocs: [],
};

function makeMockClient(response: object | Error, callCount?: { n: number }): LlmClient {
  return {
    complete: async () => {
      if (callCount) callCount.n++;
      if (response instanceof Error) throw response;
      return JSON.stringify(response);
    },
  };
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-tech-writer-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-tech-writer');

  wsMgr.writeFile(
    ws,
    'artifacts/src/auth/service.ts',
    'export function login(email: string, password: string): string {\n  if (!email || !password) throw new Error("Invalid credentials");\n  return "jwt-token";\n}\n'
  );
  wsMgr.writeFile(
    ws,
    'artifacts/qa-report.md',
    '# QA Report\n\n## Verdict: PASS\n\nAll acceptance criteria met.'
  );
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('TechnicalWriterAgent', () => {
  it('writes README.md to artifacts/', async () => {
    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(readmeResp));
    agent.setWorkspace(ws);

    await agent.execute(makeQAPassHandoff(), makeDoneStory());

    const readme = wsMgr.readFile(ws, 'artifacts/README.md');
    expect(readme).toContain('# Login Service');
  });

  it('handoff targets ORCHESTRATOR', async () => {
    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(readmeResp));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeQAPassHandoff(), makeDoneStory());

    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
    expect(handoff.fromAgent).toBe(AgentPersona.TECHNICAL_WRITER);
  });

  it('stateOfWorld contains readmePath', async () => {
    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(readmeResp));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeQAPassHandoff(), makeDoneStory());

    expect(handoff.stateOfWorld['readmePath']).toBe('artifacts/README.md');
  });

  it('carries forward branchName and commitSha', async () => {
    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(readmeResp));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeQAPassHandoff(), makeDoneStory());

    expect(handoff.stateOfWorld['branchName']).toBe('story/story-tech-writer');
    expect(handoff.stateOfWorld['commitSha']).toBe('abc1234');
  });

  it('writes additional docs when provided', async () => {
    const response = {
      readme: '# Login Service',
      additionalDocs: [
        {
          path: 'CONTRIBUTING.md',
          content: '# Contributing\n\nPlease open a PR.',
        },
      ],
    };

    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(response));
    agent.setWorkspace(ws);

    await agent.execute(makeQAPassHandoff(), makeDoneStory());

    const contributing = wsMgr.readFile(ws, 'artifacts/CONTRIBUTING.md');
    expect(contributing).toContain('Contributing');
  });

  it('throws on non-JSON response', async () => {
    const bad: LlmClient = {
      complete: async () => 'not json',
    };

    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, bad);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeQAPassHandoff(), makeDoneStory())).rejects.toThrow('non-JSON');
  });

  it('throws when readme is empty/missing', async () => {
    const badResp = { readme: '', additionalDocs: [] };
    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(badResp));
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeQAPassHandoff(), makeDoneStory())).rejects.toThrow(
      'readme must be a non-empty string'
    );
  });

  it('handles fenced JSON from LLM', async () => {
    const fenced: LlmClient = {
      complete: async () => `\`\`\`json\n${JSON.stringify(readmeResp)}\n\`\`\``,
    };

    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, fenced);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeQAPassHandoff(), makeDoneStory());
    expect(handoff.stateOfWorld['readmePath']).toBe('artifacts/README.md');
  });

  it('works without workspace (no crash)', async () => {
    const agent = new TechnicalWriterAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(readmeResp));

    const handoff = await agent.execute(makeQAPassHandoff(), makeDoneStory());
    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
    expect(handoff.stateOfWorld['readmePath']).toBe('artifacts/README.md');
  });
});
