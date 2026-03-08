import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { PlanRevisionTriggerSchema } from './plan-revision';
import type { WorkspaceState } from './types';
import { WorkspaceManager } from './workspace';

// ─── Architecture Plan Schemas ───────────────────────────────────────────────

export const TechStackDecisionSchema = z.object({
  language: z.string().min(1),
  runtime: z.string().min(1),
  framework: z.string().min(1),
  database: z.string().min(1).optional(),
  testFramework: z.string().min(1),
  buildTool: z.string().min(1),
  rationale: z.string().min(1),
});

export type TechStackDecision = z.infer<typeof TechStackDecisionSchema>;

export const ModuleDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  responsibility: z.string().min(1),
  directory: z.string().min(1),
  exposedInterfaces: z.array(z.string().min(1)),
  dependencies: z.array(z.string().min(1)),
  owningStories: z.array(z.string().min(1)),
});

export type ModuleDefinition = z.infer<typeof ModuleDefinitionSchema>;

export const StoryModuleMappingSchema = z.object({
  storyId: z.string().min(1),
  modules: z.array(z.string().min(1)),
  primaryModule: z.string().min(1),
  estimatedFiles: z.array(z.string().min(1)),
});

export type StoryModuleMapping = z.infer<typeof StoryModuleMappingSchema>;

export const ExecutionGroupSchema = z.object({
  groupId: z.number().int().positive(),
  storyIds: z.array(z.string().min(1)),
  rationale: z.string().min(1),
  dependsOn: z.array(z.number().int()),
});

export type ExecutionGroup = z.infer<typeof ExecutionGroupSchema>;

export const ArchitectureDecisionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  context: z.string().min(1),
  decision: z.string().min(1),
  consequences: z.string().min(1),
  status: z.enum(['accepted', 'proposed', 'superseded']),
});

export type ArchitectureDecision = z.infer<typeof ArchitectureDecisionSchema>;

export const ArchitectureConstraintSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['dependency', 'naming', 'pattern', 'boundary', 'technology']),
  description: z.string().min(1),
  rule: z.string().min(1),
  severity: z.enum(['error', 'warning']),
});

export type ArchitectureConstraint = z.infer<typeof ArchitectureConstraintSchema>;

export const PlanDigestSchema = z.object({
  digestId: z.string().min(1),
  sourcePlanId: z.string().min(1),
  level: z.enum(['global', 'sprint']),
  taskId: z.string().min(1),
  module: z.string().min(1),
  includedModules: z.array(z.string().min(1)),
  constraints: z.array(ArchitectureConstraintSchema),
  exposedInterfaces: z.array(
    z.object({
      module: z.string().min(1),
      names: z.array(z.string().min(1)),
    })
  ),
  maxChars: z.number().int().positive().default(24000),
  truncated: z.boolean(),
});

export type PlanDigest = z.infer<typeof PlanDigestSchema>;

export const PlanQualityScoreSchema = z.object({
  cohesion: z.number().min(0).max(100),
  dependencySanity: z.number().min(0).max(100),
  stackConsistency: z.number().min(0).max(100),
  overall: z.number().min(0).max(100),
  status: z.enum(['pass', 'review', 'fail']),
  findings: z.array(z.string()),
});

export type PlanQualityScore = z.infer<typeof PlanQualityScoreSchema>;

export const ArchitecturePlanSchema = z
  .object({
    planId: z.string().min(1),
    schemaVersion: z.number().int().positive(),
    projectId: z.string().min(1),
    level: z.enum(['global', 'sprint']),
    scopeKey: z.string().min(1),
    sprintId: z.string().min(1).optional(),
    parentPlanId: z.string().min(1).optional(),
    supersedesPlanId: z.string().min(1).optional(),
    supersededByPlanId: z.string().min(1).optional(),
    status: z.enum(['active', 'stale', 'archived']),
    createdAt: z.string().datetime(),
    revisionNumber: z.number().int().min(0).default(0),
    revisionTrigger: PlanRevisionTriggerSchema.optional(),

    techStack: TechStackDecisionSchema,
    modules: z.array(ModuleDefinitionSchema),
    storyModuleMapping: z.array(StoryModuleMappingSchema),
    executionOrder: z.array(ExecutionGroupSchema),
    decisions: z.array(ArchitectureDecisionSchema),
    constraints: z.array(ArchitectureConstraintSchema),
  })
  .superRefine((value, ctx) => {
    if (value.level === 'global') {
      if (value.scopeKey !== 'global') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scopeKey'],
          message: "scopeKey must be 'global' when level is 'global'",
        });
      }
      return;
    }

    if (!value.sprintId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sprintId'],
        message: "sprintId is required when level is 'sprint'",
      });
    }

    if (!value.scopeKey.startsWith('sprint:')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scopeKey'],
        message: "scopeKey must start with 'sprint:' when level is 'sprint'",
      });
    }
  });

export type ArchitecturePlan = z.infer<typeof ArchitecturePlanSchema>;

export { PlanRevisionTriggerSchema } from './plan-revision';
export type { PlanRevisionTrigger } from './plan-revision';

export const ArchitecturePlanRefSchema = z.object({
  planId: z.string().min(1),
  level: z.enum(['global', 'sprint']),
  scopeKey: z.string().min(1),
});

export type ArchitecturePlanRef = z.infer<typeof ArchitecturePlanRefSchema>;

export const SprintTaskPlanRefSchema = z.object({
  sprintId: z.string().min(1),
  planId: z.string().min(1),
});

export type SprintTaskPlanRef = z.infer<typeof SprintTaskPlanRefSchema>;

export const ImplementationTaskRefSchema = z.object({
  taskId: z.string().min(1),
  module: z.string().min(1),
  type: z.enum(['create', 'extend', 'integrate', 'test', 'configure']),
});

export type ImplementationTaskRef = z.infer<typeof ImplementationTaskRefSchema>;

// ─── Architecture Plan Manager ───────────────────────────────────────────────

const PLAN_DIR = 'artifacts';
const PLAN_PREFIX = 'architecture-plan-';
const PLAN_EXT = '.json';

export class ArchitecturePlanManager {
  constructor(private readonly workspaceManager: WorkspaceManager) {}

  save(ws: WorkspaceState, plan: ArchitecturePlan): void {
    const validated = ArchitecturePlanSchema.parse(plan);
    const relativePath = path.join(PLAN_DIR, `${PLAN_PREFIX}${validated.planId}${PLAN_EXT}`);
    this.workspaceManager.writeFile(ws, relativePath, JSON.stringify(validated, null, 2));
  }

  load(ws: WorkspaceState, planId: string): ArchitecturePlan | null {
    const relativePath = path.join(PLAN_DIR, `${PLAN_PREFIX}${planId}${PLAN_EXT}`);
    try {
      const raw = this.workspaceManager.readFile(ws, relativePath);
      return ArchitecturePlanSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  loadActive(ws: WorkspaceState, level: 'global' | 'sprint', scopeKey: string): ArchitecturePlan | null {
    const plans = this.list(ws)
      .filter((plan) => plan.level === level && plan.scopeKey === scopeKey && plan.status === 'active')
      .sort((a, b) => b.revisionNumber - a.revisionNumber || b.createdAt.localeCompare(a.createdAt));

    return plans[0] ?? null;
  }

  list(ws: WorkspaceState): ArchitecturePlan[] {
    const plansDir = path.join(ws.basePath, PLAN_DIR);
    if (!fs.existsSync(plansDir)) {
      return [];
    }

    const filenames = fs
      .readdirSync(plansDir)
      .filter((name) => name.startsWith(PLAN_PREFIX) && name.endsWith(PLAN_EXT));

    const plans: ArchitecturePlan[] = [];
    for (const name of filenames) {
      try {
        const raw = this.workspaceManager.readFile(ws, path.join(PLAN_DIR, name));
        plans.push(ArchitecturePlanSchema.parse(JSON.parse(raw)));
      } catch {
      }
    }
    return plans;
  }

  supersede(ws: WorkspaceState, oldPlanId: string, newPlan: ArchitecturePlan): void {
    const oldPlan = this.load(ws, oldPlanId);
    if (!oldPlan) {
      throw new Error(`Architecture plan not found: ${oldPlanId}`);
    }

    const updatedOldPlan: ArchitecturePlan = {
      ...oldPlan,
      status: 'stale',
      supersededByPlanId: newPlan.planId,
    };

    this.save(ws, updatedOldPlan);
    this.save(ws, newPlan);
  }
}
