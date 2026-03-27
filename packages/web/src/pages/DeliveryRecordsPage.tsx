import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDeliveryRecords } from '../hooks/useDeliveryRecords';
import type { CreateDeliveryRecordInput } from '../lib/api-client';

const ENV_BADGE_COLORS: Record<string, string> = {
  production: '#f8d7da',
  staging: '#fff3cd',
};

function envBadgeColor(environment: string): string {
  return ENV_BADGE_COLORS[environment.toLowerCase()] ?? '#d1ecf1';
}

export function DeliveryRecordsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { records, loading, error, createRecord, environmentFilter, setEnvironmentFilter } =
    useDeliveryRecords(projectId);

  const [environment, setEnvironment] = useState('staging');
  const [deployedVersion, setDeployedVersion] = useState('');
  const [releaseCandidateId, setReleaseCandidateId] = useState('');
  const [incrementId, setIncrementId] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [evidenceReferences, setEvidenceReferences] = useState('');
  const [windowStart, setWindowStart] = useState('');
  const [windowEnd, setWindowEnd] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleCreate() {
    if (!deployedVersion.trim()) {
      setFormError('Deployed version is required');
      return;
    }

    setFormError(null);

    const data: CreateDeliveryRecordInput = {
      environment,
      deployedVersion: deployedVersion.trim(),
      releaseCandidateId: releaseCandidateId.trim() || undefined,
      incrementId: incrementId.trim() || undefined,
      approvedBy: approvedBy.trim() || undefined,
      evidenceReferences: evidenceReferences.trim()
        ? evidenceReferences
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
      deploymentWindow:
        windowStart.trim() && windowEnd.trim()
          ? { start: windowStart.trim(), end: windowEnd.trim() }
          : undefined,
    };

    try {
      await createRecord(data);
      setDeployedVersion('');
      setReleaseCandidateId('');
      setIncrementId('');
      setApprovedBy('');
      setEvidenceReferences('');
      setWindowStart('');
      setWindowEnd('');
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const filters: Array<{ label: string; value: string | undefined }> = [
    { label: 'All', value: undefined },
    { label: 'Staging', value: 'staging' },
    { label: 'Production', value: 'production' },
  ];

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Delivery Records</h1>
          <p>{records.length} record{records.length !== 1 ? 's' : ''}</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to={`/projects/${projectId}`}>Back to project</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      {loading ? <p>Loading records...</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {filters.map((f) => (
          <button
            key={f.label}
            onClick={() => setEnvironmentFilter(f.value)}
            style={{
              padding: '4px 12px',
              borderRadius: 4,
              border: '1px solid #ccc',
              background: environmentFilter === f.value ? '#007bff' : '#fff',
              color: environmentFilter === f.value ? '#fff' : '#333',
              cursor: 'pointer',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16 }}>
        <h2>Create Record</h2>
        {formError ? <p style={{ color: 'crimson' }}>{formError}</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            Environment *
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: '4px 8px' }}
            >
              <option value="staging">Staging</option>
              <option value="production">Production</option>
              <option value="development">Development</option>
            </select>
          </label>
          <label>
            Deployed Version *
            <input
              value={deployedVersion}
              onChange={(e) => setDeployedVersion(e.target.value)}
              placeholder="e.g. v1.2.3"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Release Candidate ID
            <input
              value={releaseCandidateId}
              onChange={(e) => setReleaseCandidateId(e.target.value)}
              placeholder="Optional"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Increment ID
            <input
              value={incrementId}
              onChange={(e) => setIncrementId(e.target.value)}
              placeholder="Optional"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Approved By
            <input
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
              placeholder="Optional"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Deployment Window Start
            <input
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
              placeholder="e.g. 2025-01-15T09:00:00Z"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Deployment Window End
            <input
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
              placeholder="e.g. 2025-01-15T12:00:00Z"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Evidence References (one per line)
            <textarea
              value={evidenceReferences}
              onChange={(e) => setEvidenceReferences(e.target.value)}
              placeholder={'https://ci.example.com/build/123\nhttps://artifacts.example.com/sbom.json'}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={3}
            />
          </label>
          <button onClick={handleCreate} style={{ marginTop: 8, padding: '6px 16px' }}>
            Create Record
          </button>
        </div>
      </section>

      {!loading && !error ? (
        <section style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {records.map((record) => (
            <article
              key={record.id}
              style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, cursor: 'pointer' }}
              onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      background: envBadgeColor(record.environment),
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {record.environment}
                  </span>
                  <strong>{record.deployedVersion}</strong>
                </div>
                <span style={{ color: '#888', fontSize: 12 }}>{record.createdAt}</span>
              </div>

              {expandedId === record.id ? (
                <div style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                  <p><strong>ID:</strong> {record.id}</p>
                  {record.releaseCandidateId ? <p><strong>Release Candidate:</strong> {record.releaseCandidateId}</p> : null}
                  {record.incrementId ? <p><strong>Increment:</strong> {record.incrementId}</p> : null}
                  {record.approvedBy ? <p><strong>Approved By:</strong> {record.approvedBy}</p> : null}
                  {record.deploymentWindow ? (
                    <p><strong>Window:</strong> {record.deploymentWindow.start} — {record.deploymentWindow.end}</p>
                  ) : null}
                  {record.evidenceReferences.length > 0 ? (
                    <div>
                      <strong>Evidence:</strong>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                        {record.evidenceReferences.map((ref, i) => (
                          <li key={i}>{ref}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
          {records.length === 0 ? <p>No delivery records yet.</p> : null}
        </section>
      ) : null}
    </main>
  );
}
