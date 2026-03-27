import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';
import { users } from './users';

export const deliveryRecords = pgTable('delivery_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  releaseCandidateId: text('release_candidate_id'),
  incrementId: text('increment_id'),
  environment: text('environment').notNull(),
  deployedVersion: text('deployed_version').notNull(),
  deploymentWindow: jsonb('deployment_window').$type<{ start: string; end: string } | null>(),
  approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
  deploymentResult: text('deployment_result').notNull().default('pending'),
  rollbackReference: text('rollback_reference'),
  evidenceReferences: jsonb('evidence_references').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
