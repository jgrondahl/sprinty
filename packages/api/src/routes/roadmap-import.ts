import { EpicRepository, StoryRepository, type DbClient } from '@splinty/db';
import { StorySchema, StorySource, StoryState, type Story } from '@splinty/core';
import { z } from 'zod';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';

const ImportedStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  acceptanceCriteria: z.array(z.string()).default([]),
  storyPoints: z.number().int().min(0).optional(),
  domain: z.string().default('general'),
  tags: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
});

const ImportedEpicSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  status: z.enum(['draft', 'active', 'completed']).default('draft'),
  stories: z.array(ImportedStorySchema).default([]),
});

const RoadmapImportSchema = z.object({
  epics: z.array(ImportedEpicSchema).min(1),
});

function toDbStory(story: Story, orgId: string, projectId: string, epicId: string | null) {
  return {
    ...story,
    createdAt: new Date(story.createdAt),
    updatedAt: new Date(story.updatedAt),
    orgId,
    projectId,
    epicId,
  };
}

export async function importRoadmap(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.EPIC_WRITE, Permission.STORY_WRITE);
  const payload = RoadmapImportSchema.parse(await req.json());

  const epicRepo = new EpicRepository(db);
  const storyRepo = new StoryRepository(db);

  const createdEpics: Array<{ id: string; title: string }> = [];
  const createdStories: Array<{ id: string; title: string }> = [];
  const now = new Date().toISOString();

  for (const [index, epic] of payload.epics.entries()) {
    const createdEpic = await epicRepo.create({
      orgId: auth.orgId,
      projectId,
      title: epic.title,
      description: epic.description,
      status: epic.status,
      sortOrder: index,
    });
    createdEpics.push({ id: createdEpic.id, title: createdEpic.title });

    for (const storyInput of epic.stories) {
      const story = StorySchema.parse({
        id: storyInput.id,
        title: storyInput.title,
        description: storyInput.description,
        acceptanceCriteria: storyInput.acceptanceCriteria,
        state: StoryState.RAW,
        source: StorySource.FILE,
        sourceId: undefined,
        storyPoints: storyInput.storyPoints,
        domain: storyInput.domain,
        tags: storyInput.tags,
        dependsOn: storyInput.dependsOn,
        workspacePath: `/projects/${projectId}/stories/${storyInput.id}`,
        epicId: createdEpic.id,
        createdAt: now,
        updatedAt: now,
      });

      const createdStory = await storyRepo.create(
        toDbStory(story, auth.orgId, projectId, createdEpic.id)
      );
      createdStories.push({ id: createdStory.id, title: createdStory.title });
    }
  }

  return json({
    imported: {
      epics: createdEpics.length,
      stories: createdStories.length,
    },
    epicIds: createdEpics.map((epic) => epic.id),
    storyIds: createdStories.map((story) => story.id),
  });
}
