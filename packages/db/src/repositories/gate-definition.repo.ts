import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { gateDefinitions } from '../schema';

export class GateDefinitionRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof gateDefinitions.$inferInsert) {
    const [row] = await this.db.insert(gateDefinitions).values(input).returning();
    return row;
  }

  async findById(id: string) {
    const row = await this.db.query.gateDefinitions.findFirst({
      where: eq(gateDefinitions.id, id),
    });
    return row ?? null;
  }

  async findByTransition(fromStage: string, toStage: string) {
    const rows = await this.db
      .select()
      .from(gateDefinitions)
      .where(
        and(
          eq(gateDefinitions.fromStage, fromStage as never),
          eq(gateDefinitions.toStage, toStage as never)
        )
      );
    return rows;
  }

  async findByFromStage(fromStage: string) {
    const rows = await this.db
      .select()
      .from(gateDefinitions)
      .where(eq(gateDefinitions.fromStage, fromStage as never));
    return rows;
  }

  async listAll(orgId?: string) {
    if (orgId) {
      const rows = await this.db
        .select()
        .from(gateDefinitions)
        .where(eq(gateDefinitions.orgId, orgId));
      return rows;
    }
    const rows = await this.db.select().from(gateDefinitions);
    return rows;
  }

  async listByProject(projectId: string) {
    const rows = await this.db
      .select()
      .from(gateDefinitions)
      .where(eq(gateDefinitions.projectId, projectId));
    return rows;
  }
}
