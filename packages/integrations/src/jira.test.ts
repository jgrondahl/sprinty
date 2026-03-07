import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { JiraConnector, AuthError, NotFoundError } from './jira';
import { StorySource, StoryState } from '@splinty/core';

const config = {
  baseUrl: 'https://test.atlassian.net',
  email: 'test@example.com',
  apiToken: 'fake-token',
};

// ─── Fetch Mock Helpers ────────────────────────────────────────────────────────

function mockFetchOnce(status: number, body: unknown): void {
  globalThis.fetch = async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body == null ? '' : JSON.stringify(body)),
    } as Response);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('JiraConnector — fetchStories', () => {
  it('returns Story[] with source JIRA', async () => {
    mockFetchOnce(200, {
      issues: [
        {
          id: '10001',
          key: 'PROJ-1',
          fields: {
            summary: 'Implement login',
            description: 'Allow users to log in',
            labels: ['auth'],
          },
        },
        {
          id: '10002',
          key: 'PROJ-2',
          fields: {
            summary: 'Add logout',
            description: null,
            labels: [],
          },
        },
      ],
    });

    const connector = new JiraConnector(config);
    const stories = await connector.fetchStories('PROJ');

    expect(stories.length).toBe(2);
    expect(stories[0]!.source).toBe(StorySource.JIRA);
    expect(stories[0]!.sourceId).toBe('PROJ-1');
    expect(stories[0]!.title).toBe('Implement login');
    expect(stories[0]!.state).toBe(StoryState.RAW);
    expect(stories[0]!.tags).toContain('auth');
  });

  it('returns empty array when no issues', async () => {
    mockFetchOnce(200, { issues: [] });
    const connector = new JiraConnector(config);
    const stories = await connector.fetchStories('EMPTY-BOARD');
    expect(stories.length).toBe(0);
  });

  it('includes sprintId in JQL when provided', async () => {
    let capturedUrl = '';
    globalThis.fetch = async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ issues: [] }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    await connector.fetchStories('PROJ', 'sprint-42');

    expect(capturedUrl).toContain('sprint-42');
  });
});

describe('JiraConnector — addComment', () => {
  it('POSTs to correct endpoint with correct body', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: 'comment-1' }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    await connector.addComment('PROJ-1', 'Agent ARCHITECT completed design');

    expect(capturedUrl).toContain('/rest/api/3/issue/PROJ-1/comment');
    expect(JSON.stringify(capturedBody)).toContain('Agent ARCHITECT completed design');
  });
});

describe('JiraConnector — updateStatus', () => {
  it('POSTs transition id to correct endpoint', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedBody = JSON.parse(init?.body as string);
      return { ok: true, status: 204, text: async () => '' } as Response;
    };

    const connector = new JiraConnector(config);
    await connector.updateStatus('PROJ-1', '21');

    expect(capturedUrl).toContain('/rest/api/3/issue/PROJ-1/transitions');
    expect((capturedBody as { transition: { id: string } }).transition.id).toBe('21');
  });
});

describe('JiraConnector — getTransitions', () => {
  it('returns transition list', async () => {
    mockFetchOnce(200, {
      transitions: [
        { id: '11', name: 'To Do', to: { name: 'To Do' } },
        { id: '21', name: 'In Progress', to: { name: 'In Progress' } },
        { id: '31', name: 'Done', to: { name: 'Done' } },
      ],
    });

    const connector = new JiraConnector(config);
    const transitions = await connector.getTransitions('PROJ-1');

    expect(transitions.length).toBe(3);
    expect(transitions[1]!.name).toBe('In Progress');
  });
});

describe('JiraConnector — error handling', () => {
  it('throws AuthError on 401', async () => {
    mockFetchOnce(401, { message: 'Unauthorized' });
    const connector = new JiraConnector(config);
    await expect(connector.fetchStories('PROJ')).rejects.toThrow(AuthError);
  });

  it('throws NotFoundError on 404', async () => {
    mockFetchOnce(404, { message: 'Not found' });
    const connector = new JiraConnector(config);
    await expect(connector.getTransitions('BOGUS-99')).rejects.toThrow(NotFoundError);
  });

  it('throws generic error on 500', async () => {
    mockFetchOnce(500, { message: 'Server Error' });
    const connector = new JiraConnector(config);
    await expect(connector.fetchStories('PROJ')).rejects.toThrow('unexpected status 500');
  });
});

describe('JiraConnector — parseJiraIssue', () => {
  it('extracts description from ADF content', () => {
    const connector = new JiraConnector(config);
    const issue = {
      id: '1',
      key: 'PROJ-1',
      fields: {
        summary: 'Test',
        description: {
          content: [
            {
              content: [{ text: 'Hello' }, { text: ' world' }],
            },
          ],
        },
      },
    };
    const story = connector.parseJiraIssue(issue);
    expect(story.description).toBe('Hello world');
  });

  it('handles null description gracefully', () => {
    const connector = new JiraConnector(config);
    const issue = {
      id: '2',
      key: 'PROJ-2',
      fields: { summary: 'No desc', description: null },
    };
    const story = connector.parseJiraIssue(issue);
    expect(story.description).toBe('');
  });

  it('uses Basic auth header with base64 email:token', async () => {
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ issues: [] }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    await connector.fetchStories('PROJ');

    const expected = 'Basic ' + Buffer.from('test@example.com:fake-token').toString('base64');
    expect(capturedHeaders['Authorization']).toBe(expected);
  });
});
