import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { deliveryRecords } from '../schema';

export class DeliveryRecordRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof deliveryRecords.$inferInsert) {
    const [row] = await this.db.insert(deliveryRecords).values(input).returning();
    return row;
  }

  async findById(id: string, orgId: string) {
    const row = await this.db.query.deliveryRecords.findFirst({
      where: and(eq(deliveryRecords.id, id), eq(deliveryRecords.orgId, orgId)),
    });
    return row ?? null;
  }

  async findByProjectId(projectId: string, orgId: string) {
    return this.db
      .select()
      .from(deliveryRecords)
      .where(and(eq(deliveryRecords.projectId, projectId), eq(deliveryRecords.orgId, orgId)));
  }

  async findByEnvironment(projectId: string, environment: string, orgId: string) {
    return this.db
      .select()
      .from(deliveryRecords)
      .where(
        and(
          eq(deliveryRecords.projectId, projectId),
          eq(deliveryRecords.environment, environment),
          eq(deliveryRecords.orgId, orgId)
        )
      );
  }

  async updateResult(id: string, orgId: string, result: string, rollbackRef?: string) {
    const [row] = await this.db
      .update(deliveryRecords)
      .set({
        deploymentResult: result,
        ...(rollbackRef ? { rollbackReference: rollbackRef } : {}),
      })
      .where(and(eq(deliveryRecords.id, id), eq(deliveryRecords.orgId, orgId)))
      .returning();
    return row;
  }
}
