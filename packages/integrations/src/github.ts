import { Octokit } from '@octokit/rest';
import {
  StoryState,
  StorySource,
  type Story,
} from '@splinty/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

// Minimal shape of a GitHub issue as returned by Octokit
export interface GitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  labels: Array<{ name?: string } | string>;
  state: string;
}

// ─── GitHubConnector ──────────────────────────────────────────────────────────

export class GitHubConnector {
  private readonly owner: string;
  private readonly repo: string;
  private readonly octokit: Octokit;

  constructor(config: GitHubConfig, octokitInstance?: Octokit) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.octokit = octokitInstance ?? new Octokit({ auth: config.token });
  }

  /**
   * Fetch open issues, optionally filtered by labels.
   * Returns Story[] with source === GITHUB.
   */
  async fetchIssues(labels?: string[]): Promise<Story[]> {
    const params: Parameters<Octokit['rest']['issues']['listForRepo']>[0] = {
      owner: this.owner,
      repo: this.repo,
      state: 'open',
      per_page: 100,
    };

    if (labels && labels.length > 0) {
      params.labels = labels.join(',');
    }

    const { data } = await this.octokit.rest.issues.listForRepo(params);

    // Filter out pull requests (GitHub API returns PRs in issues endpoint)
    const issues = data.filter((issue) => !('pull_request' in issue));
    return issues.map((issue) => this.parseGitHubIssue(issue as GitHubIssue));
  }

  /**
   * Maps a GitHub issue to the Story type.
   */
  parseGitHubIssue(issue: GitHubIssue): Story {
    const now = new Date().toISOString();
    const tags = issue.labels
      .map((l) => (typeof l === 'string' ? l : (l.name ?? '')))
      .filter(Boolean);

    return {
      id: `github-${issue.number}`,
      title: issue.title,
      description: issue.body ?? '',
      acceptanceCriteria: [],
      state: StoryState.RAW,
      source: StorySource.GITHUB,
      sourceId: String(issue.number),
      workspacePath: '',
      domain: 'general',
      tags,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Add a comment to a GitHub issue.
   */
  async addComment(issueNumber: number, body: string): Promise<void> {
    await this.octokit.rest.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
  }

  /**
   * Add a label to a GitHub issue. Creates the label if it doesn't exist.
   */
  async addLabel(issueNumber: number, label: string): Promise<void> {
    await this.octokit.rest.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [label],
    });
  }

  /**
   * Create a branch from a base branch (defaults to 'main').
   * Uses the Git Data API to create a ref from the latest commit SHA.
   */
  async createBranch(branchName: string, fromBranch = 'main'): Promise<void> {
    // Get the SHA of the head of fromBranch
    const { data: ref } = await this.octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${fromBranch}`,
    });

    await this.octokit.rest.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });
  }

  /**
   * Create a pull request and return the PR URL.
   * PR body auto-references the issue with "Closes #issueNumber".
   */
  async createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string,
    issueNumber: number
  ): Promise<string> {
    const prBody = `${body}\n\nCloses #${issueNumber}`;

    const { data: pr } = await this.octokit.rest.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title,
      body: prBody,
      head,
      base,
    });

    return pr.html_url;
  }
}
