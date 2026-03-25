import { and, desc, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { velocitySnapshots } from '../schema';

export class VelocityRepository {
  constructor(private readonly db: DbClient) {}

  async snapshot(input: typeof velocitySnapshots.$inferInsert) {
    const [row] = await this.db.insert(velocitySnapshots).values(input).returning();
    return row;
  }

  async getByProject(projectId: string, orgId: string, limit = 20) {
    return this.db
      .select()
      .from(velocitySnapshots)
      .where(and(eq(velocitySnapshots.projectId, projectId), eq(velocitySnapshots.orgId, orgId)))
      .orderBy(desc(velocitySnapshots.createdAt))
      .limit(limit);
  }

  async getAverageVelocity(projectId: string, orgId: string, lastN = 5): Promise<number> {
    const recent = await this.getByProject(projectId, orgId, lastN);
    if (recent.length === 0) {
      return 0;
    }

    const total = recent.reduce((sum, row) => sum + row.completedPoints, 0);
    return total / recent.length;
  }
}
