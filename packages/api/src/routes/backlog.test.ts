import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { getBacklog, refineStory } from './backlog';

function makeRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

const mockStories = [
  {
    id: 's-1',
    title: 'Story 1',
    description: 'First story',
    acceptanceCriteria: [],
    state: 'RAW',
    source: 'FILE',
    domain: 'core',
    tags: [],
    dependsOn: [],
    workspacePath: '/workspace',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    sortOrder: 3,
    readiness: 'ready',
    orgId: 'org-1',
    projectId: 'proj-1',
  },
  {
    id: 's-2',
    title: 'Story 2',
    description: 'Second story',
    acceptanceCriteria: [],
    state: 'RAW',
    source: 'FILE',
    domain: 'core',
    tags: [],
    dependsOn: [],
    workspacePath: '/workspace',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
    sortOrder: 1,
    readiness: 'not_ready',
    orgId: 'org-1',
    projectId: 'proj-1',
  },
  {
    id: 's-3',
    title: 'Story 3',
    description: 'Third story',
    acceptanceCriteria: [],
    state: 'RAW',
    source: 'FILE',
    domain: 'core',
    tags: [],
    dependsOn: [],
    workspacePath: '/workspace',
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
    sortOrder: 2,
    readiness: 'ready',
    orgId: 'org-1',
    projectId: 'proj-1',
  },
];

const auth = { userId: 'user-1', orgId: 'org-1', role: 'admin' };

describe('backlog routes', () => {
  it('getBacklog returns stories sorted by sortOrder', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockStories,
        }),
      }),
    };

    const response = await getBacklog(
      makeRequest('http://localhost/api/backlog'),
      'proj-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { stories: typeof mockStories; total: number };
    expect(body.stories).toHaveLength(3);
    expect(body.stories[0].id).toBe('s-2');
    expect(body.stories[1].id).toBe('s-3');
    expect(body.stories[2].id).toBe('s-1');
    expect(body.total).toBe(3);
  });

  it('getBacklog filters by readiness query param', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockStories,
        }),
      }),
    };

    const response = await getBacklog(
      makeRequest('http://localhost/api/backlog?readiness=ready'),
      'proj-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { stories: typeof mockStories; total: number };
    expect(body.stories).toHaveLength(2);
    expect(body.stories.every((s) => s.readiness === 'ready')).toBe(true);
    expect(body.total).toBe(2);
  });

  it('getBacklog applies pagination (limit/offset)', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockStories,
        }),
      }),
    };

    const response = await getBacklog(
      makeRequest('http://localhost/api/backlog?limit=1&offset=1'),
      'proj-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { stories: typeof mockStories; total: number };
    expect(body.stories).toHaveLength(1);
    expect(body.stories[0].id).toBe('s-3');
    expect(body.total).toBe(3);
  });

  it('getBacklog returns total count before pagination', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockStories,
        }),
      }),
    };

    const response = await getBacklog(
      makeRequest('http://localhost/api/backlog?limit=1'),
      'proj-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { stories: typeof mockStories; total: number };
    expect(body.stories).toHaveLength(1);
    expect(body.total).toBe(3);
  });

  it('refineStory updates sortOrder', async () => {
    const updatedStory = { ...mockStories[0], sortOrder: 5 };
    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [updatedStory],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{}],
        }),
      }),
    };

    const response = await refineStory(
      makeRequest('http://localhost/api/backlog/refine', {
        storyId: 's-1',
        sortOrder: 5,
      }),
      'proj-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as typeof updatedStory;
    expect(body.sortOrder).toBe(5);
  });

  it('refineStory updates readiness', async () => {
    const updatedStory = { ...mockStories[1], readiness: 'ready' };
    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [updatedStory],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{}],
        }),
      }),
    };

    const response = await refineStory(
      makeRequest('http://localhost/api/backlog/refine', {
        storyId: 's-2',
        readiness: 'ready',
      }),
      'proj-1',
      dbMock as never as DbClient,
      auth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as typeof updatedStory;
    expect(body.readiness).toBe('ready');
  });

  it('refineStory returns 400 for missing storyId', async () => {
    const dbMock = {} as never as DbClient;

    await expect(
      refineStory(
        makeRequest('http://localhost/api/backlog/refine', { sortOrder: 5 }),
        'proj-1',
        dbMock,
        auth
      )
    ).rejects.toThrow();
  });

  it('refineStory returns error when story not found', async () => {
    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    };

    await expect(
      refineStory(
        makeRequest('http://localhost/api/backlog/refine', {
          storyId: 'nonexistent',
          sortOrder: 5,
        }),
        'proj-1',
        dbMock as never as DbClient,
        auth
      )
    ).rejects.toThrow('Story not found');
  });
});
