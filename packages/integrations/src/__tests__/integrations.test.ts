/**
 * T20 — Integrations Combined Test
 *
 * Tests combined flows that span both Jira and GitHub connectors:
 *   - Jira: fetch stories → add comment (end-to-end write-back)
 *   - GitHub: fetch issues → create PR (end-to-end pipeline output)
 *   - Error handling: auth errors, not-found errors, unexpected status
 *
 * Existing jira.test.ts and github.test.ts cover all individual method
 * scenarios. This file adds combined flows and cross-connector scenarios.
 */

import { describe, it, expect } from 'bun:test';
import { JiraConnector, AuthError, NotFoundError } from '../jira';
import { GitHubConnector } from '../github';
import { StorySource, StoryState } from '@splinty/core';
import type { Octokit } from '@octokit/rest';

// ─── Jira fetch mock helpers ──────────────────────────────────────────────────

const jiraConfig = {
  baseUrl: 'https://integration.atlassian.net',
  email: 'agent@splinty.io',
  apiToken: 'integration-token',
};

const githubConfig = {
  owner: 'splinty-org',
  repo: 'splinty-app',
  token: 'gh-integration-token',
};

type FetchCall = { url: string; method: string; body?: unknown };

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  let idx = 0;
  globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const entry = responses[idx] ?? responses[responses.length - 1]!;
    idx++;
    return {
      ok: entry.status >= 200 && entry.status < 300,
      status: entry.status,
      text: async () => (entry.body == null ? '' : JSON.stringify(entry.body)),
    } as Response;
  };
}

// ─── GitHub mock helper ───────────────────────────────────────────────────────

function mockOctokit(overrides: Partial<{
  listForRepo: (params: unknown) => Promise<{ data: unknown[] }>;
  createComment: (params: unknown) => Promise<void>;
  createPull: (params: unknown) => Promise<{ data: { html_url: string } }>;
}> = {}): Octokit {
  return {
    rest: {
      issues: {
        listForRepo: overrides.listForRepo ?? (async () => ({ data: [] })),
        createComment: overrides.createComment ?? (async () => {}),
        addLabels: async () => {},
      },
      git: {
        getRef: async () => ({ data: { object: { sha: 'aabbccdd' } } }),
        createRef: async () => {},
      },
      pulls: {
        create: overrides.createPull ?? (async () => ({
          data: { html_url: 'https://github.com/splinty-org/splinty-app/pull/10' },
        })),
      },
    },
  } as unknown as Octokit;
}

// ─── T20-A: Jira combined flow ────────────────────────────────────────────────

describe('Integrations — Jira combined flow: fetch → add comment', () => {
  it('fetches stories from a board then writes a comment back to the same issue', async () => {
    const calls: FetchCall[] = [];

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: url.toString(),
        method: (init?.method ?? 'GET').toUpperCase(),
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });

      // First call = fetchStories (GET), return 1 issue
      if (calls.length === 1) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              issues: [
                {
                  id: '20001',
                  key: 'APP-42',
                  fields: { summary: 'Build auth module', description: 'ADF', labels: ['auth'] },
                },
              ],
            }),
        } as Response;
      }

      // Second call = addComment (POST), return 201
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: 'comment-99' }),
      } as Response;
    };

    const connector = new JiraConnector(jiraConfig);

    // Fetch stories
    const stories = await connector.fetchStories('APP');
    expect(stories.length).toBe(1);
    expect(stories[0]!.source).toBe(StorySource.JIRA);
    expect(stories[0]!.sourceId).toBe('APP-42');
    expect(stories[0]!.title).toBe('Build auth module');
    expect(stories[0]!.state).toBe(StoryState.RAW);

    // Write comment back using the sourceId
    const issueKey = stories[0]!.sourceId!;
    await connector.addComment(issueKey, 'Agent ARCHITECT: design completed, ADR written.');

    // Verify both HTTP calls happened
    expect(calls.length).toBe(2);
    expect(calls[0]!.method).toBe('GET');
    expect(calls[0]!.url).toContain('/rest/api/3/search');
    expect(calls[1]!.method).toBe('POST');
    expect(calls[1]!.url).toContain('/rest/api/3/issue/APP-42/comment');
    expect(JSON.stringify(calls[1]!.body)).toContain('Agent ARCHITECT');
  });

  it('fetchStories + getTransitions for the same issue key', async () => {
    let callCount = 0;

    globalThis.fetch = async (url: string | URL | Request) => {
      callCount++;
      if (callCount === 1) {
        // fetchStories
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              issues: [
                { id: '20002', key: 'APP-55', fields: { summary: 'Add notifications', description: null, labels: [] } },
              ],
            }),
        } as Response;
      }
      // getTransitions
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            transitions: [
              { id: '11', name: 'To Do', to: { name: 'To Do' } },
              { id: '21', name: 'In Progress', to: { name: 'In Progress' } },
              { id: '31', name: 'Done', to: { name: 'Done' } },
            ],
          }),
      } as Response;
    };

    const connector = new JiraConnector(jiraConfig);
    const stories = await connector.fetchStories('APP');
    expect(stories[0]!.sourceId).toBe('APP-55');

    const transitions = await connector.getTransitions(stories[0]!.sourceId!);
    expect(transitions.length).toBe(3);
    expect(transitions.map((t) => t.name)).toContain('Done');
  });
});

// ─── T20-B: GitHub combined flow ─────────────────────────────────────────────

describe('Integrations — GitHub combined flow: fetch issues → create PR', () => {
  it('fetches issues then creates a PR that closes the fetched issue', async () => {
    let createPullParams: unknown;

    const octokit = mockOctokit({
      listForRepo: async () => ({
        data: [
          {
            number: 77,
            title: 'Build user profile page',
            body: 'Users want to view and edit their profile.',
            labels: [{ name: 'feature' }, { name: 'ui' }],
            state: 'open',
          },
        ],
      }),
      createPull: async (params) => {
        createPullParams = params;
        return { data: { html_url: 'https://github.com/splinty-org/splinty-app/pull/77' } };
      },
    });

    const connector = new GitHubConnector(githubConfig, octokit);

    // Fetch stories
    const stories = await connector.fetchIssues();
    expect(stories.length).toBe(1);
    expect(stories[0]!.source).toBe(StorySource.GITHUB);
    expect(stories[0]!.sourceId).toBe('77');
    expect(stories[0]!.tags).toContain('feature');

    // Create a PR referencing the issue
    const issueNumber = parseInt(stories[0]!.sourceId!, 10);
    const prUrl = await connector.createPullRequest(
      'feat: user profile page',
      'Implements user profile view and edit.',
      'story/github-77',
      'main',
      issueNumber
    );

    expect(prUrl).toBe('https://github.com/splinty-org/splinty-app/pull/77');

    // Verify PR body closes the issue
    const p = createPullParams as { body: string; head: string; base: string };
    expect(p.body).toContain('Closes #77');
    expect(p.body).toContain('Implements user profile view and edit.');
    expect(p.head).toBe('story/github-77');
    expect(p.base).toBe('main');
  });

  it('fetches issues with label filter then adds a comment', async () => {
    let listParams: unknown;
    let commentParams: unknown;

    const octokit = mockOctokit({
      listForRepo: async (params) => {
        listParams = params;
        return {
          data: [
            { number: 10, title: 'Audio feature', body: 'Record audio', labels: [{ name: 'audio' }], state: 'open' },
          ],
        };
      },
      createComment: async (params) => { commentParams = params; },
    });

    const connector = new GitHubConnector(githubConfig, octokit);

    const stories = await connector.fetchIssues(['audio']);
    expect((listParams as { labels: string }).labels).toBe('audio');
    expect(stories[0]!.tags).toContain('audio');

    await connector.addComment(10, 'Agent SOUND_ENGINEER: audio design complete.');
    expect((commentParams as { body: string }).body).toContain('Agent SOUND_ENGINEER');
    expect((commentParams as { issue_number: number }).issue_number).toBe(10);
  });
});

// ─── T20-C: Error handling ────────────────────────────────────────────────────

describe('Integrations — Jira error scenarios', () => {
  it('throws AuthError on 401 response', async () => {
    mockFetchSequence([{ status: 401, body: { message: 'Unauthorized' } }]);
    const connector = new JiraConnector(jiraConfig);
    await expect(connector.fetchStories('APP')).rejects.toThrow(AuthError);
  });

  it('throws NotFoundError on 404 response', async () => {
    mockFetchSequence([{ status: 404, body: { message: 'Not found' } }]);
    const connector = new JiraConnector(jiraConfig);
    await expect(connector.getTransitions('APP-999')).rejects.toThrow(NotFoundError);
  });

  it('throws generic error on 500 response', async () => {
    mockFetchSequence([{ status: 500, body: { message: 'Server error' } }]);
    const connector = new JiraConnector(jiraConfig);
    await expect(connector.fetchStories('APP')).rejects.toThrow('unexpected status 500');
  });

  it('throws network error when fetch throws', async () => {
    globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
    const connector = new JiraConnector(jiraConfig);
    await expect(connector.fetchStories('APP')).rejects.toThrow('network error');
  });
});

describe('Integrations — GitHub error scenarios', () => {
  it('returns empty story list when repo has no open issues', async () => {
    const octokit = mockOctokit({ listForRepo: async () => ({ data: [] }) });
    const connector = new GitHubConnector(githubConfig, octokit);
    const stories = await connector.fetchIssues();
    expect(stories).toHaveLength(0);
  });

  it('filters out pull requests automatically', async () => {
    const octokit = mockOctokit({
      listForRepo: async () => ({
        data: [
          { number: 1, title: 'Real issue', body: null, labels: [], state: 'open' },
          { number: 2, title: 'A PR', body: null, labels: [], state: 'open', pull_request: { url: 'https://...' } },
        ],
      }),
    });

    const connector = new GitHubConnector(githubConfig, octokit);
    const stories = await connector.fetchIssues();
    expect(stories.length).toBe(1);
    expect(stories[0]!.sourceId).toBe('1');
  });

  it('propagates octokit errors on createPullRequest failure', async () => {
    const octokit = mockOctokit({
      createPull: async () => { throw new Error('Unprocessable Entity'); },
    });
    const connector = new GitHubConnector(githubConfig, octokit);
    await expect(
      connector.createPullRequest('feat: x', 'body', 'story/x', 'main', 5)
    ).rejects.toThrow('Unprocessable Entity');
  });
});
