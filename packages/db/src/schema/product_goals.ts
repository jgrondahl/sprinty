import { integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';
import { users } from './users';

export const productGoals = pgTable('product_goals', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  problemStatement: text('problem_statement').notNull().default(''),
  targetUsers: text('target_users').notNull().default(''),
  successMeasures: jsonb('success_measures').$type<string[]>().notNull().default([]),
  businessConstraints: jsonb('business_constraints').$type<string[]>().notNull().default([]),
  nonGoals: jsonb('non_goals').$type<string[]>().notNull().default([]),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  approvalStatus: text('approval_status').notNull().default('draft'),
  sourceArtifacts: jsonb('source_artifacts').$type<string[]>().notNull().default([]),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
