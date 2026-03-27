import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBacklog } from '../hooks/useBacklog';

const readinessColors: Record<string, string> = {
  ready: '#d4edda',
  refinement_needed: '#fff3cd',
  not_ready: '#f8d7da',
};

const readinessLabels: Record<string, string> = {
  ready: 'Ready',
  refinement_needed: 'Refinement Needed',
  not_ready: 'Not Ready',
};

export function BacklogPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { stories, total, loading, error, refineStory, filter, setFilter } = useBacklog(projectId);

  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [editReadiness, setEditReadiness] = useState('');
  const [editSortOrder, setEditSortOrder] = useState('');
  const [refineError, setRefineError] = useState<string | null>(null);

  function handleStoryClick(storyId: string, readiness?: string, sortOrder?: number) {
    if (selectedStoryId === storyId) {
      setSelectedStoryId(null);
      return;
    }
    setSelectedStoryId(storyId);
    setEditReadiness(readiness ?? '');
    setEditSortOrder(sortOrder !== undefined ? String(sortOrder) : '');
    setRefineError(null);
  }

  async function handleSaveRefine() {
    if (!selectedStoryId) return;
    setRefineError(null);

    const patch: { sortOrder?: number; readiness?: string } = {};
    if (editReadiness) patch.readiness = editReadiness;
    if (editSortOrder !== '') patch.sortOrder = Number(editSortOrder);

    try {
      await refineStory(selectedStoryId, patch);
      setSelectedStoryId(null);
    } catch (err) {
      setRefineError((err as Error).message);
    }
  }

  function handleFilterChange(readiness?: string) {
    setFilter({ ...filter, readiness });
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Product Backlog</h1>
          <p>{total} stories total</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to={`/projects/${projectId}`}>Back to project</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section style={{ margin: '12px 0', display: 'flex', gap: 8 }}>
        <button
          onClick={() => handleFilterChange(undefined)}
          style={{ padding: '4px 12px', fontWeight: !filter.readiness ? 'bold' : 'normal' }}
        >
          All
        </button>
        <button
          onClick={() => handleFilterChange('not_ready')}
          style={{ padding: '4px 12px', fontWeight: filter.readiness === 'not_ready' ? 'bold' : 'normal' }}
        >
          Not Ready
        </button>
        <button
          onClick={() => handleFilterChange('refinement_needed')}
          style={{ padding: '4px 12px', fontWeight: filter.readiness === 'refinement_needed' ? 'bold' : 'normal' }}
        >
          Refinement Needed
        </button>
        <button
          onClick={() => handleFilterChange('ready')}
          style={{ padding: '4px 12px', fontWeight: filter.readiness === 'ready' ? 'bold' : 'normal' }}
        >
          Ready
        </button>
      </section>

      {loading ? <p>Loading backlog...</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      {!loading && !error ? (
        <section style={{ display: 'grid', gap: 8 }}>
          {stories.map((story) => (
            <article key={story.id}>
              <div
                onClick={() => handleStoryClick(story.id, story.readiness, story.sortOrder)}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  padding: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong>{story.title}</strong>
                  <span style={{ marginLeft: 8, color: '#666' }}>{story.state}</span>
                  {typeof story.storyPoints === 'number' ? (
                    <span style={{ marginLeft: 8, color: '#888' }}>{story.storyPoints} pts</span>
                  ) : null}
                </div>
                {story.readiness ? (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      backgroundColor: readinessColors[story.readiness] ?? '#eee',
                    }}
                  >
                    {readinessLabels[story.readiness] ?? story.readiness}
                  </span>
                ) : null}
              </div>

              {selectedStoryId === story.id ? (
                <div style={{ border: '1px solid #ccc', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 12, backgroundColor: '#fafafa' }}>
                  {refineError ? <p style={{ color: 'crimson' }}>{refineError}</p> : null}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                    <label>
                      Readiness
                      <select
                        value={editReadiness}
                        onChange={(e) => setEditReadiness(e.target.value)}
                        style={{ display: 'block', marginTop: 4 }}
                      >
                        <option value="">—</option>
                        <option value="not_ready">Not Ready</option>
                        <option value="refinement_needed">Refinement Needed</option>
                        <option value="ready">Ready</option>
                      </select>
                    </label>
                    <label>
                      Sort Order
                      <input
                        type="number"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(e.target.value)}
                        style={{ display: 'block', width: 80, marginTop: 4 }}
                        min={0}
                      />
                    </label>
                    <button onClick={handleSaveRefine} style={{ padding: '4px 16px' }}>
                      Save
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
          {stories.length === 0 ? <p>No stories in backlog.</p> : null}
        </section>
      ) : null}
    </main>
  );
}
