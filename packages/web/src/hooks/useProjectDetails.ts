import { useEffect, useState } from 'react';
import { webApiClient } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';

export type EpicSummary = {
  id: string;
  title: string;
  status: string;
};

export type StorySummary = {
  id: string;
  title: string;
  state: string;
  storyPoints?: number;
};

export function useProjectDetails(projectId: string | undefined) {
  const { session } = useAuth();
  const [epics, setEpics] = useState<EpicSummary[]>([]);
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session?.token || !projectId) {
        setEpics([]);
        setStories([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [epicData, storyData] = await Promise.all([
          webApiClient.listEpics(session.token, projectId),
          webApiClient.listStories(session.token, projectId),
        ]);

        if (!cancelled) {
          setEpics(epicData.epics);
          setStories(storyData.stories);
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

  return { epics, stories, loading, error };
}
