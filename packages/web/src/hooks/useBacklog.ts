import { useCallback, useEffect, useState } from 'react';
import { webApiClient } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { BacklogStory } from '../lib/api-client';

export type BacklogFilter = {
  readiness?: string;
  limit?: number;
  offset?: number;
};

export function useBacklog(projectId: string | undefined) {
  const { session } = useAuth();
  const [stories, setStories] = useState<BacklogStory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BacklogFilter>({});

  const loadBacklog = useCallback(async () => {
    if (!session?.token || !projectId) {
      setStories([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await webApiClient.getBacklog(session.token, projectId, filter);
      setStories(data.stories);
      setTotal(data.total);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session?.token, projectId, filter]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session?.token || !projectId) {
        setStories([]);
        setTotal(0);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await webApiClient.getBacklog(session.token, projectId, filter);
        if (!cancelled) {
          setStories(data.stories);
          setTotal(data.total);
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
  }, [session?.token, projectId, filter]);

  async function refineStory(storyId: string, patch: { sortOrder?: number; readiness?: string }) {
    if (!session?.token || !projectId) return;
    await webApiClient.refineBacklogItem(session.token, projectId, { storyId, ...patch });
    await loadBacklog();
  }

  return { stories, total, loading, error, refineStory, filter, setFilter };
}
