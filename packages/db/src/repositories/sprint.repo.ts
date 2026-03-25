import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { sprints } from '../schema';

export class SprintRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof sprints.$inferInsert) {
    const [row] = await this.db.insert(sprints).values(input).returning();
    return row;
  }

  async findById(id: string, orgId: string) {
    return this.db.query.sprints.findFirst({
      where: and(eq(sprints.id, id), eq(sprints.orgId, orgId)),
    });
  }

  async update(id: string, orgId: string, input: Partial<typeof sprints.$inferInsert>) {
    const [row] = await this.db
      .update(sprints)
      .set(input)
      .where(and(eq(sprints.id, id), eq(sprints.orgId, orgId)))
      .returning();
    return row;
  }

  async listByProject(projectId: string, orgId: string) {
    return this.db
      .select()
      .from(sprints)
      .where(and(eq(sprints.projectId, projectId), eq(sprints.orgId, orgId)));
  }

  async getActive(projectId: string, orgId: string) {
    return this.db.query.sprints.findFirst({
      where: and(
        eq(sprints.projectId, projectId),
        eq(sprints.orgId, orgId),
        eq(sprints.status, 'active')
      ),
    });
  }

  async complete(id: string, orgId: string, velocity: number) {
    const [row] = await this.db
      .update(sprints)
      .set({ status: 'completed', completedAt: new Date(), velocity })
      .where(and(eq(sprints.id, id), eq(sprints.orgId, orgId)))
      .returning();
    return row;
  }
}
