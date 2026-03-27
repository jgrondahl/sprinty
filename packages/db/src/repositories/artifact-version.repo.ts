import { and, eq, desc } from 'drizzle-orm';
import type { DbClient } from '../db';
import { artifactVersions } from '../schema';

export class ArtifactVersionRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof artifactVersions.$inferInsert) {
    const [row] = await this.db.insert(artifactVersions).values(input).returning();
    return row;
  }

  async findById(id: string) {
    const row = await this.db.query.artifactVersions.findFirst({
      where: eq(artifactVersions.id, id),
    });
    return row ?? null;
  }

  async findByArtifactId(artifactId: string) {
    const rows = await this.db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId));
    return rows;
  }

  async findByType(artifactType: string) {
    const rows = await this.db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactType, artifactType as never));
    return rows;
  }

  async findLatestVersion(artifactId: string) {
    const rows = await this.db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, artifactId))
      .orderBy(desc(artifactVersions.version))
      .limit(1);
    return rows[0] ?? null;
  }

  async listAll() {
    const rows = await this.db.select().from(artifactVersions);
    return rows;
  }
}
