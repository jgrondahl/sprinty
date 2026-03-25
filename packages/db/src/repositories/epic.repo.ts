import { and, asc, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { epics } from '../schema';

export class EpicRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: {
    projectId: string;
    orgId: string;
    title: string;
    description?: string;
    status?: 'draft' | 'active' | 'completed';
    sortOrder?: number;
  }) {
    const [row] = await this.db.insert(epics).values(input).returning();
    return row;
  }

  async findById(id: string, orgId: string) {
    return this.db.query.epics.findFirst({
      where: and(eq(epics.id, id), eq(epics.orgId, orgId)),
    });
  }

  async update(
    id: string,
    orgId: string,
    input: Partial<{ title: string; description: string; status: 'draft' | 'active' | 'completed' }>
  ) {
    const [row] = await this.db
      .update(epics)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(epics.id, id), eq(epics.orgId, orgId)))
      .returning();
    return row;
  }

  async listByProject(projectId: string, orgId: string) {
    return this.db
      .select()
      .from(epics)
      .where(and(eq(epics.projectId, projectId), eq(epics.orgId, orgId)))
      .orderBy(asc(epics.sortOrder));
  }

  async reorder(id: string, orgId: string, sortOrder: number) {
    const [row] = await this.db
      .update(epics)
      .set({ sortOrder, updatedAt: new Date() })
      .where(and(eq(epics.id, id), eq(epics.orgId, orgId)))
      .returning();
    return row;
  }

  async delete(id: string, orgId: string) {
    const [row] = await this.db
      .delete(epics)
      .where(and(eq(epics.id, id), eq(epics.orgId, orgId)))
      .returning();
    return row;
  }
}
