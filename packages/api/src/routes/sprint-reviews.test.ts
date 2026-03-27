import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createSprintReview } from './sprint-reviews';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const auth = { userId: 'user-1', orgId: 'org-1', role: 'admin' };

const validPayload = {
  sprintId: 'sprint-1',
  incrementId: 'increment-1',
  productGoalId: 'goal-1',
  goalAlignmentScore: 85,
  stakeholderFeedback: [
    {
      reviewer: 'Product Manager',
      feedback: 'Great progress on user authentication',
      rating: 5,
    },
  ],
  actionItems: ['Address security concerns', 'Improve error messaging'],
  demonstrationNotes: 'Demo went well, stakeholders satisfied with increment',
};

describe('sprint-reviews routes', () => {
  it('createSprintReview returns 201 with artifact version for valid payload', async () => {
    const dbMock = {
      insert: () => ({
        values: (input: Record<string, unknown>) => ({
          returning: async () => [{ id: 'artifact-1', ...input }],
        }),
      }),
      query: {},
      select: () => ({ from: () => ({ where: async () => [] }) }),
    };

    const response = await createSprintReview(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/review', validPayload),
      'proj-1',
      'sprint-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { artifactType: string; artifactId: string };
    expect(body.artifactType).toBe('sprint_review');
    expect(body.artifactId).toBe('sprint-1');
  });

  it('createSprintReview rejects missing required field', async () => {
    const dbMock = {} as never as DbClient;

    const invalidPayload = {
      sprintId: 'sprint-1',
      incrementId: 'increment-1',
      // Missing productGoalId
      goalAlignmentScore: 85,
      stakeholderFeedback: [],
      actionItems: [],
      demonstrationNotes: '',
    };

    await expect(
      createSprintReview(
        makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/review', invalidPayload),
        'proj-1',
        'sprint-1',
        dbMock,
        auth
      )
    ).rejects.toThrow();
  });

  it('createSprintReview creates lineage link from increment to sprint_review', async () => {
    let lineageRecord: Record<string, unknown> | null = null;

    const dbMock = {
      insert: () => ({
        values: (input: Record<string, unknown>) => {
          if (input.parentType) {
            lineageRecord = input;
          }
          return {
            returning: async () => [{ id: `entity-${Date.now()}`, ...input }],
          };
        },
      }),
      query: {},
      select: () => ({ from: () => ({ where: async () => [] }) }),
    };

    await createSprintReview(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/review', validPayload),
      'proj-1',
      'sprint-1',
      dbMock as never as DbClient,
      auth
    );

    expect(lineageRecord).not.toBeNull();
    expect(lineageRecord?.parentType).toBe('increment');
    expect(lineageRecord?.parentId).toBe('increment-1');
    expect(lineageRecord?.childType).toBe('sprint_review');
    expect(lineageRecord?.relationshipType).toBe('derived_from');
  });

  it('createSprintReview appends audit record', async () => {
    let auditRecord: Record<string, unknown> | null = null;

    const dbMock = {
      insert: () => ({
        values: (input: Record<string, unknown>) => {
          if (input.action) {
            auditRecord = input;
          }
          return {
            returning: async () => [{ id: `entity-${Date.now()}`, ...input }],
          };
        },
      }),
      query: {},
      select: () => ({ from: () => ({ where: async () => [] }) }),
    };

    await createSprintReview(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/review', validPayload),
      'proj-1',
      'sprint-1',
      dbMock as never as DbClient,
      auth
    );

    expect(auditRecord).not.toBeNull();
    expect(auditRecord?.action).toBe('SPRINT_REVIEW_CREATED');
    expect(auditRecord?.entityType).toBe('artifact_version');
    expect(auditRecord?.orgId).toBe('org-1');
    expect(auditRecord?.userId).toBe('user-1');
  });

  it('createSprintReview does NOT trigger sprint status change', async () => {
    let updateCalled = false;

    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'artifact-1' }],
        }),
      }),
      update: () => {
        updateCalled = true;
        return {
          set: () => ({
            where: () => ({
              returning: async () => [],
            }),
          }),
        };
      },
      query: {},
      select: () => ({ from: () => ({ where: async () => [] }) }),
    };

    await createSprintReview(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/review', validPayload),
      'proj-1',
      'sprint-1',
      dbMock as never as DbClient,
      auth
    );

    expect(updateCalled).toBe(false);
  });
});
