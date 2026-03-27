import { describe, expect, it } from 'bun:test';
import { ArtifactLineageRepository } from './artifact-lineage.repo';

describe('ArtifactLineageRepository', () => {
  it('creates and returns artifact lineage', async () => {
    const now = new Date();
    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [
            {
              id: 'lin-1',
              parentType: 'story',
              parentId: 'S-1',
              childType: 'architecture_plan',
              childId: 'AP-1',
              relationshipType: 'derived_from',
              createdAt: now,
              metadata: null,
            },
          ],
        }),
      }),
    };

    const repo = new ArtifactLineageRepository(dbMock as never);
    const result = await repo.create({
      id: 'lin-1',
      parentType: 'story',
      parentId: 'S-1',
      childType: 'architecture_plan',
      childId: 'AP-1',
      relationshipType: 'derived_from',
      createdAt: now,
      metadata: null,
    });

    expect(result.id).toBe('lin-1');
    expect(result.parentType).toBe('story');
    expect(result.childType).toBe('architecture_plan');
    expect(result.relationshipType).toBe('derived_from');
  });

  it('finds artifact lineage by id', async () => {
    const now = new Date();
    const dbMock = {
      query: {
        artifactLineage: {
          findFirst: async () => ({
            id: 'lin-1',
            parentType: 'story',
            parentId: 'S-1',
            childType: 'architecture_plan',
            childId: 'AP-1',
            relationshipType: 'derived_from',
            createdAt: now,
            metadata: null,
          }),
        },
      },
    };

    const repo = new ArtifactLineageRepository(dbMock as never);
    const result = await repo.findById('lin-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('lin-1');
    expect(result?.parentType).toBe('story');
  });

  it('finds artifact lineage by id returns null when not found', async () => {
    const dbMock = {
      query: {
        artifactLineage: {
          findFirst: async () => null,
        },
      },
    };

    const repo = new ArtifactLineageRepository(dbMock as never);
    const result = await repo.findById('lin-missing');

    expect(result).toBeNull();
  });

  it('finds all lineage records by parent', async () => {
    const now = new Date();
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              id: 'lin-1',
              parentType: 'story',
              parentId: 'S-1',
              childType: 'architecture_plan',
              childId: 'AP-1',
              relationshipType: 'derived_from',
              createdAt: now,
              metadata: null,
            },
            {
              id: 'lin-2',
              parentType: 'story',
              parentId: 'S-1',
              childType: 'epic',
              childId: 'E-1',
              relationshipType: 'decomposed_from',
              createdAt: now,
              metadata: null,
            },
          ],
        }),
      }),
    };

    const repo = new ArtifactLineageRepository(dbMock as never);
    const results = await repo.findByParent('story', 'S-1');

    expect(results).toHaveLength(2);
    expect(results[0].parentId).toBe('S-1');
    expect(results[1].parentId).toBe('S-1');
  });

  it('finds all lineage records by child', async () => {
    const now = new Date();
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              id: 'lin-1',
              parentType: 'story',
              parentId: 'S-1',
              childType: 'architecture_plan',
              childId: 'AP-1',
              relationshipType: 'derived_from',
              createdAt: now,
              metadata: null,
            },
          ],
        }),
      }),
    };

    const repo = new ArtifactLineageRepository(dbMock as never);
    const results = await repo.findByChild('architecture_plan', 'AP-1');

    expect(results).toHaveLength(1);
    expect(results[0].childId).toBe('AP-1');
    expect(results[0].childType).toBe('architecture_plan');
  });

  it('finds all lineage records by relationship type', async () => {
    const now = new Date();
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              id: 'lin-1',
              parentType: 'story',
              parentId: 'S-1',
              childType: 'architecture_plan',
              childId: 'AP-1',
              relationshipType: 'derived_from',
              createdAt: now,
              metadata: null,
            },
            {
              id: 'lin-2',
              parentType: 'epic',
              parentId: 'E-1',
              childType: 'story',
              childId: 'S-2',
              relationshipType: 'derived_from',
              createdAt: now,
              metadata: null,
            },
          ],
        }),
      }),
    };

    const repo = new ArtifactLineageRepository(dbMock as never);
    const results = await repo.findByRelationshipType('derived_from');

    expect(results).toHaveLength(2);
    expect(results[0].relationshipType).toBe('derived_from');
    expect(results[1].relationshipType).toBe('derived_from');
  });

  it('gets full lineage chain for an artifact', async () => {
    const now = new Date();
    let callCount = 0;
    const dbMock = {
      select: () => ({
        from: () => ({
          where: () => {
            callCount++;
            return callCount === 1
              ? [
                  {
                    id: 'lin-1',
                    parentType: 'story',
                    parentId: 'S-1',
                    childType: 'epic',
                    childId: 'E-1',
                    relationshipType: 'derived_from',
                    createdAt: now,
                    metadata: null,
                  },
                ]
              : [
                  {
                    id: 'lin-2',
                    parentType: 'project',
                    parentId: 'P-1',
                    childType: 'story',
                    childId: 'S-1',
                    relationshipType: 'decomposed_from',
                    createdAt: now,
                    metadata: null,
                  },
                ];
          },
        }),
      }),
    };

    const repo = new ArtifactLineageRepository(dbMock as never);
    const results = await repo.getLineageChain('story', 'S-1');

    expect(results).toHaveLength(2);
    expect(results[0].parentId).toBe('S-1');
    expect(results[0].childType).toBe('epic');
    expect(results[1].childId).toBe('S-1');
    expect(results[1].parentType).toBe('project');
  });
});
