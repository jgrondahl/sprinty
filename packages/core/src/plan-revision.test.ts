import { describe, test, expect } from 'bun:test';
import type { EnforcementReport } from './architecture-enforcer';
import {
  PlanRevisionReasonSchema,
  PlanRevisionLevelSchema,
  PlanRevisionTriggerSchema,
  RevisionClassificationPolicySchema,
  DriftWeightsSchema,
  DriftMeasurementSchema,
  EvidenceSummarySchema,
  buildEvidenceSummary,
  classifyRevisionLevel,
  computeDriftScore,
  detectDriftTrigger,
  detectRepeatedEnforcementViolations,
  detectSandboxConstraintTrigger,
} from './plan-revision';

const makeTrigger = (overrides: Partial<ReturnType<typeof PlanRevisionTriggerSchema.parse>> = {}) =>
  PlanRevisionTriggerSchema.parse({
    reason: 'architecture-violation',
    description: 'Repeated architecture violations across retries',
    evidence: ['dep-boundary-auth-shared'],
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

const makeReport = (overrides: Partial<EnforcementReport> = {}): EnforcementReport => ({
  taskId: 'task-001',
  planId: 'plan-001',
  timestamp: '2026-01-01T00:00:00.000Z',
  status: 'fail',
  violations: [
    {
      constraintId: 'dep-boundary-auth-shared',
      severity: 'error',
      file: 'src/modules/auth/service.ts',
      description: 'auth imports private shared internals',
      suggestion: 'use shared exposed interface',
    },
  ],
  metrics: {
    totalConstraints: 3,
    satisfied: 1,
    violated: 1,
    warnings: 1,
  },
  ...overrides,
});

describe('plan-revision schemas', () => {
  test('PlanRevisionReasonSchema accepts all expected enum values', () => {
    const values = [
      'task-failure',
      'architecture-violation',
      'new-capability-required',
      'dependency-conflict',
      'plan-reality-drift',
      'sandbox-constraint',
      'human-override',
    ] as const;
    for (const value of values) {
      expect(PlanRevisionReasonSchema.parse(value)).toBe(value);
    }
  });

  test('PlanRevisionReasonSchema rejects invalid enum value', () => {
    expect(PlanRevisionReasonSchema.safeParse('unknown').success).toBe(false);
  });

  test('PlanRevisionLevelSchema accepts global and sprint', () => {
    expect(PlanRevisionLevelSchema.parse('global')).toBe('global');
    expect(PlanRevisionLevelSchema.parse('sprint')).toBe('sprint');
  });

  test('PlanRevisionLevelSchema rejects invalid value', () => {
    expect(PlanRevisionLevelSchema.safeParse('program').success).toBe(false);
  });

  test('PlanRevisionTriggerSchema parses minimal required data', () => {
    const parsed = PlanRevisionTriggerSchema.parse({
      reason: 'task-failure',
      description: 'Retries exhausted',
      evidence: ['retry-1', 'retry-2'],
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.reason).toBe('task-failure');
    expect(parsed.level).toBeUndefined();
  });

  test('PlanRevisionTriggerSchema rejects empty description', () => {
    expect(
      PlanRevisionTriggerSchema.safeParse({
        reason: 'task-failure',
        description: '',
        evidence: ['x'],
        timestamp: '2026-01-01T00:00:00.000Z',
      }).success
    ).toBe(false);
  });

  test('RevisionClassificationPolicySchema parses valid policy', () => {
    const parsed = RevisionClassificationPolicySchema.parse({
      globalEscalationRules: ['module-boundary-change'],
      sprintRules: ['missing-interface'],
    });
    expect(parsed.globalEscalationRules).toEqual(['module-boundary-change']);
  });

  test('RevisionClassificationPolicySchema rejects invalid rule', () => {
    expect(
      RevisionClassificationPolicySchema.safeParse({
        globalEscalationRules: ['bad-rule'],
        sprintRules: ['missing-interface'],
      }).success
    ).toBe(false);
  });

  test('DriftWeightsSchema provides defaults and validates sum', () => {
    const parsed = DriftWeightsSchema.parse({});
    expect(parsed.importGraphViolations).toBe(0.4);
    expect(parsed.boundaryViolations).toBe(0.35);
    expect(parsed.dependencyMismatches).toBe(0.25);
  });

  test('DriftWeightsSchema rejects invalid sum', () => {
    expect(
      DriftWeightsSchema.safeParse({
        importGraphViolations: 0.5,
        boundaryViolations: 0.5,
        dependencyMismatches: 0.5,
      }).success
    ).toBe(false);
  });

  test('DriftWeightsSchema allows tolerance near 1.0', () => {
    const parsed = DriftWeightsSchema.parse({
      importGraphViolations: 0.333,
      boundaryViolations: 0.333,
      dependencyMismatches: 0.333,
    });
    expect(parsed.importGraphViolations + parsed.boundaryViolations + parsed.dependencyMismatches).toBe(0.9990000000000001);
  });

  test('DriftMeasurementSchema applies default threshold', () => {
    const parsed = DriftMeasurementSchema.parse({
      planId: 'plan-a',
      score: 20,
      exceeded: false,
      importGraphViolations: 0,
      boundaryViolations: 0,
      dependencyMismatches: 0,
    });
    expect(parsed.threshold).toBe(25);
  });

  test('EvidenceSummarySchema parses valid shape', () => {
    const parsed = EvidenceSummarySchema.parse({
      triggerId: 'trig-1',
      level: 'sprint',
      failingModules: ['auth'],
      violatedConstraintIds: ['dep-boundary-auth-shared'],
      missingCapabilities: [],
      resourceLimitFailures: [
        {
          taskId: 'task-1',
          limit: 'cpu',
          actual: 200,
          configured: 100,
        },
      ],
      affectedFiles: ['src/modules/auth/service.ts'],
      artifactRefs: ['artifacts/report.json'],
    });
    expect(parsed.resourceLimitFailures).toHaveLength(1);
  });

  test('EvidenceSummarySchema rejects invalid resource limit', () => {
    expect(
      EvidenceSummarySchema.safeParse({
        triggerId: 'trig-1',
        level: 'sprint',
        failingModules: ['auth'],
        violatedConstraintIds: [],
        missingCapabilities: [],
        resourceLimitFailures: [
          {
            taskId: 'task-1',
            limit: 'network',
            actual: 1,
            configured: 1,
          },
        ],
        affectedFiles: [],
        artifactRefs: [],
      }).success
    ).toBe(false);
  });
});

describe('computeDriftScore', () => {
  test('zero violations returns zero score and not exceeded', () => {
    const result = computeDriftScore({
      planId: 'plan-1',
      totalImports: 10,
      illegalImports: 0,
      totalBoundaries: 5,
      boundaryViolations: 0,
      declaredDependencies: 4,
      unexpectedDependencies: 0,
      missingDependencies: 0,
    });
    expect(result.score).toBe(0);
    expect(result.exceeded).toBe(false);
  });

  test('maximum violations saturate score at 100', () => {
    const result = computeDriftScore({
      planId: 'plan-1',
      totalImports: 1,
      illegalImports: 10,
      totalBoundaries: 1,
      boundaryViolations: 10,
      declaredDependencies: 1,
      unexpectedDependencies: 10,
      missingDependencies: 10,
    });
    expect(result.score).toBe(100);
    expect(result.exceeded).toBe(true);
  });

  test('mixed violations computes deterministic rounded score', () => {
    const result = computeDriftScore({
      planId: 'plan-1',
      totalImports: 10,
      illegalImports: 2,
      totalBoundaries: 8,
      boundaryViolations: 1,
      declaredDependencies: 6,
      unexpectedDependencies: 1,
      missingDependencies: 1,
    });
    expect(result.score).toBe(20.71);
  });

  test('custom weights are honored', () => {
    const result = computeDriftScore({
      planId: 'plan-1',
      totalImports: 10,
      illegalImports: 5,
      totalBoundaries: 10,
      boundaryViolations: 0,
      declaredDependencies: 10,
      unexpectedDependencies: 0,
      missingDependencies: 0,
      weights: {
        importGraphViolations: 1,
        boundaryViolations: 0,
        dependencyMismatches: 0,
      },
    });
    expect(result.score).toBe(50);
  });

  test('custom threshold updates exceeded decision', () => {
    const result = computeDriftScore({
      planId: 'plan-1',
      totalImports: 10,
      illegalImports: 3,
      totalBoundaries: 10,
      boundaryViolations: 3,
      declaredDependencies: 10,
      unexpectedDependencies: 2,
      missingDependencies: 0,
      threshold: 10,
    });
    expect(result.exceeded).toBe(true);
    expect(result.threshold).toBe(10);
  });

  test('zero totals avoid division by zero and can still saturate to max', () => {
    const result = computeDriftScore({
      planId: 'plan-1',
      totalImports: 0,
      illegalImports: 1,
      totalBoundaries: 0,
      boundaryViolations: 1,
      declaredDependencies: 0,
      unexpectedDependencies: 1,
      missingDependencies: 1,
    });
    expect(result.score).toBe(100);
  });
});

describe('classifyRevisionLevel', () => {
  test('global evidence classifies as global', () => {
    const level = classifyRevisionLevel(makeTrigger(), ['service-topology-change detected']);
    expect(level).toBe('global');
  });

  test('sprint-only evidence classifies as sprint', () => {
    const level = classifyRevisionLevel(makeTrigger(), ['module-capability-gap on auth']);
    expect(level).toBe('sprint');
  });

  test('mixed evidence defaults to safer global', () => {
    const level = classifyRevisionLevel(makeTrigger(), ['module-boundary-change', 'missing-interface']);
    expect(level).toBe('global');
  });

  test('human-override always classifies as global', () => {
    const level = classifyRevisionLevel(makeTrigger({ reason: 'human-override' }), ['missing-interface']);
    expect(level).toBe('global');
  });

  test('empty evidence falls back to trigger level then sprint', () => {
    expect(classifyRevisionLevel(makeTrigger({ level: 'global' }), [])).toBe('global');
    expect(classifyRevisionLevel(makeTrigger(), [])).toBe('sprint');
  });

  test('custom policy changes classification behavior', () => {
    const level = classifyRevisionLevel(
      makeTrigger(),
      ['escalate-now'],
      {
        globalEscalationRules: ['service-topology-change'],
        sprintRules: ['missing-interface'],
      }
    );
    expect(level).toBe('sprint');
  });
});

describe('detectRepeatedEnforcementViolations', () => {
  test('no violations does not trigger', () => {
    const result = detectRepeatedEnforcementViolations([makeReport({ violations: [] })]);
    expect(result.triggered).toBe(false);
    expect(result.evidence).toEqual([]);
  });

  test('single report does not trigger by default', () => {
    const result = detectRepeatedEnforcementViolations([makeReport()]);
    expect(result.triggered).toBe(false);
  });

  test('same constraint repeated across reports triggers', () => {
    const result = detectRepeatedEnforcementViolations([makeReport(), makeReport({ taskId: 'task-002' })]);
    expect(result.triggered).toBe(true);
    expect(result.constraintCategories).toEqual(['dependency-boundary']);
  });

  test('different constraints across reports do not trigger', () => {
    const result = detectRepeatedEnforcementViolations([
      makeReport({
        violations: [
          {
            constraintId: 'dep-boundary-auth-shared',
            severity: 'error',
            file: 'src/modules/auth/service.ts',
            description: 'x',
            suggestion: 'y',
          },
        ],
      }),
      makeReport({
        taskId: 'task-002',
        violations: [
          {
            constraintId: 'file-ownership-task-002',
            severity: 'error',
            file: 'src/modules/shared/file.ts',
            description: 'x',
            suggestion: 'y',
          },
        ],
      }),
    ]);
    expect(result.triggered).toBe(false);
  });

  test('custom minRepeats is respected', () => {
    const result = detectRepeatedEnforcementViolations([makeReport(), makeReport({ taskId: 'task-002' })], 3);
    expect(result.triggered).toBe(false);
  });
});

describe('detectDriftTrigger', () => {
  const m = (score: number, threshold = 25) =>
    DriftMeasurementSchema.parse({
      planId: 'plan-1',
      score,
      threshold,
      exceeded: score >= threshold,
      importGraphViolations: 0,
      boundaryViolations: 0,
      dependencyMismatches: 0,
    });

  test('below threshold does not trigger', () => {
    const result = detectDriftTrigger([m(10), m(20)]);
    expect(result.triggered).toBe(false);
  });

  test('single exceeded does not trigger without critical flag', () => {
    const result = detectDriftTrigger([m(30)]);
    expect(result.triggered).toBe(false);
  });

  test('two consecutive exceeded triggers', () => {
    const result = detectDriftTrigger([m(30), m(40)]);
    expect(result.triggered).toBe(true);
  });

  test('critical boundary violation triggers immediately on single exceedance', () => {
    const result = detectDriftTrigger([m(30)], { criticalBoundaryViolation: true });
    expect(result.triggered).toBe(true);
  });

  test('non-consecutive exceeded does not trigger when requiring consecutive', () => {
    const result = detectDriftTrigger([m(30), m(10), m(35)], { requireConsecutive: true });
    expect(result.triggered).toBe(false);
  });

  test('non-consecutive exceeded triggers when not requiring consecutive and enough hits', () => {
    const result = detectDriftTrigger([m(30), m(10), m(35)], { requireConsecutive: false });
    expect(result.triggered).toBe(true);
  });
});

describe('detectSandboxConstraintTrigger', () => {
  test('no failures does not trigger', () => {
    const result = detectSandboxConstraintTrigger([]);
    expect(result.triggered).toBe(false);
    expect(result.taskId).toBeNull();
  });

  test('single failure does not trigger by default', () => {
    const result = detectSandboxConstraintTrigger([
      { taskId: 'task-1', limit: 'memory', actual: 200, configured: 100 },
    ]);
    expect(result.triggered).toBe(false);
  });

  test('repeated same-task distinct failures trigger', () => {
    const result = detectSandboxConstraintTrigger([
      { taskId: 'task-1', limit: 'memory', actual: 200, configured: 100 },
      { taskId: 'task-1', limit: 'runtime', actual: 90, configured: 30 },
    ]);
    expect(result.triggered).toBe(true);
    expect(result.taskId).toBe('task-1');
    expect(result.evidence).toHaveLength(2);
  });

  test('different-task failures do not trigger for same task repeat rule', () => {
    const result = detectSandboxConstraintTrigger([
      { taskId: 'task-1', limit: 'memory', actual: 200, configured: 100 },
      { taskId: 'task-2', limit: 'memory', actual: 200, configured: 100 },
    ]);
    expect(result.triggered).toBe(false);
  });

  test('custom minFailures is respected', () => {
    const result = detectSandboxConstraintTrigger(
      [
        { taskId: 'task-1', limit: 'cpu', actual: 2, configured: 1 },
        { taskId: 'task-1', limit: 'memory', actual: 2, configured: 1 },
      ],
      3
    );
    expect(result.triggered).toBe(false);
  });
});

describe('buildEvidenceSummary', () => {
  test('basic trigger with no reports still builds valid summary', () => {
    const summary = buildEvidenceSummary(
      makeTrigger({ reason: 'task-failure', evidence: ['retry exhausted'], module: 'auth' }),
      []
    );
    expect(summary.triggerId.length).toBeGreaterThan(0);
    expect(summary.level).toBe('sprint');
    expect(summary.failingModules).toEqual(['auth']);
  });

  test('extracts failingModules and violatedConstraintIds from reports', () => {
    const summary = buildEvidenceSummary(
      makeTrigger({ module: 'billing' }),
      [
        makeReport(),
        makeReport({
          taskId: 'task-002',
          violations: [
            {
              constraintId: 'required-export-billing-BillingApi',
              severity: 'warning',
              file: 'src/modules/billing/index.ts',
              description: 'missing export',
              suggestion: 'export BillingApi',
            },
          ],
        }),
      ],
      ['src/manual/additional.ts']
    );

    expect(summary.failingModules).toEqual(['auth', 'billing']);
    expect(summary.violatedConstraintIds).toEqual([
      'dep-boundary-auth-shared',
      'required-export-billing-BillingApi',
    ]);
    expect(summary.affectedFiles).toEqual([
      'src/manual/additional.ts',
      'src/modules/auth/service.ts',
      'src/modules/billing/index.ts',
    ]);
  });

  test('new-capability-required maps trigger evidence into missingCapabilities', () => {
    const summary = buildEvidenceSummary(
      makeTrigger({
        reason: 'new-capability-required',
        evidence: ['needs distributed lock service', 'missing event schema registry'],
      }),
      []
    );
    expect(summary.missingCapabilities).toEqual([
      'needs distributed lock service',
      'missing event schema registry',
    ]);
  });

  test('defaults level to sprint when trigger level missing', () => {
    const summary = buildEvidenceSummary(makeTrigger({ level: undefined }), [makeReport()]);
    expect(summary.level).toBe('sprint');
  });

  test('uses explicit trigger level when provided', () => {
    const summary = buildEvidenceSummary(makeTrigger({ level: 'global' }), [makeReport()]);
    expect(summary.level).toBe('global');
  });
});
