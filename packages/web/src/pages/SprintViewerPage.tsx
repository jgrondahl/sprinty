import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectDetails } from '../hooks/useProjectDetails';
import { useSprintStream } from '../hooks/useSprintStream';
import { useAuth } from '../contexts/AuthContext';
import { webApiClient } from '../lib/api-client';
import type { BacklogStory } from '../lib/api-client';

export function SprintViewerPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { session } = useAuth();
  const { stories } = useProjectDetails(projectId);

  const sprintCandidate = useMemo(() => {
    const found = stories.find((story) => story.state === 'IN_PROGRESS' || story.state === 'IN_REVIEW');
    return found?.id;
  }, [stories]);

  const [sprintId, setSprintId] = useState<string>(sprintCandidate ?? '');
  const { events, connected } = useSprintStream(sprintId || undefined);

  const [availableStories, setAvailableStories] = useState<BacklogStory[]>([]);
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [sprintGoal, setSprintGoal] = useState('');
  const [planningLoading, setPlanningLoading] = useState(false);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [planningSuccess, setPlanningSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAvailable() {
      if (!session?.token || !projectId || !sprintId) {
        setAvailableStories([]);
        return;
      }

      try {
        const data = await webApiClient.getBacklog(session.token, projectId, { readiness: 'ready' });
        if (!cancelled) {
          setAvailableStories(data.stories);
        }
      } catch {
        if (!cancelled) {
          setAvailableStories([]);
        }
      }
    }

    void loadAvailable();

    return () => {
      cancelled = true;
    };
  }, [session?.token, projectId, sprintId]);

  function toggleStory(storyId: string) {
    setSelectedStoryIds((prev) =>
      prev.includes(storyId) ? prev.filter((id) => id !== storyId) : [...prev, storyId]
    );
  }

  async function handleAssign() {
    if (!session?.token || !projectId || !sprintId || selectedStoryIds.length === 0) return;

    setPlanningLoading(true);
    setPlanningError(null);
    setPlanningSuccess(null);

    try {
      const result = await webApiClient.assignStories(session.token, projectId, sprintId, {
        storyIds: selectedStoryIds,
        sprintGoal: sprintGoal.trim() || undefined,
      });
      setPlanningSuccess(`Assigned ${result.assignedStories.length} stories to sprint`);
      setSelectedStoryIds([]);
      setSprintGoal('');

      const data = await webApiClient.getBacklog(session.token, projectId, { readiness: 'ready' });
      setAvailableStories(data.stories);
    } catch (err) {
      setPlanningError((err as Error).message);
    } finally {
      setPlanningLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Sprint viewer</h1>
          <p>Live stream status: {connected ? 'Connected' : 'Disconnected'}</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to={`/projects/${projectId}`}>Back to project</Link>
          <Link to="/analytics">Analytics</Link>
        </nav>
      </header>

      <section style={{ margin: '12px 0' }}>
        <label>
          Sprint ID
          <input
            value={sprintId}
            onChange={(event) => setSprintId(event.target.value)}
            placeholder="Enter sprint ID"
            style={{ marginLeft: 8 }}
          />
        </label>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
        <h2>Events</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {events.map((event, index) => (
            <li key={`${event.timestamp}-${index}`} style={{ borderBottom: '1px solid #eee', paddingBottom: 8 }}>
              <strong>{event.type}</strong> · {event.timestamp}
              <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                {typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload, null, 2)}
              </pre>
            </li>
          ))}
          {events.length === 0 ? <li>No events yet.</li> : null}
        </ul>
      </section>

      {sprintId ? (
        <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16 }}>
          <h2>Sprint Planning</h2>

          {planningError ? <p style={{ color: 'crimson' }}>{planningError}</p> : null}
          {planningSuccess ? <p style={{ color: 'green' }}>{planningSuccess}</p> : null}

          <div style={{ marginBottom: 12 }}>
            <label>
              Sprint Goal
              <input
                value={sprintGoal}
                onChange={(e) => setSprintGoal(e.target.value)}
                placeholder="Enter sprint goal"
                style={{ display: 'block', width: '100%', marginTop: 4 }}
              />
            </label>
          </div>

          <h3>Available Stories (Ready)</h3>
          {availableStories.length === 0 ? (
            <p style={{ color: '#888' }}>No ready stories available for assignment.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
              {availableStories.map((story) => (
                <li key={story.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedStoryIds.includes(story.id)}
                    onChange={() => toggleStory(story.id)}
                  />
                  <span>{story.title}</span>
                  {typeof story.storyPoints === 'number' ? (
                    <span style={{ color: '#888', fontSize: 12 }}>{story.storyPoints} pts</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={handleAssign}
            disabled={planningLoading || selectedStoryIds.length === 0}
            style={{ marginTop: 12, padding: '6px 16px' }}
          >
            {planningLoading ? 'Assigning...' : `Assign ${selectedStoryIds.length} Selected Stories`}
          </button>
        </section>
      ) : null}
    </main>
  );
}
