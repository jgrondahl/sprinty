import { describe, expect, it } from 'bun:test';
import { ArtifactEvaluationRepository } from './artifact-evaluation.repo';

describe('ArtifactEvaluationRepository', () => {
  const mockRow = {
    id: 'ae-1',
    artifactType: 'story',
    artifactId: 'S-1',
    artifactVersion: 1,
    evaluationModel: 'gpt-4',
    overallScore: '95.00',
    dimensionScores: [{ dimension: 'quality', score: 95, reasoning: 'Good' }],
    rawLlmResponse: { raw: 'data' },
    evaluatedBy: 'agent-1',
    evaluatedAt: new Date(),
    orgId: 'org-1',
    projectId: 'proj-1',
  };

  it('creates and returns artifact evaluation', async () => {
    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [mockRow],
        }),
      }),
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const result = await repo.create({
      id: 'ae-1',
      artifactType: 'story',
      artifactId: 'S-1',
      artifactVersion: 1,
      evaluationModel: 'gpt-4',
      overallScore: '95.00',
      dimensionScores: [{ dimension: 'quality', score: 95, reasoning: 'Good' }],
      rawLlmResponse: { raw: 'data' },
      evaluatedBy: 'agent-1',
      evaluatedAt: new Date(),
      orgId: 'org-1',
      projectId: 'proj-1',
    });

    expect(result.id).toBe('ae-1');
    expect(result.artifactType).toBe('story');
    expect(result.overallScore).toBe('95.00');
    expect(result.evaluatedBy).toBe('agent-1');
  });

  it('finds artifact evaluation by id', async () => {
    const dbMock = {
      query: {
        artifactEvaluations: {
          findFirst: async () => mockRow,
        },
      },
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const result = await repo.findById('ae-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('ae-1');
    expect(result?.artifactType).toBe('story');
    expect(result?.overallScore).toBe('95.00');
  });

  it('finds artifact evaluation by id returns null when not found', async () => {
    const dbMock = {
      query: {
        artifactEvaluations: {
          findFirst: async () => null,
        },
      },
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const result = await repo.findById('ae-missing');

    expect(result).toBeNull();
  });

  it('finds evaluations by artifact type and id', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'ae-2',
      artifactVersion: 2,
      overallScore: '92.00',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const results = await repo.findByArtifact('story', 'S-1');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('ae-1');
    expect(results[1].id).toBe('ae-2');
    expect(results[0].artifactId).toBe('S-1');
    expect(results[1].artifactId).toBe('S-1');
  });

  it('finds evaluations by artifact type, id, and version', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow],
        }),
      }),
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const results = await repo.findByArtifactVersion('story', 'S-1', 1);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('ae-1');
    expect(results[0].artifactVersion).toBe(1);
    expect(results[0].artifactId).toBe('S-1');
    expect(results[0].artifactType).toBe('story');
  });

  it('lists all evaluations by organization', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'ae-2',
      artifactId: 'S-2',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const results = await repo.listByOrg('org-1');

    expect(results).toHaveLength(2);
    expect(results[0].orgId).toBe('org-1');
    expect(results[1].orgId).toBe('org-1');
    expect(results[0].id).toBe('ae-1');
    expect(results[1].id).toBe('ae-2');
  });

  it('returns empty array when no evaluations found for organization', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const results = await repo.listByOrg('org-missing');

    expect(results).toHaveLength(0);
  });

  it('returns empty array when no evaluations found by artifact', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const results = await repo.findByArtifact('epic', 'E-missing');

    expect(results).toHaveLength(0);
  });

  it('returns empty array when no evaluations found by artifact version', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new ArtifactEvaluationRepository(dbMock as never);
    const results = await repo.findByArtifactVersion('story', 'S-1', 99);

    expect(results).toHaveLength(0);
  });
});
