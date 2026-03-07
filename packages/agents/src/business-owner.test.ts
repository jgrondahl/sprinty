import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BusinessOwnerAgent } from './business-owner';
import {
  WorkspaceManager,
  HandoffManager,
  AgentPersona,
  StoryState,
  StorySource,
  type AgentConfig,
  type Story,
  type WorkspaceState,
  type LlmClient,
} from '@splinty/core';

const now = new Date().toISOString();

const agentConfig: AgentConfig = {
  persona: AgentPersona.BUSINESS_OWNER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Business owner system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeRawStory(): Story {
  return {
    id: 'story-001',
    title: 'Build a login system',
    description: 'Users need to be able to log in securely',
    acceptanceCriteria: [],
    state: StoryState.RAW,
    source: StorySource.FILE,
    workspacePath: '.splinty/proj/stories/story-001',
    domain: 'general',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeMockClient(jsonResponse: Record<string, string>): LlmClient {
  return {
    complete: async () => JSON.stringify(jsonResponse),
  };
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-bo-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-001');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const validResponse = {
  businessGoals: 'Enable secure user authentication',
  successMetrics: '99.9% uptime, <200ms response time',
  riskFactors: 'Security vulnerabilities, dependency on auth service, scaling',
  epicSummary: 'Build a robust authentication system supporting email/password login',
};

describe('BusinessOwnerAgent', () => {
  it('returns handoff to PRODUCT_OWNER', async () => {
    const client = makeMockClient(validResponse);
    const agent = new BusinessOwnerAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeRawStory());
    expect(handoff.toAgent).toBe(AgentPersona.PRODUCT_OWNER);
    expect(handoff.fromAgent).toBe(AgentPersona.BUSINESS_OWNER);
  });

  it('stateOfWorld contains all 4 required keys', async () => {
    const client = makeMockClient(validResponse);
    const agent = new BusinessOwnerAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeRawStory());
    expect(handoff.stateOfWorld['businessGoals']).toBeTruthy();
    expect(handoff.stateOfWorld['successMetrics']).toBeTruthy();
    expect(handoff.stateOfWorld['riskFactors']).toBeTruthy();
    expect(handoff.stateOfWorld['epicSummary']).toBeTruthy();
  });

  it('story state is EPIC (transitioned from RAW)', async () => {
    const client = makeMockClient(validResponse);
    const agent = new BusinessOwnerAgent(agentConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeRawStory());
    // Verify story.json was written with EPIC state
    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.state).toBe(StoryState.EPIC);
  });

  it('throws on malformed JSON response', async () => {
    const badClient: LlmClient = {
      complete: async () => 'not valid json',
    };

    const agent = new BusinessOwnerAgent(agentConfig, wsMgr, handoffMgr, badClient);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(null, makeRawStory())).rejects.toThrow();
  });

  it('handles markdown-fenced JSON from Claude', async () => {
    const fencedClient: LlmClient = {
      complete: async () => `\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``,
    };

    const agent = new BusinessOwnerAgent(agentConfig, wsMgr, handoffMgr, fencedClient);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeRawStory());
    expect(handoff.stateOfWorld['businessGoals']).toBeTruthy();
  });
});
