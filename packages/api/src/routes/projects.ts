import {
  AuditRepository,
  ProjectRepository,
  type DbClient,
} from '@splinty/db';
import { z } from 'zod';
import { NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, Role, requirePermission, requireRole } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  specYaml: z.string().default(''),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  specYaml: z.string().optional(),
});

export async function listProjects(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_READ);
  const repo = new ProjectRepository(db);
  const data = await repo.listByOrg(auth.orgId);
  return json({ projects: data });
}

export async function createProject(req: Request, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_WRITE);
  const body = CreateProjectSchema.parse(await req.json());
  const repo = new ProjectRepository(db);
  const audit = new AuditRepository(db);

  const created = await repo.create({
    orgId: auth.orgId,
    name: body.name,
    description: body.description,
    specYaml: body.specYaml,
  });

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'PROJECT_CREATE',
    entityType: 'project',
    entityId: created.id,
    diff: { after: created },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'project.created', {
    projectId: created.id,
    name: created.name,
  });

  return json(created, 201);
}

export async function getProject(projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_READ);
  const repo = new ProjectRepository(db);
  const data = await repo.findById(projectId, auth.orgId);
  if (!data) {
    throw new NotFoundError('Project not found');
  }
  return json(data);
}

export async function updateProject(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_WRITE);
  const body = UpdateProjectSchema.parse(await req.json());
  const repo = new ProjectRepository(db);
  const audit = new AuditRepository(db);

  const updated = await repo.update(projectId, auth.orgId, body);
  if (!updated) {
    throw new NotFoundError('Project not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'PROJECT_UPDATE',
    entityType: 'project',
    entityId: updated.id,
    diff: { patch: body },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'project.updated', {
    projectId: updated.id,
    patch: body,
  });

  return json(updated);
}

export async function deleteProject(projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_WRITE);
  requireRole(auth, Role.ADMIN);
  const repo = new ProjectRepository(db);
  const audit = new AuditRepository(db);

  const deleted = await repo.delete(projectId, auth.orgId);
  if (!deleted) {
    throw new NotFoundError('Project not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'PROJECT_DELETE',
    entityType: 'project',
    entityId: deleted.id,
    diff: null,
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'project.deleted', {
    projectId: deleted.id,
  });

  return json({ deleted: true });
}
