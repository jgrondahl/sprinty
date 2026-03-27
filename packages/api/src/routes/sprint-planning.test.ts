import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { assignStories } from './sprint-planning';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const authContext = {
  userId: 'user-1',
  orgId: 'org-1',
  role: 'admin' as const,
};

describe('sprint-planning routes', () => {
  it('assigns ready stories to planning sprint', async () => {
    let storyUpdateCalled = false;
    let sprintUpdateCalled = false;

    const dbMock = {
      query: {
        sprints: {
          findFirst: async () => ({
            id: 'sprint-1',
            orgId: 'org-1',
            projectId: 'project-1',
            name: 'Sprint 1',
            status: 'planning',
            goal: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
        stories: {
          findFirst: async ({ where }: { where: unknown }) => {
            return {
              id: 'story-1',
              orgId: 'org-1',
              projectId: 'project-1',
              title: 'Test Story',
              description: 'Test',
              state: 'SPRINT_READY',
              readiness: 'ready',
              acceptanceCriteria: [],
              source: 'FILE',
              domain: 'feature',
              tags: [],
              dependsOn: [],
              workspacePath: '/workspace/story-1',
              sprintId: null,
              epicId: null,
              sourceId: null,
              storyPoints: null,
              sortOrder: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
      },
      update: () => ({
        set: (input: unknown) => {
          const hasSprintId = (input as { sprintId?: string }).sprintId !== undefined;
          const hasGoal = (input as { goal?: string }).goal !== undefined;

          if (hasSprintId) {
            storyUpdateCalled = true;
          }
          if (hasGoal) {
            sprintUpdateCalled = true;
          }

          return {
            where: () => ({
              returning: async () => {
                if (hasSprintId) {
                  return [
                    {
                      id: 'story-1',
                      orgId: 'org-1',
                      projectId: 'project-1',
                      title: 'Test Story',
                      description: 'Test',
                      state: 'SPRINT_READY',
                      readiness: 'ready',
                      acceptanceCriteria: [],
                      source: 'FILE',
                      domain: 'feature',
                      tags: [],
                      dependsOn: [],
                      workspacePath: '/workspace/story-1',
                      sprintId: 'sprint-1',
                      epicId: null,
                      sourceId: null,
                      storyPoints: null,
                      sortOrder: null,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  ];
                }
                return [
                  {
                    id: 'sprint-1',
                    orgId: 'org-1',
                    projectId: 'project-1',
                    name: 'Sprint 1',
                    status: 'planning',
                    goal: (input as { goal?: string }).goal || null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ];
              },
            }),
          };
        },
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'audit-1' }],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const response = await assignStories(
      makeRequest('http://localhost/api/projects/project-1/sprints/sprint-1/assign-stories', {
        storyIds: ['story-1'],
        sprintGoal: 'Updated goal',
      }),
      'project-1',
      'sprint-1',
      dbMock as never as DbClient,
      authContext
    );

    expect(response.status).toBe(200);
    expect(storyUpdateCalled).toBe(true);
    expect(sprintUpdateCalled).toBe(true);
    const body = (await response.json()) as {
      sprint: { id: string };
      assignedStories: string[];
    };
    expect(body.sprint.id).toBe('sprint-1');
    expect(body.assignedStories).toEqual(['story-1']);
  });

  it('throws NotFoundError when sprint does not exist', async () => {
    const dbMock = {
      query: {
        sprints: {
          findFirst: async () => null,
        },
      },
    };

    try {
      await assignStories(
        makeRequest('http://localhost/api/projects/project-1/sprints/sprint-999/assign-stories', {
          storyIds: ['story-1'],
        }),
        'project-1',
        'sprint-999',
        dbMock as never as DbClient,
        authContext
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { message: string }).message).toBe('Sprint not found');
    }
  });

  it('throws BadRequestError when sprint is not in planning status', async () => {
    const dbMock = {
      query: {
        sprints: {
          findFirst: async () => ({
            id: 'sprint-1',
            orgId: 'org-1',
            projectId: 'project-1',
            name: 'Sprint 1',
            status: 'active',
            goal: null,
          }),
        },
      },
    };

    try {
      await assignStories(
        makeRequest('http://localhost/api/projects/project-1/sprints/sprint-1/assign-stories', {
          storyIds: ['story-1'],
        }),
        'project-1',
        'sprint-1',
        dbMock as never as DbClient,
        authContext
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { message: string }).message).toBe(
        'Sprint must be in planning status to assign stories'
      );
    }
  });

  it('throws BadRequestError when story does not exist', async () => {
    const dbMock = {
      query: {
        sprints: {
          findFirst: async () => ({
            id: 'sprint-1',
            orgId: 'org-1',
            projectId: 'project-1',
            name: 'Sprint 1',
            status: 'planning',
            goal: null,
          }),
        },
        stories: {
          findFirst: async () => null,
        },
      },
    };

    try {
      await assignStories(
        makeRequest('http://localhost/api/projects/project-1/sprints/sprint-1/assign-stories', {
          storyIds: ['story-999'],
        }),
        'project-1',
        'sprint-1',
        dbMock as never as DbClient,
        authContext
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { message: string }).message).toBe('Story story-999 not found');
    }
  });

  it('throws BadRequestError when story is not ready', async () => {
    const dbMock = {
      query: {
        sprints: {
          findFirst: async () => ({
            id: 'sprint-1',
            orgId: 'org-1',
            projectId: 'project-1',
            name: 'Sprint 1',
            status: 'planning',
            goal: null,
          }),
        },
        stories: {
          findFirst: async () => ({
            id: 'story-1',
            orgId: 'org-1',
            projectId: 'project-1',
            title: 'Test Story',
            description: 'Test',
            state: 'SPRINT_READY',
            readiness: 'needs-refinement',
            acceptanceCriteria: [],
            source: 'FILE',
            domain: 'feature',
            tags: [],
            dependsOn: [],
            workspacePath: '/workspace/story-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      },
    };

    try {
      await assignStories(
        makeRequest('http://localhost/api/projects/project-1/sprints/sprint-1/assign-stories', {
          storyIds: ['story-1'],
        }),
        'project-1',
        'sprint-1',
        dbMock as never as DbClient,
        authContext
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { message: string }).message).toBe(
        'Story story-1 is not ready for sprint assignment'
      );
    }
  });

  it('updates sprint goal when provided', async () => {
    let updatedGoal: string | undefined;
    let findByIdCallCount = 0;

    const dbMock = {
      query: {
        sprints: {
          findFirst: async () => {
            findByIdCallCount++;
            return {
              id: 'sprint-1',
              orgId: 'org-1',
              projectId: 'project-1',
              name: 'Sprint 1',
              status: 'planning',
              goal: findByIdCallCount > 1 ? updatedGoal || null : null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          },
        },
        stories: {
          findFirst: async () => ({
            id: 'story-1',
            orgId: 'org-1',
            projectId: 'project-1',
            title: 'Test Story',
            description: 'Test',
            state: 'SPRINT_READY',
            readiness: 'ready',
            acceptanceCriteria: [],
            source: 'FILE',
            domain: 'feature',
            tags: [],
            dependsOn: [],
            workspacePath: '/workspace/story-1',
            sprintId: null,
            epicId: null,
            sourceId: null,
            storyPoints: null,
            sortOrder: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
      },
      update: () => ({
        set: (input: { goal?: string; sprintId?: string }) => {
          const hasSprintId = input.sprintId !== undefined;
          const hasGoal = input.goal !== undefined;

          if (hasGoal) {
            updatedGoal = input.goal;
          }

          return {
            where: () => ({
              returning: async () => {
                if (hasSprintId) {
                  return [
                    {
                      id: 'story-1',
                      orgId: 'org-1',
                      projectId: 'project-1',
                      title: 'Test Story',
                      description: 'Test',
                      state: 'SPRINT_READY',
                      readiness: 'ready',
                      acceptanceCriteria: [],
                      source: 'FILE',
                      domain: 'feature',
                      tags: [],
                      dependsOn: [],
                      workspacePath: '/workspace/story-1',
                      sprintId: 'sprint-1',
                      epicId: null,
                      sourceId: null,
                      storyPoints: null,
                      sortOrder: null,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  ];
                }
                return [
                  {
                    id: 'sprint-1',
                    orgId: 'org-1',
                    projectId: 'project-1',
                    name: 'Sprint 1',
                    status: 'planning',
                    goal: input.goal || null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ];
              },
            }),
          };
        },
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'audit-1' }],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const response = await assignStories(
      makeRequest('http://localhost/api/projects/project-1/sprints/sprint-1/assign-stories', {
        storyIds: ['story-1'],
        sprintGoal: 'Complete auth feature',
      }),
      'project-1',
      'sprint-1',
      dbMock as never as DbClient,
      authContext
    );

    expect(response.status).toBe(200);
    expect(updatedGoal).toBe('Complete auth feature');
    const body = (await response.json()) as { sprint: { goal: string | null } };
    expect(body.sprint.goal).toBe('Complete auth feature');
  });
});
