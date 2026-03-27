import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { artifactLineage } from '../schema';

export class ArtifactLineageRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof artifactLineage.$inferInsert) {
    const [row] = await this.db.insert(artifactLineage).values(input).returning();
    return row;
  }

  async findById(id: string) {
    const row = await this.db.query.artifactLineage.findFirst({
      where: eq(artifactLineage.id, id),
    });
    return row ?? null;
  }

  async findByParent(parentType: string, parentId: string) {
    const rows = await this.db
      .select()
      .from(artifactLineage)
      .where(
        and(
          eq(artifactLineage.parentType, parentType as never),
          eq(artifactLineage.parentId, parentId),
        ),
      );
    return rows;
  }

  async findByChild(childType: string, childId: string) {
    const rows = await this.db
      .select()
      .from(artifactLineage)
      .where(
        and(
          eq(artifactLineage.childType, childType as never),
          eq(artifactLineage.childId, childId),
        ),
      );
    return rows;
  }

  async findByRelationshipType(type: string) {
    const rows = await this.db
      .select()
      .from(artifactLineage)
      .where(eq(artifactLineage.relationshipType, type as never));
    return rows;
  }

  async getLineageChain(artifactType: string, artifactId: string) {
    const asParent = await this.db
      .select()
      .from(artifactLineage)
      .where(
        and(
          eq(artifactLineage.parentType, artifactType as never),
          eq(artifactLineage.parentId, artifactId),
        ),
      );

    const asChild = await this.db
      .select()
      .from(artifactLineage)
      .where(
        and(
          eq(artifactLineage.childType, artifactType as never),
          eq(artifactLineage.childId, artifactId),
        ),
      );

    return [...asParent, ...asChild];
  }
}
