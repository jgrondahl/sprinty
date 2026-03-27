import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { webApiClient } from '../lib/api-client';

export function SprintReviewPage() {
  const params = useParams<{ projectId: string; sprintId: string }>();
  const projectId = params.projectId;
  const sprintId = params.sprintId;
  const { session } = useAuth();

  const [incrementId, setIncrementId] = useState('');
  const [stakeholderFeedback, setStakeholderFeedback] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [feedbackActionItems, setFeedbackActionItems] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!session?.token || !projectId || !sprintId) return;

    if (!incrementId.trim()) {
      setFormError('Increment ID is required');
      return;
    }

    const feedback = stakeholderFeedback
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (feedback.length === 0) {
      setFormError('At least one stakeholder feedback item is required');
      return;
    }

    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    const actionItems = feedbackActionItems
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const result = await webApiClient.createSprintReview(session.token, projectId, sprintId, {
        incrementId: incrementId.trim(),
        stakeholderFeedback: feedback,
        accepted,
        feedbackActionItems: actionItems.length > 0 ? actionItems : undefined,
      });
      setSuccess(`Sprint review recorded (version ${result.version})`);
      setIncrementId('');
      setStakeholderFeedback('');
      setAccepted(false);
      setFeedbackActionItems('');
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
          <h1>Sprint Review</h1>
          <p>Sprint: {sprintId}</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to={`/projects/${projectId}`}>Back to project</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <p style={{ background: '#fff3cd', padding: '8px 12px', borderRadius: 4, marginTop: 12, border: '1px solid #ffc107' }}>
        Sprint Review is an evaluation — not a release gate.
      </p>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16 }}>
        <h2>Review Details</h2>
        {formError ? <p style={{ color: 'crimson' }}>{formError}</p> : null}
        {success ? <p style={{ color: 'green' }}>{success}</p> : null}

        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            Increment ID *
            <input
              value={incrementId}
              onChange={(e) => setIncrementId(e.target.value)}
              placeholder="ID of the increment to review"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Stakeholder Feedback (one per line) *
            <textarea
              value={stakeholderFeedback}
              onChange={(e) => setStakeholderFeedback(e.target.value)}
              placeholder={'Feedback item 1\nFeedback item 2'}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={4}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            Accepted
          </label>
          <label>
            Feedback Action Items (one per line)
            <textarea
              value={feedbackActionItems}
              onChange={(e) => setFeedbackActionItems(e.target.value)}
              placeholder={'Action item 1\nAction item 2'}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={3}
            />
          </label>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ marginTop: 8, padding: '6px 16px' }}
          >
            {submitting ? 'Submitting...' : 'Submit Sprint Review'}
          </button>
        </div>
      </section>
    </main>
  );
}
