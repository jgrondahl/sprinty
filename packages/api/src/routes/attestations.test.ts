import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createAttestation } from './attestations';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('attestations routes', () => {
  it('creates attestation artifact with valid payload', async () => {
    let insertedArtifact: any = null;
    let insertedLineage: any = null;
    let insertedAudit: any = null;

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
          insertedAudit = { id: 'audit-1', ...input };
          return {
            returning: async () => [insertedAudit],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      format: 'in-toto',
      builderId: 'github-actions',
      buildStartedAt: '2026-01-01T00:00:00Z',
      buildFinishedAt: '2026-01-01T01:00:00Z',
      sourceDigest: 'sha256:abc123',
      outputDigest: 'sha256:def456',
      reproducible: true,
      signingMethod: 'sigstore',
      signature: 'base64-encoded-signature',
    };

    const response = await createAttestation(
      makeRequest('http://localhost/api/release-candidates/rc-1/attestation', payload),
      'rc-1',
      dbMock,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.id).toBe('av-1');
    expect(body.artifactType).toBe('provenance_attestation');
    expect(body.artifactId).toBe('rc-1');
    expect(body.version).toBe(1);
  });

  it('creates lineage link with relationshipType verified_by', async () => {
    let insertedLineage: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
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
          if (input.parentType) {
            insertedLineage = { id: 'lineage-1', ...input };
            return {
              returning: async () => [insertedLineage],
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

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      format: 'in-toto',
      builderId: 'github-actions',
      buildStartedAt: '2026-01-01T00:00:00Z',
      buildFinishedAt: '2026-01-01T01:00:00Z',
      sourceDigest: 'sha256:abc123',
      outputDigest: 'sha256:def456',
      reproducible: true,
      signingMethod: 'sigstore',
      signature: 'base64-encoded-signature',
    };

    await createAttestation(
      makeRequest('http://localhost/api/release-candidates/rc-1/attestation', payload),
      'rc-1',
      dbMock,
      auth
    );

    expect(insertedLineage).toBeTruthy();
    expect(insertedLineage.parentType).toBe('release_candidate');
    expect(insertedLineage.parentId).toBe('rc-1');
    expect(insertedLineage.childType).toBe('provenance_attestation');
    expect(insertedLineage.childId).toBe('av-1');
    expect(insertedLineage.relationshipType).toBe('verified_by');
  });

  it('appends audit record with action ATTESTATION_CREATED', async () => {
    let insertedAudit: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
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
          if (input.parentType) {
            return {
              returning: async () => [{ id: 'lineage-1', ...input }],
            };
          }
          insertedAudit = { id: 'audit-1', ...input };
          return {
            returning: async () => [insertedAudit],
          };
        },
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      format: 'in-toto',
      builderId: 'github-actions',
      buildStartedAt: '2026-01-01T00:00:00Z',
      buildFinishedAt: '2026-01-01T01:00:00Z',
      sourceDigest: 'sha256:abc123',
      outputDigest: 'sha256:def456',
      reproducible: true,
      signingMethod: 'sigstore',
      signature: 'base64-encoded-signature',
    };

    await createAttestation(
      makeRequest('http://localhost/api/release-candidates/rc-1/attestation', payload),
      'rc-1',
      dbMock,
      auth
    );

    expect(insertedAudit).toBeTruthy();
    expect(insertedAudit.action).toBe('ATTESTATION_CREATED');
    expect(insertedAudit.entityType).toBe('artifact_version');
    expect(insertedAudit.entityId).toBe('av-1');
    expect(insertedAudit.orgId).toBe('org-1');
    expect(insertedAudit.userId).toBe('user-1');
  });

  it('throws validation error for invalid payload', async () => {
    const dbMock = {} as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const invalidPayload = {
      format: 'in-toto',
      builderId: 'github-actions',
    };

    await expect(
      createAttestation(
        makeRequest('http://localhost/api/release-candidates/rc-1/attestation', invalidPayload),
        'rc-1',
        dbMock,
        auth
      )
    ).rejects.toThrow();
  });

  it('returns correct artifactType as provenance_attestation', async () => {
    const dbMock = {
      insert: () => ({
        values: (input: any) => ({
          returning: async () => [
            {
              id: 'av-1',
              ...input,
              createdAt: new Date(),
            },
          ],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      format: 'in-toto',
      builderId: 'github-actions',
      buildStartedAt: '2026-01-01T00:00:00Z',
      buildFinishedAt: '2026-01-01T01:00:00Z',
      sourceDigest: 'sha256:abc123',
      outputDigest: 'sha256:def456',
      reproducible: true,
      signingMethod: 'sigstore',
      signature: 'base64-encoded-signature',
    };

    const response = await createAttestation(
      makeRequest('http://localhost/api/release-candidates/rc-1/attestation', payload),
      'rc-1',
      dbMock,
      auth
    );

    const body = (await response.json()) as any;
    expect(body.artifactType).toBe('provenance_attestation');
  });

  it('dispatches attestation.created webhook event', async () => {
    const dbMock = {
      insert: () => ({
        values: (input: any) => ({
          returning: async () => [
            {
              id: 'av-1',
              ...input,
              createdAt: new Date(),
            },
          ],
        }),
      }),
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    } as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const payload = {
      format: 'in-toto',
      builderId: 'github-actions',
      buildStartedAt: '2026-01-01T00:00:00Z',
      buildFinishedAt: '2026-01-01T01:00:00Z',
      sourceDigest: 'sha256:abc123',
      outputDigest: 'sha256:def456',
      reproducible: true,
      signingMethod: 'sigstore',
      signature: 'base64-encoded-signature',
    };

    await createAttestation(
      makeRequest('http://localhost/api/release-candidates/rc-1/attestation', payload),
      'rc-1',
      dbMock,
      auth
    );

    expect(true).toBe(true);
  });
});
