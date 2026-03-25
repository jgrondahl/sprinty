import { integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { stories } from './stories';
import { sprints } from './sprints';

export const storyMetrics = pgTable('story_metrics', {
  id: uuid('id').defaultRandom().primaryKey(),
  storyId: text('story_id')
    .references(() => stories.id, { onDelete: 'cascade' })
    .notNull(),
  sprintId: uuid('sprint_id')
    .references(() => sprints.id, { onDelete: 'cascade' })
    .notNull(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  totalDurationMs: integer('total_duration_ms').notNull(),
  llmCalls: integer('llm_calls').notNull(),
  totalTokensInput: integer('total_tokens_input').notNull(),
  totalTokensOutput: integer('total_tokens_output').notNull(),
  sandboxRuns: integer('sandbox_runs').notNull(),
  reworkCycles: integer('rework_cycles').notNull(),
  revisionContributions: integer('revision_contributions').notNull(),
  costEstimateUsd: numeric('cost_estimate_usd', { precision: 12, scale: 4 }).notNull(),
  agentDurationsMs: jsonb('agent_durations_ms').$type<Record<string, number>>().notNull().default({}),
  traceId: text('trace_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
