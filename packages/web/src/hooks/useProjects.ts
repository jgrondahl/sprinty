import { useEffect, useState } from 'react';
import { webApiClient } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';

export type ProjectSummary = {
  id: string;
  name: string;
  description: string;
};

export function useProjects() {
  const { session } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session?.token) {
        setProjects([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await webApiClient.listProjects(session.token);
        if (!cancelled) {
          setProjects(data.projects);
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
  }, [session?.token]);

  return { projects, loading, error };
}
