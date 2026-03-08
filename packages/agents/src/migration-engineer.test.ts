import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MigrationEngineerAgent } from './migration-engineer';
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
  persona: AgentPersona.MIGRATION_ENGINEER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Migration engineer system prompt',
  maxRetries: 3,
  temperature: 0.7,
};

function makeStory(): Story {
  return {
    id: 'story-migration',
    title: 'As a platform team, we need versioned database migrations',
    description: 'Generate SQL up/down migration scripts for schema evolution',
    acceptanceCriteria: ['Given migration specs, when generated, then up/down scripts are present'],
    state: StoryState.IN_PROGRESS,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'data',
    tags: ['database', 'migration', 'sql'],
    createdAt: now,
    updatedAt: now,
  };
}

function makeHandoff(): HandoffDocument {
  return {
    fromAgent: AgentPersona.ARCHITECT,
    toAgent: AgentPersona.MIGRATION_ENGINEER,
    storyId: 'story-migration',
    status: 'completed',
    stateOfWorld: {
      techStack: 'TypeScript, Bun, PostgreSQL',
      services: 'api,worker',
      projectId: 'proj-migration',
      dataModel: 'users(id, email), orders(id, user_id)',
    },
    nextGoal: 'Generate migration artifacts',
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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-migration-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-migration');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('MigrationEngineerAgent', () => {
  it('generates up and down SQL files for each migration', async () => {
    const response = JSON.stringify({
      migrations: [
        {
          name: '001_create_users',
          up: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
          down: 'DROP TABLE users;',
        },
        {
          name: '002_create_orders',
          up: 'CREATE TABLE orders (id SERIAL PRIMARY KEY, user_id INT);',
          down: 'DROP TABLE orders;',
        },
      ],
      seedData: "INSERT INTO users (id) VALUES (1);",
    });

    const agent = new MigrationEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(wsMgr.readFile(ws, 'artifacts/migrations/001_create_users.up.sql')).toContain('CREATE TABLE users');
    expect(wsMgr.readFile(ws, 'artifacts/migrations/001_create_users.down.sql')).toContain('DROP TABLE users');
    expect(wsMgr.readFile(ws, 'artifacts/migrations/002_create_orders.up.sql')).toContain('CREATE TABLE orders');
    expect(wsMgr.readFile(ws, 'artifacts/migrations/002_create_orders.down.sql')).toContain('DROP TABLE orders');
  });

  it('handles missing optional seedData', async () => {
    const response = JSON.stringify({
      migrations: [
        {
          name: '001_create_users',
          up: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
          down: 'DROP TABLE users;',
        },
      ],
    });

    const agent = new MigrationEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await agent.execute(makeHandoff(), makeStory());

    expect(wsMgr.readFile(ws, 'artifacts/migrations/001_create_users.up.sql')).toContain('CREATE TABLE users');
    expect(() => wsMgr.readFile(ws, 'artifacts/migrations/seed.sql')).toThrow();
  });

  it('throws on missing migrations array', async () => {
    const response = JSON.stringify({
      seedData: 'INSERT INTO users (id) VALUES (1);',
    });

    const agent = new MigrationEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    await expect(agent.execute(makeHandoff(), makeStory())).rejects.toThrow("missing 'migrations' array");
  });

  it('handoff has correct toAgent', async () => {
    const response = JSON.stringify({
      migrations: [
        {
          name: '001_create_users',
          up: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
          down: 'DROP TABLE users;',
        },
      ],
    });

    const agent = new MigrationEngineerAgent(
      agentConfig,
      wsMgr,
      handoffMgr,
      makeQueuedClient([response])
    );
    agent.setWorkspace(ws);

    const result = await agent.execute(makeHandoff(), makeStory());
    expect(result.fromAgent).toBe(AgentPersona.MIGRATION_ENGINEER);
    expect(result.toAgent).toBe(AgentPersona.INFRASTRUCTURE_ENGINEER);
  });
});
