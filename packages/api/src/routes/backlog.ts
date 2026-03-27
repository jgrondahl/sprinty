import { AuditRepository, StoryRepository, type DbClient } from '@splinty/db';
import { z } from 'zod';
import { BadRequestError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';

const BacklogQuerySchema = z.object({
  readiness: z.enum(['not_ready', 'refinement_needed', 'ready']).optional(),
  limit: z.coerce.number().int().positive().default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const RefineStorySchema = z.object({
  storyId: z.string(),
  sortOrder: z.number().int().min(0).optional(),
  readiness: z.enum(['not_ready', 'refinement_needed', 'ready']).optional(),
});

export async function getBacklog(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.STORY_READ);
  const query = BacklogQuerySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );
  const repo = new StoryRepository(db);

  let stories = await repo.listByProject(projectId, auth.orgId);
  
  stories = stories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  if (query.readiness) {
    stories = stories.filter((story) => story.readiness === query.readiness);
  }

  const total = stories.length;

  stories = stories.slice(query.offset, query.offset + query.limit);

  return json({ stories, total }, 200);
}

export async function refineStory(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.STORY_WRITE);
  const body = RefineStorySchema.parse(await req.json());
  const repo = new StoryRepository(db);
  const audit = new AuditRepository(db);

  const updatePayload: Record<string, unknown> = {};
  if (body.sortOrder !== undefined) {
    updatePayload.sortOrder = body.sortOrder;
  }
  if (body.readiness !== undefined) {
    updatePayload.readiness = body.readiness;
  }

  const updated = await repo.update(body.storyId, auth.orgId, updatePayload);
  
  if (!updated) {
    throw new BadRequestError('Story not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'BACKLOG_REFINE',
    entityType: 'story',
    entityId: body.storyId,
    diff: { patch: updatePayload },
  });

  return json(updated, 200);
}
