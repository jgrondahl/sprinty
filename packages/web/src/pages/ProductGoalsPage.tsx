import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useProductGoals } from '../hooks/useProductGoals';
import type { CreateProductGoalInput } from '../lib/api-client';

export function ProductGoalsPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { goals, loading, error, createGoal, updateGoal } = useProductGoals(projectId);

  const [title, setTitle] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [targetUsers, setTargetUsers] = useState('');
  const [successMeasures, setSuccessMeasures] = useState('');
  const [businessConstraints, setBusinessConstraints] = useState('');
  const [nonGoals, setNonGoals] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate() {
    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }

    setFormError(null);
    const data: CreateProductGoalInput = {
      title: title.trim(),
      problemStatement: problemStatement.trim() || undefined,
      targetUsers: targetUsers.trim() || undefined,
      successMeasures: successMeasures.trim()
        ? successMeasures.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      businessConstraints: businessConstraints.trim()
        ? businessConstraints.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      nonGoals: nonGoals.trim()
        ? nonGoals.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
    };

    try {
      await createGoal(data);
      setTitle('');
      setProblemStatement('');
      setTargetUsers('');
      setSuccessMeasures('');
      setBusinessConstraints('');
      setNonGoals('');
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function handleStatusChange(goalId: string, approvalStatus: string) {
    try {
      await updateGoal(goalId, { approvalStatus });
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Product Goals</h1>
          <p>{goals.length} goal{goals.length !== 1 ? 's' : ''}</p>
        </div>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to={`/projects/${projectId}`}>Back to project</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </header>

      {loading ? <p>Loading goals...</p> : null}
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginTop: 16 }}>
        <h2>Create Goal</h2>
        {formError ? <p style={{ color: 'crimson' }}>{formError}</p> : null}
        <div style={{ display: 'grid', gap: 8 }}>
          <label>
            Title *
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Goal title"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Problem Statement
            <textarea
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
              placeholder="What problem does this solve?"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
              rows={2}
            />
          </label>
          <label>
            Target Users
            <input
              value={targetUsers}
              onChange={(e) => setTargetUsers(e.target.value)}
              placeholder="Who benefits from this?"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Success Measures (comma-separated)
            <input
              value={successMeasures}
              onChange={(e) => setSuccessMeasures(e.target.value)}
              placeholder="Metric 1, Metric 2"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Business Constraints (comma-separated)
            <input
              value={businessConstraints}
              onChange={(e) => setBusinessConstraints(e.target.value)}
              placeholder="Constraint 1, Constraint 2"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <label>
            Non-Goals (comma-separated)
            <input
              value={nonGoals}
              onChange={(e) => setNonGoals(e.target.value)}
              placeholder="Non-goal 1, Non-goal 2"
              style={{ display: 'block', width: '100%', marginTop: 4 }}
            />
          </label>
          <button onClick={handleCreate} style={{ marginTop: 8, padding: '6px 16px' }}>
            Create Goal
          </button>
        </div>
      </section>

      {!loading && !error ? (
        <section style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {goals.map((goal) => (
            <article key={goal.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>{goal.title}</h3>
                  {goal.problemStatement ? <p style={{ margin: '0 0 4px', color: '#555' }}>{goal.problemStatement}</p> : null}
                </div>
                <select
                  value={goal.approvalStatus}
                  onChange={(e) => handleStatusChange(goal.id, e.target.value)}
                  style={{ padding: '4px 8px' }}
                >
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {goal.successMeasures.length > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <strong>Success Measures:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {goal.successMeasures.map((measure, i) => (
                      <li key={i}>{measure}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
          {goals.length === 0 ? <p>No product goals yet.</p> : null}
        </section>
      ) : null}
    </main>
  );
}
