import { describe, expect, it } from 'bun:test';
import type { DbClient } from '../db';
import { DeliveryRecordRepository } from './delivery-record.repo';

describe('DeliveryRecordRepository', () => {
  it('create inserts and returns the delivery record', async () => {
    const mockRow = {
      id: 'record-1',
      projectId: 'proj-1',
      orgId: 'org-1',
      releaseCandidateId: 'rc-1',
      incrementId: 'inc-1',
      environment: 'production',
      deployedVersion: 'v1.2.3',
      deploymentWindow: { start: '2024-01-01T00:00:00Z', end: '2024-01-01T01:00:00Z' },
      approvedBy: 'user-1',
      deploymentResult: 'pending',
      rollbackReference: null,
      evidenceReferences: [],
      createdAt: new Date(),
    };

    const dbMock = {
      insert: () => ({
        values: () => ({
          returning: async () => [mockRow],
        }),
      }),
    };

    const repo = new DeliveryRecordRepository(dbMock as never as DbClient);
    const result = await repo.create({
      projectId: 'proj-1',
      orgId: 'org-1',
      environment: 'production',
      deployedVersion: 'v1.2.3',
    });

    expect(result).toEqual(mockRow);
  });

  it('findById returns delivery record when found', async () => {
    const mockRow = {
      id: 'record-1',
      projectId: 'proj-1',
      orgId: 'org-1',
      releaseCandidateId: null,
      incrementId: null,
      environment: 'staging',
      deployedVersion: 'v1.0.0',
      deploymentWindow: null,
      approvedBy: null,
      deploymentResult: 'success',
      rollbackReference: null,
      evidenceReferences: [],
      createdAt: new Date(),
    };

    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => mockRow,
        },
      },
    };

    const repo = new DeliveryRecordRepository(dbMock as never as DbClient);
    const result = await repo.findById('record-1', 'org-1');

    expect(result).toEqual(mockRow);
  });

  it('findById returns null when not found', async () => {
    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => undefined,
        },
      },
    };

    const repo = new DeliveryRecordRepository(dbMock as never as DbClient);
    const result = await repo.findById('nonexistent', 'org-1');

    expect(result).toBeNull();
  });

  it('findByProjectId returns all delivery records for project', async () => {
    const mockRows = [
      {
        id: 'record-1',
        projectId: 'proj-1',
        orgId: 'org-1',
        releaseCandidateId: 'rc-1',
        incrementId: null,
        environment: 'production',
        deployedVersion: 'v1.0.0',
        deploymentWindow: null,
        approvedBy: null,
        deploymentResult: 'success',
        rollbackReference: null,
        evidenceReferences: [],
        createdAt: new Date(),
      },
      {
        id: 'record-2',
        projectId: 'proj-1',
        orgId: 'org-1',
        releaseCandidateId: 'rc-2',
        incrementId: null,
        environment: 'staging',
        deployedVersion: 'v1.1.0',
        deploymentWindow: null,
        approvedBy: null,
        deploymentResult: 'pending',
        rollbackReference: null,
        evidenceReferences: [],
        createdAt: new Date(),
      },
    ];

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockRows,
        }),
      }),
    };

    const repo = new DeliveryRecordRepository(dbMock as never as DbClient);
    const result = await repo.findByProjectId('proj-1', 'org-1');

    expect(result).toEqual(mockRows);
    expect(result).toHaveLength(2);
  });

  it('findByEnvironment returns only matching environment records', async () => {
    const mockRows = [
      {
        id: 'record-1',
        projectId: 'proj-1',
        orgId: 'org-1',
        releaseCandidateId: 'rc-1',
        incrementId: null,
        environment: 'production',
        deployedVersion: 'v1.0.0',
        deploymentWindow: null,
        approvedBy: null,
        deploymentResult: 'success',
        rollbackReference: null,
        evidenceReferences: [],
        createdAt: new Date(),
      },
      {
        id: 'record-2',
        projectId: 'proj-1',
        orgId: 'org-1',
        releaseCandidateId: 'rc-2',
        incrementId: null,
        environment: 'production',
        deployedVersion: 'v1.1.0',
        deploymentWindow: null,
        approvedBy: null,
        deploymentResult: 'pending',
        rollbackReference: null,
        evidenceReferences: [],
        createdAt: new Date(),
      },
    ];

    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => mockRows,
        }),
      }),
    };

    const repo = new DeliveryRecordRepository(dbMock as never as DbClient);
    const result = await repo.findByEnvironment('proj-1', 'production', 'org-1');

    expect(result).toEqual(mockRows);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.environment === 'production')).toBe(true);
  });

  it('updateResult changes deploymentResult', async () => {
    const updatedRow = {
      id: 'record-1',
      projectId: 'proj-1',
      orgId: 'org-1',
      releaseCandidateId: 'rc-1',
      incrementId: null,
      environment: 'production',
      deployedVersion: 'v1.0.0',
      deploymentWindow: null,
      approvedBy: null,
      deploymentResult: 'success',
      rollbackReference: null,
      evidenceReferences: [],
      createdAt: new Date('2024-01-01'),
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

    const repo = new DeliveryRecordRepository(dbMock as never as DbClient);
    const result = await repo.updateResult('record-1', 'org-1', 'success');

    expect(result).toEqual(updatedRow);
    expect(result.deploymentResult).toBe('success');
  });

  it('updateResult with rollbackRef sets rollbackReference', async () => {
    const updatedRow = {
      id: 'record-1',
      projectId: 'proj-1',
      orgId: 'org-1',
      releaseCandidateId: 'rc-1',
      incrementId: null,
      environment: 'production',
      deployedVersion: 'v1.0.0',
      deploymentWindow: null,
      approvedBy: null,
      deploymentResult: 'rollback',
      rollbackReference: 'v0.9.0',
      evidenceReferences: [],
      createdAt: new Date('2024-01-01'),
    };

    let capturedSetArg: Record<string, unknown> | undefined;

    const dbMock = {
      update: () => ({
        set: (arg: Record<string, unknown>) => {
          capturedSetArg = arg;
          return {
            where: () => ({
              returning: async () => [updatedRow],
            }),
          };
        },
      }),
    };

    const repo = new DeliveryRecordRepository(dbMock as never as DbClient);
    const result = await repo.updateResult('record-1', 'org-1', 'rollback', 'v0.9.0');

    expect(result).toEqual(updatedRow);
    expect(result.rollbackReference).toBe('v0.9.0');
    expect(capturedSetArg?.['rollbackReference']).toBe('v0.9.0');
  });
});
