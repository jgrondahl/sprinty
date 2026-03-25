import {
  StoryState,
  StorySource,
  type Story,
} from '@splinty/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JiraConfig {
  baseUrl: string;  // e.g. "https://mycompany.atlassian.net"
  email: string;
  apiToken: string;
  projectKey?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: {
      content?: Array<{
        content?: Array<{ text?: string }>;
      }>;
    } | string | null;
    status?: { name?: string };
    priority?: { name?: string };
    story_points?: number;
    labels?: string[];
    [key: string]: unknown;
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

// ─── ADF Types ────────────────────────────────────────────────────────────────

export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
}

export type AdfDocument = {
  type: 'doc';
  version: 1;
  content: AdfNode[];
};

// ─── ADF Factory Functions ────────────────────────────────────────────────────

export function buildStoryDescription(text: string): AdfDocument {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

export function buildBugDescription(bug: {
  description: string;
  severity: string;
}): AdfDocument {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: `Severity: ${bug.severity}` }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: bug.description }],
      },
    ],
  };
}

export function buildQaResultComment(opts: {
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  passedAC: string[];
  failedAC: string[];
  bugs: Array<{ description: string; severity: string }>;
  prUrl?: string;
}): AdfDocument {
  const content: AdfNode[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: `QA Result: ${opts.verdict}` }],
    },
  ];

  // Passed AC
  if (opts.passedAC.length > 0) {
    content.push({
      type: 'bulletList',
      content: opts.passedAC.map((ac) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `✓ ${ac}` }],
          },
        ],
      })),
    });
  }

  // Failed AC
  if (opts.failedAC.length > 0) {
    content.push({
      type: 'bulletList',
      content: opts.failedAC.map((ac) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `✗ ${ac}` }],
          },
        ],
      })),
    });
  }

  // Bugs
  if (opts.bugs.length > 0) {
    content.push({
      type: 'bulletList',
      content: opts.bugs.map((bug) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: `Bug [${bug.severity}]: ${bug.description}` },
            ],
          },
        ],
      })),
    });
  }

  // PR URL
  if (opts.prUrl) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: `PR: ${opts.prUrl}` }],
    });
  }

  return {
    type: 'doc',
    version: 1,
    content,
  };
}

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class AuthError extends Error {
  constructor(url: string) {
    super(`AuthError: 401 Unauthorized for ${url}. Check email and API token.`);
    this.name = 'AuthError';
  }
}

export class NotFoundError extends Error {
  constructor(url: string) {
    super(`NotFoundError: 404 Not Found for ${url}`);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`Jira rate limit hit. Retry after ${retryAfter}s`);
    this.name = 'RateLimitError';
  }
}

// ─── JiraConnector ────────────────────────────────────────────────────────────

export class JiraConnector {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    const encoded = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    this.authHeader = `Basic ${encoded}`;
  }

  /**
   * Fetch stories from a Jira board, optionally filtered by sprint.
   * JQL: project = BOARD-1 AND sprint = <sprintId> ORDER BY created DESC
   */
  async fetchStories(boardId: string, sprintId?: string): Promise<Story[]> {
    let jql = `project = "${boardId}"`;
    if (sprintId) {
      jql += ` AND sprint = "${sprintId}"`;
    }
    jql += ' ORDER BY created DESC';

    const url = `${this.baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}`;
    const data = await this.request<{ issues: JiraIssue[] }>(url, 'GET');
    return (data.issues ?? []).map((issue) => this.parseJiraIssue(issue));
  }

  /**
   * Maps a Jira issue to the Story type.
   */
  parseJiraIssue(issue: JiraIssue): Story {
    const now = new Date().toISOString();
    const description = this.extractDescription(issue.fields.description);
    return {
      id: `jira-${issue.key}`,
      title: issue.fields.summary,
      description,
      acceptanceCriteria: [],
      dependsOn: [],
      state: StoryState.RAW,
      source: StorySource.JIRA,
      sourceId: issue.key,
      workspacePath: '',
      domain: 'general',
      tags: issue.fields.labels ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Add a comment to a Jira issue.
   */
  async addComment(issueKey: string, body: string): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    await this.request<unknown>(url, 'POST', {
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: body }],
          },
        ],
      },
    });
  }

  /**
   * Transition a Jira issue to a new status.
   */
  async updateStatus(issueKey: string, transitionId: string): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    await this.request<unknown>(url, 'POST', {
      transition: { id: transitionId },
    });
  }

  /**
   * Get available transitions for an issue.
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    const data = await this.request<{ transitions: JiraTransition[] }>(url, 'GET');
    return data.transitions ?? [];
  }

  /**
   * Add a comment with ADF body to a Jira issue.
   */
  async addAdfComment(issueKey: string, body: AdfDocument): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    await this.request<unknown>(url, 'POST', { body });
  }

  /**
   * Create a new Jira issue. Returns the created issue key.
   */
  async createIssue(fields: {
    summary: string;
    description?: AdfDocument;
    issuetype: string;
    projectKey: string;
  }): Promise<string> {
    const url = `${this.baseUrl}/rest/api/3/issue`;
    const payload = {
      fields: {
        project: { key: fields.projectKey },
        issuetype: { name: fields.issuetype },
        summary: fields.summary,
        ...(fields.description && { description: fields.description }),
      },
    };
    const result = await this.request<{ key: string }>(url, 'POST', payload);
    return result.key;
  }

  /**
   * Create a Bug issue (convenience wrapper for createIssue).
   */
  async createBugIssue(opts: {
    summary: string;
    description: AdfDocument;
    projectKey: string;
  }): Promise<string> {
    return this.createIssue({
      summary: opts.summary,
      description: opts.description,
      issuetype: 'Bug',
      projectKey: opts.projectKey,
    });
  }

  /**
   * Get field metadata for the Jira instance.
   */
  async getFieldMetadata(): Promise<
    Array<{ id: string; name: string; custom: boolean }>
  > {
    const url = `${this.baseUrl}/rest/api/3/field`;
    const data = await this.request<
      Array<{ id: string; name: string; custom: boolean }>
    >(url, 'GET');
    return data;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async request<T>(url: string, method: string, body?: unknown): Promise<T> {
    const maxRetries = 3;
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const headers: Record<string, string> = {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const init: RequestInit = { method, headers };
      if (body) {
        init.body = JSON.stringify(body);
      }

      let response: Response;
      try {
        response = await fetch(url, init);
      } catch (err) {
        throw new Error(`JiraConnector: network error for ${url}: ${(err as Error).message}`);
      }

      lastResponse = response;

      if (response.status === 429) {
        if (attempt >= maxRetries) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 4;
          throw new RateLimitError(retryAfter);
        }

        const retryAfterHeader = response.headers.get('Retry-After');
        const delayMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : Math.pow(2, attempt) * 1000;

        await this.sleep(delayMs);
        continue;
      }

      if (response.status === 401) throw new AuthError(url);
      if (response.status === 404) throw new NotFoundError(url);

      if (!response.ok) {
        throw new Error(`JiraConnector: unexpected status ${response.status} for ${url}`);
      }

      if (response.status === 204) return undefined as unknown as T;

      const text = await response.text();
      if (!text.trim()) return undefined as unknown as T;

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`JiraConnector: invalid JSON response from ${url}`);
      }
    }

    throw new Error(`JiraConnector: unreachable code in request() for ${url}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractDescription(
    desc: JiraIssue['fields']['description']
  ): string {
    if (!desc) return '';
    if (typeof desc === 'string') return desc;
    // Atlassian Document Format (ADF) — extract text nodes
    return (desc.content ?? [])
      .flatMap((block) => block.content ?? [])
      .map((node) => node.text ?? '')
      .join('')
      .trim();
  }
}
