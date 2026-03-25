import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import {
  JiraConnector,
  AuthError,
  NotFoundError,
  RateLimitError,
  buildStoryDescription,
  buildBugDescription,
  buildQaResultComment,
  type AdfDocument,
} from './jira';
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

describe('JiraConnector — addAdfComment', () => {
  it('POSTs ADF body to correct endpoint', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: 'comment-adf-1' }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    const adfBody: AdfDocument = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'QA passed' }] },
      ],
    };
    await connector.addAdfComment('PROJ-1', adfBody);

    expect(capturedUrl).toContain('/rest/api/3/issue/PROJ-1/comment');
    const body = capturedBody as { body: AdfDocument };
    expect(body.body.type).toBe('doc');
    expect(body.body.version).toBe(1);
  });
});

describe('JiraConnector — createIssue', () => {
  it('POSTs correct payload and returns issue key', async () => {
    let capturedBody: unknown;

    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ key: 'PROJ-123', id: '10123' }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    const key = await connector.createIssue({
      summary: 'New story',
      description: buildStoryDescription('Story details'),
      issuetype: 'Story',
      projectKey: 'PROJ',
    });

    expect(key).toBe('PROJ-123');
    const body = capturedBody as {
      fields: { project: { key: string }; issuetype: { name: string }; summary: string };
    };
    expect(body.fields.project.key).toBe('PROJ');
    expect(body.fields.issuetype.name).toBe('Story');
    expect(body.fields.summary).toBe('New story');
  });

  it('omits description if undefined', async () => {
    let capturedBody: unknown;

    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ key: 'PROJ-124', id: '10124' }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    await connector.createIssue({
      summary: 'No description',
      issuetype: 'Task',
      projectKey: 'PROJ',
    });

    const body = capturedBody as { fields: Record<string, unknown> };
    expect(body.fields.description).toBeUndefined();
  });
});

describe('JiraConnector — createBugIssue', () => {
  it('creates issue with issuetype Bug', async () => {
    let capturedBody: unknown;

    globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ key: 'PROJ-200', id: '10200' }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    const key = await connector.createBugIssue({
      summary: 'Login fails',
      description: buildBugDescription({
        description: 'Cannot login with valid credentials',
        severity: 'High',
      }),
      projectKey: 'PROJ',
    });

    expect(key).toBe('PROJ-200');
    const body = capturedBody as {
      fields: { issuetype: { name: string } };
    };
    expect(body.fields.issuetype.name).toBe('Bug');
  });
});

describe('JiraConnector — getFieldMetadata', () => {
  it('GETs field metadata from correct endpoint', async () => {
    let capturedUrl = '';

    globalThis.fetch = async (url: string | URL | Request) => {
      capturedUrl = url.toString();
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            { id: 'summary', name: 'Summary', custom: false },
            { id: 'customfield_10001', name: 'Story Points', custom: true },
          ]),
      } as Response;
    };

    const connector = new JiraConnector(config);
    const fields = await connector.getFieldMetadata();

    expect(capturedUrl).toContain('/rest/api/3/field');
    expect(fields.length).toBe(2);
    expect(fields[0]!.id).toBe('summary');
    expect(fields[1]!.custom).toBe(true);
  });
});

describe('JiraConnector — 429 retry logic', () => {
  it('retries on 429 and succeeds after 2 retries', async () => {
    let callCount = 0;

    globalThis.fetch = async () => {
      callCount++;
      if (callCount <= 2) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => null },
          text: async () => '{}',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ issues: [] }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    const stories = await connector.fetchStories('PROJ');

    expect(callCount).toBe(3);
    expect(stories.length).toBe(0);
  });

  it('throws RateLimitError after 3 retries exhausted', async () => {
    let callCount = 0;
    const originalSetTimeout = globalThis.setTimeout;

    globalThis.setTimeout = ((fn: () => void, _ms: number) => {
      return originalSetTimeout(fn, 0);
    }) as typeof setTimeout;

    globalThis.fetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name === 'Retry-After' ? '10' : null) },
        text: async () => '{}',
      } as unknown as Response;
    };

    const connector = new JiraConnector(config);
    await expect(connector.fetchStories('PROJ')).rejects.toThrow(RateLimitError);

    globalThis.setTimeout = originalSetTimeout;
    expect(callCount).toBe(4);
  });

  it('uses Retry-After header when present', async () => {
    let callCount = 0;
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0);
    }) as typeof setTimeout;

    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name: string) => (name === 'Retry-After' ? '2' : null) },
          text: async () => '{}',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ issues: [] }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    await connector.fetchStories('PROJ');

    globalThis.setTimeout = originalSetTimeout;
    expect(delays[0]).toBe(2000);
  });

  it('uses exponential backoff when Retry-After absent', async () => {
    let callCount = 0;
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0);
    }) as typeof setTimeout;

    globalThis.fetch = async () => {
      callCount++;
      if (callCount <= 3) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => null },
          text: async () => '{}',
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ issues: [] }),
      } as Response;
    };

    const connector = new JiraConnector(config);
    await connector.fetchStories('PROJ');

    globalThis.setTimeout = originalSetTimeout;
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBe(2000);
    expect(delays[2]).toBe(4000);
  });
});

describe('ADF factory functions', () => {
  describe('buildStoryDescription', () => {
    it('creates single paragraph ADF document', () => {
      const doc = buildStoryDescription('User login feature');
      expect(doc.type).toBe('doc');
      expect(doc.version).toBe(1);
      expect(doc.content.length).toBe(1);
      expect(doc.content[0]!.type).toBe('paragraph');
      expect(doc.content[0]!.content?.[0]?.text).toBe('User login feature');
    });
  });

  describe('buildBugDescription', () => {
    it('creates two-paragraph ADF document', () => {
      const doc = buildBugDescription({
        description: 'Login button not working',
        severity: 'Critical',
      });
      expect(doc.type).toBe('doc');
      expect(doc.content.length).toBe(2);
      expect(doc.content[0]!.content?.[0]?.text).toBe('Severity: Critical');
      expect(doc.content[1]!.content?.[0]?.text).toBe('Login button not working');
    });
  });

  describe('buildQaResultComment', () => {
    it('creates QA result with all sections', () => {
      const doc = buildQaResultComment({
        verdict: 'FAIL',
        passedAC: ['User can login'],
        failedAC: ['Logout not working'],
        bugs: [{ description: 'Logout button missing', severity: 'High' }],
        prUrl: 'https://github.com/org/repo/pull/42',
      });

      expect(doc.type).toBe('doc');
      expect(doc.content.length).toBeGreaterThan(3);
      expect(doc.content[0]!.type).toBe('heading');
      expect(doc.content[0]!.content?.[0]?.text).toContain('QA Result: FAIL');

      const allTexts: string[] = [];
      const traverse = (node: typeof doc.content[number]) => {
        if (node.text) allTexts.push(node.text);
        if (node.content) {
          node.content.forEach(traverse);
        }
      };
      doc.content.forEach(traverse);

      expect(allTexts.some((t) => t.includes('User can login'))).toBe(true);
      expect(allTexts.some((t) => t.includes('Logout not working'))).toBe(true);
      expect(allTexts.some((t) => t.includes('Bug [High]'))).toBe(true);
    });

    it('handles empty arrays gracefully', () => {
      const doc = buildQaResultComment({
        verdict: 'PASS',
        passedAC: ['All tests passed'],
        failedAC: [],
        bugs: [],
      });

      expect(doc.content.length).toBe(2);
      expect(doc.content[0]!.content?.[0]?.text).toContain('PASS');
    });

    it('includes PR URL when provided', () => {
      const doc = buildQaResultComment({
        verdict: 'BLOCKED',
        passedAC: [],
        failedAC: [],
        bugs: [],
        prUrl: 'https://github.com/org/repo/pull/99',
      });

      const lastNode = doc.content[doc.content.length - 1];
      expect(lastNode?.type).toBe('paragraph');
      expect(lastNode?.content?.[0]?.text).toContain('PR: https://github.com/org/repo/pull/99');
    });

    it('omits PR paragraph when undefined', () => {
      const doc = buildQaResultComment({
        verdict: 'PASS',
        passedAC: ['AC1'],
        failedAC: [],
        bugs: [],
      });

      const hasParUrl = doc.content.some(
        (n) => n.type === 'paragraph' && n.content?.[0]?.text?.startsWith('PR:')
      );
      expect(hasParUrl).toBe(false);
    });
  });
});
