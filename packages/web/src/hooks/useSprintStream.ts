import { useEffect, useState } from 'react';
import { webApiClient } from '../lib/api-client';
import { useAuth } from '../contexts/AuthContext';

export type StreamEvent = {
  type: string;
  payload: unknown;
  timestamp: string;
};

export function useSprintStream(sprintId: string | undefined) {
  const { session } = useAuth();
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session?.token || !sprintId) {
      setEvents([]);
      setConnected(false);
      return;
    }

    const source = webApiClient.createSprintEventSource(session.token, sprintId);
    source.onopen = () => {
      setConnected(true);
    };

    source.onmessage = (event) => {
      const next: StreamEvent = {
        type: 'message',
        payload: event.data,
        timestamp: new Date().toISOString(),
      };
      setEvents((prev) => [...prev.slice(-99), next]);
    };

    source.onerror = () => {
      setConnected(false);
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [session?.token, sprintId]);

  return { events, connected };
}
