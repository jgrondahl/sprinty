import { describe, expect, it } from 'bun:test';
import { ArtifactVersionRepository } from './artifact-version.repo';

describe('ArtifactVersionRepository', () => {
  it('creates and returns artifact version', async () => {
    const now = new Date();
    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [
            {
              id: 'av-1',
              artifactType: 'story',
              artifactId: 'S-1',
              version: 1,
              snapshotData: { title: 'Test' },
              createdBy: 'user-1',
              createdAt: now,
              metadata: null,
            },
          ],
        }),
      }),
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const result = await repo.create({
      id: 'av-1',
      artifactType: 'story',
      artifactId: 'S-1',
      version: 1,
      snapshotData: { title: 'Test' },
      createdBy: 'user-1',
      createdAt: now,
      metadata: null,
    });

    expect(result.id).toBe('av-1');
    expect(result.artifactType).toBe('story');
    expect(result.version).toBe(1);
  });

  it('finds artifact version by id', async () => {
    const now = new Date();
    const dbMock = {
      query: {
        artifactVersions: {
          findFirst: async () => ({
            id: 'av-1',
            artifactType: 'epic',
            artifactId: 'E-1',
            version: 2,
            snapshotData: { name: 'Epic Test' },
            createdBy: 'user-1',
            createdAt: now,
            metadata: null,
          }),
        },
      },
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const result = await repo.findById('av-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('av-1');
    expect(result?.artifactType).toBe('epic');
  });

  it('finds artifact version by id returns null when not found', async () => {
    const dbMock = {
      query: {
        artifactVersions: {
          findFirst: async () => null,
        },
      },
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const result = await repo.findById('av-missing');

    expect(result).toBeNull();
  });

  it('finds all versions by artifact id', async () => {
    const now = new Date();
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              id: 'av-1',
              artifactType: 'story',
              artifactId: 'S-1',
              version: 1,
              snapshotData: { title: 'Test v1' },
              createdBy: 'user-1',
              createdAt: now,
              metadata: null,
            },
            {
              id: 'av-2',
              artifactType: 'story',
              artifactId: 'S-1',
              version: 2,
              snapshotData: { title: 'Test v2' },
              createdBy: 'user-1',
              createdAt: now,
              metadata: null,
            },
          ],
        }),
      }),
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const results = await repo.findByArtifactId('S-1');

    expect(results).toHaveLength(2);
    expect(results[0].version).toBe(1);
    expect(results[1].version).toBe(2);
  });

  it('finds all versions by artifact type', async () => {
    const now = new Date();
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            {
              id: 'av-1',
              artifactType: 'architecture_plan',
              artifactId: 'AP-1',
              version: 1,
              snapshotData: { plan: 'test' },
              createdBy: 'user-1',
              createdAt: now,
              metadata: null,
            },
            {
              id: 'av-2',
              artifactType: 'architecture_plan',
              artifactId: 'AP-2',
              version: 1,
              snapshotData: { plan: 'test2' },
              createdBy: 'user-1',
              createdAt: now,
              metadata: null,
            },
          ],
        }),
      }),
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const results = await repo.findByType('architecture_plan');

    expect(results).toHaveLength(2);
    expect(results[0].artifactType).toBe('architecture_plan');
    expect(results[1].artifactType).toBe('architecture_plan');
  });

  it('finds latest version for artifact id', async () => {
    const now = new Date();
    const dbMock = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [
                {
                  id: 'av-3',
                  artifactType: 'story',
                  artifactId: 'S-1',
                  version: 3,
                  snapshotData: { title: 'Latest' },
                  createdBy: 'user-1',
                  createdAt: now,
                  metadata: null,
                },
              ],
            }),
          }),
        }),
      }),
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const result = await repo.findLatestVersion('S-1');

    expect(result).not.toBeNull();
    expect(result?.version).toBe(3);
    expect(result?.id).toBe('av-3');
  });

  it('returns null when no latest version found', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const result = await repo.findLatestVersion('S-missing');

    expect(result).toBeNull();
  });

  it('lists all artifact versions', async () => {
    const now = new Date();
    const dbMock = {
      select: () => ({
        from: async () => [
          {
            id: 'av-1',
            artifactType: 'story',
            artifactId: 'S-1',
            version: 1,
            snapshotData: { title: 'Test' },
            createdBy: 'user-1',
            createdAt: now,
            metadata: null,
          },
          {
            id: 'av-2',
            artifactType: 'epic',
            artifactId: 'E-1',
            version: 1,
            snapshotData: { name: 'Epic' },
            createdBy: 'user-1',
            createdAt: now,
            metadata: null,
          },
        ],
      }),
    };

    const repo = new ArtifactVersionRepository(dbMock as never);
    const results = await repo.listAll();

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('av-1');
    expect(results[1].id).toBe('av-2');
  });
});
