import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { webApiClient } from '../lib/api-client';

export function RetrospectivePage() {
  const params = useParams<{ projectId: string; sprintId: string }>();
  const projectId = params.projectId;
  const sprintId = params.sprintId;
  const { session } = useAuth();

  const [wentWell, setWentWell] = useState('');
  const [needsImprovement, setNeedsImprovement] = useState('');
  const [actionItems, setActionItems] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!session?.token || !projectId || !sprintId) return;

    const wellItems = wentWell
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const improveItems = needsImprovement
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const actions = actionItems
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (wellItems.length === 0) {
      setFormError('At least one "went well" item is required');
      return;
    }
    if (improveItems.length === 0) {
      setFormError('At least one "needs improvement" item is required');
      return;
    }
    if (actions.length === 0) {
      setFormError('At least one action item is required');
      return;
    }

    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const result = await webApiClient.createRetrospective(session.token, projectId, sprintId, {
        sprintId,
        wentWell: wellItems,
        needsImprovement: improveItems,
        actionItems: actions,
      });
      setSuccess(`Retrospective recorded (version ${result.version})`);
      setWentWell('');
      setNeedsImprovement('');
      setActionItems('');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Sprint Retrospective</h1>
          <p>Sprint: {sprintId}</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to={`/projects/${projectId}`}>Back to project</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16 }}>
        <h2>Retrospective</h2>
        {formError ? <p style={{ color: 'crimson' }}>{formError}</p> : null}
        {success ? <p style={{ color: 'green' }}>{success}</p> : null}

        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            What went well (one per line) *
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              placeholder={'Good thing 1\nGood thing 2'}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={4}
            />
          </label>
          <label>
            Needs improvement (one per line) *
            <textarea
              value={needsImprovement}
              onChange={(e) => setNeedsImprovement(e.target.value)}
              placeholder={'Improvement 1\nImprovement 2'}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={4}
            />
          </label>
          <label>
            Action items (one per line) *
            <textarea
              value={actionItems}
              onChange={(e) => setActionItems(e.target.value)}
              placeholder={'Action 1\nAction 2'}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={4}
            />
          </label>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ marginTop: 8, padding: '6px 16px' }}
          >
            {submitting ? 'Submitting...' : 'Submit Retrospective'}
          </button>
        </div>
      </section>
    </main>
  );
}
