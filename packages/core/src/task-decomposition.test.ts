// TEST FIX: use structuredClone to prevent cross-test pollution from shared mutable fixtures
import * as os from 'os';
import { describe, it, expect } from 'bun:test';
import type { ArchitecturePlan } from './architecture-plan';
import type { Story } from './types';
import {
  DecompositionGuardrailsSchema,
  ImplementationTaskSchema,
  IntegrationTaskSchema,
  SprintTaskPlanSchema,
  TaskDecomposer,
  TaskGroupSchema,
  validateDecomposition,
  validateNoFileCollisions,
  validateTaskDependencies,
  type SprintTaskPlan,
} from './task-decomposition';

// Deep clone helper: uses structuredClone if available, otherwise JSON deep clone
const deepClone = <T>(obj: T): T => {
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj)) as T;
};

const makeStory = (id: string, acceptanceCriteria: string[] = []): Story => ({
  id,
  title: `Story ${id}`,
  description: `Description ${id}`,
  acceptanceCriteria,
  state: 'SPRINT_READY',
  source: 'FILE',
  workspacePath: '/tmp/workspace',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  domain: 'general',
  tags: [],
});

const storyFixture = (id: string, acceptanceCriteria: string[] = []): Story =>
  deepClone(makeStory(id, acceptanceCriteria));

const makePlan = (overrides: Partial<ArchitecturePlan> = {}): ArchitecturePlan => ({
  planId: 'plan-sprint-001',
  schemaVersion: 1,
  projectId: 'proj-001',
  level: 'sprint',
  scopeKey: 'sprint:sprint-001',
  sprintId: 'sprint-001',
  parentPlanId: 'plan-global-001',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  revisionNumber: 0,
  techStack: {
    language: 'TypeScript',
    runtime: 'Node.js 20',
    framework: 'Express',
    testFramework: 'Bun',
    buildTool: 'tsc',
    rationale: 'Consistent stack',
  },
  modules: [
    {
      name: 'auth',
      description: 'Auth module',
      responsibility: 'Authentication',
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
      estimatedFiles: ['src/modules/auth/auth-service.ts'],
    },
  ],
  executionOrder: [
    {
      groupId: 1,
      storyIds: ['story-1'],
      rationale: 'Start with auth',
      dependsOn: [],
    },
  ],
  decisions: [],
  constraints: [],
  ...overrides,
});

const planFixture = (overrides: Partial<ArchitecturePlan> = {}): ArchitecturePlan =>
  deepClone(makePlan(overrides));

const makeMinimalSprintTaskPlan = (overrides: Partial<SprintTaskPlan> = {}): SprintTaskPlan => ({
  sprintId: 'sprint-001',
  planId: 'plan-sprint-001',
  parentGlobalPlanId: 'plan-global-001',
  schemaVersion: 1,
  tasks: [
    {
      taskId: 'task-a',
      storyIds: ['story-1'],
      module: 'auth',
      type: 'create',
      description: '',
      targetFiles: ['src/modules/auth/auth-service.ts'],
      ownedFiles: ['src/modules/auth/auth-service.ts'],
      dependencies: [],
      inputs: [],
      expectedOutputs: ['src/modules/auth/auth-service.ts'],
      acceptanceCriteria: [],
    },
  ],
  schedule: {
    groups: [{ groupId: 1, taskIds: ['task-a'], dependsOn: [] }],
  },
  integrationTasks: [],
  integrationPhase: {
    phaseId: 'integration-sprint-001',
    tasks: [],
    dependsOnTaskGroups: [1],
  },
  ...deepClone(overrides),
});

const minimalSprintFixture = (overrides: Partial<SprintTaskPlan> = {}): SprintTaskPlan =>
  deepClone(makeMinimalSprintTaskPlan(overrides));

describe('task-decomposition schema parsing', () => {
  it('parses valid ImplementationTaskSchema', () => {
    const parsed = ImplementationTaskSchema.parse(minimalSprintFixture().tasks[0]);
    expect(parsed.taskId).toBe('task-a');
    expect(parsed.storyIds).toEqual(['story-1']);
  });

  it('rejects invalid ImplementationTaskSchema with empty storyIds', () => {
    expect(() =>
      ImplementationTaskSchema.parse({
        ...minimalSprintFixture().tasks[0],
        storyIds: [],
      })
    ).toThrow();
  });

  it('parses valid IntegrationTaskSchema', () => {
    const parsed = IntegrationTaskSchema.parse({
      taskId: 'integration-auth-routing',
      type: 'routing',
      description: 'Integrate auth routing',
      targetFiles: ['src/modules/auth/integration-routing.ts'],
      dependsOnTasks: ['task-a'],
    });
    expect(parsed.type).toBe('routing');
  });

  it('rejects invalid IntegrationTaskSchema type', () => {
    expect(() =>
      IntegrationTaskSchema.parse({
        taskId: 'integration-auth',
        type: 'invalid',
        description: 'Invalid',
        targetFiles: ['src/modules/auth/integration-routing.ts'],
        dependsOnTasks: ['task-a'],
      })
    ).toThrow();
  });

  it('parses valid TaskGroupSchema', () => {
    const parsed = TaskGroupSchema.parse({
      groupId: 1,
      taskIds: ['task-a'],
      dependsOn: [],
    });
    expect(parsed.groupId).toBe(1);
  });

  it('rejects invalid TaskGroupSchema with non-positive groupId', () => {
    expect(() => TaskGroupSchema.parse({ groupId: 0, taskIds: ['task-a'], dependsOn: [] })).toThrow();
  });

  it('parses valid SprintTaskPlanSchema', () => {
    const parsed = SprintTaskPlanSchema.parse(minimalSprintFixture());
    expect(parsed.sprintId).toBe('sprint-001');
    expect(parsed.tasks).toHaveLength(1);
  });

  it('rejects invalid SprintTaskPlanSchema with schemaVersion 0', () => {
    expect(() =>
      SprintTaskPlanSchema.parse({
        ...minimalSprintFixture(),
        schemaVersion: 0,
      })
    ).toThrow();
  });

  it('applies default DecompositionGuardrails values', () => {
    const parsed = DecompositionGuardrailsSchema.parse({});
    expect(parsed.maxTasksPerStory).toBe(5);
    expect(parsed.maxTasksPerSprint).toBe(50);
    expect(parsed.maxParallelTasks).toBe(Math.max(1, os.cpus().length));
    expect(parsed.maxRevisionsPerSprint).toBe(1);
    expect(parsed.maxRevisionsPerStory).toBe(1);
  });

  it('rejects invalid DecompositionGuardrails values', () => {
    expect(() => DecompositionGuardrailsSchema.parse({ maxTasksPerStory: 0 })).toThrow();
  });
});

describe('TaskDecomposer.decompose', () => {
  it('single story single module single interface yields one task', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture();
    const stories = [storyFixture('story-1', ['AuthService must validate tokens'])];

    const result = decomposer.decompose(plan, stories);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.module).toBe('auth');
    expect(result.tasks[0]?.taskId).toContain('task-auth-authservice-1');
    expect(result.tasks[0]?.targetFiles).toEqual(['src/modules/auth/authservice.ts']);
  });

  it('single story multi-module yields tasks per module interfaces', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture({
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService', 'AuthMiddleware'],
          dependencies: [],
          owningStories: ['story-1'],
        },
        {
          name: 'billing',
          description: 'Billing module',
          responsibility: 'Billing',
          directory: 'src/modules/billing',
          exposedInterfaces: ['BillingService'],
          dependencies: [],
          owningStories: ['story-1'],
        },
      ],
      storyModuleMapping: [
        { storyId: 'story-1', modules: ['auth', 'billing'], primaryModule: 'auth', estimatedFiles: [] },
      ],
    });

    const result = decomposer.decompose(plan, [storyFixture('story-1')]);
    expect(result.tasks).toHaveLength(3);
    expect(result.tasks.map((task) => task.module).sort((a, b) => a.localeCompare(b))).toEqual([
      'auth',
      'auth',
      'billing',
    ]);
  });

  it('multi-story shared modules keep correct storyIds per task', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture({
      modules: [
        {
          name: 'shared',
          description: 'Shared module',
          responsibility: 'Shared utilities',
          directory: 'src/modules/shared',
          exposedInterfaces: ['SharedLogger'],
          dependencies: [],
          owningStories: ['story-1', 'story-2'],
        },
      ],
      storyModuleMapping: [
        { storyId: 'story-1', modules: ['shared'], primaryModule: 'shared', estimatedFiles: [] },
        { storyId: 'story-2', modules: ['shared'], primaryModule: 'shared', estimatedFiles: [] },
      ],
      executionOrder: [
        { groupId: 1, storyIds: ['story-1'], rationale: 'first', dependsOn: [] },
        { groupId: 2, storyIds: ['story-2'], rationale: 'second', dependsOn: [1] },
      ],
    });

    const result = decomposer.decompose(plan, [storyFixture('story-1'), storyFixture('story-2')]);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.map((task) => task.storyIds[0]).sort((a, b) => a.localeCompare(b))).toEqual([
      'story-1',
      'story-2',
    ]);
  });

  it('module dependencies produce task dependencies and inputs', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture({
      modules: [
        {
          name: 'shared',
          description: 'Shared module',
          responsibility: 'Shared utilities',
          directory: 'src/modules/shared',
          exposedInterfaces: ['SharedLogger'],
          dependencies: [],
          owningStories: ['story-1'],
        },
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService'],
          dependencies: ['shared'],
          owningStories: ['story-1'],
        },
      ],
      storyModuleMapping: [
        { storyId: 'story-1', modules: ['shared', 'auth'], primaryModule: 'auth', estimatedFiles: [] },
      ],
    });

    const result = decomposer.decompose(plan, [storyFixture('story-1')]);
    const authTask = result.tasks.find((task) => task.module === 'auth');
    const sharedTask = result.tasks.find((task) => task.module === 'shared');
    expect(authTask).toBeDefined();
    expect(sharedTask).toBeDefined();
    expect(authTask?.dependencies).toEqual([sharedTask?.taskId]);
    expect(authTask?.inputs[0]?.fromTaskId).toBe(sharedTask?.taskId);
    expect(authTask?.inputs[0]?.artifact).toBe(sharedTask?.expectedOutputs[0]);
  });

  it('task groups are derived from executionOrder', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture({
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService'],
          dependencies: [],
          owningStories: ['story-1'],
        },
        {
          name: 'billing',
          description: 'Billing module',
          responsibility: 'Billing',
          directory: 'src/modules/billing',
          exposedInterfaces: ['BillingService'],
          dependencies: [],
          owningStories: ['story-2'],
        },
      ],
      storyModuleMapping: [
        { storyId: 'story-1', modules: ['auth'], primaryModule: 'auth', estimatedFiles: [] },
        { storyId: 'story-2', modules: ['billing'], primaryModule: 'billing', estimatedFiles: [] },
      ],
      executionOrder: [
        { groupId: 1, storyIds: ['story-1'], rationale: 'first', dependsOn: [] },
        { groupId: 2, storyIds: ['story-2'], rationale: 'second', dependsOn: [1] },
      ],
    });

    const result = decomposer.decompose(plan, [storyFixture('story-1'), storyFixture('story-2')]);
    expect(result.schedule.groups).toHaveLength(2);
    expect(result.schedule.groups[0]?.groupId).toBe(1);
    expect(result.schedule.groups[1]?.dependsOn).toEqual([1]);
  });

  it('creates integration tasks for modules with dependencies', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture({
      modules: [
        {
          name: 'shared',
          description: 'Shared module',
          responsibility: 'Shared utilities',
          directory: 'src/modules/shared',
          exposedInterfaces: ['SharedLogger'],
          dependencies: [],
          owningStories: ['story-1'],
        },
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService'],
          dependencies: ['shared'],
          owningStories: ['story-1'],
        },
      ],
      storyModuleMapping: [
        { storyId: 'story-1', modules: ['shared', 'auth'], primaryModule: 'auth', estimatedFiles: [] },
      ],
    });

    const result = decomposer.decompose(plan, [storyFixture('story-1')]);
    expect(result.integrationTasks).toHaveLength(1);
    expect(result.integrationTasks[0]?.type).toBe('routing');
    expect(result.integrationTasks[0]?.dependsOnTasks.length).toBeGreaterThan(0);
  });

  it('creates integration phase depending on all task groups', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture({
      executionOrder: [
        { groupId: 1, storyIds: ['story-1'], rationale: 'first', dependsOn: [] },
        { groupId: 2, storyIds: ['story-2'], rationale: 'second', dependsOn: [1] },
      ],
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService'],
          dependencies: [],
          owningStories: ['story-1'],
        },
        {
          name: 'billing',
          description: 'Billing module',
          responsibility: 'Billing',
          directory: 'src/modules/billing',
          exposedInterfaces: ['BillingService'],
          dependencies: ['auth'],
          owningStories: ['story-2'],
        },
      ],
      storyModuleMapping: [
        { storyId: 'story-1', modules: ['auth'], primaryModule: 'auth', estimatedFiles: [] },
        { storyId: 'story-2', modules: ['billing'], primaryModule: 'billing', estimatedFiles: [] },
      ],
    });

    const result = decomposer.decompose(plan, [storyFixture('story-1'), storyFixture('story-2')]);
    expect(result.integrationPhase).toBeDefined();
    expect(result.integrationPhase?.dependsOnTaskGroups).toEqual([1, 2]);
  });

  it('filters acceptance criteria by module or interface name match', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture({
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService'],
          dependencies: [],
          owningStories: ['story-1'],
        },
      ],
    });
    const stories = [
      storyFixture('story-1', [
        'AuthService validates JWT',
        'Auth module logs all auth events',
        'Payments must capture receipts',
      ]),
    ];

    const result = decomposer.decompose(plan, stories);
    expect(result.tasks[0]?.acceptanceCriteria).toEqual([
      'AuthService validates JWT',
      'Auth module logs all auth events',
    ]);
  });
});

describe('TaskDecomposer guardrails', () => {
  it('default guardrails are applied when none provided', () => {
    const decomposer = new TaskDecomposer();
    const plan = planFixture();
    const result = decomposer.decompose(plan, [storyFixture('story-1')]);
    expect(result.tasks.length).toBeLessThanOrEqual(5);
  });

  it('custom guardrails override defaults', () => {
    const decomposer = new TaskDecomposer({ maxTasksPerStory: 10, maxTasksPerSprint: 100 });
    const plan = planFixture({
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['A', 'B', 'C', 'D', 'E', 'F'],
          dependencies: [],
          owningStories: ['story-1'],
        },
      ],
    });

    const result = decomposer.decompose(plan, [storyFixture('story-1')]);
    expect(result.tasks).toHaveLength(6);
  });

  it('maxTasksPerStory can trigger merge pass and reduce task count', () => {
    const decomposer = new TaskDecomposer({ maxTasksPerStory: 1, maxTasksPerSprint: 50 });
    const plan = planFixture({
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['Read Model', 'Read-Model'],
          dependencies: [],
          owningStories: ['story-1'],
        },
      ],
    });
    const result = decomposer.decompose(
      plan,
      [storyFixture('story-1', ['Read Model must be available', 'Read-Model should be queryable'])]
    );

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.acceptanceCriteria).toEqual([
      'Read Model must be available',
      'Read-Model should be queryable',
    ]);
  });

  it('maxTasksPerSprint exceeded throws descriptive error', () => {
    const decomposer = new TaskDecomposer({ maxTasksPerSprint: 1 });
    const plan = planFixture({
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'Authentication',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService', 'AuthMiddleware'],
          dependencies: [],
          owningStories: ['story-1'],
        },
      ],
    });

    expect(() => decomposer.decompose(plan, [storyFixture('story-1')])).toThrow('maxTasksPerSprint');
  });
});

describe('decomposition validation helpers', () => {
  it('validateNoFileCollisions detects overlapping files', () => {
    const plan = minimalSprintFixture({
      tasks: [
        {
          ...minimalSprintFixture().tasks[0],
          taskId: 'task-a',
          ownedFiles: ['src/modules/auth/shared.ts'],
        },
        {
          ...minimalSprintFixture().tasks[0],
          taskId: 'task-b',
          ownedFiles: ['src/modules/auth/shared.ts'],
        },
      ],
      schedule: {
        groups: [{ groupId: 1, taskIds: ['task-a', 'task-b'], dependsOn: [] }],
      },
    });

    const result = validateNoFileCollisions(plan.schedule.groups[0]!, plan.tasks);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('owned file collision');
  });

  it('validateNoFileCollisions passes with no overlap', () => {
    const plan = minimalSprintFixture({
      tasks: [
        { ...minimalSprintFixture().tasks[0], taskId: 'task-a', ownedFiles: ['a.ts'] },
        { ...minimalSprintFixture().tasks[0], taskId: 'task-b', ownedFiles: ['b.ts'] },
      ],
      schedule: {
        groups: [{ groupId: 1, taskIds: ['task-a', 'task-b'], dependsOn: [] }],
      },
    });

    const result = validateNoFileCollisions(plan.schedule.groups[0]!, plan.tasks);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateTaskDependencies detects unknown task references', () => {
    const plan = minimalSprintFixture({
      tasks: [
        {
          ...minimalSprintFixture().tasks[0],
          taskId: 'task-a',
          dependencies: ['task-missing'],
        },
      ],
    });

    const result = validateTaskDependencies(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('unknown taskId');
  });

  it('validateTaskDependencies detects cycles', () => {
    const plan = minimalSprintFixture({
      tasks: [
        {
          ...minimalSprintFixture().tasks[0],
          taskId: 'task-a',
          dependencies: ['task-b'],
        },
        {
          ...minimalSprintFixture().tasks[0],
          taskId: 'task-b',
          dependencies: ['task-a'],
          ownedFiles: ['task-b.ts'],
          targetFiles: ['task-b.ts'],
          expectedOutputs: ['task-b.ts'],
        },
      ],
      schedule: {
        groups: [{ groupId: 1, taskIds: ['task-a', 'task-b'], dependsOn: [] }],
      },
    });

    const result = validateTaskDependencies(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Cycle detected in task dependencies');
  });

  it('validateDecomposition combines collision and dependency errors', () => {
    const plan = minimalSprintFixture({
      tasks: [
        {
          ...minimalSprintFixture().tasks[0],
          taskId: 'task-a',
          ownedFiles: ['same.ts'],
          dependencies: ['task-b'],
        },
        {
          ...minimalSprintFixture().tasks[0],
          taskId: 'task-b',
          ownedFiles: ['same.ts'],
          dependencies: ['task-a'],
          targetFiles: ['other.ts'],
          expectedOutputs: ['other.ts'],
        },
      ],
      schedule: {
        groups: [{ groupId: 1, taskIds: ['task-a', 'task-b'], dependsOn: [] }],
      },
    });

    const result = validateDecomposition(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('owned file collision'))).toBe(true);
    expect(result.errors.some((error) => error.includes('Cycle detected in task dependencies'))).toBe(true);
  });
});
