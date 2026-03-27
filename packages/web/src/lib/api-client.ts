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

// --- Product Goal types ---
export type ProductGoal = {
  id: string;
  projectId: string;
  orgId: string;
  title: string;
  problemStatement: string;
  targetUsers: string;
  successMeasures: string[];
  businessConstraints: string[];
  nonGoals: string[];
  approvalStatus: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateProductGoalInput = {
  title: string;
  problemStatement?: string;
  targetUsers?: string;
  successMeasures?: string[];
  businessConstraints?: string[];
  nonGoals?: string[];
};

// --- Backlog types ---
export type BacklogStory = {
  id: string;
  title: string;
  state: string;
  storyPoints?: number;
  sortOrder?: number;
  readiness?: string;
};

// --- Sprint types ---
export type SprintAssignResult = {
  sprint: Record<string, unknown>;
  assignedStories: string[];
};

// --- Artifact types ---
export type ArtifactVersion = {
  id: string;
  artifactType: string;
  artifactId: string;
  version: number;
  snapshotData: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
};

export type IncrementPayload = {
  completedStoryIds: string[];
  sprintGoal: string;
  velocityAchieved: number;
  qualityNotes?: string;
};

export type SprintReviewPayload = {
  incrementId: string;
  stakeholderFeedback: string[];
  accepted: boolean;
  feedbackActionItems?: string[];
};

export type RetrospectivePayload = {
  sprintId?: string;
  wentWell: string[];
  needsImprovement: string[];
  actionItems: string[];
};

// --- Delivery types ---
export type DeliveryRecord = {
  id: string;
  projectId: string;
  orgId: string;
  environment: string;
  deployedVersion: string;
  releaseCandidateId?: string;
  incrementId?: string;
  deploymentWindow?: { start: string; end: string } | null;
  approvedBy?: string;
  evidenceReferences: string[];
  createdAt: string;
};

export type CreateDeliveryRecordInput = {
  environment: string;
  deployedVersion: string;
  releaseCandidateId?: string;
  incrementId?: string;
  deploymentWindow?: { start: string; end: string } | null;
  approvedBy?: string;
  evidenceReferences?: string[];
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

  async createProductGoal(token: string, projectId: string, data: CreateProductGoalInput): Promise<ProductGoal> {
    return this.jsonRequest<ProductGoal>(`/api/projects/${projectId}/product-goal`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async listProductGoals(token: string, projectId: string): Promise<ProductGoal[]> {
    const result = await this.jsonRequest<{ goals: ProductGoal[] }>(`/api/projects/${projectId}/product-goal`, {
      method: 'GET',
      headers: { ...authHeaders(token) },
    });
    return result.goals;
  }

  async updateProductGoal(token: string, goalId: string, data: Partial<ProductGoal>): Promise<ProductGoal> {
    return this.jsonRequest<ProductGoal>(`/api/product-goals/${goalId}`, {
      method: 'PATCH',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async getBacklog(token: string, projectId: string, params?: { readiness?: string; limit?: number; offset?: number }): Promise<{ stories: BacklogStory[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.readiness) searchParams.set('readiness', params.readiness);
    if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
    const qs = searchParams.toString();
    return this.jsonRequest<{ stories: BacklogStory[]; total: number }>(`/api/projects/${projectId}/backlog${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: { ...authHeaders(token) },
    });
  }

  async refineBacklogItem(token: string, projectId: string, data: { storyId: string; sortOrder?: number; readiness?: string }): Promise<BacklogStory> {
    return this.jsonRequest<BacklogStory>(`/api/projects/${projectId}/backlog/refine`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async assignStories(token: string, projectId: string, sprintId: string, data: { storyIds: string[]; sprintGoal?: string }): Promise<SprintAssignResult> {
    return this.jsonRequest<SprintAssignResult>(`/api/projects/${projectId}/sprints/${sprintId}/assign-stories`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async createIncrement(token: string, projectId: string, sprintId: string, data: IncrementPayload): Promise<ArtifactVersion> {
    return this.jsonRequest<ArtifactVersion>(`/api/projects/${projectId}/sprints/${sprintId}/increment`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async createSprintReview(token: string, projectId: string, sprintId: string, data: SprintReviewPayload): Promise<ArtifactVersion> {
    return this.jsonRequest<ArtifactVersion>(`/api/projects/${projectId}/sprints/${sprintId}/review`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async createRetrospective(token: string, projectId: string, sprintId: string, data: RetrospectivePayload): Promise<ArtifactVersion> {
    return this.jsonRequest<ArtifactVersion>(`/api/projects/${projectId}/sprints/${sprintId}/retrospective`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async createDeliveryRecord(token: string, projectId: string, data: CreateDeliveryRecordInput): Promise<DeliveryRecord> {
    return this.jsonRequest<DeliveryRecord>(`/api/projects/${projectId}/delivery-records`, {
      method: 'POST',
      headers: { ...authHeaders(token) },
      body: JSON.stringify(data),
    });
  }

  async listDeliveryRecords(token: string, projectId: string, params?: { environment?: string }): Promise<DeliveryRecord[]> {
    const searchParams = new URLSearchParams();
    if (params?.environment) searchParams.set('environment', params.environment);
    const qs = searchParams.toString();
    const result = await this.jsonRequest<{ records: DeliveryRecord[] }>(`/api/projects/${projectId}/delivery-records${qs ? `?${qs}` : ''}`, {
      method: 'GET',
      headers: { ...authHeaders(token) },
    });
    return result.records;
  }

  async getDeliveryRecord(token: string, deliveryId: string): Promise<DeliveryRecord> {
    return this.jsonRequest<DeliveryRecord>(`/api/delivery-records/${deliveryId}`, {
      method: 'GET',
      headers: { ...authHeaders(token) },
    });
  }
}

export const webApiClient = new WebApiClient();
