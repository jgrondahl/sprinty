import {
  WebhookRepository,
  type DbClient,
} from '@splinty/db';
import { z } from 'zod';
import { NotFoundError } from '../middleware/error-handler';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { json } from '../utils/response';

const CreateWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(8),
  events: z.array(z.string().min(1)).min(1),
  active: z.boolean().optional(),
});

const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().min(8).optional(),
  events: z.array(z.string().min(1)).min(1).optional(),
  active: z.boolean().optional(),
});

export async function listWebhooks(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.WEBHOOK_MANAGE);
  const repo = new WebhookRepository(db);
  const hooks = await repo.listByOrg(auth.orgId);
  return json({ webhooks: hooks });
}

export async function createWebhook(req: Request, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.WEBHOOK_MANAGE);
  const body = CreateWebhookSchema.parse(await req.json());
  const repo = new WebhookRepository(db);

  const created = await repo.create({
    orgId: auth.orgId,
    url: body.url,
    secret: body.secret,
    events: body.events,
    active: body.active ?? true,
  });

  return json(created, 201);
}

export async function updateWebhook(
  req: Request,
  webhookId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.WEBHOOK_MANAGE);
  const body = UpdateWebhookSchema.parse(await req.json());
  const repo = new WebhookRepository(db);

  const updated = await repo.update(webhookId, auth.orgId, body);
  if (!updated) {
    throw new NotFoundError('Webhook not found');
  }

  return json(updated);
}

export async function deleteWebhook(webhookId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.WEBHOOK_MANAGE);
  const repo = new WebhookRepository(db);
  const removed = await repo.delete(webhookId, auth.orgId);
  if (!removed) {
    throw new NotFoundError('Webhook not found');
  }

  return json({ deleted: true });
}
