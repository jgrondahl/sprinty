import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { productGoals } from '../schema';

export class ProductGoalRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof productGoals.$inferInsert) {
    const [row] = await this.db.insert(productGoals).values(input).returning();
    return row;
  }

  async findById(id: string, orgId: string) {
    const row = await this.db.query.productGoals.findFirst({
      where: and(eq(productGoals.id, id), eq(productGoals.orgId, orgId)),
    });
    return row ?? null;
  }

  async findByProjectId(projectId: string, orgId: string) {
    return this.db
      .select()
      .from(productGoals)
      .where(and(eq(productGoals.projectId, projectId), eq(productGoals.orgId, orgId)));
  }

  async update(id: string, orgId: string, input: Partial<typeof productGoals.$inferInsert>) {
    const [row] = await this.db
      .update(productGoals)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(productGoals.id, id), eq(productGoals.orgId, orgId)))
      .returning();
    return row ?? null;
  }

  async findByApprovalStatus(status: string, orgId: string) {
    return this.db
      .select()
      .from(productGoals)
      .where(and(eq(productGoals.approvalStatus, status), eq(productGoals.orgId, orgId)));
  }
}
