import { z } from 'zod';
import type { EnforcementReport } from './architecture-enforcer';

// ─── Imports ─────────────────────────────────────────────────────────────────

const DEFAULT_REVISION_POLICY = {
  globalEscalationRules: ['tech-stack-change', 'service-topology-change', 'module-boundary-change'],
  sprintRules: ['missing-interface', 'module-capability-gap', 'task-dependency-mistake', 'localized-sandbox-constraint'],
} as const;

const normalizeSignal = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const formatLimit = (value: string): string => value.toLowerCase().replace(/[^a-z0-9-]+/g, '');

const violationCategoryFromConstraintId = (constraintId: string): string => {
  if (constraintId.startsWith('dep-boundary-')) {
    return 'dependency-boundary';
  }
  if (constraintId.startsWith('required-export-')) {
    return 'required-export';
  }
  if (constraintId.startsWith('file-ownership-')) {
    return 'file-ownership';
  }
  if (constraintId.startsWith('tech-compliance-')) {
    return 'technology-compliance';
  }
  const firstToken = constraintId.split('-')[0];
  return firstToken && firstToken.length > 0 ? firstToken : 'unknown';
};

const moduleFromViolationFile = (filePath: string): string | null => {
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/(?:^|\/)modules\/([^/]+)/);
  return match?.[1] ?? null;
};

// ─── Revision Trigger Schemas ────────────────────────────────────────────────

export const PlanRevisionReasonSchema = z.enum([
  'task-failure',
  'architecture-violation',
  'new-capability-required',
  'dependency-conflict',
  'plan-reality-drift',
  'sandbox-constraint',
  'human-override',
]);

export type PlanRevisionReason = z.infer<typeof PlanRevisionReasonSchema>;

export const PlanRevisionLevelSchema = z.enum(['global', 'sprint']);

export type PlanRevisionLevel = z.infer<typeof PlanRevisionLevelSchema>;

export const PlanRevisionTriggerSchema = z.object({
  reason: PlanRevisionReasonSchema,
  level: PlanRevisionLevelSchema.optional(),
  taskId: z.string().min(1).optional(),
  module: z.string().min(1).optional(),
  description: z.string().min(1),
  evidence: z.array(z.string().min(1)),
  timestamp: z.string().datetime(),
});

export type PlanRevisionTrigger = z.infer<typeof PlanRevisionTriggerSchema>;

export const RevisionClassificationPolicySchema = z.object({
  globalEscalationRules: z.array(
    z.enum(['tech-stack-change', 'service-topology-change', 'module-boundary-change'])
  ),
  sprintRules: z.array(
    z.enum(['missing-interface', 'module-capability-gap', 'task-dependency-mistake', 'localized-sandbox-constraint'])
  ),
});

export type RevisionClassificationPolicy = z.infer<typeof RevisionClassificationPolicySchema>;

// ─── Drift Scoring Schemas ───────────────────────────────────────────────────

export const DriftWeightsSchema = z
  .object({
    importGraphViolations: z.number().min(0).max(1).default(0.4),
    boundaryViolations: z.number().min(0).max(1).default(0.35),
    dependencyMismatches: z.number().min(0).max(1).default(0.25),
  })
  .superRefine((value, ctx) => {
    const total = value.importGraphViolations + value.boundaryViolations + value.dependencyMismatches;
    if (Math.abs(total - 1) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Drift weights must sum to 1.0 (±0.001).',
      });
    }
  });

export type DriftWeights = z.infer<typeof DriftWeightsSchema>;

export const DriftMeasurementSchema = z.object({
  planId: z.string().min(1),
  score: z.number().min(0).max(100),
  threshold: z.number().min(0).max(100).default(25),
  exceeded: z.boolean(),
  importGraphViolations: z.number().int().min(0),
  boundaryViolations: z.number().int().min(0),
  dependencyMismatches: z.number().int().min(0),
});

export type DriftMeasurement = z.infer<typeof DriftMeasurementSchema>;

export interface DriftScoreInput {
  planId: string;
  totalImports: number;
  illegalImports: number;
  totalBoundaries: number;
  boundaryViolations: number;
  declaredDependencies: number;
  unexpectedDependencies: number;
  missingDependencies: number;
  weights?: DriftWeights;
  threshold?: number;
}

// ─── Evidence Summary Schema ─────────────────────────────────────────────────

export const EvidenceSummarySchema = z.object({
  triggerId: z.string().min(1),
  level: PlanRevisionLevelSchema,
  failingModules: z.array(z.string().min(1)),
  violatedConstraintIds: z.array(z.string().min(1)),
  missingCapabilities: z.array(z.string().min(1)),
  resourceLimitFailures: z.array(
    z.object({
      taskId: z.string().min(1),
      limit: z.enum(['cpu', 'memory', 'runtime', 'disk']),
      actual: z.number().min(0),
      configured: z.number().min(0),
    })
  ),
  affectedFiles: z.array(z.string()),
  artifactRefs: z.array(z.string()),
});

export type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;

// ─── Drift Scoring ───────────────────────────────────────────────────────────

export function computeDriftScore(input: DriftScoreInput): DriftMeasurement {
  const weights = DriftWeightsSchema.parse(input.weights ?? {});
  const threshold = input.threshold ?? 25;

  const ig = Math.min(input.illegalImports / Math.max(input.totalImports, 1), 1);
  const bv = Math.min(input.boundaryViolations / Math.max(input.totalBoundaries, 1), 1);
  const dmRaw = (input.unexpectedDependencies + input.missingDependencies) / Math.max(input.declaredDependencies, 1);
  const dm = Math.min(dmRaw, 1);

  const scoreRaw = 100 * (weights.importGraphViolations * ig + weights.boundaryViolations * bv + weights.dependencyMismatches * dm);
  const score = Number(scoreRaw.toFixed(2));
  const exceeded = score >= threshold;

  return DriftMeasurementSchema.parse({
    planId: input.planId,
    score,
    threshold,
    exceeded,
    importGraphViolations: input.illegalImports,
    boundaryViolations: input.boundaryViolations,
    dependencyMismatches: input.unexpectedDependencies + input.missingDependencies,
  });
}

// ─── Trigger Detection ───────────────────────────────────────────────────────

export function classifyRevisionLevel(
  trigger: PlanRevisionTrigger,
  evidence: string[],
  policy?: RevisionClassificationPolicy
): PlanRevisionLevel {
  if (trigger.reason === 'human-override') {
    return 'global';
  }

  const effectivePolicy = RevisionClassificationPolicySchema.parse(policy ?? DEFAULT_REVISION_POLICY);

  const normalizedEvidence = evidence.map((item) => normalizeSignal(item));
  const hasGlobal = effectivePolicy.globalEscalationRules.some((rule) => {
    const normalizedRule = normalizeSignal(rule);
    return normalizedEvidence.some((item) => item.includes(normalizedRule));
  });
  const hasSprint = effectivePolicy.sprintRules.some((rule) => {
    const normalizedRule = normalizeSignal(rule);
    return normalizedEvidence.some((item) => item.includes(normalizedRule));
  });

  if (hasGlobal) {
    return 'global';
  }
  if (hasSprint) {
    return 'sprint';
  }

  return trigger.level ?? 'sprint';
}

export function detectRepeatedEnforcementViolations(
  reports: EnforcementReport[],
  minRepeats = 2
): { triggered: boolean; constraintCategories: string[]; evidence: string[] } {
  const normalizedMinRepeats = Math.max(1, Math.floor(minRepeats));
  const reportMapByConstraint = new Map<string, Set<number>>();

  reports.forEach((report, reportIndex) => {
    const seenInReport = new Set<string>();
    report.violations.forEach((violation) => {
      if (seenInReport.has(violation.constraintId)) {
        return;
      }
      seenInReport.add(violation.constraintId);
      const existing = reportMapByConstraint.get(violation.constraintId) ?? new Set<number>();
      existing.add(reportIndex);
      reportMapByConstraint.set(violation.constraintId, existing);
    });
  });

  const repeated = [...reportMapByConstraint.entries()]
    .filter(([, reportIndexes]) => reportIndexes.size >= normalizedMinRepeats)
    .sort(([left], [right]) => left.localeCompare(right));

  const evidence = repeated.map(([constraintId, reportIndexes]) =>
    `constraint '${constraintId}' repeated in ${reportIndexes.size} reports`
  );
  const constraintCategories = [...new Set(repeated.map(([constraintId]) => violationCategoryFromConstraintId(constraintId)))].sort(
    (a, b) => a.localeCompare(b)
  );

  return {
    triggered: repeated.length > 0,
    constraintCategories,
    evidence,
  };
}

export function detectDriftTrigger(
  measurements: DriftMeasurement[],
  opts?: { requireConsecutive?: boolean; criticalBoundaryViolation?: boolean }
): { triggered: boolean; reason: string } {
  if (measurements.length === 0) {
    return { triggered: false, reason: 'no measurements' };
  }

  const requireConsecutive = opts?.requireConsecutive ?? true;
  const exceededIndexes = measurements
    .map((measurement, index) => ({ measurement, index }))
    .filter(({ measurement }) => measurement.score >= measurement.threshold)
    .map(({ index }) => index);

  const hasExceeded = exceededIndexes.length > 0;
  if (opts?.criticalBoundaryViolation && hasExceeded) {
    return { triggered: true, reason: 'critical boundary violation with threshold exceedance' };
  }

  if (requireConsecutive) {
    for (let i = 1; i < measurements.length; i += 1) {
      const previous = measurements[i - 1];
      const current = measurements[i];
      if (!previous || !current) {
        continue;
      }
      if (previous.score >= previous.threshold && current.score >= current.threshold) {
        return { triggered: true, reason: 'two consecutive drift measurements exceeded threshold' };
      }
    }

    return { triggered: false, reason: 'no consecutive threshold exceedance' };
  }

  if (exceededIndexes.length >= 2) {
    return { triggered: true, reason: 'multiple drift measurements exceeded threshold' };
  }

  return { triggered: false, reason: 'insufficient threshold exceedance' };
}

export function detectSandboxConstraintTrigger(
  failures: Array<{ taskId: string; limit: string; actual: number; configured: number }>,
  minFailures = 2
): { triggered: boolean; taskId: string | null; evidence: string[] } {
  const normalizedMinFailures = Math.max(1, Math.floor(minFailures));
  const uniqueByTask = new Map<string, Set<string>>();

  failures.forEach((failure) => {
    const key = `${formatLimit(failure.limit)}:${failure.actual}:${failure.configured}`;
    const existing = uniqueByTask.get(failure.taskId) ?? new Set<string>();
    existing.add(key);
    uniqueByTask.set(failure.taskId, existing);
  });

  const triggeredTaskEntry = [...uniqueByTask.entries()]
    .filter(([, entries]) => entries.size >= normalizedMinFailures)
    .sort(([leftTaskId], [rightTaskId]) => leftTaskId.localeCompare(rightTaskId))[0];

  if (!triggeredTaskEntry) {
    return { triggered: false, taskId: null, evidence: [] };
  }

  const [taskId, entries] = triggeredTaskEntry;
  const evidence = [...entries]
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => {
      const [limit, actual, configured] = entry.split(':');
      return `task '${taskId}' exceeded ${limit} (${actual} > ${configured})`;
    });

  return {
    triggered: true,
    taskId,
    evidence,
  };
}

// ─── Evidence Packaging ──────────────────────────────────────────────────────

export function buildEvidenceSummary(
  trigger: PlanRevisionTrigger,
  reports: EnforcementReport[],
  files?: string[]
): EvidenceSummary {
  const allViolations = reports.flatMap((report) => report.violations);

  const failingModules = [
    ...new Set([
      ...allViolations
        .map((violation) => moduleFromViolationFile(violation.file))
        .filter((value): value is string => value !== null),
      ...(trigger.module ? [trigger.module] : []),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const violatedConstraintIds = [...new Set(allViolations.map((violation) => violation.constraintId))].sort((a, b) =>
    a.localeCompare(b)
  );

  const missingCapabilities = trigger.reason === 'new-capability-required' ? [...trigger.evidence] : [];

  const affectedFiles = [...new Set([...(files ?? []), ...allViolations.map((violation) => violation.file)])].sort((a, b) =>
    a.localeCompare(b)
  );

  const triggerId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `trigger-${Date.now()}`;

  return EvidenceSummarySchema.parse({
    triggerId,
    level: trigger.level ?? 'sprint',
    failingModules,
    violatedConstraintIds,
    missingCapabilities,
    resourceLimitFailures: [],
    affectedFiles,
    artifactRefs: [],
  });
}
