import { describe, test, expect } from 'bun:test';
import type { ArchitecturePlan } from './architecture-plan';
import type { ImplementationTask } from './task-decomposition';
import {
  ArchitectureEnforcer,
  ArchitectureViolationSchema,
  ComplianceMetricsSchema,
  EnforcementReportSchema,
  ModuleLockSchema,
  type EnforcementTelemetryEvent,
} from './architecture-enforcer';

const makePlan = (overrides: Partial<ArchitecturePlan> = {}): ArchitecturePlan => ({
  planId: 'plan-enforcer-001',
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
    framework: 'express',
    testFramework: 'vitest',
    buildTool: 'tsc',
    rationale: 'deterministic enforcement coverage',
  },
  modules: [
    {
      name: 'auth',
      description: 'Authentication module',
      responsibility: 'Auth flows',
      directory: 'src/modules/auth',
      exposedInterfaces: ['AuthService', 'AuthContract'],
      dependencies: ['shared'],
      owningStories: ['story-1'],
    },
    {
      name: 'shared',
      description: 'Shared module',
      responsibility: 'Common functionality',
      directory: 'src/modules/shared',
      exposedInterfaces: ['SharedApi', 'SharedUtil'],
      dependencies: [],
      owningStories: ['story-1'],
    },
    {
      name: 'billing',
      description: 'Billing module',
      responsibility: 'Payment operations',
      directory: 'src/modules/billing',
      exposedInterfaces: ['BillingApi'],
      dependencies: ['shared'],
      owningStories: ['story-2'],
    },
  ],
  storyModuleMapping: [
    {
      storyId: 'story-1',
      modules: ['auth', 'shared'],
      primaryModule: 'auth',
      estimatedFiles: ['src/modules/auth/service.ts'],
    },
    {
      storyId: 'story-2',
      modules: ['billing', 'shared'],
      primaryModule: 'billing',
      estimatedFiles: ['src/modules/billing/api.ts'],
    },
  ],
  executionOrder: [
    {
      groupId: 1,
      storyIds: ['story-1'],
      rationale: 'auth and shared first',
      dependsOn: [],
    },
    {
      groupId: 2,
      storyIds: ['story-2'],
      rationale: 'billing depends on shared',
      dependsOn: [1],
    },
  ],
  decisions: [
    {
      id: 'ADR-001',
      title: 'Use Express with Vitest',
      context: 'Unified backend stack',
      decision: 'Express and Vitest for all services',
      consequences: 'Consistent patterns',
      status: 'accepted',
    },
  ],
  constraints: [
    {
      id: 'CONST-BOUNDARY-001',
      type: 'boundary',
      description: 'auth can only consume shared public interfaces',
      rule: 'auth may import shared exposed interfaces only',
      severity: 'error',
    },
    {
      id: 'CONST-TECH-001',
      type: 'technology',
      description: 'forbid jest and koa',
      rule: 'forbid jest and koa packages',
      severity: 'error',
    },
  ],
  ...overrides,
});

const makeTask = (ownedFiles: string[] = []): ImplementationTask => ({
  taskId: 'task-auth-001',
  storyIds: ['story-1'],
  module: 'auth',
  type: 'create',
  description: 'Implement auth interfaces',
  targetFiles: [...ownedFiles],
  ownedFiles: [...ownedFiles],
  dependencies: [],
  inputs: [],
  expectedOutputs: [...ownedFiles],
  acceptanceCriteria: [],
});

const onlyViolations = (reportViolations: { constraintId: string }[], prefix: string): number =>
  reportViolations.filter((violation) => violation.constraintId.startsWith(prefix)).length;

describe('architecture-enforcer schemas', () => {
  test('valid EnforcementReport parses', () => {
    const parsed = EnforcementReportSchema.parse({
      taskId: 'task-1',
      planId: 'plan-1',
      timestamp: '2026-01-01T00:00:00.000Z',
      status: 'pass',
      violations: [],
      metrics: {
        totalConstraints: 10,
        satisfied: 10,
        violated: 0,
        warnings: 0,
      },
    });
    expect(parsed.status).toBe('pass');
    expect(parsed.metrics.totalConstraints).toBe(10);
  });

  test('valid ArchitectureViolation parses', () => {
    const parsed = ArchitectureViolationSchema.parse({
      constraintId: 'dep-boundary-auth-shared',
      severity: 'error',
      file: 'src/modules/auth/service.ts',
      line: 5,
      description: 'Cross-module internal import',
      suggestion: 'Use exposed interface import',
    });
    expect(parsed.line).toBe(5);
  });

  test('valid ComplianceMetrics parses', () => {
    const parsed = ComplianceMetricsSchema.parse({
      totalConstraints: 15,
      satisfied: 10,
      violated: 2,
      warnings: 3,
    });
    expect(parsed.satisfied).toBe(10);
  });

  test('valid ModuleLock parses', () => {
    const parsed = ModuleLockSchema.parse({
      module: 'auth',
      ownerTaskId: 'task-1',
      groupId: 2,
      acquiredAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.groupId).toBe(2);
  });

  test('invalid schema data is rejected', () => {
    expect(() =>
      EnforcementReportSchema.parse({
        taskId: '',
        planId: 'plan-1',
        timestamp: 'invalid',
        status: 'unknown',
        violations: [],
        metrics: {
          totalConstraints: -1,
          satisfied: 0,
          violated: 0,
          warnings: 0,
        },
      })
    ).toThrow();

    expect(() =>
      ModuleLockSchema.parse({
        module: 'auth',
        ownerTaskId: '',
        groupId: 0,
        acquiredAt: '2026-01-01T00:00:00.000Z',
      })
    ).toThrow();
  });
});

describe('ArchitectureEnforcer rule 1 - dependency boundaries', () => {
  test('import from exposed interface does not violate', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/service.ts',
        "import { SharedApi } from '../shared/SharedApi'; export const AuthService = () => SharedApi;",
      ],
      ['src/modules/shared/SharedApi.ts', 'export const SharedApi = () => true;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'dep-boundary-')).toBe(0);
  });

  test('import from internal path of another module violates', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/service.ts',
        "import { helper } from '../shared/internal/helper'; export const AuthService = helper;",
      ],
      ['src/modules/shared/internal/helper.ts', 'export const helper = () => true;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'dep-boundary-')).toBe(1);
    expect(report.violations[0]?.constraintId).toBe('dep-boundary-auth-shared');
  });

  test('self import within same module does not violate', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/service.ts',
        "import { internal } from './internal/util'; export const AuthService = internal;",
      ],
      ['src/modules/auth/internal/util.ts', 'export const internal = () => true;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'dep-boundary-')).toBe(0);
  });

  test('no cross module imports passes dependency rule', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/service.ts',
        "export const AuthService = () => 'ok'; export type AuthContract = { id: string };",
      ],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'dep-boundary-')).toBe(0);
  });

  test('multiple internal cross module imports produce multiple violations', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/a.ts',
        "import { x } from '../shared/internal/x'; export const AuthService = () => x;",
      ],
      [
        'src/modules/auth/b.ts',
        "export { y } from '../shared/internal/y'; export type AuthContract = { y: string };",
      ],
      ['src/modules/shared/internal/x.ts', 'export const x = 1;'],
      ['src/modules/shared/internal/y.ts', 'export const y = 2;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'dep-boundary-')).toBe(2);
  });

  test('dynamic import and require are checked', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/runtime.ts',
        "export async function run(){ await import('../shared/internal/runtime'); const k = require('../shared/internal/legacy'); return k; }",
      ],
      ['src/modules/shared/internal/runtime.ts', 'export const r = 1;'],
      ['src/modules/shared/internal/legacy.ts', 'module.exports = { x: 1 };'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'dep-boundary-')).toBe(2);
  });
});

describe('ArchitectureEnforcer rule 2 - required exports', () => {
  test('all exposed interfaces exported produces no required export violations', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/public.ts',
        'export function AuthService() { return true; } export type AuthContract = { ok: boolean };',
      ],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'required-export-')).toBe(0);
  });

  test('missing export is warning violation', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      ['src/modules/auth/public.ts', 'export function AuthService() { return true; }'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    const missing = report.violations.filter((violation) =>
      violation.constraintId.startsWith('required-export-auth-')
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]?.severity).toBe('warning');
    expect(missing[0]?.constraintId).toBe('required-export-auth-AuthContract');
  });

  test('modules absent from fileContents are skipped', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/public.ts',
        'export function AuthService() { return true; } export type AuthContract = { ok: boolean };',
      ],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(
      report.violations.some((violation) => violation.constraintId.startsWith('required-export-shared-'))
    ).toBe(false);
    expect(
      report.violations.some((violation) => violation.constraintId.startsWith('required-export-billing-'))
    ).toBe(false);
  });

  test('export forms function const class type interface are detected', () => {
    const enforcer = new ArchitectureEnforcer();
    const plan = makePlan({
      modules: [
        {
          ...makePlan().modules[0],
          exposedInterfaces: ['AuthService', 'AuthContract', 'AuthClass', 'AuthShape', 'AuthConst'],
        },
        makePlan().modules[1],
        makePlan().modules[2],
      ],
    });
    const files = new Map<string, string>([
      [
        'src/modules/auth/public.ts',
        [
          'export function AuthService() { return true; }',
          'export const AuthConst = 1;',
          'export class AuthClass {}',
          'export type AuthContract = { id: string };',
          'export interface AuthShape { id: string }',
        ].join('\n'),
      ],
    ]);
    const report = enforcer.validate(files, plan, makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'required-export-')).toBe(0);
  });

  test('re-export with alias satisfies interface name', () => {
    const enforcer = new ArchitectureEnforcer();
    const plan = makePlan({
      modules: [
        {
          ...makePlan().modules[0],
          exposedInterfaces: ['AuthServiceAlias', 'AuthContract'],
        },
        makePlan().modules[1],
        makePlan().modules[2],
      ],
    });
    const files = new Map<string, string>([
      ['src/modules/auth/service.ts', 'export const AuthService = () => true; export type AuthContract = string;'],
      ['src/modules/auth/index.ts', "export { AuthService as AuthServiceAlias } from './service';"],
    ]);
    const report = enforcer.validate(files, plan, makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'required-export-')).toBe(0);
  });
});

describe('ArchitectureEnforcer rule 3 - file ownership', () => {
  test('all files inside ownedFiles passes', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      ['src/modules/auth/service.ts', 'export const AuthService = () => true;'],
      ['src/modules/auth/contract.ts', 'export type AuthContract = string;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    expect(onlyViolations(report.violations, 'file-ownership-')).toBe(0);
  });

  test('file outside ownedFiles creates error', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      ['src/modules/auth/service.ts', 'export const AuthService = () => true;'],
      ['src/modules/shared/public.ts', 'export const SharedApi = () => true;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask(['src/modules/auth/service.ts']));
    const ownershipViolations = report.violations.filter((violation) =>
      violation.constraintId.startsWith('file-ownership-')
    );
    expect(ownershipViolations).toHaveLength(1);
    expect(ownershipViolations[0]?.severity).toBe('error');
  });

  test('empty fileContents passes ownership', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>();
    const report = enforcer.validate(files, makePlan(), makeTask([]));
    expect(onlyViolations(report.violations, 'file-ownership-')).toBe(0);
  });

  test('multiple unauthorized files create multiple violations', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      ['src/modules/auth/service.ts', 'export const AuthService = () => true;'],
      ['src/modules/shared/private.ts', 'export const SharedApi = () => true;'],
      ['src/modules/billing/api.ts', 'export const BillingApi = () => true;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask(['src/modules/auth/service.ts']));
    expect(onlyViolations(report.violations, 'file-ownership-')).toBe(2);
  });
});

describe('ArchitectureEnforcer rule 4 - technology compliance', () => {
  test('matching tech stack with no competitors passes technology check', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([['src/modules/auth/service.ts', 'export const AuthService = () => true;']]);
    const plan = makePlan({ constraints: [] });
    const report = enforcer.validate(files, plan, makeTask([...files.keys()]), {
      dependencies: {
        express: '^4.0.0',
      },
      devDependencies: {
        vitest: '^1.0.0',
      },
    });
    expect(onlyViolations(report.violations, 'tech-compliance-')).toBe(0);
  });

  test('competitor framework in dependencies triggers warning', () => {
    const enforcer = new ArchitectureEnforcer();
    const report = enforcer.validate(new Map<string, string>(), makePlan({ constraints: [] }), makeTask([]), {
      dependencies: {
        express: '^4.0.0',
        fastify: '^5.0.0',
      },
      devDependencies: {
        vitest: '^1.0.0',
      },
    });
    const techViolations = report.violations.filter((violation) => violation.constraintId === 'tech-compliance-fastify');
    expect(techViolations).toHaveLength(1);
    expect(techViolations[0]?.severity).toBe('warning');
  });

  test('no packageJson skips technology checks entirely', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>();
    const report = enforcer.validate(files, makePlan(), makeTask([]));
    expect(onlyViolations(report.violations, 'tech-compliance-')).toBe(0);
    expect(report.metrics.totalConstraints).toBe(0);
  });

  test('multiple framework and test framework competitors are reported', () => {
    const enforcer = new ArchitectureEnforcer();
    const report = enforcer.validate(new Map<string, string>(), makePlan({ constraints: [] }), makeTask([]), {
      dependencies: {
        koa: '^2.0.0',
      },
      devDependencies: {
        jest: '^29.0.0',
        mocha: '^10.0.0',
      },
    });
    const ids = report.violations.map((violation) => violation.constraintId).sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(['tech-compliance-jest', 'tech-compliance-koa', 'tech-compliance-mocha']);
  });

  test('technology constraint forbidden package severity is honored', () => {
    const enforcer = new ArchitectureEnforcer();
    const plan = makePlan({
      constraints: [
        {
          id: 'CONST-TECH-ERROR',
          type: 'technology',
          description: 'must not use koa package',
          rule: 'forbid koa',
          severity: 'error',
        },
      ],
    });
    const report = enforcer.validate(new Map<string, string>(), plan, makeTask([]), {
      dependencies: {
        koa: '^2.0.0',
      },
      devDependencies: {},
    });
    const violation = report.violations.find((item) => item.constraintId === 'tech-compliance-koa');
    expect(violation?.severity).toBe('error');
  });
});

describe('ArchitectureEnforcer report assembly and integration', () => {
  test('full validate with clean code returns pass', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/index.ts',
        [
          "import { SharedApi } from '../shared/SharedApi';",
          'export const AuthService = () => SharedApi();',
          'export type AuthContract = { id: string };',
        ].join('\n'),
      ],
      [
        'src/modules/shared/SharedApi.ts',
        'export const SharedApi = () => true; export const SharedUtil = () => true;',
      ],
    ]);

    const report = enforcer.validate(files, makePlan({ constraints: [] }), makeTask([...files.keys()]), {
      dependencies: { express: '^4.0.0' },
      devDependencies: { vitest: '^1.0.0' },
    });

    expect(report.status).toBe('pass');
    expect(report.violations).toHaveLength(0);
    expect(report.metrics.violated).toBe(0);
    expect(report.metrics.warnings).toBe(0);
    expect(report.metrics.satisfied).toBe(report.metrics.totalConstraints);
  });

  test('full validate with mixed violations returns fail and correct counts', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/service.ts',
        "import { helper } from '../shared/internal/helper'; export const AuthService = helper;",
      ],
      ['src/modules/shared/internal/helper.ts', 'export const helper = () => true;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask(['src/modules/auth/service.ts']), {
      dependencies: {
        fastify: '^5.0.0',
        koa: '^2.0.0',
      },
      devDependencies: {
        jest: '^29.0.0',
      },
    });

    expect(report.status).toBe('fail');
    expect(report.metrics.violated).toBeGreaterThan(0);
    expect(report.metrics.warnings).toBeGreaterThan(0);
    expect(report.metrics.violated + report.metrics.warnings).toBe(report.violations.length);
  });

  test('warn status when only warnings exist', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      ['src/modules/auth/service.ts', 'export const AuthService = () => true;'],
    ]);
    const plan = makePlan({ constraints: [] });
    const report = enforcer.validate(files, plan, makeTask([...files.keys()]), {
      dependencies: { express: '^4.0.0', fastify: '^5.0.0' },
      devDependencies: { vitest: '^1.0.0' },
    });
    expect(report.status).toBe('warn');
    expect(report.metrics.violated).toBe(0);
    expect(report.metrics.warnings).toBeGreaterThan(0);
  });

  test('violations are sorted deterministically', () => {
    const enforcer = new ArchitectureEnforcer();
    const files = new Map<string, string>([
      [
        'src/modules/auth/z.ts',
        "import { y } from '../shared/internal/y'; export const AuthService = y;",
      ],
      [
        'src/modules/auth/a.ts',
        "import { x } from '../shared/internal/x'; export type AuthContract = string;",
      ],
      ['src/modules/shared/internal/x.ts', 'export const x = 1;'],
      ['src/modules/shared/internal/y.ts', 'export const y = 2;'],
    ]);
    const report = enforcer.validate(files, makePlan(), makeTask([...files.keys()]));
    const ids = report.violations.map((violation) => `${violation.constraintId}::${violation.file}`);
    const sorted = [...ids].sort((a, b) => a.localeCompare(b));
    expect(ids).toEqual(sorted);
  });

  test('telemetry hook receives enforcement completed event', () => {
    const events: EnforcementTelemetryEvent[] = [];
    const enforcer = new ArchitectureEnforcer((event) => {
      events.push(event);
    });
    const files = new Map<string, string>([['src/modules/auth/service.ts', 'export const AuthService = () => true;']]);
    const report = enforcer.validate(files, makePlan({ constraints: [] }), makeTask([...files.keys()]), {
      dependencies: { express: '^4.0.0' },
      devDependencies: { vitest: '^1.0.0' },
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('enforcement-completed');
    expect(events[0]?.taskId).toBe('task-auth-001');
    expect(events[0]?.planId).toBe('plan-enforcer-001');
    expect(events[0]?.status).toBe(report.status);
    expect(events[0]?.metrics.totalConstraints).toBe(report.metrics.totalConstraints);
  });

  test('telemetry violationsByRule groups counts by deterministic buckets', () => {
    const events: EnforcementTelemetryEvent[] = [];
    const enforcer = new ArchitectureEnforcer((event) => {
      events.push(event);
    });

    const files = new Map<string, string>([
      [
        'src/modules/auth/service.ts',
        "import { helper } from '../shared/internal/helper'; export const AuthService = helper;",
      ],
      ['src/modules/shared/internal/helper.ts', 'export const helper = () => true;'],
      ['src/modules/shared/extra.ts', 'export const SharedApi = () => true;'],
    ]);

    enforcer.validate(files, makePlan(), makeTask(['src/modules/auth/service.ts']), {
      dependencies: { fastify: '^5.0.0' },
      devDependencies: { jest: '^29.0.0' },
    });

    expect(events).toHaveLength(1);
    expect((events[0]?.violationsByRule['dependency-boundary'] ?? 0) > 0).toBe(true);
    expect((events[0]?.violationsByRule['file-ownership'] ?? 0) > 0).toBe(true);
    expect((events[0]?.violationsByRule['technology-compliance'] ?? 0) > 0).toBe(true);
  });
});
