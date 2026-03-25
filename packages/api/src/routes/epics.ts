import {
  AuditRepository,
  EpicRepository,
  StoryRepository,
  type DbClient,
} from '@splinty/db';
import { z } from 'zod';
import { NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';

const CreateEpicSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  status: z.enum(['draft', 'active', 'completed']).optional(),
});

const UpdateEpicSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'completed']).optional(),
});

const ReorderEpicSchema = z.object({
  sortOrder: z.number().int().min(0),
});

export async function listEpics(projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.EPIC_READ);
  const repo = new EpicRepository(db);
  const epics = await repo.listByProject(projectId, auth.orgId);
  return json({ epics });
}

export async function createEpic(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.EPIC_WRITE);
  const body = CreateEpicSchema.parse(await req.json());
  const repo = new EpicRepository(db);
  const audit = new AuditRepository(db);

  const created = await repo.create({
    orgId: auth.orgId,
    projectId,
    title: body.title,
    description: body.description,
    status: body.status,
  });

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'EPIC_CREATE',
    entityType: 'epic',
    entityId: created.id,
    diff: { after: created },
  });

  return json(created, 201);
}

export async function getEpic(epicId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.EPIC_READ);
  const epicRepo = new EpicRepository(db);
  const storyRepo = new StoryRepository(db);

  const epic = await epicRepo.findById(epicId, auth.orgId);
  if (!epic) {
    throw new NotFoundError('Epic not found');
  }

  const stories = await storyRepo.listByEpic(epicId, auth.orgId);
  return json({ ...epic, stories });
}

export async function updateEpic(
  req: Request,
  epicId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.EPIC_WRITE);
  const body = UpdateEpicSchema.parse(await req.json());
  const repo = new EpicRepository(db);
  const audit = new AuditRepository(db);

  const updated = await repo.update(epicId, auth.orgId, body);
  if (!updated) {
    throw new NotFoundError('Epic not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'EPIC_UPDATE',
    entityType: 'epic',
    entityId: updated.id,
    diff: { patch: body },
  });

  return json(updated);
}

export async function reorderEpic(
  req: Request,
  epicId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.EPIC_WRITE);
  const body = ReorderEpicSchema.parse(await req.json());
  const repo = new EpicRepository(db);
  const audit = new AuditRepository(db);

  const updated = await repo.reorder(epicId, auth.orgId, body.sortOrder);
  if (!updated) {
    throw new NotFoundError('Epic not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'EPIC_REORDER',
    entityType: 'epic',
    entityId: updated.id,
    diff: { sortOrder: body.sortOrder },
  });

  return json(updated);
}

export async function deleteEpic(epicId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.EPIC_WRITE);
  const epicRepo = new EpicRepository(db);
  const storyRepo = new StoryRepository(db);
  const audit = new AuditRepository(db);

  const existing = await epicRepo.findById(epicId, auth.orgId);
  if (!existing) {
    throw new NotFoundError('Epic not found');
  }

  const linkedStories = await storyRepo.listByEpic(epicId, auth.orgId);
  for (const story of linkedStories) {
    await storyRepo.update(story.id, auth.orgId, { epicId: null });
  }

  await epicRepo.delete(epicId, auth.orgId);

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'EPIC_DELETE',
    entityType: 'epic',
    entityId: epicId,
    diff: null,
  });

  return json({ deleted: true });
}
