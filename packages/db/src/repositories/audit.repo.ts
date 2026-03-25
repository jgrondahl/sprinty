import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { auditLog } from '../schema';

export class AuditRepository {
  constructor(private readonly db: DbClient) {}

  async append(input: typeof auditLog.$inferInsert) {
    const [row] = await this.db.insert(auditLog).values(input).returning();
    return row;
  }

  async listByEntity(orgId: string, entityType: string, entityId: string) {
    return this.db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.orgId, orgId), eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId))
      );
  }

  async listByOrg(orgId: string, offset = 0, limit = 50) {
    return this.db.select().from(auditLog).where(eq(auditLog.orgId, orgId)).offset(offset).limit(limit);
  }
}
