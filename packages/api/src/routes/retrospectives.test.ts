import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createRetrospective } from './retrospectives';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('retrospectives routes', () => {
  const auth = { userId: 'user-1', orgId: 'org-1', role: 'admin' as const };

  it('creates retrospective artifact with valid payload', async () => {
    let insertedArtifact: Record<string, unknown> | null = null;

    const dbMock = {
      insert: () => ({
        values: (input: Record<string, unknown>) => ({
          returning: async () => {
            if (input['artifactType'] === 'retrospective') {
              insertedArtifact = {
                id: 'artifact-1',
                artifactType: input['artifactType'],
                artifactId: input['artifactId'],
                version: input['version'],
                snapshotData: input['snapshotData'],
                createdBy: input['createdBy'],
                createdAt: new Date(),
              };
              return [insertedArtifact];
            }
            return [];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const response = await createRetrospective(
      makeRequest('http://localhost/api/retrospectives', {
        sprintId: 'sprint-1',
        whatWentWell: ['CI/CD pipeline stable'],
        whatDidntGoWell: ['Flaky integration tests'],
        improvements: [{ description: 'Add retry logic', priority: 'high', assignee: 'dev-1' }],
        teamSentiment: 4,
      }),
      'project-1',
      'sprint-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { artifactType: string; id: string };
    expect(body.artifactType).toBe('retrospective');
    expect(body.id).toBe('artifact-1');
    expect(insertedArtifact).not.toBeNull();
  });

  it('rejects payload missing whatWentWell', async () => {
    const dbMock = {} as DbClient;

    const promise = createRetrospective(
      makeRequest('http://localhost/api/retrospectives', {
        sprintId: 'sprint-1',
        whatDidntGoWell: ['Flaky tests'],
        improvements: [],
        teamSentiment: 3,
      }),
      'project-1',
      'sprint-1',
      dbMock,
      auth
    );

    await expect(promise).rejects.toThrow();
  });

  it('rejects payload with invalid teamSentiment exceeding max', async () => {
    const dbMock = {} as DbClient;

    const promise = createRetrospective(
      makeRequest('http://localhost/api/retrospectives', {
        sprintId: 'sprint-1',
        whatWentWell: ['All good'],
        whatDidntGoWell: [],
        improvements: [],
        teamSentiment: 6,
      }),
      'project-1',
      'sprint-1',
      dbMock,
      auth
    );

    await expect(promise).rejects.toThrow();
  });

  it('creates lineage link when payload includes sprintId', async () => {
    let insertedLineage: Record<string, unknown> | null = null;

    const dbMock = {
      insert: () => ({
        values: (input: Record<string, unknown>) => ({
          returning: async () => {
            if (input['parentType'] === 'sprint_review') {
              insertedLineage = {
                id: 'lineage-1',
                parentType: input['parentType'],
                parentId: input['parentId'],
                childType: input['childType'],
                childId: input['childId'],
                relationshipType: input['relationshipType'],
              };
              return [insertedLineage];
            }
            if (input['artifactType'] === 'retrospective') {
              return [{ id: 'artifact-1', ...input }];
            }
            return [];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    await createRetrospective(
      makeRequest('http://localhost/api/retrospectives', {
        sprintId: 'sprint-1',
        whatWentWell: ['All good'],
        whatDidntGoWell: [],
        improvements: [],
        teamSentiment: 4,
      }),
      'project-1',
      'sprint-1',
      dbMock as never as DbClient,
      auth
    );

    expect(insertedLineage).not.toBeNull();
    expect(insertedLineage?.parentType).toBe('sprint_review');
    expect(insertedLineage?.childType).toBe('retrospective');
    expect(insertedLineage?.relationshipType).toBe('derived_from');
  });

  it('validates improvements array structure', async () => {
    const dbMock = {
      insert: () => ({
        values: (input: Record<string, unknown>) => ({
          returning: async () => {
            if (input['artifactType'] === 'retrospective') {
              return [{ id: 'artifact-1', ...input }];
            }
            return [];
          },
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const response = await createRetrospective(
      makeRequest('http://localhost/api/retrospectives', {
        sprintId: 'sprint-1',
        whatWentWell: ['Good progress'],
        whatDidntGoWell: ['Some delays'],
        improvements: [
          { description: 'Improve CI speed', priority: 'high', assignee: 'dev-1' },
          { description: 'Add documentation', priority: 'medium', targetSprintId: 'sprint-2' },
          { description: 'Refactor auth', priority: 'low' },
        ],
        teamSentiment: 4,
      }),
      'project-1',
      'sprint-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { snapshotData: { improvements: Array<{ description: string; priority: string }> } };
    expect(body.snapshotData.improvements).toHaveLength(3);
    expect(body.snapshotData.improvements[0].description).toBe('Improve CI speed');
    expect(body.snapshotData.improvements[0].priority).toBe('high');
  });
});
