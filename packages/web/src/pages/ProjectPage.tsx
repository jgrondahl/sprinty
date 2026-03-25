import { Link, useParams } from 'react-router-dom';
import { useProjectDetails } from '../hooks/useProjectDetails';

export function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { epics, stories, loading, error } = useProjectDetails(projectId);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Project {projectId}</h1>
          <p>{epics.length} epics · {stories.length} stories</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/dashboard">Back to dashboard</Link>
          <Link to={`/projects/${projectId}/sprint`}>Sprint viewer</Link>
        </nav>
      </header>

      {loading ? <p>Loading project details...</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {!loading && !error ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <h2>Epics</h2>
            <ul>
              {epics.map((epic) => (
                <li key={epic.id}>
                  {epic.title} · <strong>{epic.status}</strong>
                </li>
              ))}
              {epics.length === 0 ? <li>No epics</li> : null}
            </ul>
          </article>

          <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <h2>Stories</h2>
            <ul>
              {stories.map((story) => (
                <li key={story.id}>
                  {story.title} · <strong>{story.state}</strong>
                  {typeof story.storyPoints === 'number' ? ` · ${story.storyPoints} pts` : ''}
                </li>
              ))}
              {stories.length === 0 ? <li>No stories</li> : null}
            </ul>
          </article>
        </section>
      ) : null}
    </main>
  );
}
