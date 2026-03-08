import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { type ArchitecturePlan } from './architecture-plan';
import { type PlanRevisionTrigger } from './plan-revision';
import {
  DefaultHumanGate,
  PlannedSprintStateSchema,
  SprintCheckpointManager,
  SprintCheckpointSchema,
  type PlannedSprintState,
  type SprintCheckpoint,
} from './sprint-state';
import { type SprintTaskPlan } from './task-decomposition';
import { WorkspaceManager } from './workspace';

const now = '2026-01-01T00:00:00.000Z';

const makeArchitecturePlan = (): ArchitecturePlan => ({
  planId: 'proj-sprint-001',
  schemaVersion: 1,
  projectId: 'proj',
  level: 'sprint',
  scopeKey: 'sprint:sprint-1',
  sprintId: 'sprint-1',
  parentPlanId: 'proj-global-001',
  status: 'active',
  createdAt: now,
  revisionNumber: 0,
  techStack: {
    language: 'TypeScript',
    runtime: 'Node.js',
    framework: 'Bun',
    testFramework: 'bun:test',
    buildTool: 'bun',
    rationale: 'fast iteration',
  },
  modules: [
    {
      name: 'auth',
      description: 'auth module',
      responsibility: 'authentication',
      directory: 'src/modules/auth',
      exposedInterfaces: ['AuthService'],
      dependencies: [],
      owningStories: ['story-1'],
    },
  ],
  storyModuleMapping: [
    {
      storyId: 'story-1',
      modules: ['auth'],
      primaryModule: 'auth',
      estimatedFiles: ['src/modules/auth/service.ts'],
    },
  ],
  executionOrder: [
    {
      groupId: 1,
      storyIds: ['story-1'],
      rationale: 'single story',
      dependsOn: [],
    },
  ],
  decisions: [
    {
      id: 'dec-1',
      title: 'Use TypeScript',
      context: 'service runtime',
      decision: 'TypeScript on Bun',
      consequences: 'typed codebase',
      status: 'accepted',
    },
  ],
  constraints: [
    {
      id: 'dep-auth',
      type: 'dependency',
      description: 'No unauthorized imports',
      rule: 'auth depends only on shared interfaces',
      severity: 'error',
    },
  ],
});

const makeSprintTaskPlan = (): SprintTaskPlan => ({
  sprintId: 'sprint-1',
  planId: 'proj-sprint-001',
  parentGlobalPlanId: 'proj-global-001',
  schemaVersion: 1,
  tasks: [
    {
      taskId: 'task-1',
      storyIds: ['story-1'],
      module: 'auth',
      type: 'create',
      description: 'create auth service',
      targetFiles: ['src/modules/auth/service.ts'],
      ownedFiles: ['src/modules/auth/service.ts'],
      dependencies: [],
      inputs: [],
      expectedOutputs: ['src/modules/auth/service.ts'],
      acceptanceCriteria: ['Given valid creds, user receives token'],
    },
  ],
  schedule: {
    groups: [{ groupId: 1, taskIds: ['task-1'], dependsOn: [] }],
  },
  integrationTasks: [],
});

const makeCheckpoint = (): SprintCheckpoint => ({
  checkpointId: 'checkpoint-1',
  sprintId: 'sprint-1',
  runId: 'run-1',
  activeSprintPlanId: 'proj-sprint-001',
  activeGlobalPlanId: 'proj-global-001',
  revisionCount: 0,
  completedTaskIds: ['task-1'],
  blockedTaskIds: [],
  remainingTaskSchedule: {
    groups: [{ groupId: 2, taskIds: ['task-2'], dependsOn: [1] }],
  },
  lastCompletedGroupId: 1,
  createdAt: now,
});

const makePlannedState = (): PlannedSprintState => ({
  currentSprintPlan: makeArchitecturePlan(),
  currentGlobalPlanId: 'proj-global-001',
  taskPlan: makeSprintTaskPlan(),
  revisionCount: 0,
  maxRevisions: 1,
  storyRevisionCounts: { 'story-1': 0 },
  maxRevisionsPerStory: 1,
  checkpoint: makeCheckpoint(),
});

describe('SprintCheckpointSchema', () => {
  it('parses valid checkpoint', () => {
    const parsed = SprintCheckpointSchema.parse(makeCheckpoint());
    expect(parsed.sprintId).toBe('sprint-1');
    expect(parsed.remainingTaskSchedule.groups).toHaveLength(1);
  });

  it('rejects invalid checkpoint fields', () => {
    expect(() => SprintCheckpointSchema.parse({ ...makeCheckpoint(), revisionCount: -1 })).toThrow();
  });
});

describe('PlannedSprintStateSchema', () => {
  it('parses valid planned sprint state', () => {
    const parsed = PlannedSprintStateSchema.parse(makePlannedState());
    expect(parsed.currentGlobalPlanId).toBe('proj-global-001');
    expect(parsed.storyRevisionCounts['story-1']).toBe(0);
  });

  it('applies defaults for revision limits and story counts', () => {
    const parsed = PlannedSprintStateSchema.parse({
      currentSprintPlan: makeArchitecturePlan(),
      currentGlobalPlanId: 'proj-global-001',
      taskPlan: makeSprintTaskPlan(),
      revisionCount: 0,
    });

    expect(parsed.maxRevisions).toBe(1);
    expect(parsed.maxRevisionsPerStory).toBe(1);
    expect(parsed.storyRevisionCounts).toEqual({});
  });
});

describe('DefaultHumanGate', () => {
  it('throws when approval is requested', async () => {
    const gate = new DefaultHumanGate();
    const trigger: PlanRevisionTrigger = {
      reason: 'architecture-violation',
      description: 'Boundary conflict',
      evidence: ['module-boundary-change'],
      timestamp: now,
    };
    await expect(gate.requestApproval(trigger)).rejects.toThrow(
      'Human approval required — no interactive gate configured. Set a HumanGate implementation on OrchestratorConfig.'
    );
  });
});

describe('SprintCheckpointManager', () => {
  let tmpDir: string;
  let workspaceManager: WorkspaceManager;
  let checkpointManager: SprintCheckpointManager;
  let ws: ReturnType<WorkspaceManager['createWorkspace']>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-sprint-checkpoint-'));
    workspaceManager = new WorkspaceManager(tmpDir);
    checkpointManager = new SprintCheckpointManager(workspaceManager);
    ws = workspaceManager.createWorkspace('proj', 'story-1');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('save then load returns persisted checkpoint', () => {
    const checkpoint = makeCheckpoint();
    checkpointManager.save(ws, checkpoint);

    const loaded = checkpointManager.load(ws);
    expect(loaded).toEqual(checkpoint);
  });

  it('returns null when checkpoint file is missing', () => {
    const loaded = checkpointManager.load(ws);
    expect(loaded).toBeNull();
  });

  it('returns null for invalid checkpoint JSON', () => {
    workspaceManager.writeFile(ws, 'sprint-checkpoint.json', JSON.stringify({ bad: true }));
    const loaded = checkpointManager.load(ws);
    expect(loaded).toBeNull();
  });

  it('clear removes checkpoint file and exists reflects state', () => {
    checkpointManager.save(ws, makeCheckpoint());
    expect(checkpointManager.exists(ws)).toBe(true);

    checkpointManager.clear(ws);
    expect(checkpointManager.exists(ws)).toBe(false);
  });
});
