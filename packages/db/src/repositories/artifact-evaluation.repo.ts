import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { artifactEvaluations } from '../schema';

export class ArtifactEvaluationRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof artifactEvaluations.$inferInsert) {
    const [row] = await this.db.insert(artifactEvaluations).values(input).returning();
    return row;
  }

  async findById(id: string) {
    const row = await this.db.query.artifactEvaluations.findFirst({
      where: eq(artifactEvaluations.id, id),
    });
    return row ?? null;
  }

  async findByArtifact(artifactType: string, artifactId: string) {
    const rows = await this.db
      .select()
      .from(artifactEvaluations)
      .where(
        and(
          eq(artifactEvaluations.artifactType, artifactType as never),
          eq(artifactEvaluations.artifactId, artifactId)
        )
      );
    return rows;
  }

  async findByArtifactVersion(artifactType: string, artifactId: string, artifactVersion: number) {
    const rows = await this.db
      .select()
      .from(artifactEvaluations)
      .where(
        and(
          eq(artifactEvaluations.artifactType, artifactType as never),
          eq(artifactEvaluations.artifactId, artifactId),
          eq(artifactEvaluations.artifactVersion, artifactVersion)
        )
      );
    return rows;
  }

  async listByOrg(orgId: string) {
    const rows = await this.db
      .select()
      .from(artifactEvaluations)
      .where(eq(artifactEvaluations.orgId, orgId));
    return rows;
  }
}
