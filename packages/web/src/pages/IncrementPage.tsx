import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { webApiClient } from '../lib/api-client';

export function IncrementPage() {
  const params = useParams<{ projectId: string; sprintId: string }>();
  const projectId = params.projectId;
  const sprintId = params.sprintId;
  const { session } = useAuth();

  const [completedStoryIds, setCompletedStoryIds] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');
  const [velocityAchieved, setVelocityAchieved] = useState('');
  const [qualityNotes, setQualityNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!session?.token || !projectId || !sprintId) return;

    if (!completedStoryIds.trim()) {
      setFormError('At least one completed story ID is required');
      return;
    }
    if (!sprintGoal.trim()) {
      setFormError('Sprint goal is required');
      return;
    }
    const velocity = Number(velocityAchieved);
    if (!velocityAchieved.trim() || Number.isNaN(velocity)) {
      setFormError('Velocity achieved must be a number');
      return;
    }

    setFormError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const result = await webApiClient.createIncrement(session.token, projectId, sprintId, {
        completedStoryIds: completedStoryIds
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        sprintGoal: sprintGoal.trim(),
        velocityAchieved: velocity,
        qualityNotes: qualityNotes.trim() || undefined,
      });
      setSuccess(`Increment created (version ${result.version})`);
      setCompletedStoryIds('');
      setSprintGoal('');
      setVelocityAchieved('');
      setQualityNotes('');
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
          <h1>Create Increment</h1>
          <p>Sprint: {sprintId}</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to={`/projects/${projectId}`}>Back to project</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16 }}>
        <h2>Increment Details</h2>
        {formError ? <p style={{ color: 'crimson' }}>{formError}</p> : null}
        {success ? <p style={{ color: 'green' }}>{success}</p> : null}

        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            Completed Story IDs (one per line) *
            <textarea
              value={completedStoryIds}
              onChange={(e) => setCompletedStoryIds(e.target.value)}
              placeholder={'story-1\nstory-2'}
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={4}
            />
          </label>
          <label>
            Sprint Goal *
            <input
              value={sprintGoal}
              onChange={(e) => setSprintGoal(e.target.value)}
              placeholder="What was the sprint goal?"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Velocity Achieved *
            <input
              type="number"
              value={velocityAchieved}
              onChange={(e) => setVelocityAchieved(e.target.value)}
              placeholder="e.g. 21"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Quality Notes
            <textarea
              value={qualityNotes}
              onChange={(e) => setQualityNotes(e.target.value)}
              placeholder="Optional quality observations"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={2}
            />
          </label>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ marginTop: 8, padding: '6px 16px' }}
          >
            {submitting ? 'Creating...' : 'Create Increment'}
          </button>
        </div>
      </section>
    </main>
  );
}
