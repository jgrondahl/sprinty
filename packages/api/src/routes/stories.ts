import {
  AuditRepository,
  StoryRepository,
  type DbClient,
} from '@splinty/db';
import { StorySchema, StoryState, StoryStateMachine, type StorySource, type Story } from '@splinty/core';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

const ListStoriesQuerySchema = z.object({
  epicId: z.string().optional(),
  state: z.nativeEnum(StoryState).optional(),
  sprintId: z.string().optional(),
});

const CreateStorySchema = StorySchema.omit({
  createdAt: true,
  updatedAt: true,
}).extend({
  source: z.custom<StorySource>((value) => typeof value === 'string'),
});

const UpdateStorySchema = StorySchema.partial();

const UpdateStoryStateSchema = z.object({
  state: z.nativeEnum(StoryState),
});

const stateMachine = new StoryStateMachine();

function toInsertPayload(story: Story, projectId: string, orgId: string) {
  return {
    ...story,
    createdAt: new Date(story.createdAt),
    updatedAt: new Date(story.updatedAt),
    orgId,
    projectId,
  };
}

export async function listStories(req: Request, projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.STORY_READ);
  const repo = new StoryRepository(db);
  const query = ListStoriesQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));

  let stories = await repo.listByProject(projectId, auth.orgId);
  if (query.epicId) {
    stories = stories.filter((story) => story.epicId === query.epicId);
  }
  if (query.state) {
    stories = stories.filter((story) => story.state === query.state);
  }
  if (query.sprintId) {
    const bySprint = await repo.listBySprint(query.sprintId, auth.orgId);
    const ids = new Set(bySprint.map((story) => story.id));
    stories = stories.filter((story) => ids.has(story.id));
  }

  return json({ stories });
}

export async function createStory(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.STORY_WRITE);
  const body = CreateStorySchema.parse(await req.json());
  const repo = new StoryRepository(db);
  const audit = new AuditRepository(db);

  const now = new Date().toISOString();
  const parsed = StorySchema.parse({
    ...body,
    createdAt: now,
    updatedAt: now,
  });

  const created = await repo.create(toInsertPayload(parsed, projectId, auth.orgId));

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'STORY_CREATE',
    entityType: 'story',
    entityId: created.id,
    diff: { after: created },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'story.created', {
    storyId: created.id,
    projectId,
  });

  return json(created, 201);
}

export async function getStory(storyId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.STORY_READ);
  const repo = new StoryRepository(db);
  const story = await repo.findById(storyId, auth.orgId);
  if (!story) {
    throw new NotFoundError('Story not found');
  }
  return json(story);
}

export async function updateStory(
  req: Request,
  storyId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.STORY_WRITE);
  const patch = UpdateStorySchema.parse(await req.json());
  const repo = new StoryRepository(db);
  const audit = new AuditRepository(db);

  const current = await repo.findById(storyId, auth.orgId);
  if (!current) {
    throw new NotFoundError('Story not found');
  }

  const updated = await repo.update(storyId, auth.orgId, {
    ...patch,
    createdAt: patch.createdAt ? new Date(patch.createdAt) : undefined,
    updatedAt: patch.updatedAt ? new Date(patch.updatedAt) : undefined,
  });

  if (!updated) {
    throw new NotFoundError('Story not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'STORY_UPDATE',
    entityType: 'story',
    entityId: updated.id,
    diff: { patch },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'story.updated', {
    storyId: updated.id,
    patch,
  });

  return json(updated);
}

export async function updateStoryState(
  req: Request,
  storyId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.STORY_WRITE);
  const { state } = UpdateStoryStateSchema.parse(await req.json());
  const repo = new StoryRepository(db);
  const audit = new AuditRepository(db);

  const current = await repo.findById(storyId, auth.orgId);
  if (!current) {
    throw new NotFoundError('Story not found');
  }

  if (!stateMachine.canTransition(current.state, state)) {
    throw new BadRequestError(`Invalid transition ${current.state} -> ${state}`, 'INVALID_STATE_TRANSITION');
  }

  const updated = await repo.updateState(storyId, auth.orgId, state);
  if (!updated) {
    throw new NotFoundError('Story not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'STORY_STATE_UPDATE',
    entityType: 'story',
    entityId: updated.id,
    diff: { from: current.state, to: state },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'story.state_changed', {
    storyId: updated.id,
    from: current.state,
    to: state,
  });

  return json(updated);
}

export async function deleteStory(storyId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.STORY_WRITE);
  const repo = new StoryRepository(db);
  const audit = new AuditRepository(db);

  const current = await repo.findById(storyId, auth.orgId);
  if (!current) {
    throw new NotFoundError('Story not found');
  }

  await repo.delete(storyId, auth.orgId);

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'STORY_DELETE',
    entityType: 'story',
    entityId: current.id,
    diff: { softDelete: true },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'story.deleted', {
    storyId: current.id,
  });

  return json({ deleted: true });
}
