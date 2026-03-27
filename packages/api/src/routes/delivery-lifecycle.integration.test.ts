import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { createDeliveryRecord, listDeliveryRecords, getDeliveryRecord } from './delivery-records';
import { attachSbom } from './sbom';
import { createAttestation } from './attestations';
import { createPostDeliveryReview } from './post-delivery-reviews';
import type { AuthContext } from '../auth/middleware';

const PROJECT_ID = 'project-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';

const auth: AuthContext = {
  userId: USER_ID,
  orgId: ORG_ID,
  role: 'admin',
};

function makeRequest(url: string, body: unknown, method = 'POST'): Request {
  if (method === 'GET') {
    return new Request(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  }
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createDeliveryDbMock() {
  const auditEntries: Array<Record<string, unknown>> = [];
  const lineageEntries: Array<Record<string, unknown>> = [];
  const artifactVersions: Array<Record<string, unknown>> = [];
  const deliveryRecords: Array<Record<string, unknown>> = [];

  let idCounter = 0;
  function nextId(prefix: string) {
    return `${prefix}-${++idCounter}`;
  }

  const db = {
    insert: (table: unknown) => ({
      values: (input: Record<string, unknown>) => ({
        returning: async () => {
          if ('action' in input && 'entityType' in input) {
            const entry = { id: nextId('audit'), ...input, createdAt: new Date().toISOString() };
            auditEntries.push(entry);
            return [entry];
          }
          if ('parentType' in input && 'childType' in input) {
            const entry = { id: nextId('lineage'), ...input, createdAt: new Date().toISOString() };
            lineageEntries.push(entry);
            return [entry];
          }
          if ('artifactType' in input && 'snapshotData' in input) {
            const entry = { id: nextId('av'), ...input, createdAt: new Date().toISOString() };
            artifactVersions.push(entry);
            return [entry];
          }
          if ('environment' in input && 'deployedVersion' in input) {
            const record = { id: nextId('dr'), ...input, createdAt: new Date().toISOString() };
            deliveryRecords.push(record);
            return [record];
          }
          return [{ id: nextId('unknown'), ...input }];
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: async () => [],
      }),
    }),
    query: {
      deliveryRecords: {
        findFirst: async (opts?: { where?: unknown }) => deliveryRecords[0] ?? null,
        findMany: async () => deliveryRecords,
      },
      webhooks: {
        findMany: async () => [],
      },
    },
  } as never as DbClient;

  return { db, auditEntries, lineageEntries, artifactVersions, deliveryRecords };
}

describe('Delivery Provenance lifecycle integration', () => {
  it('Step 1: Create delivery record returns 201 with environment and evidence', async () => {
    const mock = createDeliveryDbMock();
    const response = await createDeliveryRecord(
      makeRequest(`http://localhost/api/projects/${PROJECT_ID}/delivery-records`, {
        environment: 'staging',
        deployedVersion: 'v1.2.3',
        releaseCandidateId: 'rc-1',
        evidenceReferences: ['https://ci.example.com/build/100'],
      }),
      PROJECT_ID,
      mock.db,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; environment: string; deployedVersion: string };
    expect(body.environment).toBe('staging');
    expect(body.deployedVersion).toBe('v1.2.3');
    expect(body.id).toBeString();

    expect(mock.deliveryRecords.length).toBe(1);
    expect(mock.artifactVersions.length).toBe(1);
    expect(mock.artifactVersions[0]?.artifactType).toBe('delivery_record');

    expect(mock.auditEntries.length).toBe(1);
    expect(mock.auditEntries[0]?.action).toBe('DELIVERY_RECORD_CREATED');
  });

  it('Step 2: Delivery record with releaseCandidateId creates lineage', async () => {
    const mock = createDeliveryDbMock();
    await createDeliveryRecord(
      makeRequest(`http://localhost/api/projects/${PROJECT_ID}/delivery-records`, {
        environment: 'production',
        deployedVersion: 'v1.2.3',
        releaseCandidateId: 'rc-42',
        evidenceReferences: [],
      }),
      PROJECT_ID,
      mock.db,
      auth
    );

    const rcLineage = mock.lineageEntries.find(
      e => e.parentType === 'release_candidate' && e.childType === 'delivery_record'
    );
    expect(rcLineage).toBeDefined();
    expect(rcLineage?.parentId).toBe('rc-42');
    expect(rcLineage?.relationshipType).toBe('derived_from');
  });

  it('Step 3: Attach SBOM returns 201 with verified_by lineage', async () => {
    const mock = createDeliveryDbMock();
    const releaseCandidateId = 'rc-1';

    const response = await attachSbom(
      makeRequest(`http://localhost/api/release-candidates/${releaseCandidateId}/sbom`, {
        format: 'CycloneDX',
        version: '1.5',
        components: [
          { name: 'express', version: '4.18.2', type: 'library', license: 'MIT' },
          { name: 'zod', version: '3.22.0', type: 'library', license: 'MIT' },
        ],
        generatedAt: '2025-01-15T10:00:00Z',
        toolUsed: 'syft',
        hash: 'sha256:abc123',
      }),
      releaseCandidateId,
      mock.db,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; artifactType: string };
    expect(body.artifactType).toBe('sbom_manifest');

    const sbomLineage = mock.lineageEntries.find(e => e.childType === 'sbom_manifest');
    expect(sbomLineage).toBeDefined();
    expect(sbomLineage?.parentType).toBe('release_candidate');
    expect(sbomLineage?.parentId).toBe(releaseCandidateId);
    expect(sbomLineage?.relationshipType).toBe('verified_by');

    expect(mock.auditEntries[0]?.action).toBe('SBOM_ATTACHED');
  });

  it('Step 4: Attach attestation returns 201 with verified_by lineage', async () => {
    const mock = createDeliveryDbMock();
    const releaseCandidateId = 'rc-1';

    const response = await createAttestation(
      makeRequest(`http://localhost/api/release-candidates/${releaseCandidateId}/attest`, {
        format: 'in-toto',
        builderId: 'github-actions/build',
        buildStartedAt: '2025-01-15T09:00:00Z',
        buildFinishedAt: '2025-01-15T09:15:00Z',
        sourceDigest: 'sha256:src123',
        outputDigest: 'sha256:out456',
        reproducible: true,
        signingMethod: 'cosign',
        signature: 'sig-data-here',
      }),
      releaseCandidateId,
      mock.db,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; artifactType: string };
    expect(body.artifactType).toBe('provenance_attestation');

    const attLineage = mock.lineageEntries.find(e => e.childType === 'provenance_attestation');
    expect(attLineage).toBeDefined();
    expect(attLineage?.parentType).toBe('release_candidate');
    expect(attLineage?.relationshipType).toBe('verified_by');

    expect(mock.auditEntries[0]?.action).toBe('ATTESTATION_CREATED');
  });

  it('Step 5: Create post-delivery review returns 201 with derived_from lineage', async () => {
    const mock = createDeliveryDbMock();

    // Create delivery record first so the findById mock resolves
    await createDeliveryRecord(
      makeRequest(`http://localhost/api/projects/${PROJECT_ID}/delivery-records`, {
        environment: 'production',
        deployedVersion: 'v1.2.3',
        evidenceReferences: [],
      }),
      PROJECT_ID,
      mock.db,
      auth
    );

    const deliveryId = mock.deliveryRecords[0]?.id as string;

    const response = await createPostDeliveryReview(
      makeRequest(`http://localhost/api/delivery-records/${deliveryId}/post-review`, {
        deliveryRecordId: deliveryId,
        reviewedAt: '2025-01-16T12:00:00Z',
        reviewedBy: 'ops-lead',
        healthChecks: [
          { name: 'API response time', status: 'pass', details: 'p99 < 200ms' },
          { name: 'Error rate', status: 'pass', details: '< 0.1%' },
        ],
        performanceBaseline: [
          { metric: 'response_time_p99', expected: 200, actual: 150 },
          { metric: 'error_rate', expected: 0.1, actual: 0.05 },
        ],
        issues: [],
        followUpStoryIds: [],
      }),
      deliveryId,
      mock.db,
      auth
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; artifactType: string };
    expect(body.artifactType).toBe('post_delivery_review');

    const pdrLineage = mock.lineageEntries.find(e => e.childType === 'post_delivery_review');
    expect(pdrLineage).toBeDefined();
    expect(pdrLineage?.parentType).toBe('delivery_record');
    expect(pdrLineage?.parentId).toBe(deliveryId);
    expect(pdrLineage?.relationshipType).toBe('derived_from');

    expect(mock.auditEntries.some(e => e.action === 'POST_DELIVERY_REVIEW_CREATED')).toBe(true);
  });

  it('Step 6: Post-delivery review contains structured evidence (not narrative-only)', async () => {
    const mock = createDeliveryDbMock();

    await createDeliveryRecord(
      makeRequest(`http://localhost/api/projects/${PROJECT_ID}/delivery-records`, {
        environment: 'production',
        deployedVersion: 'v2.0.0',
        evidenceReferences: ['https://ci.example.com/build/200'],
      }),
      PROJECT_ID,
      mock.db,
      auth
    );

    const deliveryId = mock.deliveryRecords[0]?.id as string;

    await createPostDeliveryReview(
      makeRequest(`http://localhost/api/delivery-records/${deliveryId}/post-review`, {
        deliveryRecordId: deliveryId,
        reviewedAt: '2025-01-16T14:00:00Z',
        reviewedBy: 'sre-team',
        healthChecks: [
          { name: 'Database connectivity', status: 'pass' },
          { name: 'Memory usage', status: 'fail', details: 'Above threshold' },
        ],
        performanceBaseline: [
          { metric: 'cpu_utilization', expected: 60, actual: 55 },
          { metric: 'memory_mb', expected: 512, actual: 620 },
        ],
        issues: ['Memory above baseline'],
        followUpStoryIds: ['story-fix-mem'],
      }),
      deliveryId,
      mock.db,
      auth
    );

    const pdrArtifact = mock.artifactVersions.find(a => a.artifactType === 'post_delivery_review');
    expect(pdrArtifact).toBeDefined();
    const snapshot = pdrArtifact?.snapshotData as Record<string, unknown>;

    // Verify structured healthChecks (array, not freeform text)
    expect(Array.isArray(snapshot.healthChecks)).toBe(true);
    const checks = snapshot.healthChecks as Array<{ name: string; status: string }>;
    expect(checks.length).toBe(2);
    expect(checks[0]?.name).toBe('Database connectivity');
    expect(checks[0]?.status).toBe('pass');

    // Verify structured performanceBaseline (expected vs actual metrics)
    expect(Array.isArray(snapshot.performanceBaseline)).toBe(true);
    const baselines = snapshot.performanceBaseline as Array<{ metric: string; expected: number; actual: number }>;
    expect(baselines.length).toBe(2);
    expect(baselines[0]?.metric).toBe('cpu_utilization');
    expect(typeof baselines[0]?.expected).toBe('number');
    expect(typeof baselines[0]?.actual).toBe('number');
  });

  it('Step 7: Full delivery lifecycle audit trail', async () => {
    const mock = createDeliveryDbMock();
    const rcId = 'rc-full';

    await createDeliveryRecord(
      makeRequest(`http://localhost/api/projects/${PROJECT_ID}/delivery-records`, {
        environment: 'staging',
        deployedVersion: 'v3.0.0',
        releaseCandidateId: rcId,
        evidenceReferences: [],
      }),
      PROJECT_ID,
      mock.db,
      auth
    );

    await attachSbom(
      makeRequest(`http://localhost/api/release-candidates/${rcId}/sbom`, {
        format: 'SPDX',
        version: '2.3',
        components: [{ name: 'lib', version: '1.0', type: 'library' }],
        generatedAt: '2025-01-15T10:00:00Z',
        toolUsed: 'trivy',
        hash: 'sha256:xyz',
      }),
      rcId,
      mock.db,
      auth
    );

    await createAttestation(
      makeRequest(`http://localhost/api/release-candidates/${rcId}/attest`, {
        format: 'in-toto',
        builderId: 'ci/main',
        buildStartedAt: '2025-01-15T09:00:00Z',
        buildFinishedAt: '2025-01-15T09:10:00Z',
        sourceDigest: 'sha256:aaa',
        outputDigest: 'sha256:bbb',
        reproducible: false,
        signingMethod: 'keyless',
        signature: 'sig',
      }),
      rcId,
      mock.db,
      auth
    );

    const deliveryId = mock.deliveryRecords[0]?.id as string;
    await createPostDeliveryReview(
      makeRequest(`http://localhost/api/delivery-records/${deliveryId}/post-review`, {
        deliveryRecordId: deliveryId,
        reviewedAt: '2025-01-16T08:00:00Z',
        reviewedBy: 'ops',
        healthChecks: [{ name: 'ping', status: 'pass' }],
        performanceBaseline: [{ metric: 'latency', expected: 100, actual: 95 }],
        issues: [],
        followUpStoryIds: [],
      }),
      deliveryId,
      mock.db,
      auth
    );

    expect(mock.auditEntries.length).toBe(4);
    const actions = mock.auditEntries.map(e => e.action);
    expect(actions).toContain('DELIVERY_RECORD_CREATED');
    expect(actions).toContain('SBOM_ATTACHED');
    expect(actions).toContain('ATTESTATION_CREATED');
    expect(actions).toContain('POST_DELIVERY_REVIEW_CREATED');

    for (const entry of mock.auditEntries) {
      expect(entry.orgId).toBe(ORG_ID);
      expect(entry.userId).toBe(USER_ID);
    }
  });

  it('Step 8: Full delivery lineage chain verification', async () => {
    const mock = createDeliveryDbMock();
    const rcId = 'rc-chain';

    await createDeliveryRecord(
      makeRequest(`http://localhost/api/projects/${PROJECT_ID}/delivery-records`, {
        environment: 'production',
        deployedVersion: 'v4.0.0',
        releaseCandidateId: rcId,
        evidenceReferences: ['https://artifacts.example.com/sbom.json'],
      }),
      PROJECT_ID,
      mock.db,
      auth
    );

    await attachSbom(
      makeRequest(`http://localhost/api/release-candidates/${rcId}/sbom`, {
        format: 'CycloneDX',
        version: '1.5',
        components: [{ name: 'pkg', version: '2.0', type: 'library' }],
        generatedAt: '2025-01-15T11:00:00Z',
        toolUsed: 'syft',
        hash: 'sha256:sbom',
      }),
      rcId,
      mock.db,
      auth
    );

    await createAttestation(
      makeRequest(`http://localhost/api/release-candidates/${rcId}/attest`, {
        format: 'SLSA',
        builderId: 'gh-actions',
        buildStartedAt: '2025-01-15T10:00:00Z',
        buildFinishedAt: '2025-01-15T10:20:00Z',
        sourceDigest: 'sha256:s1',
        outputDigest: 'sha256:o1',
        reproducible: true,
        signingMethod: 'cosign',
        signature: 'verified-sig',
      }),
      rcId,
      mock.db,
      auth
    );

    const deliveryId = mock.deliveryRecords[0]?.id as string;
    await createPostDeliveryReview(
      makeRequest(`http://localhost/api/delivery-records/${deliveryId}/post-review`, {
        deliveryRecordId: deliveryId,
        reviewedAt: '2025-01-17T09:00:00Z',
        reviewedBy: 'platform-eng',
        healthChecks: [{ name: 'uptime', status: 'pass' }],
        performanceBaseline: [{ metric: 'rps', expected: 1000, actual: 1200 }],
        issues: [],
        followUpStoryIds: [],
      }),
      deliveryId,
      mock.db,
      auth
    );

    // delivery_record → release_candidate (derived_from)
    const drToRc = mock.lineageEntries.find(
      e => e.parentType === 'release_candidate' && e.childType === 'delivery_record'
    );
    expect(drToRc).toBeDefined();
    expect(drToRc?.parentId).toBe(rcId);

    // sbom → release_candidate (verified_by)
    const sbomToRc = mock.lineageEntries.find(
      e => e.parentType === 'release_candidate' && e.childType === 'sbom_manifest'
    );
    expect(sbomToRc).toBeDefined();
    expect(sbomToRc?.relationshipType).toBe('verified_by');

    // attestation → release_candidate (verified_by)
    const attToRc = mock.lineageEntries.find(
      e => e.parentType === 'release_candidate' && e.childType === 'provenance_attestation'
    );
    expect(attToRc).toBeDefined();
    expect(attToRc?.relationshipType).toBe('verified_by');

    // post_delivery_review → delivery_record (derived_from)
    const pdrToDr = mock.lineageEntries.find(
      e => e.parentType === 'delivery_record' && e.childType === 'post_delivery_review'
    );
    expect(pdrToDr).toBeDefined();
    expect(pdrToDr?.parentId).toBe(deliveryId);
    expect(pdrToDr?.relationshipType).toBe('derived_from');
  });

  it('Step 9: Post-delivery review for non-existent delivery record throws NotFoundError', async () => {
    const mock = createDeliveryDbMock();
    // No delivery records created — findById returns null

    try {
      await createPostDeliveryReview(
        makeRequest(`http://localhost/api/delivery-records/nonexistent/post-review`, {
          deliveryRecordId: 'nonexistent',
          reviewedAt: '2025-01-16T12:00:00Z',
          reviewedBy: 'nobody',
          healthChecks: [],
          performanceBaseline: [],
          issues: [],
          followUpStoryIds: [],
        }),
        'nonexistent',
        mock.db,
        auth
      );
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe('Delivery record not found');
    }
  });
});
