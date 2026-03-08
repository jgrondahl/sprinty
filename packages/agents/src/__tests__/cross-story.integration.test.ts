import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SprintOrchestrator } from '../orchestrator';
import { DeveloperAgent } from '../developer';
import {
  ProjectMemoryManager,
  WorkspaceManager,
  StoryState,
  StorySource,
  type HandoffDocument,
  type LlmClient,
  type Story,
} from '@splinty/core';

type MockResponse = object;

function makeQueuedClient(queue: MockResponse[]): LlmClient {
  let idx = 0;
  return {
    complete: async () => {
      const resp = queue[idx] ?? queue[queue.length - 1]!;
      idx++;
      return JSON.stringify(resp);
    },
  };
}

function makeMockGit() {
  return (_repoPath: string) =>
    ({
      init: async () => {},
      checkoutLocalBranch: async () => {},
      add: async () => {},
      commit: async () => ({
        commit: 'abc1234',
        summary: { changes: 1, insertions: 5, deletions: 0 },
        author: null,
        root: false,
        branch: 'story/test',
      }),
      push: async () => {},
    }) as never;
}

const now = new Date().toISOString();

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 'story-x',
    title: 'Test story',
    description: 'A test story',
    acceptanceCriteria: ['Given X, Then Y'],
    dependsOn: [],
    state: StoryState.RAW,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'auth',
    tags: ['auth'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const bizResp = {
  businessGoals: 'Enable secure login',
  successMetrics: '1000 DAU',
  riskFactors: 'Token theft',
  epicSummary: 'Build JWT login system.',
};

const poResp = {
  title: 'As a user, I want to log in',
  description: 'Secure JWT login',
  acceptanceCriteria: ['Given valid creds, When I submit, Then I receive JWT'],
  priority: 'MUST',
  storyPoints: 3,
  domain: 'auth',
  tags: ['auth'],
};

const archResp = {
  adr: '# ADR\n\n## Decision\nUse JWT.',
  diagram: 'C4Context\n  title Auth',
  techStack: 'TypeScript, Node.js, JWT',
  soundEngineerRequired: false,
  soundEngineerRationale: 'No audio features',
};

const qaPassResp = {
  passedAC: ['Given valid creds, When I submit, Then I receive JWT'],
  failedAC: [],
  bugs: [],
  verdict: 'PASS',
  additionalTests: [],
  report: '# QA Report\n\nVerdict: PASS',
};

const readmeResp = {
  readme: '# Auth Service\n\nJWT login.\n\n## Usage\n\n```bash\nbun run start\n```\n\n## Testing\n\n```bash\nbun test\n```',
  additionalDocs: [],
};

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-cross-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('cross-story integration', () => {
  it('Story 2 depends on Story 1: stories run in order, Story 1 files promoted, Story 2 receives projectContext', async () => {
    const executionOrder: string[] = [];
    const story1DevResponses: { path: string; content: string }[][] = [];

    const story1 = makeStory({
      id: 'story-1',
      title: 'Implement auth service',
      dependsOn: [],
    });

    const story2 = makeStory({
      id: 'story-2',
      title: 'Implement auth middleware',
      dependsOn: ['story-1'],
    });

    const devRespStory1 = {
      files: [
        { path: 'auth/service.ts', content: 'export function login() { return "jwt"; }' },
        { path: 'auth/service.test.ts', content: 'import { describe, it, expect } from "bun:test";\ndescribe("login", () => { it("works", () => { expect(true).toBe(true); }); });' },
      ],
      testCommand: 'bun test',
      summary: 'Auth service implemented',
    };

    const devRespStory2 = {
      files: [
        { path: 'auth/middleware.ts', content: 'export function authMiddleware() { return true; }' },
        { path: 'auth/middleware.test.ts', content: 'import { describe, it, expect } from "bun:test";\ndescribe("middleware", () => { it("works", () => { expect(true).toBe(true); }); });' },
      ],
      testCommand: 'bun test',
      summary: 'Auth middleware implemented',
    };

    const client = makeQueuedClient([
      bizResp, poResp, archResp, devRespStory1, qaPassResp, readmeResp,
      bizResp, poResp, archResp, devRespStory2, qaPassResp, readmeResp,
    ]);

    let story2DevHandoff: HandoffDocument | null = null;
    const originalExecute = DeveloperAgent.prototype.execute;
    DeveloperAgent.prototype.execute = async function (handoff, story) {
      executionOrder.push(story.id);
      story1DevResponses.push([]);
      if (story.id === 'story-2') {
        story2DevHandoff = handoff;
      }
      return originalExecute.call(this, handoff, story);
    };

    try {
      const orch = new SprintOrchestrator({
        projectId: 'cross-proj',
        workspaceBaseDir: tmpDir,
        defaultClient: client,
        gitFactory: makeMockGit(),
      });

      const results = await orch.run([story2, story1]);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.testResults.failed === 0)).toBe(true);

      expect(executionOrder[0]).toBe('story-1');
      expect(executionOrder[1]).toBe('story-2');

      const promotedFile = path.join(tmpDir, 'cross-proj', 'project', 'src', 'auth', 'service.ts');
      expect(fs.existsSync(promotedFile)).toBe(true);

      const workspaceMgr = new WorkspaceManager(tmpDir);
      const memoryMgr = new ProjectMemoryManager(workspaceMgr);
      const memory = memoryMgr.load('cross-proj');
      expect(memory).not.toBeNull();
      expect(memory!.fileIndex.length).toBeGreaterThan(0);
      const story1FileEntry = memory!.fileIndex.find((e) => e.createdBy === 'story-1');
      expect(story1FileEntry).toBeDefined();

      expect(story2DevHandoff).not.toBeNull();
      expect(story2DevHandoff!.projectContext).toBeDefined();
      expect(story2DevHandoff!.projectContext!.memory.projectId).toBe('cross-proj');

      const storyManifestPath = path.join(tmpDir, 'cross-proj', 'stories', 'story-1', 'story-manifest.json');
      expect(fs.existsSync(storyManifestPath)).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(storyManifestPath, 'utf-8')) as { storyId: string };
      expect(manifest.storyId).toBe('story-1');
    } finally {
      DeveloperAgent.prototype.execute = originalExecute;
    }
  });

  it('file conflict detection emits console.warn when two stories claim the same file', async () => {
    const workspaceMgr = new WorkspaceManager(tmpDir);
    workspaceMgr.createProjectWorkspace('cross-proj');
    const memoryMgr = new ProjectMemoryManager(workspaceMgr);
    memoryMgr.initialize('cross-proj', { language: 'TypeScript', runtime: 'Bun', additionalDeps: [] });
    memoryMgr.addFileEntry('cross-proj', {
      path: 'src/auth/service.ts',
      createdBy: 'story-1',
      lastModifiedBy: 'story-1',
      exports: ['login'],
      description: 'Auth service',
    });
    memoryMgr.addFileEntry('cross-proj', {
      path: 'src/auth/service.ts',
      createdBy: 'story-2',
      lastModifiedBy: 'story-2',
      exports: ['login'],
      description: 'Auth service duplicate',
    });

    const warns: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warns.push(args.join(' ')); };

    try {
      const orch = new SprintOrchestrator({
        projectId: 'cross-proj',
        workspaceBaseDir: tmpDir,
        defaultClient: makeQueuedClient([]),
      });

      (orch as unknown as { runStory: (s: Story) => Promise<{ storyId: string; gitBranch: string; commitShas: string[]; testResults: { passed: number; failed: number; skipped: number }; duration: number }> }).runStory = async (story) => ({
        storyId: story.id,
        gitBranch: `story/${story.id}`,
        commitShas: [],
        testResults: { passed: 1, failed: 0, skipped: 0 },
        duration: 0,
      });

      await orch.run([
        makeStory({ id: 'story-1', dependsOn: [] }),
        makeStory({ id: 'story-2', dependsOn: [] }),
      ]);
    } finally {
      console.warn = originalWarn;
    }

    const conflictWarn = warns.find((w) => w.includes('File conflict') && w.includes('src/auth/service.ts'));
    expect(conflictWarn).toBeDefined();
  });

  it('retrieval tracker emits console.warn when developer does not retrieve requested files', async () => {
    const warns: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => { warns.push(args.join(' ')); };

    const workspaceMgr = new WorkspaceManager(tmpDir);
    workspaceMgr.createProjectWorkspace('cross-proj');
    const memoryMgr = new ProjectMemoryManager(workspaceMgr);
    memoryMgr.initialize('cross-proj', { language: 'TypeScript', runtime: 'Bun', additionalDeps: [] });
    memoryMgr.addFileEntry('cross-proj', {
      path: 'src/auth/service.ts',
      createdBy: 'story-1',
      lastModifiedBy: 'story-1',
      exports: ['login'],
      description: 'Auth service from story-1',
    });
    workspaceMgr.writeProjectFile('cross-proj', 'src/auth/service.ts', 'export function login() {}');

    const originalExecute = DeveloperAgent.prototype.execute;
    DeveloperAgent.prototype.execute = async function (handoff, story) {
      const result = await originalExecute.call(this, handoff, story);
      return result;
    };

    const devRespNoFilesRead = {
      files: [
        { path: 'auth/middleware.ts', content: 'export function authMiddleware() { return true; }' },
        { path: 'auth/middleware.test.ts', content: 'import { describe, it, expect } from "bun:test";\ndescribe("m", () => { it("works", () => { expect(true).toBe(true); }); });' },
      ],
      testCommand: 'bun test',
      summary: 'Done',
    };

    const client = makeQueuedClient([
      bizResp, poResp, archResp, devRespNoFilesRead, qaPassResp, readmeResp,
    ]);

    try {
      const orch = new SprintOrchestrator({
        projectId: 'cross-proj',
        workspaceBaseDir: tmpDir,
        defaultClient: client,
        gitFactory: makeMockGit(),
      });

      await orch.run([makeStory({ id: 'story-2', dependsOn: ['story-1'] })]);
    } finally {
      DeveloperAgent.prototype.execute = originalExecute;
      console.warn = originalWarn;
    }

    const missWarn = warns.find((w) => w.includes('story-2') && w.includes('not retrieved'));
    expect(missWarn).toBeDefined();
  });
});
