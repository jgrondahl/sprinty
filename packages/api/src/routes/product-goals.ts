import { AuditRepository, ProductGoalRepository, type DbClient } from '@splinty/db';
import { z } from 'zod';
import { NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

const CreateProductGoalSchema = z.object({
  title: z.string().min(1),
  problemStatement: z.string().default(''),
  targetUsers: z.string().default(''),
  successMeasures: z.array(z.string()).default([]),
  businessConstraints: z.array(z.string()).default([]),
  nonGoals: z.array(z.string()).default([]),
});

const UpdateProductGoalSchema = z.object({
  title: z.string().min(1).optional(),
  problemStatement: z.string().optional(),
  targetUsers: z.string().optional(),
  successMeasures: z.array(z.string()).optional(),
  businessConstraints: z.array(z.string()).optional(),
  nonGoals: z.array(z.string()).optional(),
  approvalStatus: z.string().optional(),
  version: z.number().int().positive().optional(),
});

export async function createProductGoal(req: Request, projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PRODUCT_GOAL_WRITE);
  const body = CreateProductGoalSchema.parse(await req.json());
  const repo = new ProductGoalRepository(db);
  const audit = new AuditRepository(db);

  const goal = await repo.create({
    ...body,
    projectId,
    orgId: auth.orgId,
  });

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'PRODUCT_GOAL_CREATE',
    entityType: 'product_goal',
    entityId: goal.id,
    diff: { after: goal },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'product_goal.created', {
    goalId: goal.id,
    projectId,
  });

  return json(goal, 201);
}

export async function listProductGoals(req: Request, projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PRODUCT_GOAL_READ);
  const repo = new ProductGoalRepository(db);

  const goals = await repo.findByProjectId(projectId, auth.orgId);

  return json({ goals }, 200);
}

export async function updateProductGoal(req: Request, goalId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PRODUCT_GOAL_WRITE);
  const patch = UpdateProductGoalSchema.parse(await req.json());
  const repo = new ProductGoalRepository(db);
  const audit = new AuditRepository(db);

  const updated = await repo.update(goalId, auth.orgId, patch);

  if (!updated) {
    throw new NotFoundError('Product goal not found');
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'PRODUCT_GOAL_UPDATE',
    entityType: 'product_goal',
    entityId: goalId,
    diff: { patch },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'product_goal.updated', {
    goalId,
    patch,
  });

  return json(updated, 200);
}
