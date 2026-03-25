import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';
import { sprints } from './sprints';

export const velocitySnapshots = pgTable('velocity_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  sprintId: uuid('sprint_id')
    .references(() => sprints.id, { onDelete: 'cascade' })
    .notNull(),
  completedPoints: integer('completed_points').notNull(),
  plannedPoints: integer('planned_points').notNull(),
  completedStories: integer('completed_stories').notNull(),
  plannedStories: integer('planned_stories').notNull(),
  sprintDurationMs: integer('sprint_duration_ms').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
