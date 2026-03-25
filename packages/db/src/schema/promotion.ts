import { jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';
import { projects } from './projects';
import { users } from './users';
import { artifactEvaluations } from './artifact_evaluations';
import { artifactTypeEnum } from './artifact_versions';

type RequiredEvidence = {
  type: string;
  description: string;
};

type RequiredApproval = {
  role: string;
  count: number;
};

type ApprovalDecision = {
  userId: string;
  role: string;
  decision: 'approved' | 'rejected';
  justification: string;
  timestamp: string;
};

export const promotionStageEnum = pgEnum('promotion_stage', [
  'draft',
  'planned',
  'requirements_ready',
  'architecture_ready',
  'build_ready',
  'in_execution',
  'built',
  'verified',
  'release_candidate',
  'approved_for_delivery',
  'delivered',
  'post_delivery_review',
]);

export const gateDefinitions = pgTable('gate_definitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromStage: promotionStageEnum('from_stage').notNull(),
  toStage: promotionStageEnum('to_stage').notNull(),
  requiredEvidence: jsonb('required_evidence').$type<RequiredEvidence[]>().notNull().default([]),
  requiredApprovals: jsonb('required_approvals').$type<RequiredApproval[]>().notNull().default([]),
  autoPassThreshold: numeric('auto_pass_threshold', { precision: 5, scale: 2 }),
  disqualifyingConditions: jsonb('disqualifying_conditions').$type<Record<string, unknown>>().notNull().default({}),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const stageTransitions = pgTable('stage_transitions', {
  id: uuid('id').defaultRandom().primaryKey(),
  artifactType: artifactTypeEnum('artifact_type').notNull(),
  artifactId: text('artifact_id').notNull(),
  fromStage: promotionStageEnum('from_stage').notNull(),
  toStage: promotionStageEnum('to_stage').notNull(),
  triggeredBy: uuid('triggered_by')
    .references(() => users.id, { onDelete: 'set null' })
    .notNull(),
  approvals: jsonb('approvals').$type<ApprovalDecision[]>().notNull().default([]),
  evaluationId: uuid('evaluation_id').references(() => artifactEvaluations.id, { onDelete: 'set null' }),
  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull().default([]),
  transitionedAt: timestamp('transitioned_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
});
