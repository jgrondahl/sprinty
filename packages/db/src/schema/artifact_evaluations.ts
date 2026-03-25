import { numeric, jsonb, pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';
import { artifactTypeEnum } from './artifact_versions';

type DimensionScore = {
  dimension: string;
  score: number;
  reasoning: string;
};

export const artifactEvaluations = pgTable('artifact_evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  artifactType: artifactTypeEnum('artifact_type').notNull(),
  artifactId: text('artifact_id').notNull(),
  artifactVersion: integer('artifact_version').notNull(),
  evaluationModel: text('evaluation_model').notNull(),
  overallScore: numeric('overall_score', { precision: 5, scale: 2 }).notNull(),
  dimensionScores: jsonb('dimension_scores').$type<DimensionScore[]>().notNull().default([]),
  rawLlmResponse: jsonb('raw_llm_response').$type<Record<string, unknown>>().notNull(),
  evaluatedBy: text('evaluated_by').notNull(),
  evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).defaultNow().notNull(),
  orgId: uuid('org_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: uuid('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
});
