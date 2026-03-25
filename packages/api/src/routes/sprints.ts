import {
  SprintRepository,
  StoryRepository,
  VelocityRepository,
  type DbClient,
} from '@splinty/db';
import { topologicalSortStories } from '@splinty/core';
import { z } from 'zod';
import { NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

const PlanSprintSchema = z.object({
  sprintName: z.string().min(1),
  sprintGoal: z.string().default(''),
  velocityOverride: z.number().int().positive().optional(),
});

const StartSprintSchema = z.object({
  sprintId: z.string().uuid(),
});

const CompleteSprintSchema = z.object({
  sprintId: z.string().uuid(),
});

function getStoryPoints(story: { storyPoints?: number }): number {
  return story.storyPoints ?? 1;
}

export async function planSprint(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.SPRINT_WRITE, Permission.STORY_READ);
  const body = PlanSprintSchema.parse(await req.json());

  const sprintRepo = new SprintRepository(db);
  const storyRepo = new StoryRepository(db);
  const velocityRepo = new VelocityRepository(db);

  const averageVelocity = await velocityRepo.getAverageVelocity(projectId, auth.orgId, 5);
  const targetVelocity = body.velocityOverride ?? Math.max(1, Math.round(averageVelocity || 8));

  const allStories = await storyRepo.listByProject(projectId, auth.orgId);
  const candidates = allStories.filter((story) => story.state === 'SPRINT_READY');
  const ordered = topologicalSortStories(candidates);

  const selected: typeof ordered = [];
  let consumedPoints = 0;
  for (const story of ordered) {
    const points = getStoryPoints(story);
    if (consumedPoints + points > targetVelocity) {
      continue;
    }
    selected.push(story);
    consumedPoints += points;
  }

  const sprint = await sprintRepo.create({
    orgId: auth.orgId,
    projectId,
    name: body.sprintName,
    goal: body.sprintGoal,
    status: 'planning',
  });

  for (const story of selected) {
    await storyRepo.update(story.id, auth.orgId, {
      sprintId: sprint.id,
    });
  }

  return json({
    sprint,
    selectedStoryIds: selected.map((story) => story.id),
    selectedStoryPoints: consumedPoints,
    targetVelocity,
  });
}

export async function startSprint(req: Request, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.SPRINT_EXECUTE);
  const { sprintId } = StartSprintSchema.parse(await req.json());

  const sprintRepo = new SprintRepository(db);
  const sprint = await sprintRepo.findById(sprintId, auth.orgId);
  if (!sprint) {
    throw new NotFoundError('Sprint not found');
  }

  const updated = await sprintRepo.update(sprintId, auth.orgId, {
    status: 'active',
    startedAt: new Date(),
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'sprint.started', {
    sprintId,
  });

  return json(updated);
}

export async function completeSprint(req: Request, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.SPRINT_EXECUTE, Permission.SPRINT_WRITE);
  const { sprintId } = CompleteSprintSchema.parse(await req.json());

  const sprintRepo = new SprintRepository(db);
  const storyRepo = new StoryRepository(db);
  const velocityRepo = new VelocityRepository(db);

  const sprint = await sprintRepo.findById(sprintId, auth.orgId);
  if (!sprint) {
    throw new NotFoundError('Sprint not found');
  }

  const sprintStories = await storyRepo.listBySprint(sprintId, auth.orgId);
  const completedStories = sprintStories.filter((story) => story.state === 'DONE' || story.state === 'MERGED');
  const completedPoints = completedStories.reduce((sum, story) => sum + getStoryPoints(story), 0);
  const plannedPoints = sprintStories.reduce((sum, story) => sum + getStoryPoints(story), 0);

  const completed = await sprintRepo.complete(sprintId, auth.orgId, completedPoints);

  await velocityRepo.snapshot({
    projectId: sprint.projectId,
    orgId: auth.orgId,
    sprintId,
    completedPoints,
    plannedPoints,
    completedStories: completedStories.length,
    plannedStories: sprintStories.length,
    sprintDurationMs: sprint.startedAt
      ? Math.max(0, Date.now() - sprint.startedAt.getTime())
      : 0,
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'sprint.completed', {
    sprintId,
    completedPoints,
    plannedPoints,
  });

  return json({
    sprint: completed,
    completedPoints,
    plannedPoints,
    completedStories: completedStories.length,
    plannedStories: sprintStories.length,
  });
}
