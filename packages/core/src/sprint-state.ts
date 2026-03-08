import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { ArchitecturePlanSchema } from './architecture-plan';
import { PlanRevisionTriggerSchema, type PlanRevisionTrigger } from './plan-revision';
import { SprintTaskPlanSchema, TaskScheduleSchema } from './task-decomposition';
import type { WorkspaceState } from './types';
import { WorkspaceManager } from './workspace';

// ─── Sprint State Schemas ─────────────────────────────────────────────────────

export const SprintCheckpointSchema = z.object({
  checkpointId: z.string().min(1),
  sprintId: z.string().min(1),
  runId: z.string().min(1),
  activeSprintPlanId: z.string().min(1),
  activeGlobalPlanId: z.string().min(1),
  revisionCount: z.number().int().min(0),
  completedTaskIds: z.array(z.string().min(1)),
  blockedTaskIds: z.array(z.string().min(1)),
  remainingTaskSchedule: TaskScheduleSchema,
  lastCompletedGroupId: z.number().int().positive().optional(),
  createdAt: z.string().datetime(),
});

export const PlannedSprintStateSchema = z.object({
  currentSprintPlan: ArchitecturePlanSchema,
  currentGlobalPlanId: z.string().min(1),
  taskPlan: SprintTaskPlanSchema,
  revisionCount: z.number().int().min(0),
  maxRevisions: z.number().int().positive().default(1),
  storyRevisionCounts: z.record(z.string(), z.number().int().min(0)).default({}),
  maxRevisionsPerStory: z.number().int().positive().default(1),
  checkpoint: SprintCheckpointSchema.optional(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type SprintCheckpoint = z.infer<typeof SprintCheckpointSchema>;
export type PlannedSprintState = z.infer<typeof PlannedSprintStateSchema>;

// ─── Human Gate ───────────────────────────────────────────────────────────────

export interface HumanGate {
  requestApproval(trigger: PlanRevisionTrigger): Promise<boolean>;
}

export class DefaultHumanGate implements HumanGate {
  async requestApproval(_trigger: PlanRevisionTrigger): Promise<boolean> {
    throw new Error(
      'Human approval required — no interactive gate configured. Set a HumanGate implementation on OrchestratorConfig.'
    );
  }
}

// ─── Sprint Checkpoint Manager ────────────────────────────────────────────────

const SPRINT_CHECKPOINT_FILE = 'sprint-checkpoint.json';

export class SprintCheckpointManager {
  constructor(private readonly workspaceManager: WorkspaceManager) {}

  save(ws: WorkspaceState, checkpoint: SprintCheckpoint): void {
    const validated = SprintCheckpointSchema.parse(checkpoint);
    this.workspaceManager.writeFile(ws, SPRINT_CHECKPOINT_FILE, JSON.stringify(validated, null, 2));
  }

  load(ws: WorkspaceState): SprintCheckpoint | null {
    try {
      const raw = this.workspaceManager.readFile(ws, SPRINT_CHECKPOINT_FILE);
      return SprintCheckpointSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  clear(ws: WorkspaceState): void {
    const fullPath = path.join(ws.basePath, SPRINT_CHECKPOINT_FILE);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    delete ws.files[SPRINT_CHECKPOINT_FILE];
  }

  exists(ws: WorkspaceState): boolean {
    return fs.existsSync(path.join(ws.basePath, SPRINT_CHECKPOINT_FILE));
  }
}

export { PlanRevisionTriggerSchema };
