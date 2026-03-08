import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResumeManager, ResumePointSchema, type ResumePoint } from './resume';
import { WorkspaceManager } from './workspace';
import { AgentPersona, StoryState, StorySource, type WorkspaceState } from './types';

let tmpDir: string;
let workspaceManager: WorkspaceManager;
let resumeManager: ResumeManager;
let ws: WorkspaceState;

const makeResumePoint = (): ResumePoint => {
  const now = new Date().toISOString();
  return {
    storyId: 'story-001',
    projectId: 'proj-001',
    lastCompletedAgent: AgentPersona.ARCHITECT,
    handoffId: 'handoff-001',
    handoff: {
      fromAgent: AgentPersona.ARCHITECT,
      toAgent: AgentPersona.DEVELOPER,
      storyId: 'story-001',
      status: 'completed',
      stateOfWorld: {
        architecture: 'layered',
      },
      nextGoal: 'Implement features',
      artifacts: ['artifacts/architecture.md'],
      timestamp: now,
    },
    storySnapshot: {
      id: 'story-001',
      title: 'As a user, I can log in',
      description: 'Add authentication flow',
      acceptanceCriteria: ['User can authenticate with valid credentials'],
      state: StoryState.SPRINT_READY,
      source: StorySource.FILE,
      sourceId: 'STORY-001',
      storyPoints: 3,
      domain: 'auth',
      tags: ['backend'],
      workspacePath: '.splinty/proj-001/stories/story-001',
      createdAt: now,
      updatedAt: now,
      dependsOn: [],
    },
    timestamp: now,
    pipelineStep: 4,
    metadata: {
      qaAttempts: '1',
    },
  };
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-resume-'));
  workspaceManager = new WorkspaceManager(tmpDir);
  resumeManager = new ResumeManager(workspaceManager);
  ws = workspaceManager.createWorkspace('proj-001', 'story-001');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ResumePointSchema', () => {
  it('parses a valid resume point', () => {
    const point = makeResumePoint();
    const parsed = ResumePointSchema.parse(point);
    expect(parsed.storyId).toBe('story-001');
    expect(parsed.lastCompletedAgent).toBe(AgentPersona.ARCHITECT);
    expect(parsed.pipelineStep).toBe(4);
  });

  it('rejects invalid resume point', () => {
    const point = makeResumePoint();
    expect(() =>
      ResumePointSchema.parse({
        ...point,
        pipelineStep: -1,
      })
    ).toThrow();
  });
});

describe('ResumeManager.save()', () => {
  it('writes resume-point.json to workspace', () => {
    const point = makeResumePoint();
    resumeManager.save(ws, point);

    const fullPath = path.join(ws.basePath, 'resume-point.json');
    expect(fs.existsSync(fullPath)).toBe(true);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const parsed = JSON.parse(raw) as ResumePoint;
    expect(parsed.handoffId).toBe('handoff-001');
  });
});

describe('ResumeManager.load()', () => {
  it('reads and parses saved resume point', () => {
    const point = makeResumePoint();
    resumeManager.save(ws, point);

    const loaded = resumeManager.load(ws);
    expect(loaded).not.toBeNull();
    expect(loaded!.storyId).toBe('story-001');
    expect(loaded!.storySnapshot.state).toBe(StoryState.SPRINT_READY);
  });

  it('returns null when no resume point exists', () => {
    const loaded = resumeManager.load(ws);
    expect(loaded).toBeNull();
  });
});

describe('ResumeManager.clear()', () => {
  it('removes resume-point.json from workspace', () => {
    const point = makeResumePoint();
    resumeManager.save(ws, point);

    const fullPath = path.join(ws.basePath, 'resume-point.json');
    expect(fs.existsSync(fullPath)).toBe(true);

    resumeManager.clear(ws);
    expect(fs.existsSync(fullPath)).toBe(false);
  });
});

describe('ResumeManager.exists()', () => {
  it('returns false when file does not exist', () => {
    expect(resumeManager.exists(ws)).toBe(false);
  });

  it('returns true when file exists', () => {
    resumeManager.save(ws, makeResumePoint());
    expect(resumeManager.exists(ws)).toBe(true);
  });
});

describe('ResumeManager round-trip', () => {
  it('save then load returns identical data', () => {
    const point = makeResumePoint();
    resumeManager.save(ws, point);

    const loaded = resumeManager.load(ws);
    expect(loaded).toEqual(point);
  });
});
