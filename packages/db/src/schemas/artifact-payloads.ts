import { z } from 'zod';

// Schema 1: IncrementPayloadSchema
export const IncrementPayloadSchema = z.object({
  sprintId: z.string(),
  completedStoryIds: z.array(z.string()),
  incompleteStoryIds: z.array(z.string()),
  demonstrableFeatures: z.array(z.string()),
  technicalDebt: z.array(z.string()),
  notes: z.string(),
});

export type IncrementPayload = z.infer<typeof IncrementPayloadSchema>;

// Schema 2: SprintReviewPayloadSchema
export const SprintReviewPayloadSchema = z.object({
  sprintId: z.string(),
  incrementId: z.string(),
  productGoalId: z.string(),
  goalAlignmentScore: z.number().min(0).max(100),
  stakeholderFeedback: z.array(
    z.object({
      reviewer: z.string(),
      feedback: z.string(),
      rating: z.number(),
    })
  ),
  actionItems: z.array(z.string()),
  demonstrationNotes: z.string(),
});

export type SprintReviewPayload = z.infer<typeof SprintReviewPayloadSchema>;

// Schema 3: RetrospectivePayloadSchema
export const RetrospectivePayloadSchema = z.object({
  sprintId: z.string(),
  whatWentWell: z.array(z.string()),
  whatDidntGoWell: z.array(z.string()),
  improvements: z.array(
    z.object({
      description: z.string(),
      priority: z.enum(['high', 'medium', 'low']),
      assignee: z.string().optional(),
      targetSprintId: z.string().optional(),
    })
  ),
  teamSentiment: z.number().min(1).max(5),
});

export type RetrospectivePayload = z.infer<typeof RetrospectivePayloadSchema>;

// Schema 4: SbomManifestPayloadSchema
export const SbomManifestPayloadSchema = z.object({
  format: z.string(),
  version: z.string(),
  components: z.array(
    z.object({
      name: z.string(),
      version: z.string(),
      type: z.string(),
      license: z.string().optional(),
    })
  ),
  generatedAt: z.string(),
  toolUsed: z.string(),
  hash: z.string(),
});

export type SbomManifestPayload = z.infer<typeof SbomManifestPayloadSchema>;

// Schema 5: ProvenanceAttestationPayloadSchema
export const ProvenanceAttestationPayloadSchema = z.object({
  format: z.string(),
  builderId: z.string(),
  buildStartedAt: z.string(),
  buildFinishedAt: z.string(),
  sourceDigest: z.string(),
  outputDigest: z.string(),
  reproducible: z.boolean(),
  signingMethod: z.string(),
  signature: z.string(),
});

export type ProvenanceAttestationPayload = z.infer<
  typeof ProvenanceAttestationPayloadSchema
>;

// Schema 6: PostDeliveryReviewPayloadSchema
export const PostDeliveryReviewPayloadSchema = z.object({
  deliveryRecordId: z.string(),
  reviewedAt: z.string(),
  reviewedBy: z.string(),
  healthChecks: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['pass', 'fail']),
      details: z.string().optional(),
    })
  ),
  performanceBaseline: z.array(
    z.object({
      metric: z.string(),
      expected: z.number(),
      actual: z.number(),
    })
  ),
  issues: z.array(z.string()),
  followUpStoryIds: z.array(z.string()),
});

export type PostDeliveryReviewPayload = z.infer<
  typeof PostDeliveryReviewPayloadSchema
>;

// Schema 7: ProductGoalPayloadSchema
export const ProductGoalPayloadSchema = z.object({
  title: z.string(),
  problemStatement: z.string(),
  targetUsers: z.string(),
  successMeasures: z.array(z.string()),
  businessConstraints: z.array(z.string()),
  nonGoals: z.array(z.string()),
});

export type ProductGoalPayload = z.infer<typeof ProductGoalPayloadSchema>;

// Schema 8: DeliveryRecordPayloadSchema
export const DeliveryRecordPayloadSchema = z.object({
  releaseCandidateId: z.string().optional(),
  incrementId: z.string().optional(),
  environment: z.string(),
  deployedVersion: z.string(),
  deploymentWindow: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .nullable(),
  deploymentResult: z.string(),
  rollbackReference: z.string().optional(),
  evidenceReferences: z.array(z.string()),
});

export type DeliveryRecordPayload = z.infer<typeof DeliveryRecordPayloadSchema>;
