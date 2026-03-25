import { integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';

export const sprintStatusEnum = pgEnum('sprint_status', [
  'planning',
  'active',
  'completed',
  'cancelled',
]);

export const sprints = pgTable('sprints', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  goal: text('goal').notNull().default(''),
  status: sprintStatusEnum('status').notNull().default('planning'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  velocity: integer('velocity'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
