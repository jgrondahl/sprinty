import { and, eq, asc } from 'drizzle-orm';
import type { DbClient } from '../db';
import { stageTransitions } from '../schema';

export class StageTransitionRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof stageTransitions.$inferInsert) {
    const [row] = await this.db.insert(stageTransitions).values(input).returning();
    return row;
  }

  async findById(id: string) {
    const row = await this.db.query.stageTransitions.findFirst({
      where: eq(stageTransitions.id, id),
    });
    return row ?? null;
  }

  async findByArtifact(artifactType: string, artifactId: string) {
    const rows = await this.db
      .select()
      .from(stageTransitions)
      .where(
        and(
          eq(stageTransitions.artifactType, artifactType as never),
          eq(stageTransitions.artifactId, artifactId)
        )
      );
    return rows;
  }

  async findByFromStage(stage: string) {
    const rows = await this.db
      .select()
      .from(stageTransitions)
      .where(eq(stageTransitions.fromStage, stage as never));
    return rows;
  }

  async findByToStage(stage: string) {
    const rows = await this.db
      .select()
      .from(stageTransitions)
      .where(eq(stageTransitions.toStage, stage as never));
    return rows;
  }

  async getTransitionHistory(artifactType: string, artifactId: string) {
    const rows = await this.db
      .select()
      .from(stageTransitions)
      .where(
        and(
          eq(stageTransitions.artifactType, artifactType as never),
          eq(stageTransitions.artifactId, artifactId)
        )
      )
      .orderBy(asc(stageTransitions.transitionedAt));
    return rows;
  }
}
