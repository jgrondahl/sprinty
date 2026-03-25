export type AuthSession = {
  token: string;
  orgId: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
};

function getBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
  return env?.['VITE_API_URL'] ?? '';
}

function authHeaders(token?: string): HeadersInit {
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

export class WebApiClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = getBaseUrl();
  }

  private async jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }

    return (await response.json()) as T;
  }

  async register(payload: {
    email: string;
    password: string;
    name: string;
    orgName?: string;
    orgId?: string;
  }): Promise<AuthSession> {
    const data = await this.jsonRequest<{
      token: string;
      user: { id: string; email: string; name: string; role: string; orgId: string };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      token: data.token,
      orgId: data.user.orgId,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
      },
    };
  }

  async login(payload: { email: string; password: string; orgId?: string }): Promise<{ token: string }> {
    return this.jsonRequest<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async me(token: string): Promise<{ id: string; orgId: string; email: string; name: string; role: string }> {
    return this.jsonRequest('/api/auth/me', {
      method: 'GET',
      headers: {
        ...authHeaders(token),
      },
    });
  }

  async listProjects(token: string): Promise<{ projects: Array<{ id: string; name: string; description: string }> }> {
    return this.jsonRequest('/api/projects', {
      method: 'GET',
      headers: {
        ...authHeaders(token),
      },
    });
  }

  async listEpics(token: string, projectId: string): Promise<{ epics: Array<{ id: string; title: string; status: string }> }> {
    return this.jsonRequest(`/api/projects/${projectId}/epics`, {
      method: 'GET',
      headers: {
        ...authHeaders(token),
      },
    });
  }

  async listStories(token: string, projectId: string): Promise<{ stories: Array<{ id: string; title: string; state: string; storyPoints?: number }> }> {
    return this.jsonRequest(`/api/projects/${projectId}/stories`, {
      method: 'GET',
      headers: {
        ...authHeaders(token),
      },
    });
  }

  async getOrgMetrics(token: string): Promise<{ projects: number; aggregate: Array<{ projectId: string; projectName: string; averageVelocity: number; recentCompletedPoints: number; recentPlannedPoints: number; throughputStories: number }> }> {
    return this.jsonRequest('/api/metrics/org', {
      method: 'GET',
      headers: {
        ...authHeaders(token),
      },
    });
  }

  async getTrends(token: string): Promise<{ trends: Array<{ month: string; completedPoints: number; plannedPoints: number }> }> {
    return this.jsonRequest('/api/metrics/trends', {
      method: 'GET',
      headers: {
        ...authHeaders(token),
      },
    });
  }

  createSprintEventSource(token: string, sprintId: string): EventSource {
    const base = this.baseUrl || window.location.origin;
    const url = new URL(`/api/sprints/${sprintId}/stream`, base);
    url.searchParams.set('token', token);
    return new EventSource(url.toString());
  }
}

export const webApiClient = new WebApiClient();
