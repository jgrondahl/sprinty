import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { IntegrationTestEngineerAgent } from './integration-test-engineer';
import {
  AgentPersona,
  HandoffManager,
  MockIntegrationSandbox,
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
  persona: AgentPersona.INTEGRATION_TEST_ENGINEER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Integration test engineer system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeStory(): Story {
  return {
    id: 'story-integration-tests',
    title: 'As a team, we need confidence in service integration',
    description: 'Generate cross-service integration tests',
    acceptanceCriteria: [
      'Given service endpoints, when tests run, then contracts are validated',
    ],
    dependsOn: [],
    state: StoryState.IN_PROGRESS,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'platform',
    tags: ['integration', 'contracts'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.INFRASTRUCTURE_ENGINEER,
    toAgent: AgentPersona.INTEGRATION_TEST_ENGINEER,
    storyId: 'story-integration-tests',
    status: 'completed',
    stateOfWorld: {
      techStack: 'TypeScript, Bun',
      services: 'api,worker',
      projectId: 'proj-integration-tests',
      serviceUrls: 'api=http://localhost:3001,worker=http://localhost:3002',
    },
    nextGoal: 'Generate integration tests',
    artifacts: [],
    timestamp: now,
  };
}

function makeQueuedClient(queue: string[]): LlmClient {
  let idx = 0;
  return {
    complete: async () => {
      const resp = queue[idx] ?? queue[queue.length - 1]!;
      idx += 1;
      return resp;
    },
  };
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-integration-tests-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-integration-tests');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('IntegrationTestEngineerAgent', () => {
  it('generates test scripts', async () => {
    const response = JSON.stringify({
      tests: [
        { name: 'api-health-check', service: 'api', script: 'curl -f http://api:3000/health' },
        { name: 'worker-contract', service: 'worker', script: 'curl -f http://worker:3000/contracts' },
      ],
    });

    const agent = new IntegrationTestEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(wsMgr.readFile(ws, 'artifacts/integration-tests/api-health-check.sh')).toContain('curl -f');
    expect(wsMgr.readFile(ws, 'artifacts/integration-tests/worker-contract.sh')).toContain('/contracts');
  });

  it('generates runner.sh when testRunner present', async () => {
    const response = JSON.stringify({
      tests: [{ name: 'api-health-check', service: 'api', script: 'curl -f http://api:3000/health' }],
      testRunner: 'set -e\n./api-health-check.sh\n',
    });

    const agent = new IntegrationTestEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(wsMgr.readFile(ws, 'artifacts/integration-tests/runner.sh')).toContain('./api-health-check.sh');
  });

  it('omits runner.sh when testRunner absent', async () => {
    const response = JSON.stringify({
      tests: [{ name: 'api-health-check', service: 'api', script: 'curl -f http://api:3000/health' }],
    });

    const agent = new IntegrationTestEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(() => wsMgr.readFile(ws, 'artifacts/integration-tests/runner.sh')).toThrow();
  });

  it('throws on missing tests array', async () => {
    const response = JSON.stringify({
      testRunner: 'echo running',
    });

    const agent = new IntegrationTestEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await expect(agent.execute(makeHandoff(), makeStory())).rejects.toThrow("missing 'tests' array");
  });

  it('executes tests via sandbox when sandbox is set', async () => {
    const response = JSON.stringify({
      tests: [
        { name: 'api-health-check', service: 'api', script: 'curl -f http://api:3000/health' },
        { name: 'worker-contract', service: 'worker', script: 'curl -f http://worker:3000/contracts' },
      ],
    });

    const agent = new IntegrationTestEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    const sandbox = new MockIntegrationSandbox();
    agent.setIntegrationSandbox(sandbox);
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(sandbox.executeCalls).toHaveLength(2);
    expect(sandbox.executeCalls[0]).toEqual({ name: 'api', command: 'curl -f http://api:3000/health' });
    expect(sandbox.executeCalls[1]).toEqual({ name: 'worker', command: 'curl -f http://worker:3000/contracts' });
  });
});
