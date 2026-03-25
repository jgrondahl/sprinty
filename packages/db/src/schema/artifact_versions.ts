import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const artifactTypeEnum = pgEnum('artifact_type', [
  'story',
  'epic',
  'project',
  'architecture_plan',
  'requirement_set',
  'evidence_bundle',
  'verification_result',
  'release_candidate',
]);

export const artifactVersions = pgTable('artifact_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  artifactType: artifactTypeEnum('artifact_type').notNull(),
  artifactId: text('artifact_id').notNull(),
  version: integer('version').notNull(),
  snapshotData: jsonb('snapshot_data').$type<Record<string, unknown>>().notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
});
