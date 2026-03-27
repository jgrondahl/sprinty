import { StorySource, StoryState } from '@splinty/core';
import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';
import { epics } from './epics';
import { users } from './users';
import { sprints } from './sprints';

export const storyStateEnum = pgEnum('story_state', Object.values(StoryState) as [string, ...string[]]);
export const storySourceEnum = pgEnum('story_source', Object.values(StorySource) as [string, ...string[]]);

export const stories = pgTable('stories', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  acceptanceCriteria: jsonb('acceptance_criteria').$type<string[]>().notNull().default([]),
  state: storyStateEnum('state').notNull(),
  source: storySourceEnum('source').notNull(),
  sourceId: text('source_id'),
  storyPoints: integer('story_points'),
  domain: text('domain').notNull().default('general'),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  dependsOn: jsonb('depends_on').$type<string[]>().notNull().default([]),
  workspacePath: text('workspace_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),

  epicId: uuid('epic_id').references(() => epics.id, { onDelete: 'set null' }),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  sprintId: uuid('sprint_id').references(() => sprints.id, { onDelete: 'set null' }),

  sortOrder: integer('sort_order').notNull().default(0),
  readiness: text('readiness').notNull().default('not_ready'),
});
