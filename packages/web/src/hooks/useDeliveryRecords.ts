import { useEffect, useState } from 'react';
import { webApiClient } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';
import type { DeliveryRecord, CreateDeliveryRecordInput } from '../lib/api-client';

export function useDeliveryRecords(projectId: string | undefined) {
  const { session } = useAuth();
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [environmentFilter, setEnvironmentFilter] = useState<string | undefined>(undefined);

  async function loadRecords() {
    if (!session?.token || !projectId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await webApiClient.listDeliveryRecords(session.token, projectId, {
        environment: environmentFilter,
      });
      setRecords(data);
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
        setRecords([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await webApiClient.listDeliveryRecords(session.token, projectId, {
          environment: environmentFilter,
        });
        if (!cancelled) {
          setRecords(data);
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
  }, [session?.token, projectId, environmentFilter]);

  async function createRecord(data: CreateDeliveryRecordInput) {
    if (!session?.token || !projectId) return;
    await webApiClient.createDeliveryRecord(session.token, projectId, data);
    await loadRecords();
  }

  return { records, loading, error, createRecord, environmentFilter, setEnvironmentFilter };
}
