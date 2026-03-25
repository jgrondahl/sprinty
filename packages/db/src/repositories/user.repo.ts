import { and, eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { users } from '../schema';

export class UserRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: {
    orgId: string;
    email: string;
    passwordHash: string;
    name: string;
    role?: 'admin' | 'member' | 'viewer' | 'service-account';
  }) {
    const [row] = await this.db.insert(users).values(input).returning();
    return row;
  }

  async findById(id: string, orgId: string) {
    return this.db.query.users.findFirst({
      where: and(eq(users.id, id), eq(users.orgId, orgId)),
    });
  }

  async findByEmail(email: string, orgId: string) {
    return this.db.query.users.findFirst({
      where: and(eq(users.email, email), eq(users.orgId, orgId)),
    });
  }

  async findByEmailAny(email: string) {
    return this.db.select().from(users).where(eq(users.email, email));
  }

  async update(
    id: string,
    orgId: string,
    input: Partial<{ name: string; role: 'admin' | 'member' | 'viewer' | 'service-account' }>
  ) {
    const [row] = await this.db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.orgId, orgId)))
      .returning();
    return row;
  }

  async listByOrg(orgId: string) {
    return this.db.select().from(users).where(eq(users.orgId, orgId));
  }
}
