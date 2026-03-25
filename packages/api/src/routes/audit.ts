import { AuditRepository, type DbClient } from '@splinty/db';
import { z } from 'zod';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { json } from '../utils/response';

const AuditQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
});

export async function listAudit(req: Request, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.AUDIT_READ);
  const repo = new AuditRepository(db);

  const parsed = AuditQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()));
  const rows = parsed.entityType && parsed.entityId
    ? await repo.listByEntity(auth.orgId, parsed.entityType, parsed.entityId)
    : await repo.listByOrg(auth.orgId, parsed.offset, parsed.limit);

  return json({
    offset: parsed.offset,
    limit: parsed.limit,
    records: rows,
  });
}
