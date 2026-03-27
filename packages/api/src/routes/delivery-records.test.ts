import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createDeliveryRecord, listDeliveryRecords, getDeliveryRecord } from './delivery-records';

function makeRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body && { body: JSON.stringify(body) }),
  });
}

describe('delivery-records routes', () => {
  const adminAuth = { userId: 'user-1', orgId: 'org-1', role: 'admin' as const };
  const viewerAuth = { userId: 'user-2', orgId: 'org-1', role: 'viewer' as const };

  it('createDeliveryRecord returns 201 with valid payload', async () => {
    let insertedRecord: any = null;
    let insertedArtifact: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
          if (input.environment) {
            insertedRecord = {
              id: 'dr-1',
              ...input,
              deploymentResult: 'pending',
              createdAt: new Date(),
            };
            return {
              returning: async () => [insertedRecord],
            };
          }
          if (input.artifactType) {
            insertedArtifact = {
              id: 'av-1',
              ...input,
              createdAt: new Date(),
            };
            return {
              returning: async () => [insertedArtifact],
            };
          }
          return {
            returning: async () => [{ id: 'audit-1', ...input }],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const response = await createDeliveryRecord(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records', {
        environment: 'production',
        deployedVersion: '1.2.3',
        evidenceReferences: ['link-1', 'link-2'],
      }),
      'proj-1',
      dbMock,
      adminAuth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; environment: string };
    expect(body.id).toBe('dr-1');
    expect(body.environment).toBe('production');
  });

  it('createDeliveryRecord creates artifact_version with type=delivery_record', async () => {
    let insertedArtifact: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
          if (input.artifactType) {
            insertedArtifact = {
              id: 'av-1',
              ...input,
              createdAt: new Date(),
            };
            return {
              returning: async () => [insertedArtifact],
            };
          }
          if (input.environment) {
            return {
              returning: async () => [
                {
                  id: 'dr-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          return {
            returning: async () => [{ id: 'audit-1', ...input }],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    await createDeliveryRecord(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records', {
        environment: 'production',
        deployedVersion: '1.2.3',
      }),
      'proj-1',
      dbMock,
      adminAuth
    );

    expect(insertedArtifact).toBeTruthy();
    expect(insertedArtifact.artifactType).toBe('delivery_record');
    expect(insertedArtifact.version).toBe(1);
  });

  it('createDeliveryRecord creates lineage when releaseCandidateId provided', async () => {
    let insertedLineage: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
          if (input.parentType) {
            insertedLineage = {
              id: 'lineage-1',
              ...input,
              createdAt: new Date(),
            };
            return {
              returning: async () => [insertedLineage],
            };
          }
          if (input.environment) {
            return {
              returning: async () => [
                {
                  id: 'dr-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          if (input.artifactType) {
            return {
              returning: async () => [
                {
                  id: 'av-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          return {
            returning: async () => [{ id: 'audit-1', ...input }],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    await createDeliveryRecord(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records', {
        environment: 'production',
        deployedVersion: '1.2.3',
        releaseCandidateId: 'rc-1',
      }),
      'proj-1',
      dbMock,
      adminAuth
    );

    expect(insertedLineage).toBeTruthy();
    expect(insertedLineage.parentType).toBe('release_candidate');
    expect(insertedLineage.parentId).toBe('rc-1');
    expect(insertedLineage.childType).toBe('delivery_record');
    expect(insertedLineage.childId).toBe('av-1');
    expect(insertedLineage.relationshipType).toBe('derived_from');
  });

  it('createDeliveryRecord does NOT create lineage when releaseCandidateId not provided', async () => {
    let lineageAttempted = false;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
          if (input.parentType) {
            lineageAttempted = true;
          }
          if (input.environment) {
            return {
              returning: async () => [
                {
                  id: 'dr-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          if (input.artifactType) {
            return {
              returning: async () => [
                {
                  id: 'av-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          return {
            returning: async () => [{ id: 'audit-1', ...input }],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    await createDeliveryRecord(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records', {
        environment: 'staging',
        deployedVersion: '1.0.0',
      }),
      'proj-1',
      dbMock,
      adminAuth
    );

    expect(lineageAttempted).toBe(false);
  });

  it('createDeliveryRecord appends audit with action=DELIVERY_RECORD_CREATED', async () => {
    let insertedAudit: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
          if (input.action) {
            insertedAudit = { id: 'audit-1', ...input };
          }
          if (input.environment) {
            return {
              returning: async () => [
                {
                  id: 'dr-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          if (input.artifactType) {
            return {
              returning: async () => [
                {
                  id: 'av-1',
                  ...input,
                  createdAt: new Date(),
                },
              ],
            };
          }
          return {
            returning: async () => [{ id: 'audit-1', ...input }],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    await createDeliveryRecord(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records', {
        environment: 'production',
        deployedVersion: '1.2.3',
      }),
      'proj-1',
      dbMock,
      adminAuth
    );

    expect(insertedAudit).toBeTruthy();
    expect(insertedAudit.action).toBe('DELIVERY_RECORD_CREATED');
    expect(insertedAudit.entityType).toBe('delivery_record');
    expect(insertedAudit.entityId).toBe('dr-1');
    expect(insertedAudit.orgId).toBe('org-1');
    expect(insertedAudit.userId).toBe('user-1');
  });

  it('listDeliveryRecords returns 200 with records array', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 'dr-1', environment: 'production', deployedVersion: '1.2.3' },
            { id: 'dr-2', environment: 'staging', deployedVersion: '1.2.2' },
          ],
        }),
      }),
    } as never as DbClient;

    const response = await listDeliveryRecords(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records'),
      'proj-1',
      dbMock,
      adminAuth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { records: Array<{ id: string; environment: string }> };
    expect(body.records).toHaveLength(2);
    expect(body.records[0].id).toBe('dr-1');
    expect(body.records[1].environment).toBe('staging');
  });

  it('listDeliveryRecords filters by environment when query param provided', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [
            { id: 'dr-1', environment: 'production', deployedVersion: '1.2.3' },
          ],
        }),
      }),
    } as never as DbClient;

    const response = await listDeliveryRecords(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records?environment=production'),
      'proj-1',
      dbMock,
      adminAuth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { records: Array<{ id: string; environment: string }> };
    expect(body.records).toHaveLength(1);
    expect(body.records[0].environment).toBe('production');
  });

  it('getDeliveryRecord returns 200 with record', async () => {
    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => ({
            id: 'dr-1',
            environment: 'production',
            deployedVersion: '1.2.3',
            deploymentResult: 'success',
          }),
        },
      },
    } as never as DbClient;

    const response = await getDeliveryRecord(
      makeRequest('http://localhost/api/delivery-records/dr-1'),
      'dr-1',
      dbMock,
      adminAuth
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: string; environment: string; deploymentResult: string };
    expect(body.id).toBe('dr-1');
    expect(body.environment).toBe('production');
    expect(body.deploymentResult).toBe('success');
  });

  it('getDeliveryRecord throws NotFoundError when record not found', async () => {
    const dbMock = {
      query: {
        deliveryRecords: {
          findFirst: async () => null,
        },
      },
    } as never as DbClient;

    await expect(async () => {
      await getDeliveryRecord(
        makeRequest('http://localhost/api/delivery-records/dr-999'),
        'dr-999',
        dbMock,
        adminAuth
      );
    }).toThrow('Delivery record not found');
  });

  it('createDeliveryRecord as VIEWER throws ForbiddenError', async () => {
    const dbMock = {} as never as DbClient;

    await expect(async () => {
      await createDeliveryRecord(
        makeRequest('http://localhost/api/projects/proj-1/delivery-records', {
          environment: 'production',
          deployedVersion: '1.0.0',
        }),
        'proj-1',
        dbMock,
        viewerAuth
      );
    }).toThrow();
  });

  it('listDeliveryRecords as VIEWER returns 200', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [{ id: 'dr-1', environment: 'production' }],
        }),
      }),
    } as never as DbClient;

    const response = await listDeliveryRecords(
      makeRequest('http://localhost/api/projects/proj-1/delivery-records'),
      'proj-1',
      dbMock,
      viewerAuth
    );

    expect(response.status).toBe(200);
  });

  it('createDeliveryRecord with missing required fields throws validation error', async () => {
    const dbMock = {} as never as DbClient;

    await expect(async () => {
      await createDeliveryRecord(
        makeRequest('http://localhost/api/projects/proj-1/delivery-records', {
          environment: 'production',
        }),
        'proj-1',
        dbMock,
        adminAuth
      );
    }).toThrow();
  });
});
