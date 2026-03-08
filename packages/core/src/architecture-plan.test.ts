import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ArchitectureConstraintSchema,
  ArchitecturePlanManager,
  ArchitecturePlanRefSchema,
  ArchitecturePlanSchema,
  ImplementationTaskRefSchema,
  PlanQualityScoreSchema,
  SprintTaskPlanRefSchema,
  TechStackDecisionSchema,
  type ArchitecturePlan,
} from './architecture-plan';
import { AgentPersona, HandoffDocumentSchema, type WorkspaceState } from './types';
import { WorkspaceManager } from './workspace';

let tmpDir: string;
let workspaceManager: WorkspaceManager;
let planManager: ArchitecturePlanManager;
let ws: WorkspaceState;

const makeBasePlan = (overrides: Partial<ArchitecturePlan> = {}): ArchitecturePlan => ({
  planId: 'plan-001',
  schemaVersion: 1,
  projectId: 'proj-001',
  level: 'global',
  scopeKey: 'global',
  status: 'active',
  createdAt: new Date().toISOString(),
  revisionNumber: 0,
  techStack: {
    language: 'TypeScript',
    runtime: 'Node.js 20',
    framework: 'Express',
    testFramework: 'Vitest',
    buildTool: 'tsc',
    rationale: 'Shared stack across all modules',
  },
  modules: [
    {
      name: 'auth',
      description: 'Authentication module',
      responsibility: 'Authenticate and authorize requests',
      directory: 'src/modules/auth',
      exposedInterfaces: ['AuthService', 'AuthMiddleware'],
      dependencies: ['shared'],
      owningStories: ['story-001'],
    },
  ],
  storyModuleMapping: [
    {
      storyId: 'story-001',
      modules: ['auth'],
      primaryModule: 'auth',
      estimatedFiles: ['src/modules/auth/service.ts'],
    },
  ],
  executionOrder: [
    {
      groupId: 1,
      storyIds: ['story-001'],
      rationale: 'Build auth first',
      dependsOn: [],
    },
  ],
  decisions: [
    {
      id: 'ADR-001',
      title: 'Use TypeScript',
      context: 'Need type safety',
      decision: 'Use strict TypeScript mode',
      consequences: 'Higher confidence in refactors',
      status: 'accepted',
    },
  ],
  constraints: [
    {
      id: 'CONST-001',
      type: 'boundary',
      description: 'No cross-module private imports',
      rule: 'forbid:src/modules/*/internal/* from outside module',
      severity: 'error',
    },
  ],
  ...overrides,
});

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-architecture-plan-'));
  workspaceManager = new WorkspaceManager(tmpDir);
  planManager = new ArchitecturePlanManager(workspaceManager);
  ws = workspaceManager.createWorkspace('proj-001', 'story-001');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ArchitecturePlanSchema', () => {
  test('valid global-level plan parses correctly', () => {
    const plan = makeBasePlan();
    const parsed = ArchitecturePlanSchema.parse(plan);
    expect(parsed.level).toBe('global');
    expect(parsed.scopeKey).toBe('global');
  });

  test('valid sprint-level plan parses correctly', () => {
    const plan = makeBasePlan({
      planId: 'plan-sprint-001',
      level: 'sprint',
      scopeKey: 'sprint:sprint-001',
      sprintId: 'sprint-001',
    });
    const parsed = ArchitecturePlanSchema.parse(plan);
    expect(parsed.level).toBe('sprint');
    expect(parsed.sprintId).toBe('sprint-001');
  });

  test('invalid plan missing required fields fails', () => {
    const plan = makeBasePlan();
    const { techStack: _techStack, ...invalid } = plan;
    expect(() => ArchitecturePlanSchema.parse(invalid)).toThrow();
  });

  test('scopeKey format validation works for sprint plans', () => {
    const invalidPlan = makeBasePlan({
      level: 'sprint',
      scopeKey: 'global',
      sprintId: 'sprint-002',
    });
    expect(() => ArchitecturePlanSchema.parse(invalidPlan)).toThrow();
  });
});

describe('enum schemas', () => {
  test('PlanQualityScore status values are correct enum', () => {
    expect(
      PlanQualityScoreSchema.parse({
        cohesion: 90,
        dependencySanity: 92,
        stackConsistency: 88,
        overall: 90,
        status: 'pass',
        findings: [],
      }).status
    ).toBe('pass');

    expect(() =>
      PlanQualityScoreSchema.parse({
        cohesion: 90,
        dependencySanity: 92,
        stackConsistency: 88,
        overall: 90,
        status: 'unknown',
        findings: [],
      })
    ).toThrow();
  });

  test('ArchitectureConstraint type values are correct enum', () => {
    expect(
      ArchitectureConstraintSchema.parse({
        id: 'CONST-001',
        type: 'dependency',
        description: 'Dependency rule',
        rule: 'module:a -> module:b',
        severity: 'warning',
      }).type
    ).toBe('dependency');

    expect(() =>
      ArchitectureConstraintSchema.parse({
        id: 'CONST-002',
        type: 'invalid-type',
        description: 'Invalid',
        rule: 'none',
        severity: 'error',
      })
    ).toThrow();
  });
});

describe('supporting schemas', () => {
  test('TechStackDecision supports optional database field', () => {
    const withoutDatabase = TechStackDecisionSchema.parse({
      language: 'TypeScript',
      runtime: 'Node.js 20',
      framework: 'Express',
      testFramework: 'Vitest',
      buildTool: 'tsc',
      rationale: 'Simple service',
    });
    expect(withoutDatabase.database).toBeUndefined();

    const withDatabase = TechStackDecisionSchema.parse({
      language: 'TypeScript',
      runtime: 'Node.js 20',
      framework: 'Express',
      database: 'PostgreSQL',
      testFramework: 'Vitest',
      buildTool: 'tsc',
      rationale: 'Persistent data needed',
    });
    expect(withDatabase.database).toBe('PostgreSQL');
  });

  test('HandoffDocument remains backward compatible without new fields', () => {
    const now = new Date().toISOString();
    const parsed = HandoffDocumentSchema.parse({
      fromAgent: AgentPersona.ARCHITECT,
      toAgent: AgentPersona.DEVELOPER,
      storyId: 'story-001',
      status: 'completed',
      stateOfWorld: { architecture: 'layered' },
      nextGoal: 'Implement module',
      artifacts: ['artifacts/architecture-plan-plan-001.json'],
      timestamp: now,
    });

    expect(parsed.storyId).toBe('story-001');
    expect(parsed.architecturePlan).toBeUndefined();
    expect(parsed.sprintTaskPlan).toBeUndefined();
    expect(parsed.task).toBeUndefined();
  });

  test('HandoffDocument parses with new optional typed fields', () => {
    const now = new Date().toISOString();
    const parsed = HandoffDocumentSchema.parse({
      fromAgent: AgentPersona.ARCHITECT,
      toAgent: AgentPersona.DEVELOPER,
      storyId: 'story-001',
      status: 'completed',
      stateOfWorld: { architecture: 'layered' },
      architecturePlan: {
        planId: 'plan-001',
        level: 'global',
        scopeKey: 'global',
      },
      sprintTaskPlan: {
        sprintId: 'sprint-001',
        planId: 'plan-sprint-001',
      },
      task: {
        taskId: 'task-001',
        module: 'auth',
        type: 'create',
      },
      nextGoal: 'Implement module',
      artifacts: ['artifacts/architecture-plan-plan-001.json'],
      timestamp: now,
    });

    expect(parsed.architecturePlan?.planId).toBe('plan-001');
    expect(parsed.sprintTaskPlan?.sprintId).toBe('sprint-001');
    expect(parsed.task?.type).toBe('create');
  });

  test('ArchitecturePlanRef, SprintTaskPlanRef, and ImplementationTaskRef parse correctly', () => {
    expect(
      ArchitecturePlanRefSchema.parse({
        planId: 'plan-001',
        level: 'global',
        scopeKey: 'global',
      }).planId
    ).toBe('plan-001');

    expect(
      SprintTaskPlanRefSchema.parse({
        sprintId: 'sprint-001',
        planId: 'plan-sprint-001',
      }).planId
    ).toBe('plan-sprint-001');

    expect(
      ImplementationTaskRefSchema.parse({
        taskId: 'task-001',
        module: 'auth',
        type: 'integrate',
      }).type
    ).toBe('integrate');
  });
});

describe('ArchitecturePlanManager', () => {
  test('save and load roundtrip works', () => {
    const plan = makeBasePlan();
    planManager.save(ws, plan);

    const loaded = planManager.load(ws, plan.planId);
    expect(loaded).toEqual(plan);
  });

  test('loadActive finds active plan by level and scopeKey', () => {
    const stalePlan = makeBasePlan({
      planId: 'plan-older',
      status: 'stale',
      revisionNumber: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    });
    const activePlan = makeBasePlan({
      planId: 'plan-active',
      status: 'active',
      revisionNumber: 2,
      createdAt: new Date('2026-01-02T00:00:00.000Z').toISOString(),
    });

    planManager.save(ws, stalePlan);
    planManager.save(ws, activePlan);

    const loaded = planManager.loadActive(ws, 'global', 'global');
    expect(loaded?.planId).toBe('plan-active');
  });

  test('supersede updates both plans correctly', () => {
    const oldPlan = makeBasePlan({
      planId: 'plan-old',
      status: 'active',
    });
    const newPlan = makeBasePlan({
      planId: 'plan-new',
      supersedesPlanId: 'plan-old',
      status: 'active',
    });

    planManager.save(ws, oldPlan);
    planManager.supersede(ws, 'plan-old', newPlan);

    const loadedOld = planManager.load(ws, 'plan-old');
    const loadedNew = planManager.load(ws, 'plan-new');

    expect(loadedOld?.status).toBe('stale');
    expect(loadedOld?.supersededByPlanId).toBe('plan-new');
    expect(loadedNew?.planId).toBe('plan-new');
  });

  test('load returns null for non-existent plan', () => {
    const loaded = planManager.load(ws, 'does-not-exist');
    expect(loaded).toBeNull();
  });
});
