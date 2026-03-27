import { StorySchema, type Story, type StoryState } from '@splinty/core';
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { stories } from '../schema';

function toStoryRow(row: typeof stories.$inferSelect): Story {
  return StorySchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    acceptanceCriteria: row.acceptanceCriteria,
    state: row.state,
    source: row.source,
    sourceId: row.sourceId ?? undefined,
    storyPoints: row.storyPoints ?? undefined,
    domain: row.domain,
    tags: row.tags,
    dependsOn: row.dependsOn,
    epicId: row.epicId ?? undefined,
    workspacePath: row.workspacePath,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sortOrder: row.sortOrder ?? undefined,
    readiness: row.readiness ?? undefined,
  });
}

export class StoryRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof stories.$inferInsert) {
    const [row] = await this.db.insert(stories).values(input).returning();
    return toStoryRow(row);
  }

  async findById(id: string, orgId: string) {
    const row = await this.db.query.stories.findFirst({
      where: and(eq(stories.id, id), eq(stories.orgId, orgId)),
    });
    return row ? toStoryRow(row) : null;
  }

  async update(id: string, orgId: string, input: Partial<typeof stories.$inferInsert>) {
    const [row] = await this.db
      .update(stories)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(stories.id, id), eq(stories.orgId, orgId)))
      .returning();
    return row ? toStoryRow(row) : null;
  }

  async listByProject(projectId: string, orgId: string) {
    const rows = await this.db
      .select()
      .from(stories)
      .where(and(eq(stories.projectId, projectId), eq(stories.orgId, orgId)));
    return rows.map(toStoryRow);
  }

  async listByEpic(epicId: string, orgId: string) {
    const rows = await this.db
      .select()
      .from(stories)
      .where(and(eq(stories.epicId, epicId), eq(stories.orgId, orgId)));
    return rows.map(toStoryRow);
  }

  async listBySprint(sprintId: string, orgId: string) {
    const rows = await this.db
      .select()
      .from(stories)
      .where(and(eq(stories.sprintId, sprintId), eq(stories.orgId, orgId)));
    return rows.map(toStoryRow);
  }

  async updateState(id: string, orgId: string, state: StoryState) {
    const [row] = await this.db
      .update(stories)
      .set({ state, updatedAt: new Date() })
      .where(and(eq(stories.id, id), eq(stories.orgId, orgId)))
      .returning();
    return row ? toStoryRow(row) : null;
  }

  async findBySourceId(sourceId: string, orgId: string) {
    const row = await this.db.query.stories.findFirst({
      where: and(eq(stories.sourceId, sourceId), eq(stories.orgId, orgId)),
    });
    return row ? toStoryRow(row) : null;
  }

  async delete(id: string, orgId: string) {
    const [row] = await this.db
      .delete(stories)
      .where(and(eq(stories.id, id), eq(stories.orgId, orgId)))
      .returning();
    return row ? toStoryRow(row) : null;
  }
}
