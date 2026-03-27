import { describe, it, expect } from 'bun:test';
import {
  IncrementPayloadSchema,
  SprintReviewPayloadSchema,
  RetrospectivePayloadSchema,
  SbomManifestPayloadSchema,
  ProvenanceAttestationPayloadSchema,
  PostDeliveryReviewPayloadSchema,
  ProductGoalPayloadSchema,
  DeliveryRecordPayloadSchema,
} from './artifact-payloads';

describe('IncrementPayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      sprintId: 'sprint-123',
      completedStoryIds: ['story-1', 'story-2'],
      incompleteStoryIds: ['story-3'],
      demonstrableFeatures: ['Feature A', 'Feature B'],
      technicalDebt: ['Debt item 1'],
      notes: 'Sprint went well overall',
    };
    expect(() => IncrementPayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      sprintId: 'sprint-123',
      completedStoryIds: ['story-1'],
    };
    expect(() => IncrementPayloadSchema.parse(invalid)).toThrow();
  });
});

describe('SprintReviewPayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      sprintId: 'sprint-123',
      incrementId: 'increment-456',
      productGoalId: 'goal-789',
      goalAlignmentScore: 85,
      stakeholderFeedback: [
        {
          reviewer: 'John Doe',
          feedback: 'Great work',
          rating: 4.5,
        },
      ],
      actionItems: ['Follow up on feature X'],
      demonstrationNotes: 'Demo successful',
    };
    expect(() => SprintReviewPayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      sprintId: 'sprint-123',
      goalAlignmentScore: 85,
    };
    expect(() => SprintReviewPayloadSchema.parse(invalid)).toThrow();
  });

  it('rejects goalAlignmentScore > 100', () => {
    const invalid = {
      sprintId: 'sprint-123',
      incrementId: 'increment-456',
      productGoalId: 'goal-789',
      goalAlignmentScore: 101,
      stakeholderFeedback: [],
      actionItems: [],
      demonstrationNotes: 'Notes',
    };
    expect(() => SprintReviewPayloadSchema.parse(invalid)).toThrow();
  });
});

describe('RetrospectivePayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      sprintId: 'sprint-123',
      whatWentWell: ['Good communication', 'Met deadlines'],
      whatDidntGoWell: ['Some tech debt'],
      improvements: [
        {
          description: 'Improve code review process',
          priority: 'high' as const,
          assignee: 'dev-1',
          targetSprintId: 'sprint-124',
        },
      ],
      teamSentiment: 4,
    };
    expect(() => RetrospectivePayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      sprintId: 'sprint-123',
      whatWentWell: [],
    };
    expect(() => RetrospectivePayloadSchema.parse(invalid)).toThrow();
  });

  it('rejects teamSentiment > 5', () => {
    const invalid = {
      sprintId: 'sprint-123',
      whatWentWell: ['Item 1'],
      whatDidntGoWell: ['Item 2'],
      improvements: [],
      teamSentiment: 6,
    };
    expect(() => RetrospectivePayloadSchema.parse(invalid)).toThrow();
  });

  it('rejects teamSentiment < 1', () => {
    const invalid = {
      sprintId: 'sprint-123',
      whatWentWell: ['Item 1'],
      whatDidntGoWell: ['Item 2'],
      improvements: [],
      teamSentiment: 0,
    };
    expect(() => RetrospectivePayloadSchema.parse(invalid)).toThrow();
  });
});

describe('SbomManifestPayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      format: 'CycloneDX',
      version: '1.4',
      components: [
        {
          name: 'react',
          version: '18.2.0',
          type: 'library',
          license: 'MIT',
        },
      ],
      generatedAt: '2024-03-27T12:00:00Z',
      toolUsed: 'syft',
      hash: 'sha256:abc123',
    };
    expect(() => SbomManifestPayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      format: 'CycloneDX',
      version: '1.4',
    };
    expect(() => SbomManifestPayloadSchema.parse(invalid)).toThrow();
  });
});

describe('ProvenanceAttestationPayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      format: 'in-toto',
      builderId: 'github-actions-123',
      buildStartedAt: '2024-03-27T12:00:00Z',
      buildFinishedAt: '2024-03-27T12:30:00Z',
      sourceDigest: 'sha256:source123',
      outputDigest: 'sha256:output456',
      reproducible: true,
      signingMethod: 'sigstore',
      signature: 'sig-abc123',
    };
    expect(() => ProvenanceAttestationPayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      format: 'in-toto',
      builderId: 'github-actions-123',
    };
    expect(() => ProvenanceAttestationPayloadSchema.parse(invalid)).toThrow();
  });
});

describe('PostDeliveryReviewPayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      deliveryRecordId: 'delivery-123',
      reviewedAt: '2024-03-27T12:00:00Z',
      reviewedBy: 'reviewer-1',
      healthChecks: [
        {
          name: 'API health',
          status: 'pass' as const,
          details: 'All endpoints responding',
        },
      ],
      performanceBaseline: [
        {
          metric: 'response_time',
          expected: 100,
          actual: 95,
        },
      ],
      issues: ['Minor logging issue'],
      followUpStoryIds: ['story-999'],
    };
    expect(() => PostDeliveryReviewPayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      deliveryRecordId: 'delivery-123',
      reviewedAt: '2024-03-27T12:00:00Z',
    };
    expect(() => PostDeliveryReviewPayloadSchema.parse(invalid)).toThrow();
  });
});

describe('ProductGoalPayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      title: 'Improve user onboarding',
      problemStatement: 'New users struggle to complete setup',
      targetUsers: 'First-time users',
      successMeasures: ['90% completion rate', 'Under 5 minutes'],
      businessConstraints: ['Must work on mobile', 'GDPR compliant'],
      nonGoals: ['Desktop app', 'Offline mode'],
    };
    expect(() => ProductGoalPayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      title: 'Improve user onboarding',
      problemStatement: 'New users struggle',
    };
    expect(() => ProductGoalPayloadSchema.parse(invalid)).toThrow();
  });
});

describe('DeliveryRecordPayloadSchema', () => {
  it('parses valid payload', () => {
    const valid = {
      releaseCandidateId: 'rc-123',
      incrementId: 'inc-456',
      environment: 'production',
      deployedVersion: 'v1.2.3',
      deploymentWindow: {
        start: '2024-03-27T00:00:00Z',
        end: '2024-03-27T01:00:00Z',
      },
      deploymentResult: 'success',
      rollbackReference: 'v1.2.2',
      evidenceReferences: ['log-1', 'log-2'],
    };
    expect(() => DeliveryRecordPayloadSchema.parse(valid)).not.toThrow();
  });

  it('rejects invalid payload', () => {
    const invalid = {
      environment: 'production',
      deployedVersion: 'v1.2.3',
    };
    expect(() => DeliveryRecordPayloadSchema.parse(invalid)).toThrow();
  });

  it('parses with null deploymentWindow', () => {
    const valid = {
      environment: 'staging',
      deployedVersion: 'v1.2.3',
      deploymentWindow: null,
      deploymentResult: 'success',
      evidenceReferences: [],
    };
    expect(() => DeliveryRecordPayloadSchema.parse(valid)).not.toThrow();
  });
});
