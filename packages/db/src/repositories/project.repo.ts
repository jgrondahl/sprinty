import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { projects } from '../schema';

export class ProjectRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: {
    orgId: string;
    name: string;
    description?: string;
    specYaml?: string;
  }) {
    const [row] = await this.db.insert(projects).values(input).returning();
    return row;
  }

  async findById(id: string, orgId: string) {
    return this.db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.orgId, orgId)),
    });
  }

  async update(
    id: string,
    orgId: string,
    input: Partial<{ name: string; description: string; specYaml: string }>
  ) {
    const [row] = await this.db
      .update(projects)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.orgId, orgId)))
      .returning();
    return row;
  }

  async listByOrg(orgId: string) {
    return this.db.select().from(projects).where(eq(projects.orgId, orgId));
  }

  async delete(id: string, orgId: string) {
    const [row] = await this.db
      .delete(projects)
      .where(and(eq(projects.id, id), eq(projects.orgId, orgId)))
      .returning();
    return row;
  }
}
