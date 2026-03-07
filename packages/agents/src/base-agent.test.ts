import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BaseAgent, AgentCallError } from './base-agent';
import {
  WorkspaceManager,
  HandoffManager,
  AgentPersona,
  StoryState,
  StorySource,
  type AgentConfig,
  type HandoffDocument,
  type Story,
  type WorkspaceState,
  type LlmClient,
} from '@splinty/core';

// ── Concrete test subclass ───────────────────────────────────────────────────

class TestAgent extends BaseAgent {
  public callCount = 0;
  public lastUserMessage = '';

  async execute(_handoff: HandoffDocument | null, story: Story): Promise<HandoffDocument> {
    const result = await this.callClaude({
      systemPrompt: 'You are a test agent.',
      userMessage: `Process story: ${story.id}`,
    });
    this.lastUserMessage = result;
    return this.buildHandoff(story, AgentPersona.PRODUCT_OWNER, { result }, 'Next step', []);
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const now = new Date().toISOString();

const agentConfig: AgentConfig = {
  persona: AgentPersona.BUSINESS_OWNER,
  model: 'claude-test-model',
  systemPrompt: 'Test system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeStory(state: StoryState = StoryState.RAW): Story {
  return {
    id: 'story-001',
    title: 'Test story',
    description: 'desc',
    acceptanceCriteria: [],
    state,
    source: StorySource.FILE,
    workspacePath: '.splinty/proj/stories/story-001',
    domain: 'general',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-agent-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-001');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockLlmClient(responses: Array<string | Error>): LlmClient {
  let callIndex = 0;
  return {
    complete: async () => {
      const response = responses[callIndex++];
      if (response instanceof Error) throw response;
      return response as string;
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BaseAgent.callLlm() — retry logic', () => {
  it('succeeds on first attempt', async () => {
    const client = makeMockLlmClient(['Hello from Claude']);
    const agent = new TestAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeStory());
    expect(handoff.stateOfWorld['result']).toBe('Hello from Claude');
  });

  it('retries and succeeds on 3rd attempt', async () => {
    const client = makeMockLlmClient([
      new Error('Overloaded'),
      new Error('Overloaded'),
      'Success on 3rd',
    ]);
    const agent = new TestAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    // Speed up by using 0ms delays — but we need to mock sleep
    // For this test we accept real 1+2=3s delay or mock it
    // We'll override the sleep via reduced maxRetries approach:
    const fastConfig: AgentConfig = { ...agentConfig, maxRetries: 3 };
    const fastAgent = new TestAgent(fastConfig, wsMgr, handoffMgr, client);
    fastAgent.setWorkspace(ws);

    // Patch sleep to be instant
    // @ts-ignore - accessing private for test
    fastAgent['sleep'] = () => Promise.resolve();

    const handoff = await fastAgent.execute(null, makeStory());
    expect(handoff.stateOfWorld['result']).toBe('Success on 3rd');
  });

  it('throws AgentCallError after maxRetries failures', async () => {
    const client = makeMockLlmClient([
      new Error('Fail 1'),
      new Error('Fail 2'),
      new Error('Fail 3'),
    ]);
    const agent = new TestAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(null, makeStory())).rejects.toThrow(AgentCallError);
  });

  it('AgentCallError message contains persona and attempt count', async () => {
    const client = makeMockLlmClient([new Error('X'), new Error('X'), new Error('X')]);
    const agent = new TestAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    try {
      await agent.execute(null, makeStory());
    } catch (e) {
      expect(e).toBeInstanceOf(AgentCallError);
      const err = e as AgentCallError;
      expect(err.persona).toBe(AgentPersona.BUSINESS_OWNER);
      expect(err.attempts).toBe(3);
    }
  });

  it('writes to errors.log after all failures', async () => {
    const client = makeMockLlmClient([new Error('Bad'), new Error('Bad'), new Error('Bad')]);
    const agent = new TestAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    try {
      await agent.execute(null, makeStory());
    } catch {
      // expected
    }

    const errLog = path.join(ws.basePath, 'errors.log');
    const content = fs.readFileSync(errLog, 'utf-8');
    expect(content).toContain('ERROR');
    expect(content.length).toBeGreaterThan(0);
  });
});

describe('BaseAgent.buildHandoff()', () => {
  it('produces a valid HandoffDocument', async () => {
    const client = makeMockLlmClient(['response text']);
    const agent = new TestAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeStory());
    expect(handoff.fromAgent).toBe(AgentPersona.BUSINESS_OWNER);
    expect(handoff.toAgent).toBe(AgentPersona.PRODUCT_OWNER);
    expect(handoff.storyId).toBe('story-001');
    expect(handoff.status).toBe('completed');
  });
});

describe('BaseAgent.logActivity()', () => {
  it('writes to agent.log', async () => {
    const client = makeMockLlmClient(['ok']);
    const agent = new TestAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    await agent.execute(null, makeStory());

    const log = path.join(ws.basePath, 'agent.log');
    const content = fs.readFileSync(log, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('BUSINESS_OWNER');
  });
});
