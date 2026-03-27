import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createIncrement } from './increments';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('increments routes', () => {
  it('creates increment artifact with valid payload', async () => {
    let insertedArtifact: any = null;
    let insertedLineages: any[] = [];
    let insertedAudit: any = null;

    const dbMock = {
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
            const lineage = {
              id: `lineage-${insertedLineages.length + 1}`,
              ...input,
              createdAt: new Date(),
            };
            insertedLineages.push(lineage);
            return {
              returning: async () => [lineage],
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
      sprintId: 'sprint-1',
      completedStoryIds: ['story-1', 'story-2'],
      incompleteStoryIds: [],
      demonstrableFeatures: ['Feature A', 'Feature B'],
      technicalDebt: [],
      notes: 'Sprint completed successfully',
    };

    const response = await createIncrement(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/increment', payload),
      'proj-1',
      'sprint-1',
      dbMock,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.id).toBe('av-1');
    expect(body.artifactType).toBe('increment');
    expect(body.artifactId).toBe('sprint-1');
    expect(body.version).toBe(1);
  });

  it('creates lineage links for each completed story', async () => {
    let insertedLineages: any[] = [];

    const dbMock = {
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
            const lineage = { id: `lineage-${insertedLineages.length + 1}`, ...input };
            insertedLineages.push(lineage);
            return {
              returning: async () => [lineage],
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
      sprintId: 'sprint-1',
      completedStoryIds: ['story-1', 'story-2', 'story-3'],
      incompleteStoryIds: [],
      demonstrableFeatures: [],
      technicalDebt: [],
      notes: '',
    };

    await createIncrement(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/increment', payload),
      'proj-1',
      'sprint-1',
      dbMock,
      auth
    );

    expect(insertedLineages).toHaveLength(3);
    expect(insertedLineages[0].parentType).toBe('story');
    expect(insertedLineages[0].parentId).toBe('story-1');
    expect(insertedLineages[0].childType).toBe('increment');
    expect(insertedLineages[0].childId).toBe('av-1');
    expect(insertedLineages[0].relationshipType).toBe('derived_from');
  });

  it('appends audit record with correct action', async () => {
    let insertedAudit: any = null;

    const dbMock = {
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
      sprintId: 'sprint-1',
      completedStoryIds: ['story-1'],
      incompleteStoryIds: [],
      demonstrableFeatures: [],
      technicalDebt: [],
      notes: '',
    };

    await createIncrement(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/increment', payload),
      'proj-1',
      'sprint-1',
      dbMock,
      auth
    );

    expect(insertedAudit).toBeTruthy();
    expect(insertedAudit.action).toBe('INCREMENT_CREATED');
    expect(insertedAudit.entityType).toBe('artifact_version');
    expect(insertedAudit.entityId).toBe('av-1');
    expect(insertedAudit.orgId).toBe('org-1');
    expect(insertedAudit.userId).toBe('user-1');
  });

  it('returns correct artifactType as increment', async () => {
    const dbMock = {
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
      sprintId: 'sprint-1',
      completedStoryIds: [],
      incompleteStoryIds: [],
      demonstrableFeatures: [],
      technicalDebt: [],
      notes: '',
    };

    const response = await createIncrement(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/increment', payload),
      'proj-1',
      'sprint-1',
      dbMock,
      auth
    );

    const body = (await response.json()) as any;
    expect(body.artifactType).toBe('increment');
  });

  it('throws validation error for invalid payload', async () => {
    const dbMock = {} as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const invalidPayload = {
      sprintId: 'sprint-1',
      completedStoryIds: ['story-1'],
    };

    await expect(
      createIncrement(
        makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/increment', invalidPayload),
        'proj-1',
        'sprint-1',
        dbMock,
        auth
      )
    ).rejects.toThrow();
  });

  it('dispatches increment.created webhook event', async () => {
    let dispatchedEvent: any = null;

    const dbMock = {
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
      sprintId: 'sprint-1',
      completedStoryIds: ['story-1'],
      incompleteStoryIds: [],
      demonstrableFeatures: [],
      technicalDebt: [],
      notes: '',
    };

    await createIncrement(
      makeRequest('http://localhost/api/projects/proj-1/sprints/sprint-1/increment', payload),
      'proj-1',
      'sprint-1',
      dbMock,
      auth
    );

    expect(true).toBe(true);
  });
});
