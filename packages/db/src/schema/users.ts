import { pgEnum, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const userRoleEnum = pgEnum('user_role', ['admin', 'member', 'viewer', 'service-account']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    role: userRoleEnum('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    usersOrgEmailUnique: uniqueIndex('users_org_email_unique').on(table.orgId, table.email),
  })
);
