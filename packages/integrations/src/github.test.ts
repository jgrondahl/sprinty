import { describe, it, expect } from 'bun:test';
import { GitHubConnector } from './github';
import { StorySource, StoryState } from '@splinty/core';
import type { Octokit } from '@octokit/rest';

const config = {
  owner: 'test-org',
  repo: 'test-repo',
  token: 'fake-token',
};

// ─── Mock Octokit Builder ─────────────────────────────────────────────────────

function mockOctokit(overrides: Partial<{
  listForRepo: (params: unknown) => Promise<{ data: unknown[] }>;
  createComment: (params: unknown) => Promise<void>;
  addLabels: (params: unknown) => Promise<void>;
  getRef: (params: unknown) => Promise<{ data: { object: { sha: string } } }>;
  createRef: (params: unknown) => Promise<void>;
  createPull: (params: unknown) => Promise<{ data: { html_url: string } }>;
}> = {}): Octokit {
  return {
    rest: {
      issues: {
        listForRepo: overrides.listForRepo ?? (async () => ({ data: [] })),
        createComment: overrides.createComment ?? (async () => {}),
        addLabels: overrides.addLabels ?? (async () => {}),
      },
      git: {
        getRef: overrides.getRef ?? (async () => ({ data: { object: { sha: 'abc123' } } })),
        createRef: overrides.createRef ?? (async () => {}),
      },
      pulls: {
        create: overrides.createPull ?? (async () => ({ data: { html_url: 'https://github.com/test-org/test-repo/pull/1' } })),
      },
    },
  } as unknown as Octokit;
}

// ─── fetchIssues ─────────────────────────────────────────────────────────────

describe('GitHubConnector — fetchIssues', () => {
  it('returns Story[] with source GITHUB', async () => {
    const octokit = mockOctokit({
      listForRepo: async () => ({
        data: [
          {
            number: 42,
            title: 'Add login feature',
            body: 'Users need to be able to log in',
            labels: [{ name: 'auth' }, { name: 'security' }],
            state: 'open',
          },
        ],
      }),
    });

    const connector = new GitHubConnector(config, octokit);
    const stories = await connector.fetchIssues();

    expect(stories.length).toBe(1);
    expect(stories[0]!.source).toBe(StorySource.GITHUB);
    expect(stories[0]!.sourceId).toBe('42');
    expect(stories[0]!.title).toBe('Add login feature');
    expect(stories[0]!.state).toBe(StoryState.RAW);
    expect(stories[0]!.tags).toContain('auth');
    expect(stories[0]!.tags).toContain('security');
  });

  it('filters by labels when provided', async () => {
    let capturedParams: unknown;
    const octokit = mockOctokit({
      listForRepo: async (params) => {
        capturedParams = params;
        return { data: [] };
      },
    });

    const connector = new GitHubConnector(config, octokit);
    await connector.fetchIssues(['audio', 'ml']);

    expect((capturedParams as { labels: string }).labels).toBe('audio,ml');
  });

  it('filters out pull requests from results', async () => {
    const octokit = mockOctokit({
      listForRepo: async () => ({
        data: [
          { number: 1, title: 'Issue', body: null, labels: [], state: 'open' },
          { number: 2, title: 'PR', body: null, labels: [], state: 'open', pull_request: { url: 'https://...' } },
        ],
      }),
    });

    const connector = new GitHubConnector(config, octokit);
    const stories = await connector.fetchIssues();

    expect(stories.length).toBe(1);
    expect(stories[0]!.sourceId).toBe('1');
  });

  it('returns empty array when no issues', async () => {
    const connector = new GitHubConnector(config, mockOctokit());
    const stories = await connector.fetchIssues();
    expect(stories.length).toBe(0);
  });
});

// ─── parseGitHubIssue ─────────────────────────────────────────────────────────

describe('GitHubConnector — parseGitHubIssue', () => {
  it('maps issue fields to Story correctly', () => {
    const connector = new GitHubConnector(config, mockOctokit());
    const story = connector.parseGitHubIssue({
      number: 99,
      title: 'Build audio player',
      body: 'Users want to play audio',
      labels: [{ name: 'audio' }],
      state: 'open',
    });

    expect(story.id).toBe('github-99');
    expect(story.title).toBe('Build audio player');
    expect(story.description).toBe('Users want to play audio');
    expect(story.source).toBe(StorySource.GITHUB);
    expect(story.sourceId).toBe('99');
    expect(story.tags).toContain('audio');
  });

  it('handles null body gracefully', () => {
    const connector = new GitHubConnector(config, mockOctokit());
    const story = connector.parseGitHubIssue({
      number: 1,
      title: 'No body',
      body: null,
      labels: [],
      state: 'open',
    });
    expect(story.description).toBe('');
  });

  it('handles string labels', () => {
    const connector = new GitHubConnector(config, mockOctokit());
    const story = connector.parseGitHubIssue({
      number: 3,
      title: 'String labels',
      body: 'desc',
      labels: ['bug', 'enhancement'],
      state: 'open',
    });
    expect(story.tags).toContain('bug');
    expect(story.tags).toContain('enhancement');
  });
});

// ─── addComment ──────────────────────────────────────────────────────────────

describe('GitHubConnector — addComment', () => {
  it('calls createComment with correct parameters', async () => {
    let capturedParams: unknown;
    const octokit = mockOctokit({
      createComment: async (params) => { capturedParams = params; },
    });

    const connector = new GitHubConnector(config, octokit);
    await connector.addComment(42, 'Agent ARCHITECT completed design');

    const p = capturedParams as { owner: string; repo: string; issue_number: number; body: string };
    expect(p.owner).toBe('test-org');
    expect(p.repo).toBe('test-repo');
    expect(p.issue_number).toBe(42);
    expect(p.body).toBe('Agent ARCHITECT completed design');
  });
});

// ─── addLabel ────────────────────────────────────────────────────────────────

describe('GitHubConnector — addLabel', () => {
  it('calls addLabels with correct parameters', async () => {
    let capturedParams: unknown;
    const octokit = mockOctokit({
      addLabels: async (params) => { capturedParams = params; },
    });

    const connector = new GitHubConnector(config, octokit);
    await connector.addLabel(42, 'splinty:in-progress');

    const p = capturedParams as { labels: string[] };
    expect(p.labels).toContain('splinty:in-progress');
  });
});

// ─── createBranch ────────────────────────────────────────────────────────────

describe('GitHubConnector — createBranch', () => {
  it('creates branch from main by default', async () => {
    let getRefParams: unknown;
    let createRefParams: unknown;

    const octokit = mockOctokit({
      getRef: async (params) => {
        getRefParams = params;
        return { data: { object: { sha: 'deadbeef' } } };
      },
      createRef: async (params) => { createRefParams = params; },
    });

    const connector = new GitHubConnector(config, octokit);
    await connector.createBranch('story/login-feature');

    expect((getRefParams as { ref: string }).ref).toBe('heads/main');
    expect((createRefParams as { ref: string; sha: string }).ref).toBe('refs/heads/story/login-feature');
    expect((createRefParams as { sha: string }).sha).toBe('deadbeef');
  });

  it('creates branch from custom base', async () => {
    let getRefParams: unknown;
    const octokit = mockOctokit({
      getRef: async (params) => {
        getRefParams = params;
        return { data: { object: { sha: 'cafebabe' } } };
      },
      createRef: async () => {},
    });

    const connector = new GitHubConnector(config, octokit);
    await connector.createBranch('hotfix/patch', 'develop');

    expect((getRefParams as { ref: string }).ref).toBe('heads/develop');
  });
});

// ─── createPullRequest ────────────────────────────────────────────────────────

describe('GitHubConnector — createPullRequest', () => {
  it('returns PR URL', async () => {
    const octokit = mockOctokit({
      createPull: async () => ({
        data: { html_url: 'https://github.com/test-org/test-repo/pull/7' },
      }),
    });

    const connector = new GitHubConnector(config, octokit);
    const url = await connector.createPullRequest(
      'feat: login',
      'Implements login functionality',
      'story/login',
      'main',
      42
    );

    expect(url).toBe('https://github.com/test-org/test-repo/pull/7');
  });

  it('PR body contains Closes #issueNumber', async () => {
    let capturedBody = '';
    const octokit = mockOctokit({
      createPull: async (params) => {
        capturedBody = (params as { body: string }).body;
        return { data: { html_url: 'https://github.com/test-org/test-repo/pull/8' } };
      },
    });

    const connector = new GitHubConnector(config, octokit);
    await connector.createPullRequest('feat: login', 'Some description', 'story/login', 'main', 42);

    expect(capturedBody).toContain('Closes #42');
  });

  it('PR body preserves the original body text', async () => {
    let capturedBody = '';
    const octokit = mockOctokit({
      createPull: async (params) => {
        capturedBody = (params as { body: string }).body;
        return { data: { html_url: 'https://github.com/test-org/test-repo/pull/9' } };
      },
    });

    const connector = new GitHubConnector(config, octokit);
    await connector.createPullRequest('feat: audio', 'Audio streaming implementation', 'story/audio', 'main', 99);

    expect(capturedBody).toContain('Audio streaming implementation');
    expect(capturedBody).toContain('Closes #99');
  });
});
