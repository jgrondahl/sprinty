import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { storyMetrics } from '../schema';

export class StoryMetricsRepository {
  constructor(private readonly db: DbClient) {}

  async save(input: typeof storyMetrics.$inferInsert) {
    const [row] = await this.db.insert(storyMetrics).values(input).returning();
    return row;
  }

  async findBySprint(sprintId: string, orgId: string) {
    return this.db
      .select()
      .from(storyMetrics)
      .where(and(eq(storyMetrics.sprintId, sprintId), eq(storyMetrics.orgId, orgId)));
  }

  async findByStory(storyId: string, orgId: string) {
    return this.db
      .select()
      .from(storyMetrics)
      .where(and(eq(storyMetrics.storyId, storyId), eq(storyMetrics.orgId, orgId)));
  }
}
