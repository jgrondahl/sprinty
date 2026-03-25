import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProjectDetails } from '../hooks/useProjectDetails';
import { useSprintStream } from '../hooks/useSprintStream';

export function SprintViewerPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { stories } = useProjectDetails(projectId);

  const sprintCandidate = useMemo(() => {
    const found = stories.find((story) => story.state === 'IN_PROGRESS' || story.state === 'IN_REVIEW');
    return found?.id;
  }, [stories]);

  const [sprintId, setSprintId] = useState<string>(sprintCandidate ?? '');
  const { events, connected } = useSprintStream(sprintId || undefined);

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
    </main>
  );
}
