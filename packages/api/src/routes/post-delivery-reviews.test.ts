import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createPostDeliveryReview } from './post-delivery-reviews';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('post-delivery-reviews routes', () => {
  it('creates review artifact with valid payload', async () => {
    let insertedArtifact: any = null;
    let insertedLineage: any = null;
    let insertedAudit: any = null;

    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => ({
            id: 'del-1',
            projectId: 'proj-1',
            orgId: 'org-1',
            environment: 'production',
            deployedVersion: '1.0.0',
            deploymentResult: 'success',
            createdAt: new Date(),
          }),
        },
      },
      insert: () => ({
        values: (input: any) => {
          if (input.artifactType) {
            insertedArtifact = {
              id: 'av-1',
              ...input,
              createdAt: new Date(),
            };
            return {
              returning: async () => [insertedArtifact],
            };
          }
          if (input.parentType) {
            insertedLineage = {
              id: 'lineage-1',
              ...input,
              createdAt: new Date(),
            };
            return {
              returning: async () => [insertedLineage],
            };
          }
          insertedAudit = { id: 'audit-1', ...input };
          return {
            returning: async () => [insertedAudit],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      deliveryRecordId: 'del-1',
      reviewedAt: '2026-03-27T10:00:00Z',
      reviewedBy: 'user-1',
      healthChecks: [
        { name: 'Database connectivity', status: 'pass' as const },
        { name: 'API response time', status: 'pass' as const, details: 'Average 150ms' },
      ],
      performanceBaseline: [
        { metric: 'response_time_p95', expected: 200, actual: 180 },
        { metric: 'error_rate', expected: 0.01, actual: 0.005 },
      ],
      issues: ['Minor styling bug in header', 'Deployment logs showing warnings'],
      followUpStoryIds: ['story-123', 'story-124'],
    };

    const response = await createPostDeliveryReview(
      makeRequest('http://localhost/api/deliveries/del-1/review', payload),
      'del-1',
      dbMock,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.id).toBe('av-1');
    expect(body.artifactType).toBe('post_delivery_review');
    expect(body.artifactId).toBe('del-1');
    expect(body.version).toBe(1);
  });

  it('throws NotFoundError when delivery record does not exist', async () => {
    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => undefined,
        },
      },
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      deliveryRecordId: 'del-nonexistent',
      reviewedAt: '2026-03-27T10:00:00Z',
      reviewedBy: 'user-1',
      healthChecks: [],
      performanceBaseline: [],
      issues: [],
      followUpStoryIds: [],
    };

    await expect(
      createPostDeliveryReview(
        makeRequest('http://localhost/api/deliveries/del-nonexistent/review', payload),
        'del-nonexistent',
        dbMock,
        auth
      )
    ).rejects.toThrow('Delivery record not found');
  });

  it('creates lineage link with correct relationshipType', async () => {
    let insertedLineage: any = null;

    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => ({
            id: 'del-1',
            projectId: 'proj-1',
            orgId: 'org-1',
            environment: 'production',
            deployedVersion: '1.0.0',
            deploymentResult: 'success',
            createdAt: new Date(),
          }),
        },
      },
      insert: () => ({
        values: (input: any) => {
          if (input.artifactType) {
            return {
              returning: async () => [
                {
                  id: 'av-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          if (input.parentType) {
            insertedLineage = {
              id: 'lineage-1',
              ...input,
              createdAt: new Date(),
            };
            return {
              returning: async () => [insertedLineage],
            };
          }
          return {
            returning: async () => [{ id: 'audit-1', ...input }],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      deliveryRecordId: 'del-1',
      reviewedAt: '2026-03-27T10:00:00Z',
      reviewedBy: 'user-1',
      healthChecks: [],
      performanceBaseline: [],
      issues: [],
      followUpStoryIds: [],
    };

    await createPostDeliveryReview(
      makeRequest('http://localhost/api/deliveries/del-1/review', payload),
      'del-1',
      dbMock,
      auth
    );

    expect(insertedLineage).toBeTruthy();
    expect(insertedLineage.parentType).toBe('delivery_record');
    expect(insertedLineage.parentId).toBe('del-1');
    expect(insertedLineage.childType).toBe('post_delivery_review');
    expect(insertedLineage.childId).toBe('av-1');
    expect(insertedLineage.relationshipType).toBe('derived_from');
  });

  it('appends audit record with correct action', async () => {
    let insertedAudit: any = null;

    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => ({
            id: 'del-1',
            projectId: 'proj-1',
            orgId: 'org-1',
            environment: 'production',
            deployedVersion: '1.0.0',
            deploymentResult: 'success',
            createdAt: new Date(),
          }),
        },
      },
      insert: () => ({
        values: (input: any) => {
          if (input.artifactType) {
            return {
              returning: async () => [
                {
                  id: 'av-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          if (input.parentType) {
            return {
              returning: async () => [{ id: 'lineage-1', ...input }],
            };
          }
          insertedAudit = { id: 'audit-1', ...input };
          return {
            returning: async () => [insertedAudit],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      deliveryRecordId: 'del-1',
      reviewedAt: '2026-03-27T10:00:00Z',
      reviewedBy: 'user-1',
      healthChecks: [],
      performanceBaseline: [],
      issues: [],
      followUpStoryIds: [],
    };

    await createPostDeliveryReview(
      makeRequest('http://localhost/api/deliveries/del-1/review', payload),
      'del-1',
      dbMock,
      auth
    );

    expect(insertedAudit).toBeTruthy();
    expect(insertedAudit.action).toBe('POST_DELIVERY_REVIEW_CREATED');
    expect(insertedAudit.entityType).toBe('artifact_version');
    expect(insertedAudit.entityId).toBe('av-1');
    expect(insertedAudit.orgId).toBe('org-1');
    expect(insertedAudit.userId).toBe('user-1');
  });

  it('throws validation error for invalid payload', async () => {
    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => ({
            id: 'del-1',
            projectId: 'proj-1',
            orgId: 'org-1',
            environment: 'production',
            deployedVersion: '1.0.0',
            deploymentResult: 'success',
            createdAt: new Date(),
          }),
        },
      },
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const invalidPayload = {
      deliveryRecordId: 'del-1',
      reviewedAt: '2026-03-27T10:00:00Z',
    };

    await expect(
      createPostDeliveryReview(
        makeRequest('http://localhost/api/deliveries/del-1/review', invalidPayload),
        'del-1',
        dbMock,
        auth
      )
    ).rejects.toThrow();
  });

  it('returns artifactType as post_delivery_review', async () => {
    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => ({
            id: 'del-1',
            projectId: 'proj-1',
            orgId: 'org-1',
            environment: 'production',
            deployedVersion: '1.0.0',
            deploymentResult: 'success',
            createdAt: new Date(),
          }),
        },
      },
      insert: () => ({
        values: (input: any) => ({
          returning: async () => [
            {
              id: 'av-1',
              ...input,
              createdAt: new Date(),
            },
          ],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      deliveryRecordId: 'del-1',
      reviewedAt: '2026-03-27T10:00:00Z',
      reviewedBy: 'user-1',
      healthChecks: [],
      performanceBaseline: [],
      issues: [],
      followUpStoryIds: [],
    };

    const response = await createPostDeliveryReview(
      makeRequest('http://localhost/api/deliveries/del-1/review', payload),
      'del-1',
      dbMock,
      auth
    );

    const body = (await response.json()) as any;
    expect(body.artifactType).toBe('post_delivery_review');
  });
});
