import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { attachSbom } from './sbom';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('sbom routes', () => {
  it('creates SBOM artifact with valid payload and returns 201', async () => {
    let insertedArtifact: any = null;
    let insertedLineage: any = null;
    let insertedAudit: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
          if (input.artifactType) {
            insertedArtifact = {
              id: 'av-sbom-1',
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
      format: 'CycloneDX',
      version: '1.4',
      components: [
        {
          name: 'react',
          version: '18.2.0',
          type: 'library',
          license: 'MIT',
        },
        {
          name: 'typescript',
          version: '5.0.4',
          type: 'library',
        },
      ],
      generatedAt: '2026-03-27T12:00:00Z',
      toolUsed: 'cyclonedx-cli',
      hash: 'sha256:abc123...',
    };

    const response = await attachSbom(
      makeRequest('http://localhost/api/release-candidates/rc-1/sbom', payload),
      'rc-1',
      dbMock,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as any;
    expect(body.id).toBe('av-sbom-1');
    expect(body.artifactType).toBe('sbom_manifest');
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
                  id: 'av-sbom-1',
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
      format: 'CycloneDX',
      version: '1.4',
      components: [
        {
          name: 'react',
          version: '18.2.0',
          type: 'library',
        },
      ],
      generatedAt: '2026-03-27T12:00:00Z',
      toolUsed: 'cyclonedx-cli',
      hash: 'sha256:abc123...',
    };

    await attachSbom(
      makeRequest('http://localhost/api/release-candidates/rc-1/sbom', payload),
      'rc-1',
      dbMock,
      auth
    );

    expect(insertedLineage).toBeTruthy();
    expect(insertedLineage.parentType).toBe('release_candidate');
    expect(insertedLineage.parentId).toBe('rc-1');
    expect(insertedLineage.childType).toBe('sbom_manifest');
    expect(insertedLineage.childId).toBe('av-sbom-1');
    expect(insertedLineage.relationshipType).toBe('verified_by');
  });

  it('appends audit record with action SBOM_ATTACHED', async () => {
    let insertedAudit: any = null;

    const dbMock = {
      insert: () => ({
        values: (input: any) => {
          if (input.artifactType) {
            return {
              returning: async () => [
                {
                  id: 'av-sbom-1',
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
      format: 'CycloneDX',
      version: '1.4',
      components: [
        {
          name: 'react',
          version: '18.2.0',
          type: 'library',
        },
      ],
      generatedAt: '2026-03-27T12:00:00Z',
      toolUsed: 'cyclonedx-cli',
      hash: 'sha256:abc123...',
    };

    await attachSbom(
      makeRequest('http://localhost/api/release-candidates/rc-1/sbom', payload),
      'rc-1',
      dbMock,
      auth
    );

    expect(insertedAudit).toBeTruthy();
    expect(insertedAudit.action).toBe('SBOM_ATTACHED');
    expect(insertedAudit.entityType).toBe('artifact_version');
    expect(insertedAudit.entityId).toBe('av-sbom-1');
    expect(insertedAudit.orgId).toBe('org-1');
    expect(insertedAudit.userId).toBe('user-1');
  });

  it('throws validation error when components field is missing', async () => {
    const dbMock = {} as never as DbClient;

    const auth = {
      userId: 'user-1',
      orgId: 'org-1',
      role: 'admin' as const,
    };

    const invalidPayload = {
      format: 'CycloneDX',
      version: '1.4',
      // Missing required 'components' field
      generatedAt: '2026-03-27T12:00:00Z',
      toolUsed: 'cyclonedx-cli',
      hash: 'sha256:abc123...',
    };

    await expect(
      attachSbom(
        makeRequest('http://localhost/api/release-candidates/rc-1/sbom', invalidPayload),
        'rc-1',
        dbMock,
        auth
      )
    ).rejects.toThrow();
  });

  it('returns artifactType as sbom_manifest', async () => {
    const dbMock = {
      insert: () => ({
        values: (input: any) => ({
          returning: async () => [
            {
              id: 'av-sbom-1',
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
      format: 'CycloneDX',
      version: '1.4',
      components: [
        {
          name: 'react',
          version: '18.2.0',
          type: 'library',
        },
      ],
      generatedAt: '2026-03-27T12:00:00Z',
      toolUsed: 'cyclonedx-cli',
      hash: 'sha256:abc123...',
    };

    const response = await attachSbom(
      makeRequest('http://localhost/api/release-candidates/rc-1/sbom', payload),
      'rc-1',
      dbMock,
      auth
    );

    const body = (await response.json()) as any;
    expect(body.artifactType).toBe('sbom_manifest');
  });
});
