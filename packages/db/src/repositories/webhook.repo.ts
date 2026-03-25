import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { webhooks } from '../schema';

export class WebhookRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: typeof webhooks.$inferInsert) {
    const [row] = await this.db.insert(webhooks).values(input).returning();
    return row;
  }

  async findById(id: string, orgId: string) {
    return this.db.query.webhooks.findFirst({
      where: and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)),
    });
  }

  async update(id: string, orgId: string, input: Partial<typeof webhooks.$inferInsert>) {
    const [row] = await this.db
      .update(webhooks)
      .set(input)
      .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
      .returning();
    return row;
  }

  async listByOrg(orgId: string) {
    return this.db.select().from(webhooks).where(eq(webhooks.orgId, orgId));
  }

  async listByEvent(orgId: string, event: string) {
    const rows = await this.db.select().from(webhooks).where(eq(webhooks.orgId, orgId));
    return rows.filter((row) => row.events.includes(event));
  }

  async delete(id: string, orgId: string) {
    const [row] = await this.db
      .delete(webhooks)
      .where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId)))
      .returning();
    return row;
  }
}
