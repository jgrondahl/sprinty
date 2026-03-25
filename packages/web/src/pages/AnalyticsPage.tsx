import { Link } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics';

function renderVelocityBars(points: Array<{ projectName: string; averageVelocity: number }>) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {points.map((point) => {
        const width = Math.max(8, Math.round(point.averageVelocity * 8));
        return (
          <div key={point.projectName}>
            <div style={{ fontSize: 13 }}>{point.projectName} · {point.averageVelocity.toFixed(1)} pts</div>
            <div style={{ background: '#f2f4f7', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width, background: '#4f46e5', height: 10 }} />
            </div>
          </div>
        );
      })}
      {points.length === 0 ? <p>No velocity data yet.</p> : null}
    </div>
  );
}

function renderBurndown(trends: Array<{ month: string; completedPoints: number; plannedPoints: number }>) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Month</th>
          <th style={{ textAlign: 'right' }}>Completed</th>
          <th style={{ textAlign: 'right' }}>Planned</th>
          <th style={{ textAlign: 'right' }}>Delta</th>
        </tr>
      </thead>
      <tbody>
        {trends.map((row) => (
          <tr key={row.month}>
            <td>{row.month}</td>
            <td style={{ textAlign: 'right' }}>{row.completedPoints}</td>
            <td style={{ textAlign: 'right' }}>{row.plannedPoints}</td>
            <td style={{ textAlign: 'right' }}>{row.completedPoints - row.plannedPoints}</td>
          </tr>
        ))}
        {trends.length === 0 ? (
          <tr>
            <td colSpan={4}>No burndown data yet.</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function AnalyticsPage() {
  const { projects, trends, loading, error } = useMetrics();

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Analytics</h1>
          <p>Velocity and burndown overview</p>
        </div>
        <Link to="/dashboard">Back to dashboard</Link>
      </header>

      {loading ? <p>Loading analytics...</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {!loading && !error ? (
        <section style={{ display: 'grid', gap: 16 }}>
          <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <h2>Velocity</h2>
            {renderVelocityBars(
              projects.map((project) => ({
                projectName: project.projectName,
                averageVelocity: project.averageVelocity,
              }))
            )}
          </article>

          <article style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
            <h2>Burndown trend</h2>
            {renderBurndown(trends)}
          </article>
        </section>
      ) : null}
    </main>
  );
}
