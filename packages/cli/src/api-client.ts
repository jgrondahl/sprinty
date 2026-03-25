import * as fs from 'fs';
import * as path from 'path';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

type CredentialsPayload = {
  token: string;
  orgId: string;
};

function credentialsFilePath(): string {
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? process.cwd();
  return path.join(home, '.splinty', 'credentials.json');
}

export class SplintyApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string
  ) {}

  static loadCredentials(): CredentialsPayload | null {
    const filePath = credentialsFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const text = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(text) as Partial<CredentialsPayload>;
      if (!parsed.token || !parsed.orgId) {
        return null;
      }
      return { token: parsed.token, orgId: parsed.orgId };
    } catch {
      return null;
    }
  }

  static async saveCredentials(payload: CredentialsPayload): Promise<void> {
    const filePath = credentialsFilePath();
    const parent = path.dirname(filePath);
    fs.mkdirSync(parent, { recursive: true });
    await Bun.write(filePath, JSON.stringify(payload, null, 2));
  }

  private async request(path: string, method: string, body?: JsonObject): Promise<Response> {
    const headers = new Headers({
      'Content-Type': 'application/json',
    });

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async login(email: string, password: string, orgId?: string): Promise<{ token: string; orgId: string }> {
    const response = await this.request('/api/auth/login', 'POST', {
      email,
      password,
      ...(orgId ? { orgId } : {}),
    });
    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    const payload = (await response.json()) as { token: string };
    const meResponse = await fetch(`${this.baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${payload.token}`,
      },
    });

    if (!meResponse.ok) {
      throw new Error(`Could not resolve org from token: ${meResponse.status}`);
    }

    const me = (await meResponse.json()) as { orgId: string };
    return { token: payload.token, orgId: me.orgId };
  }

  async listProjects(): Promise<JsonValue> {
    const response = await this.request('/api/projects', 'GET');
    if (!response.ok) {
      throw new Error(`Failed to list projects: ${response.status}`);
    }
    return response.json();
  }

  async importRoadmap(projectId: string, payload: unknown): Promise<JsonValue> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Roadmap payload must be a JSON object');
    }

    const response = await this.request(
      `/api/projects/${projectId}/roadmap/import`,
      'POST',
      payload as JsonObject
    );
    if (!response.ok) {
      throw new Error(`Roadmap import failed: ${response.status}`);
    }
    return response.json();
  }

  async planSprint(projectId: string, sprintName: string, sprintGoal: string): Promise<JsonValue> {
    const response = await this.request(`/api/projects/${projectId}/sprints/plan`, 'POST', {
      sprintName,
      sprintGoal,
    });
    if (!response.ok) {
      throw new Error(`Sprint plan failed: ${response.status}`);
    }
    return response.json();
  }
}
