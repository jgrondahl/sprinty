import { Link } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';
import { useAuth } from '../contexts/AuthContext';

export function DashboardPage() {
  const { session, logout } = useAuth();
  const { projects, loading, error } = useProjects();

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Dashboard</h1>
          <p>
            Signed in as <strong>{session?.user.email}</strong> ({session?.user.role})
          </p>
        </div>
        <button onClick={logout}>Log out</button>
      </header>

      <nav style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
        <Link to="/dashboard">Projects</Link>
        <Link to="/analytics">Analytics</Link>
      </nav>

      {loading ? <p>Loading projects...</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {!loading && !error ? (
        <ul style={{ display: 'grid', gap: 12, listStyle: 'none', padding: 0 }}>
          {projects.map((project) => (
            <li key={project.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <h3 style={{ marginTop: 0 }}>{project.name}</h3>
              <p>{project.description || 'No description'}</p>
              <Link to={`/projects/${project.id}`}>Open project</Link>
            </li>
          ))}
          {projects.length === 0 ? <li>No projects yet.</li> : null}
        </ul>
      ) : null}
    </main>
  );
}
