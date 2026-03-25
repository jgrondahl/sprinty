import { useEffect, useState } from 'react';
import { webApiClient } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';

type OrgMetricProject = {
  projectId: string;
  projectName: string;
  averageVelocity: number;
  recentCompletedPoints: number;
  recentPlannedPoints: number;
  throughputStories: number;
};

type TrendPoint = {
  month: string;
  completedPoints: number;
  plannedPoints: number;
};

export function useMetrics() {
  const { session } = useAuth();
  const [projects, setProjects] = useState<OrgMetricProject[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session?.token) {
        setProjects([]);
        setTrends([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const [orgData, trendData] = await Promise.all([
          webApiClient.getOrgMetrics(session.token),
          webApiClient.getTrends(session.token),
        ]);

        if (!cancelled) {
          setProjects(orgData.aggregate);
          setTrends(trendData.trends);
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

  return { projects, trends, loading, error };
}
