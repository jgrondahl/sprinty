import { describe, expect, test } from 'bun:test';
import { PlanDigestSchema, type ArchitecturePlan } from './architecture-plan';
import {
  checkAcyclicDependencies,
  checkInterfaceOwnership,
  checkModuleCoverage,
  checkStoryCoverage,
  generateDigest,
  scorePlan,
  validatePlan,
} from './plan-validation';

const makeTestPlan = (overrides: Partial<ArchitecturePlan> = {}): ArchitecturePlan => ({
  planId: 'plan-validation-001',
  schemaVersion: 1,
  projectId: 'proj-001',
  level: 'global',
  scopeKey: 'global',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  revisionNumber: 0,
  techStack: {
    language: 'TypeScript',
    runtime: 'Node.js 20',
    framework: 'Express',
    database: 'PostgreSQL',
    testFramework: 'Bun',
    buildTool: 'tsc',
    rationale: 'Unified backend stack',
  },
  modules: [
    {
      name: 'auth',
      description: 'Authentication and authorization',
      responsibility: 'Handle login sessions and user identity verification',
      directory: 'src/modules/auth',
      exposedInterfaces: ['AuthService'],
      dependencies: ['shared'],
      owningStories: ['story-auth'],
    },
    {
      name: 'payments',
      description: 'Payment orchestration',
      responsibility: 'Process payment workflows and payment status updates',
      directory: 'src/modules/payments',
      exposedInterfaces: ['PaymentService'],
      dependencies: ['shared', 'auth'],
      owningStories: ['story-payments'],
    },
    {
      name: 'shared',
      description: 'Shared utilities',
      responsibility: 'Provide reusable utility helpers and shared primitives',
      directory: 'src/modules/shared',
      exposedInterfaces: ['SharedClock', 'SharedLogger'],
      dependencies: [],
      owningStories: ['story-auth', 'story-payments'],
    },
  ],
  storyModuleMapping: [
    {
      storyId: 'story-auth',
      modules: ['auth', 'shared'],
      primaryModule: 'auth',
      estimatedFiles: ['src/modules/auth/service.ts'],
    },
    {
      storyId: 'story-payments',
      modules: ['payments', 'shared'],
      primaryModule: 'payments',
      estimatedFiles: ['src/modules/payments/service.ts'],
    },
  ],
  executionOrder: [
    {
      groupId: 1,
      storyIds: ['story-auth'],
      rationale: 'Auth first',
      dependsOn: [],
    },
    {
      groupId: 2,
      storyIds: ['story-payments'],
      rationale: 'Payments after auth',
      dependsOn: [1],
    },
  ],
  decisions: [
    {
      id: 'ADR-001',
      title: 'Runtime and language',
      context: 'Need maintainability',
      decision: 'Use TypeScript and Express with Bun test runner',
      consequences: 'Consistency across modules',
      status: 'accepted',
    },
  ],
  constraints: [
    {
      id: 'CONST-001',
      type: 'technology',
      description: 'TypeScript and Express are required',
      rule: 'All services must use TypeScript, Express, and Bun tests',
      severity: 'error',
    },
    {
      id: 'CONST-002',
      type: 'boundary',
      description: 'payments can depend on auth and shared only',
      rule: 'payments -> auth,shared',
      severity: 'error',
    },
    {
      id: 'CONST-003',
      type: 'boundary',
      description: 'auth can depend on shared only',
      rule: 'auth -> shared',
      severity: 'warning',
    },
    {
      id: 'CONST-004',
      type: 'pattern',
      description: 'observability standard',
      rule: 'all modules emit structured logs',
      severity: 'warning',
    },
  ],
  ...overrides,
});

describe('checkAcyclicDependencies', () => {
  test('acyclic graph passes', () => {
    const plan = makeTestPlan();
    const result = checkAcyclicDependencies(plan.modules);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('direct cycle (A→B→A) detected with cycle path', () => {
    const plan = makeTestPlan({
      modules: [
        {
          ...makeTestPlan().modules[0],
          name: 'a',
          dependencies: ['b'],
          owningStories: ['story-a'],
        },
        {
          ...makeTestPlan().modules[1],
          name: 'b',
          dependencies: ['a'],
          owningStories: ['story-b'],
        },
      ],
    });
    const result = checkAcyclicDependencies(plan.modules);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('Cycle detected:') && error.includes('a'))).toBe(
      true
    );
  });

  test('indirect cycle (A→B→C→A) detected', () => {
    const base = makeTestPlan();
    const result = checkAcyclicDependencies([
      {
        ...base.modules[0],
        name: 'a',
        dependencies: ['b'],
      },
      {
        ...base.modules[1],
        name: 'b',
        dependencies: ['c'],
      },
      {
        ...base.modules[2],
        name: 'c',
        dependencies: ['a'],
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Cycle detected:');
  });

  test('unknown dependency reference is reported as error', () => {
    const base = makeTestPlan();
    const result = checkAcyclicDependencies([
      {
        ...base.modules[0],
        dependencies: ['missing-module'],
      },
      base.modules[1],
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain("Unknown dependency 'missing-module'");
  });

  test('self-dependency detected as cycle', () => {
    const base = makeTestPlan();
    const result = checkAcyclicDependencies([
      {
        ...base.modules[0],
        dependencies: ['auth'],
      },
      base.modules[2],
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Cycle detected:');
  });

  test('empty modules array passes', () => {
    const result = checkAcyclicDependencies([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('checkStoryCoverage', () => {
  test('all stories mapped passes', () => {
    const result = checkStoryCoverage(makeTestPlan());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('unmapped story reports error with storyId', () => {
    const plan = makeTestPlan({
      storyModuleMapping: [
        ...makeTestPlan().storyModuleMapping,
        {
          storyId: 'story-missing',
          modules: ['auth'],
          primaryModule: 'auth',
          estimatedFiles: ['src/modules/auth/extra.ts'],
        },
      ],
    });
    const result = checkStoryCoverage(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('story-missing');
  });

  test('empty storyModuleMapping passes', () => {
    const result = checkStoryCoverage(makeTestPlan({ storyModuleMapping: [] }));
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('checkModuleCoverage', () => {
  test('all modules have owning stories passes', () => {
    const result = checkModuleCoverage(makeTestPlan());
    expect(result.valid).toBe(true);
  });

  test('orphaned module reports error', () => {
    const base = makeTestPlan();
    const result = checkModuleCoverage({
      ...base,
      modules: [
        ...base.modules,
        {
          ...base.modules[0],
          name: 'orphan',
          owningStories: [],
          dependencies: [],
          exposedInterfaces: ['OrphanApi'],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain("Module 'orphan' has no owning stories.");
  });
});

describe('checkInterfaceOwnership', () => {
  test('unique interfaces passes', () => {
    const result = checkInterfaceOwnership(makeTestPlan());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('duplicate interface across modules reports both modules', () => {
    const base = makeTestPlan();
    const result = checkInterfaceOwnership({
      ...base,
      modules: [
        {
          ...base.modules[0],
          exposedInterfaces: ['SharedApi'],
        },
        {
          ...base.modules[1],
          exposedInterfaces: ['SharedApi'],
        },
        base.modules[2],
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('auth');
    expect(result.errors.join(' ')).toContain('payments');
  });
});

describe('validatePlan', () => {
  test('clean plan returns valid true with no errors', () => {
    const result = validatePlan(makeTestPlan());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test('plan with multiple issues collects all errors and valid false', () => {
    const base = makeTestPlan();
    const badPlan: ArchitecturePlan = {
      ...base,
      modules: [
        {
          ...base.modules[0],
          dependencies: ['payments', 'unknown-dep'],
          exposedInterfaces: ['DuplicateApi'],
          owningStories: [],
        },
        {
          ...base.modules[1],
          dependencies: ['auth'],
          exposedInterfaces: ['DuplicateApi'],
          owningStories: ['story-payments'],
        },
      ],
      storyModuleMapping: [
        ...base.storyModuleMapping,
        {
          storyId: 'story-unmapped',
          modules: ['auth'],
          primaryModule: 'auth',
          estimatedFiles: ['x.ts'],
        },
      ],
    };

    const result = validatePlan(badPlan);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.errors.join(' ')).toContain('Unknown dependency');
    expect(result.errors.join(' ')).toContain('Cycle detected');
    expect(result.errors.join(' ')).toContain('story-unmapped');
    expect(result.errors.join(' ')).toContain('Interface');
  });
});

describe('scorePlan', () => {
  test('well-designed plan scores high and passes', () => {
    const score = scorePlan(makeTestPlan());
    expect(score.overall).toBeGreaterThanOrEqual(75);
    expect(score.status).toBe('pass');
  });

  test('plan with cycle sets dependencySanity to 0', () => {
    const base = makeTestPlan();
    const score = scorePlan({
      ...base,
      modules: [
        {
          ...base.modules[0],
          dependencies: ['payments'],
        },
        {
          ...base.modules[1],
          dependencies: ['auth'],
        },
        base.modules[2],
      ],
    });
    expect(score.dependencySanity).toBe(0);
  });

  test('high fan-out penalizes dependencySanity', () => {
    const base = makeTestPlan();
    const extraModules = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((name) => ({
      ...base.modules[2],
      name,
      dependencies: [],
      exposedInterfaces: [`${name}-api`],
      owningStories: ['story-auth'],
    }));
    const score = scorePlan({
      ...base,
      modules: [
        {
          ...base.modules[0],
          dependencies: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
        },
        ...extraModules,
      ],
      storyModuleMapping: [
        {
          storyId: 'story-auth',
          modules: ['auth', ...extraModules.map((module) => module.name)],
          primaryModule: 'auth',
          estimatedFiles: ['src/modules/auth/service.ts'],
        },
      ],
    });
    expect(score.dependencySanity).toBeLessThan(100);
    expect(score.findings.join(' ')).toContain('fan-out');
  });

  test('overlapping responsibilities penalize cohesion', () => {
    const base = makeTestPlan();
    const sameResponsibility = 'Handle user account profile settings updates synchronization';
    const score = scorePlan({
      ...base,
      modules: [
        {
          ...base.modules[0],
          responsibility: sameResponsibility,
        },
        {
          ...base.modules[1],
          responsibility: sameResponsibility,
        },
      ],
      storyModuleMapping: [
        {
          storyId: 'story-auth',
          modules: ['auth'],
          primaryModule: 'auth',
          estimatedFiles: ['a.ts'],
        },
        {
          storyId: 'story-payments',
          modules: ['payments'],
          primaryModule: 'payments',
          estimatedFiles: ['b.ts'],
        },
      ],
    });
    expect(score.cohesion).toBeLessThan(100);
    expect(score.findings.join(' ')).toContain('High responsibility overlap');
  });

  test('missing stack tokens penalize stackConsistency', () => {
    const base = makeTestPlan();
    const score = scorePlan({
      ...base,
      decisions: [
        {
          ...base.decisions[0],
          decision: 'Use internal standards only',
          title: 'No direct stack mentions',
          context: 'General policy',
          consequences: 'May drift',
        },
      ],
      constraints: [
        {
          ...base.constraints[0],
          description: 'No explicit stack mention',
          rule: 'Rule does not contain specific technologies',
        },
      ],
    });
    expect(score.stackConsistency).toBe(55);
  });

  test('overall formula uses weighted rounded computation', () => {
    const base = makeTestPlan();
    const score = scorePlan({
      ...base,
      modules: [
        {
          ...base.modules[0],
          responsibility: 'sync sync sync data flow',
          dependencies: ['payments'],
        },
        {
          ...base.modules[1],
          responsibility: 'sync sync sync data flow',
          dependencies: ['auth'],
        },
      ],
      constraints: [
        {
          id: 'CONST-ONE',
          type: 'boundary',
          description: 'No stack names here',
          rule: 'none',
          severity: 'error',
        },
      ],
      decisions: [
        {
          id: 'ADR-ONE',
          title: 'Policy',
          context: 'Context',
          decision: 'No stack names',
          consequences: 'None',
          status: 'accepted',
        },
      ],
      storyModuleMapping: [
        {
          storyId: 'story-auth',
          modules: ['auth'],
          primaryModule: 'auth',
          estimatedFiles: ['a.ts'],
        },
        {
          storyId: 'story-payments',
          modules: ['payments'],
          primaryModule: 'payments',
          estimatedFiles: ['b.ts'],
        },
      ],
    });

    const expected = Math.round(
      0.4 * score.cohesion + 0.35 * score.dependencySanity + 0.25 * score.stackConsistency
    );
    expect(score.overall).toBe(expected);
  });

  test('status thresholds are pass, review, fail', () => {
    const passScore = scorePlan(makeTestPlan());
    expect(passScore.status).toBe('pass');

    const reviewPlan = makeTestPlan({
      modules: [
        {
          ...makeTestPlan().modules[0],
          dependencies: ['payments'],
        },
        {
          ...makeTestPlan().modules[1],
          dependencies: ['auth'],
        },
      ],
      constraints: [
        {
          id: 'CONST-R1',
          type: 'technology',
          description: 'TypeScript Express Bun required',
          rule: 'Use TypeScript with Express and Bun',
          severity: 'warning',
        },
      ],
      decisions: [
        {
          id: 'ADR-R1',
          title: 'review decision',
          context: 'ctx',
          decision: 'keep TypeScript and Express with Bun tests',
          consequences: 'cons',
          status: 'accepted',
        },
      ],
      storyModuleMapping: [
        {
          storyId: 'story-auth',
          modules: ['auth'],
          primaryModule: 'auth',
          estimatedFiles: ['a.ts'],
        },
        {
          storyId: 'story-payments',
          modules: ['payments'],
          primaryModule: 'payments',
          estimatedFiles: ['b.ts'],
        },
      ],
    });
    const reviewScore = scorePlan(reviewPlan);
    expect(reviewScore.overall).toBeGreaterThanOrEqual(60);
    expect(reviewScore.overall).toBeLessThan(75);
    expect(reviewScore.status).toBe('review');

    const failPlan = makeTestPlan({
      modules: [
        {
          ...makeTestPlan().modules[0],
          name: 'a',
          responsibility: 'same same words now',
          dependencies: ['b'],
          owningStories: ['story-auth'],
        },
        {
          ...makeTestPlan().modules[1],
          name: 'b',
          responsibility: 'same same words now',
          dependencies: ['a'],
          owningStories: ['story-payments'],
        },
      ],
      constraints: [
        {
          id: 'CONST-F1',
          type: 'boundary',
          description: 'no stack',
          rule: 'none',
          severity: 'error',
        },
      ],
      decisions: [
        {
          id: 'ADR-F1',
          title: 'none',
          context: 'none',
          decision: 'none',
          consequences: 'none',
          status: 'accepted',
        },
      ],
      storyModuleMapping: [
        {
          storyId: 'story-auth',
          modules: ['a'],
          primaryModule: 'a',
          estimatedFiles: ['a.ts'],
        },
        {
          storyId: 'story-payments',
          modules: ['b'],
          primaryModule: 'b',
          estimatedFiles: ['b.ts'],
        },
      ],
    });
    const failScore = scorePlan(failPlan);
    expect(failScore.overall).toBeLessThan(60);
    expect(failScore.status).toBe('fail');
  });
});

describe('generateDigest', () => {
  test('basic digest includes correct task module', () => {
    const digest = generateDigest(makeTestPlan(), 'task-001', 'payments');
    expect(digest.module).toBe('payments');
    expect(digest.includedModules).toContain('payments');
  });

  test('includes direct dependencies in includedModules', () => {
    const digest = generateDigest(makeTestPlan(), 'task-001', 'payments');
    expect(digest.includedModules).toEqual(['auth', 'payments', 'shared']);
  });

  test('filters constraints to relevant and technology constraints', () => {
    const digest = generateDigest(makeTestPlan(), 'task-001', 'auth');
    const ids = digest.constraints.map((constraint) => constraint.id);
    expect(ids).toContain('CONST-001');
    expect(ids).toContain('CONST-003');
    expect(ids).not.toContain('CONST-004');
  });

  test('filters exposedInterfaces to included modules only', () => {
    const digest = generateDigest(makeTestPlan(), 'task-001', 'auth');
    const interfaceModules = digest.exposedInterfaces.map((entry) => entry.module);
    expect(interfaceModules).toContain('auth');
    expect(interfaceModules).toContain('shared');
    expect(interfaceModules).not.toContain('payments');
  });

  test('digest generation is deterministic', () => {
    const plan = makeTestPlan();
    const left = generateDigest(plan, 'task-001', 'payments');
    const right = generateDigest(plan, 'task-001', 'payments');
    expect(left).toEqual(right);
  });

  test('digestId format is correct', () => {
    const plan = makeTestPlan({ planId: 'plan-xyz' });
    const digest = generateDigest(plan, 'task-abc', 'auth');
    expect(digest.digestId).toBe('digest-plan-xyz-task-abc');
  });

  test('unknown module name throws Error', () => {
    expect(() => generateDigest(makeTestPlan(), 'task-001', 'missing')).toThrow(
      'Task module not found in plan: missing'
    );
  });

  test('truncation works when maxChars is very small', () => {
    const digest = generateDigest(makeTestPlan(), 'task-001', 'payments', 500);
    expect(digest.truncated).toBe(true);
  });

  test('truncation keeps task module in includedModules', () => {
    const digest = generateDigest(makeTestPlan(), 'task-001', 'payments', 250);
    expect(digest.truncated).toBe(true);
    expect(digest.includedModules).toContain('payments');
  });

  test('result validates against PlanDigestSchema', () => {
    const digest = generateDigest(makeTestPlan(), 'task-001', 'auth');
    const parsed = PlanDigestSchema.parse(digest);
    expect(parsed.digestId).toBe(digest.digestId);
  });
});
