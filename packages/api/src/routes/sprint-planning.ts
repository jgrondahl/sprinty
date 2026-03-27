import { AuditRepository, SprintRepository, StoryRepository, type DbClient } from '@splinty/db';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

const AssignStoriesSchema = z.object({
  storyIds: z.array(z.string()).min(1),
  sprintGoal: z.string().optional(),
});

export async function assignStories(
  req: Request,
  projectId: string,
  sprintId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.SPRINT_WRITE);

  const body = AssignStoriesSchema.parse(await req.json());

  const sprintRepo = new SprintRepository(db);
  const storyRepo = new StoryRepository(db);
  const audit = new AuditRepository(db);

  const sprint = await sprintRepo.findById(sprintId, auth.orgId);
  if (!sprint) {
    throw new NotFoundError('Sprint not found');
  }

  if (sprint.status !== 'planning') {
    throw new BadRequestError('Sprint must be in planning status to assign stories');
  }

  for (const storyId of body.storyIds) {
    const story = await storyRepo.findById(storyId, auth.orgId);
    if (!story) {
      throw new BadRequestError(`Story ${storyId} not found`);
    }

    if (story.readiness !== undefined && story.readiness !== 'ready') {
      throw new BadRequestError(`Story ${storyId} is not ready for sprint assignment`);
    }

    await storyRepo.update(storyId, auth.orgId, { sprintId });
  }

  if (body.sprintGoal) {
    await sprintRepo.update(sprintId, auth.orgId, { goal: body.sprintGoal });
  }

  const updatedSprint = await sprintRepo.findById(sprintId, auth.orgId);

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'SPRINT_STORIES_ASSIGNED',
    entityType: 'sprint',
    entityId: sprintId,
    diff: { storyIds: body.storyIds, sprintGoal: body.sprintGoal },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'sprint.stories_assigned', {
    sprintId,
    projectId,
    storyIds: body.storyIds,
  });

  return json({ sprint: updatedSprint, assignedStories: body.storyIds }, 200);
}
