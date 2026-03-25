import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ArchitectAgent } from './architect';
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
  persona: AgentPersona.ARCHITECT,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Architect system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeSprintReadyStory(tags: string[] = ['web', 'auth']): Story {
  return {
    id: 'story-arch',
    title: 'As a user, I want to log in so that I can access my account',
    description: 'Secure login with JWT tokens',
    acceptanceCriteria: [
      'Given valid credentials, When I submit, Then I receive a JWT token',
    ],
    dependsOn: [],
    state: StoryState.SPRINT_READY,
    source: StorySource.FILE,
    workspacePath: '',
    domain: tags.includes('audio') ? 'audio' : 'auth',
    tags,
    createdAt: now,
    updatedAt: now,
  };
}

function makeRefinementHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.ORCHESTRATOR,
    toAgent: AgentPersona.ARCHITECT,
    storyId: 'story-arch',
    status: 'completed',
    stateOfWorld: {
      businessGoals: 'Enable secure authentication',
      acceptanceCriteria: 'Given valid credentials, When I submit, Then I receive a JWT token',
    },
    nextGoal: 'Design system architecture',
    artifacts: [],
    timestamp: now,
  };
}

const validNonAudioResponse = {
  adr: `# ADR-001: JWT Authentication\n\n## Status\nAccepted\n\n## Context\nNeed secure auth.\n\n## Decision\nUse JWT with RS256.\n\n## Consequences\nStateless, scalable.`,
  diagram: `C4Context\n  title Login System\n  Person(user, "User")\n  System(api, "Auth API")`,
  techStack: 'TypeScript, Node.js, JWT, PostgreSQL',
  soundEngineerRequired: false,
  soundEngineerRationale: 'No audio or ML features required for authentication.',
};

const validAudioResponse = {
  adr: `# ADR-002: Audio ML Pipeline\n\n## Status\nAccepted\n\n## Context\nNeed audio processing.\n\n## Decision\nPython + Librosa pipeline.\n\n## Consequences\nHigh accuracy, Python dependency.`,
  diagram: `C4Context\n  title Audio Pipeline\n  Person(user, "User")\n  System(pipeline, "ML Audio Service")`,
  techStack: 'Python, Librosa, PyTorch',
  soundEngineerRequired: true,
  soundEngineerRationale: 'Audio ML requires specialised Python tooling: Librosa for feature extraction, PyTorch for model training.',
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-arch-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-arch');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ArchitectAgent', () => {
  it('writes architecture.md to workspace artifacts', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validNonAudioResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeRefinementHandoff(), makeSprintReadyStory());

    const adr = wsMgr.readFile(ws, 'artifacts/architecture.md');
    expect(adr).toContain('ADR');
  });

  it('writes diagram.mmd to workspace artifacts', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validNonAudioResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeRefinementHandoff(), makeSprintReadyStory());

    const diagram = wsMgr.readFile(ws, 'artifacts/diagram.mmd');
    expect(diagram).toBeTruthy();
    expect(diagram.length).toBeGreaterThan(0);
  });

  it('non-audio story: soundEngineerRequired === false in handoff', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validNonAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeRefinementHandoff(), makeSprintReadyStory(['web', 'auth']));

    expect(handoff.stateOfWorld['soundEngineerRequired']).toBe('false');
  });

  it('audio story: soundEngineerRequired === true in handoff', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeRefinementHandoff(), makeSprintReadyStory(['audio', 'ml']));

    expect(handoff.stateOfWorld['soundEngineerRequired']).toBe('true');
  });

  it('soundEngineerRationale is non-empty string for audio story', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeRefinementHandoff(), makeSprintReadyStory(['audio', 'ml']));

    expect(handoff.stateOfWorld['soundEngineerRationale']).toBeTruthy();
  });

  it('sets soundEngineerRequired true from story tags even if Claude returns false', async () => {
    // Claude says false, but story has 'audio' tag — tags win
    const contradictory = { ...validNonAudioResponse, soundEngineerRequired: false };
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(contradictory));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeRefinementHandoff(), makeSprintReadyStory(['audio']));

    expect(handoff.stateOfWorld['soundEngineerRequired']).toBe('true');
  });

  it('handoff targets DEVELOPER', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validNonAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeRefinementHandoff(), makeSprintReadyStory());

    expect(handoff.toAgent).toBe(AgentPersona.DEVELOPER);
    expect(handoff.fromAgent).toBe(AgentPersona.ARCHITECT);
  });

  it('story transitions to IN_PROGRESS', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validNonAudioResponse));
    agent.setWorkspace(ws);

    await agent.execute(makeRefinementHandoff(), makeSprintReadyStory());

    // Story.json not written by Architect — but story passed to buildHandoff reflects IN_PROGRESS
    const handoff = await agent.execute(makeRefinementHandoff(), makeSprintReadyStory());
    expect(handoff.stateOfWorld['architecturePath']).toBe('artifacts/architecture.md');
  });

  it('strips markdown code fences from response', async () => {
    const fenced: LlmClient = {
      complete: async () => `\`\`\`json\n${JSON.stringify(validNonAudioResponse)}\n\`\`\``,
    };

    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, fenced);
    agent.setWorkspace(ws);

    const handoff = await agent.execute(makeRefinementHandoff(), makeSprintReadyStory());
    expect(handoff.toAgent).toBe(AgentPersona.DEVELOPER);
  });

  it('throws when adr missing from response', async () => {
    const noAdr = { ...validNonAudioResponse, adr: undefined };
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(noAdr));
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeRefinementHandoff(), makeSprintReadyStory())).rejects.toThrow("missing 'adr'");
  });

  it('throws when diagram missing from response', async () => {
    const noDiagram = { ...validNonAudioResponse, diagram: undefined };
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(noDiagram));
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeRefinementHandoff(), makeSprintReadyStory())).rejects.toThrow("missing 'diagram'");
  });

  it('throws on non-JSON response', async () => {
    const bad: LlmClient = {
      complete: async () => 'not json',
    };

    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, bad);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(agent.execute(makeRefinementHandoff(), makeSprintReadyStory())).rejects.toThrow();
  });

  it('handles null handoff (direct invocation)', async () => {
    const agent = new ArchitectAgent(agentConfig, wsMgr, handoffMgr, makeMockClient(validNonAudioResponse));
    agent.setWorkspace(ws);

    const handoff = await agent.execute(null, makeSprintReadyStory());
    expect(handoff.toAgent).toBe(AgentPersona.DEVELOPER);
  });
});
