import { describe, expect, it } from 'bun:test';
import { GateDefinitionRepository } from './gate-definition.repo';

describe('GateDefinitionRepository', () => {
  const mockRow = {
    id: 'gate-1',
    fromStage: 'draft',
    toStage: 'planned',
    requiredEvidence: [{ type: 'review', description: 'Code review' }],
    requiredApprovals: [{ role: 'admin', count: 1 }],
    autoPassThreshold: '90.00',
    disqualifyingConditions: {},
    orgId: 'org-1',
    projectId: 'proj-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('creates and returns gate definition', async () => {
    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [mockRow],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const result = await repo.create({
      id: 'gate-1',
      fromStage: 'draft',
      toStage: 'planned',
      requiredEvidence: [{ type: 'review', description: 'Code review' }],
      requiredApprovals: [{ role: 'admin', count: 1 }],
      autoPassThreshold: '90.00',
      disqualifyingConditions: {},
      orgId: 'org-1',
      projectId: 'proj-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(result.id).toBe('gate-1');
    expect(result.fromStage).toBe('draft');
    expect(result.toStage).toBe('planned');
    expect(result.autoPassThreshold).toBe('90.00');
  });

  it('finds gate definition by id', async () => {
    const dbMock = {
      query: {
        gateDefinitions: {
          findFirst: async () => mockRow,
        },
      },
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const result = await repo.findById('gate-1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('gate-1');
    expect(result?.fromStage).toBe('draft');
    expect(result?.toStage).toBe('planned');
  });

  it('finds gate definition by id returns null when not found', async () => {
    const dbMock = {
      query: {
        gateDefinitions: {
          findFirst: async () => null,
        },
      },
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const result = await repo.findById('gate-missing');

    expect(result).toBeNull();
  });

  it('finds gate definitions by transition (from and to stages)', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'gate-2',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.findByTransition('draft', 'planned');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('gate-1');
    expect(results[1].id).toBe('gate-2');
    expect(results[0].fromStage).toBe('draft');
    expect(results[0].toStage).toBe('planned');
  });

  it('returns empty array when no gates found by transition', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.findByTransition('draft', 'unknown');

    expect(results).toHaveLength(0);
  });

  it('finds gate definitions by fromStage only', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'gate-2',
      toStage: 'in_progress',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.findByFromStage('draft');

    expect(results).toHaveLength(2);
    expect(results[0].fromStage).toBe('draft');
    expect(results[1].fromStage).toBe('draft');
  });

  it('lists all gate definitions without filter', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'gate-2',
      orgId: 'org-2',
    };

    const dbMock = {
      select: () => ({
        from: () => [mockRow, mockRow2],
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.listAll();

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
  });

  it('lists all gate definitions filtered by orgId', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'gate-2',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.listAll('org-1');

    expect(results).toHaveLength(2);
    expect(results[0].orgId).toBe('org-1');
    expect(results[1].orgId).toBe('org-1');
  });

  it('lists gate definitions by projectId', async () => {
    const mockRow2 = {
      ...mockRow,
      id: 'gate-2',
    };

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [mockRow, mockRow2],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.listByProject('proj-1');

    expect(results).toHaveLength(2);
    expect(results[0].projectId).toBe('proj-1');
    expect(results[1].projectId).toBe('proj-1');
  });

  it('returns empty array when no gates found by fromStage', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.findByFromStage('unknown');

    expect(results).toHaveLength(0);
  });

  it('returns empty array when no gates found by projectId', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const repo = new GateDefinitionRepository(dbMock as never);
    const results = await repo.listByProject('proj-missing');

    expect(results).toHaveLength(0);
  });
});
