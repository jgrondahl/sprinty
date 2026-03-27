import { describe, expect, it } from 'bun:test';
import { StageTransitionRepository } from './stage-transition.repo';

describe('StageTransitionRepository', () => {
  const mockRow = {
    id: 'trans-1',
    artifactType: 'story',
    artifactId: 'S-1',
    fromStage: 'draft',
    toStage: 'planned',
    triggeredBy: 'user-1',
    approvals: [{ userId: 'u1', role: 'admin', decision: 'approved', justification: 'LGTM', timestamp: '2024-01-01' }],
    evaluationId: null,
    evidenceIds: ['ev-1'],
    transitionedAt: new Date(),
    metadata: null,
  };

  it('creates and returns stage transition', async () => {
    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [mockRow],
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const result = await repo.create({
      id: 'trans-1',
      artifactType: 'story',
      artifactId: 'S-1',
      fromStage: 'draft',
      toStage: 'planned',
      triggeredBy: 'user-1',
      approvals: [{ userId: 'u1', role: 'admin', decision: 'approved', justification: 'LGTM', timestamp: '2024-01-01' }],
      evaluationId: null,
      evidenceIds: ['ev-1'],
      transitionedAt: new Date(),
      metadata: null,
    });

    expect(result.id).toBe('trans-1');
    expect(result.artifactType).toBe('story');
    expect(result.artifactId).toBe('S-1');
    expect(result.fromStage).toBe('draft');
    expect(result.toStage).toBe('planned');
  });

  it('finds stage transition by id', async () => {
    const dbMock = {
      query: {
        stageTransitions: {
          findFirst: async () => mockRow,
        },
      },
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const result = await repo.findById('trans-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('trans-1');
    expect(result?.artifactType).toBe('story');
    expect(result?.artifactId).toBe('S-1');
  });

  it('finds stage transition by id returns null when not found', async () => {
    const dbMock = {
      query: {
        stageTransitions: {
          findFirst: async () => null,
        },
      },
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const result = await repo.findById('trans-missing');

    expect(result).toBeNull();
  });

  it('finds stage transitions by artifact type and id', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'trans-2',
      toStage: 'in_progress',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.findByArtifact('story', 'S-1');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('trans-1');
    expect(results[1].id).toBe('trans-2');
    expect(results[0].artifactType).toBe('story');
    expect(results[0].artifactId).toBe('S-1');
  });

  it('returns empty array when no transitions found by artifact', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.findByArtifact('epic', 'E-missing');

    expect(results).toHaveLength(0);
  });

  it('finds stage transitions by fromStage', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'trans-2',
      artifactId: 'S-2',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.findByFromStage('draft');

    expect(results).toHaveLength(2);
    expect(results[0].fromStage).toBe('draft');
    expect(results[1].fromStage).toBe('draft');
  });

  it('returns empty array when no transitions found by fromStage', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.findByFromStage('unknown');

    expect(results).toHaveLength(0);
  });

  it('finds stage transitions by toStage', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'trans-2',
      artifactId: 'S-2',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.findByToStage('planned');

    expect(results).toHaveLength(2);
    expect(results[0].toStage).toBe('planned');
    expect(results[1].toStage).toBe('planned');
  });

  it('returns empty array when no transitions found by toStage', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.findByToStage('unknown');

    expect(results).toHaveLength(0);
  });

  it('gets transition history ordered by transitionedAt', async () => {
    const date1 = new Date('2024-01-01');
    const date2 = new Date('2024-01-02');
    const mockRow1 = {
      ...mockRow,
      id: 'trans-1',
      transitionedAt: date1,
    };
    const mockRow2 = {
      ...mockRow,
      id: 'trans-2',
      transitionedAt: date2,
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => [mockRow1, mockRow2],
          }),
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.getTransitionHistory('story', 'S-1');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('trans-1');
    expect(results[1].id).toBe('trans-2');
    expect(results[0].transitionedAt.getTime()).toBeLessThanOrEqual(results[1].transitionedAt.getTime());
  });

  it('returns empty array when no transition history found', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      }),
    };

    const repo = new StageTransitionRepository(dbMock as never);
    const results = await repo.getTransitionHistory('story', 'S-missing');

    expect(results).toHaveLength(0);
  });
});
