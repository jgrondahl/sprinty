import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { artifactTypeEnum } from './artifact_versions';

export const relationshipTypeEnum = pgEnum('relationship_type', [
  'derived_from',
  'decomposed_from',
  'verified_by',
  'supersedes',
  'implements',
]);

export const artifactLineage = pgTable('artifact_lineage', {
  id: uuid('id').defaultRandom().primaryKey(),
  parentType: artifactTypeEnum('parent_type').notNull(),
  parentId: text('parent_id').notNull(),
  childType: artifactTypeEnum('child_type').notNull(),
  childId: text('child_id').notNull(),
  relationshipType: relationshipTypeEnum('relationship_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
});
