import { integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { sprints } from './sprints';

export const sprintTelemetry = pgTable('sprint_telemetry', {
  id: uuid('id').defaultRandom().primaryKey(),
  sprintId: uuid('sprint_id')
    .references(() => sprints.id, { onDelete: 'cascade' })
    .notNull(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  runId: text('run_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  stories: jsonb('stories').$type<unknown[]>().notNull().default([]),
  totalDurationMs: integer('total_duration_ms').notNull(),
  totalLlmCalls: integer('total_llm_calls').notNull(),
  totalCostEstimateUsd: numeric('total_cost_estimate_usd', {
    precision: 12,
    scale: 4,
  }).notNull(),
  execution: jsonb('execution').$type<Record<string, unknown> | null>(),
  sandbox: jsonb('sandbox').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
