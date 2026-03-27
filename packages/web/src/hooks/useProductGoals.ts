import { useEffect, useState } from 'react';
import { webApiClient } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { ProductGoal, CreateProductGoalInput } from '../lib/api-client';

export function useProductGoals(projectId: string | undefined) {
  const { session } = useAuth();
  const [goals, setGoals] = useState<ProductGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadGoals() {
    if (!session?.token || !projectId) {
      setGoals([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await webApiClient.listProductGoals(session.token, projectId);
      setGoals(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session?.token || !projectId) {
        setGoals([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await webApiClient.listProductGoals(session.token, projectId);
        if (!cancelled) {
          setGoals(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [session?.token, projectId]);

  async function createGoal(data: CreateProductGoalInput) {
    if (!session?.token || !projectId) return;
    await webApiClient.createProductGoal(session.token, projectId, data);
    await loadGoals();
  }

  async function updateGoal(goalId: string, data: Partial<ProductGoal>) {
    if (!session?.token) return;
    await webApiClient.updateProductGoal(session.token, goalId, data);
    await loadGoals();
  }

  return { goals, loading, error, createGoal, updateGoal };
}
