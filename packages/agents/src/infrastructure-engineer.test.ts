import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { InfrastructureEngineerAgent } from './infrastructure-engineer';
import {
  AgentPersona,
  HandoffManager,
  StorySource,
  StoryState,
  WorkspaceManager,
  type AgentConfig,
  type HandoffDocument,
  type LlmClient,
  type Story,
  type WorkspaceState,
} from '@splinty/core';

const now = new Date().toISOString();

const agentConfig: AgentConfig = {
  persona: AgentPersona.INFRASTRUCTURE_ENGINEER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Infrastructure engineer system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeStory(): Story {
  return {
    id: 'story-infra',
    title: 'As a platform team, we need repeatable build and deploy automation',
    description: 'Create infra artifacts for local/dev/prod workflows',
    acceptanceCriteria: ['Given service definitions, when infra artifacts are generated, they can run in CI'],
    dependsOn: [],
    state: StoryState.IN_PROGRESS,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'platform',
    tags: ['infrastructure', 'docker', 'ci'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.ARCHITECT,
    toAgent: AgentPersona.INFRASTRUCTURE_ENGINEER,
    storyId: 'story-infra',
    status: 'completed',
    stateOfWorld: {
      techStack: 'TypeScript, Bun, PostgreSQL',
      services: 'api,worker,web',
      projectId: 'proj-infra',
    },
    nextGoal: 'Generate infrastructure artifacts',
    artifacts: [],
    timestamp: now,
  };
}

function makeQueuedClient(queue: string[]): LlmClient {
  let idx = 0;
  return {
    complete: async () => {
      const resp = queue[idx] ?? queue[queue.length - 1]!;
      idx++;
      return resp;
    },
  };
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-infra-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-infra');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('InfrastructureEngineerAgent', () => {
  it('generates all artifact files', async () => {
    const response = JSON.stringify({
      dockerfiles: [
        { service: 'api', content: 'FROM oven/bun:1\nWORKDIR /app\n' },
        { service: 'worker', content: 'FROM oven/bun:1\nWORKDIR /worker\n' },
      ],
      dockerCompose: 'services:\n  api:\n    build: .\n',
      ciConfig: 'name: ci\non: [push]\n',
      deployManifest: 'apiVersion: apps/v1\nkind: Deployment\n',
    });

    const agent = new InfrastructureEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(wsMgr.readFile(ws, 'artifacts/Dockerfile.api')).toContain('FROM oven/bun:1');
    expect(wsMgr.readFile(ws, 'artifacts/Dockerfile.worker')).toContain('WORKDIR /worker');
    expect(wsMgr.readFile(ws, 'artifacts/docker-compose.yml')).toContain('services:');
    expect(wsMgr.readFile(ws, 'artifacts/ci.yml')).toContain('name: ci');
    expect(wsMgr.readFile(ws, 'artifacts/deploy-manifest.yml')).toContain('Deployment');
  });

  it('handles missing optional deployManifest', async () => {
    const response = JSON.stringify({
      dockerfiles: [{ service: 'api', content: 'FROM oven/bun:1\n' }],
      dockerCompose: 'services:\n  api:\n    build: .\n',
      ciConfig: 'name: ci\non: [push]\n',
    });

    const agent = new InfrastructureEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(wsMgr.readFile(ws, 'artifacts/Dockerfile.api')).toContain('FROM oven/bun:1');
    expect(wsMgr.readFile(ws, 'artifacts/docker-compose.yml')).toContain('services:');
    expect(wsMgr.readFile(ws, 'artifacts/ci.yml')).toContain('name: ci');
    expect(() => wsMgr.readFile(ws, 'artifacts/deploy-manifest.yml')).toThrow();
  });

  it('throws on missing dockerCompose', async () => {
    const response = JSON.stringify({
      dockerfiles: [{ service: 'api', content: 'FROM oven/bun:1\n' }],
      ciConfig: 'name: ci\non: [push]\n',
    });

    const agent = new InfrastructureEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await expect(agent.execute(makeHandoff(), makeStory())).rejects.toThrow("missing 'dockerCompose'");
  });

  it('handoff has correct fromAgent/toAgent', async () => {
    const response = JSON.stringify({
      dockerfiles: [{ service: 'api', content: 'FROM oven/bun:1\n' }],
      dockerCompose: 'services:\n  api:\n    build: .\n',
      ciConfig: 'name: ci\non: [push]\n',
    });

    const agent = new InfrastructureEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    const result = await agent.execute(makeHandoff(), makeStory());
    expect(result.fromAgent).toBe(AgentPersona.INFRASTRUCTURE_ENGINEER);
    expect(result.toAgent).toBe(AgentPersona.TECHNICAL_WRITER);
  });
});
