import { eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { organizations } from '../schema';

export class OrganizationRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: { name: string; slug: string }) {
    const [row] = await this.db.insert(organizations).values(input).returning();
    return row;
  }

  async findById(id: string) {
    return this.db.query.organizations.findFirst({ where: eq(organizations.id, id) });
  }

  async findBySlug(slug: string) {
    return this.db.query.organizations.findFirst({ where: eq(organizations.slug, slug) });
  }

  async update(id: string, input: Partial<{ name: string; slug: string }>) {
    const [row] = await this.db
      .update(organizations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return row;
  }

  async list() {
    return this.db.select().from(organizations);
  }
}
