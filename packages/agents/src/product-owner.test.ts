import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProductOwnerAgent } from './product-owner';
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
  persona: AgentPersona.PRODUCT_OWNER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Product owner system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeEpicStory(): Story {
  return {
    id: 'story-002',
    title: 'Build a music streaming feature',
    description: 'Users want to stream audio tracks',
    acceptanceCriteria: [],
    state: StoryState.EPIC,
    source: StorySource.FILE,
    workspacePath: '.splinty/proj/stories/story-002',
    domain: 'general',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeBusinessHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.BUSINESS_OWNER,
    toAgent: AgentPersona.PRODUCT_OWNER,
    storyId: 'story-002',
    status: 'completed',
    stateOfWorld: {
      businessGoals: 'Enable audio streaming for premium users',
      epicSummary: 'Build a music streaming feature with playback controls',
      successMetrics: '1M streams/day, <500ms load time',
      riskFactors: 'Licensing, CDN costs, mobile performance',
    },
    nextGoal: 'Generate user stories',
    artifacts: [],
    timestamp: now,
  };
}

const validResponse = {
  title: 'As a premium user, I want to stream audio tracks so that I can listen on-demand',
  description: 'Enable premium users to stream audio tracks with full playback controls',
  acceptanceCriteria: [
    'Given I am a premium user, When I click Play, Then the track starts within 500ms',
    'Given a track is playing, When I click Pause, Then playback stops immediately',
  ],
  priority: 'MUST',
  storyPoints: 8,
  domain: 'audio',
  tags: ['audio', 'streaming', 'premium'],
};

function makeMockClient(response: object | Error): LlmClient {
  return {
    complete: async () => {
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-po-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-002');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ProductOwnerAgent', () => {
  it('transitions story from EPIC to USER_STORY', async () => {
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeBusinessHandoff(), makeEpicStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.state).toBe(StoryState.USER_STORY);
  });

  it('populates acceptanceCriteria with at least 1 Gherkin scenario', async () => {
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeBusinessHandoff(), makeEpicStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);
  });

  it('populates domain and tags from Claude response', async () => {
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeBusinessHandoff(), makeEpicStory());

    const storyJson = JSON.parse(wsMgr.readFile(ws, 'story.json'));
    expect(storyJson.domain).toBe('audio');
    expect(storyJson.tags).toContain('audio');
  });

  it('returns handoff to ORCHESTRATOR', async () => {
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeBusinessHandoff(), makeEpicStory());

    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
    expect(handoff.fromAgent).toBe(AgentPersona.PRODUCT_OWNER);
  });

  it('stateOfWorld includes priority and storyPoints', async () => {
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeBusinessHandoff(), makeEpicStory());

    expect(handoff.stateOfWorld['priority']).toBe('MUST');
    expect(handoff.stateOfWorld['storyPoints']).toBe('8');
    expect(handoff.stateOfWorld['domain']).toBe('audio');
    expect(handoff.stateOfWorld['tags']).toContain('audio');
  });

  it('handles null handoff (no business context)', async () => {
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeEpicStory());
    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
  });

  it('strips markdown code fences from Claude response', async () => {
    const fencedClient: LlmClient = {
      complete: async () => `\`\`\`json\n${JSON.stringify(validResponse)}\n\`\`\``,
    };

    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, fencedClient);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeBusinessHandoff(), makeEpicStory());
    expect(handoff.toAgent).toBe(AgentPersona.ORCHESTRATOR);
  });

  it('throws when Claude returns non-JSON', async () => {
    const badClient: LlmClient = {
      complete: async () => 'not json at all',
    };

    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, badClient);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeBusinessHandoff(), makeEpicStory())).rejects.toThrow();
  });

  it('throws when acceptanceCriteria is empty array', async () => {
    const noAC = { ...validResponse, acceptanceCriteria: [] };
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(noAC));
    agent.setWorkspace(ws);

    await expect(agent.execute(makeBusinessHandoff(), makeEpicStory())).rejects.toThrow(
      'at least 1 acceptance criterion'
    );
  });

  it('throws when priority is missing', async () => {
    const noPriority = { ...validResponse, priority: undefined };
    const agent = new ProductOwnerAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(noPriority));
    agent.setWorkspace(ws);

    await expect(agent.execute(makeBusinessHandoff(), makeEpicStory())).rejects.toThrow(
      "missing 'priority'"
    );
  });
});
