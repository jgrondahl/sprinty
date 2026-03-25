import { describe, expect, it } from 'bun:test';
import { StorySource, StoryState } from '@splinty/core';
import { StoryRepository } from './story.repo';

describe('StoryRepository', () => {
  it('maps db row to Story-compatible shape', async () => {
    const now = new Date();
    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [
            {
              id: 'S-1',
              title: 'title',
              description: 'desc',
              acceptanceCriteria: ['ac-1'],
              state: StoryState.RAW,
              source: StorySource.FILE,
              sourceId: null,
              storyPoints: null,
              domain: 'general',
              tags: [],
              dependsOn: [],
              epicId: null,
              workspacePath: '/tmp',
              createdAt: now,
              updatedAt: now,
              orgId: 'org-1',
              projectId: 'proj-1',
              assignedTo: null,
              sprintId: null,
            },
          ],
        }),
      }),
    };

    const repo = new StoryRepository(dbMock as never);
    const created = await repo.create({
      id: 'S-1',
      title: 'title',
      description: 'desc',
      acceptanceCriteria: ['ac-1'],
      state: StoryState.RAW,
      source: StorySource.FILE,
      domain: 'general',
      tags: [],
      dependsOn: [],
      workspacePath: '/tmp',
      createdAt: now,
      updatedAt: now,
      orgId: 'org-1',
      projectId: 'proj-1',
    });

    expect(created.id).toBe('S-1');
    expect(created.state).toBe(StoryState.RAW);
    expect(created.source).toBe(StorySource.FILE);
    expect(created.dependsOn).toEqual([]);
  });
});
