import { describe, expect, it } from 'bun:test';
import type { DbClient } from '../db';
import { ProductGoalRepository } from './product-goal.repo';

describe('ProductGoalRepository', () => {
  it('create inserts and returns the product goal', async () => {
    const mockRow = {
      id: 'goal-1',
      projectId: 'proj-1',
      orgId: 'org-1',
      title: 'Improve user retention',
      problemStatement: 'Users churn after first week',
      targetUsers: 'New signups',
      successMeasures: ['Reduce churn by 20%'],
      businessConstraints: ['Budget under $50k'],
      nonGoals: ['Enterprise features'],
      approvedBy: null,
      approvalStatus: 'draft',
      sourceArtifacts: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [mockRow],
        }),
      }),
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    const result = await repo.create({
      projectId: 'proj-1',
      orgId: 'org-1',
      title: 'Improve user retention',
    });

    expect(result).toEqual(mockRow);
  });

  it('findById returns product goal when found', async () => {
    const mockRow = {
      id: 'goal-1',
      projectId: 'proj-1',
      orgId: 'org-1',
      title: 'Test Goal',
      problemStatement: '',
      targetUsers: '',
      successMeasures: [],
      businessConstraints: [],
      nonGoals: [],
      approvedBy: null,
      approvalStatus: 'draft',
      sourceArtifacts: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dbMock = {
      query: {
        productGoals: {
          findFirst: async () => mockRow,
        },
      },
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    const result = await repo.findById('goal-1', 'org-1');

    expect(result).toEqual(mockRow);
  });

  it('findById returns null when not found', async () => {
    const dbMock = {
      query: {
        productGoals: {
          findFirst: async () => undefined,
        },
      },
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    const result = await repo.findById('nonexistent', 'org-1');

    expect(result).toBeNull();
  });

  it('findByProjectId returns all goals for project', async () => {
    const mockRows = [
      {
        id: 'goal-1',
        projectId: 'proj-1',
        orgId: 'org-1',
        title: 'Goal 1',
        problemStatement: '',
        targetUsers: '',
        successMeasures: [],
        businessConstraints: [],
        nonGoals: [],
        approvedBy: null,
        approvalStatus: 'draft',
        sourceArtifacts: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'goal-2',
        projectId: 'proj-1',
        orgId: 'org-1',
        title: 'Goal 2',
        problemStatement: '',
        targetUsers: '',
        successMeasures: [],
        businessConstraints: [],
        nonGoals: [],
        approvedBy: null,
        approvalStatus: 'approved',
        sourceArtifacts: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockRows,
        }),
      }),
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    const result = await repo.findByProjectId('proj-1', 'org-1');

    expect(result).toEqual(mockRows);
    expect(result).toHaveLength(2);
  });

  it('update modifies and returns updated goal', async () => {
    const updatedRow = {
      id: 'goal-1',
      projectId: 'proj-1',
      orgId: 'org-1',
      title: 'Updated Title',
      problemStatement: 'Updated problem',
      targetUsers: '',
      successMeasures: [],
      businessConstraints: [],
      nonGoals: [],
      approvedBy: null,
      approvalStatus: 'draft',
      sourceArtifacts: [],
      version: 2,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date(),
    };

    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [updatedRow],
          }),
        }),
      }),
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    const result = await repo.update('goal-1', 'org-1', {
      title: 'Updated Title',
      problemStatement: 'Updated problem',
      version: 2,
    });

    expect(result).toEqual(updatedRow);
    expect(result?.title).toBe('Updated Title');
  });

  it('update sets updatedAt to new Date', async () => {
    let capturedSetArg: Record<string, unknown> | undefined;

    const dbMock = {
      update: () => ({
        set: (arg: Record<string, unknown>) => {
          capturedSetArg = arg;
          return {
            where: () => ({
              returning: async () => [{ id: 'goal-1', updatedAt: new Date() }],
            }),
          };
        },
      }),
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    await repo.update('goal-1', 'org-1', { title: 'Test' });

    expect(capturedSetArg?.['updatedAt']).toBeInstanceOf(Date);
  });

  it('update returns null when goal not found', async () => {
    const dbMock = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    const result = await repo.update('nonexistent', 'org-1', { title: 'Test' });

    expect(result).toBeNull();
  });

  it('findByApprovalStatus returns all goals with matching status', async () => {
    const mockRows = [
      {
        id: 'goal-1',
        projectId: 'proj-1',
        orgId: 'org-1',
        title: 'Goal 1',
        problemStatement: '',
        targetUsers: '',
        successMeasures: [],
        businessConstraints: [],
        nonGoals: [],
        approvedBy: 'user-1',
        approvalStatus: 'approved',
        sourceArtifacts: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'goal-2',
        projectId: 'proj-2',
        orgId: 'org-1',
        title: 'Goal 2',
        problemStatement: '',
        targetUsers: '',
        successMeasures: [],
        businessConstraints: [],
        nonGoals: [],
        approvedBy: 'user-2',
        approvalStatus: 'approved',
        sourceArtifacts: [],
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockRows,
        }),
      }),
    };

    const repo = new ProductGoalRepository(dbMock as never as DbClient);
    const result = await repo.findByApprovalStatus('approved', 'org-1');

    expect(result).toEqual(mockRows);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.approvalStatus === 'approved')).toBe(true);
  });
});
