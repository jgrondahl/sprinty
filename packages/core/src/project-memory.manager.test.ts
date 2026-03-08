import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ProjectMemoryManager,
  StoryManifestWriter,
  type StackInfo,
  type StoryManifest,
  type FileEntry,
  type ArtifactEntry,
  type ProjectMemory,
} from './project-memory';
import { type WorkspaceState } from './types';
import { WorkspaceManager } from './workspace';

let tmpDir: string;
let workspaceManager: WorkspaceManager;
let projectMemoryManager: ProjectMemoryManager;
let storyManifestWriter: StoryManifestWriter;
let ws: WorkspaceState;

const makeStack = (): StackInfo => ({
  language: 'typescript',
  runtime: 'bun',
  framework: 'hono',
  packageManager: 'bun',
  testFramework: 'bun:test',
  additionalDeps: ['zod'],
});

const makeStoryManifest = (): StoryManifest => ({
  storyId: 'story-001',
  title: 'Implement project memory persistence',
  completedAt: new Date().toISOString(),
  filesCreated: ['src/project-memory.ts'],
  filesModified: ['src/index.ts'],
  keyExports: ['ProjectMemoryManager', 'StoryManifestWriter'],
  dependencies: ['zod'],
  commands: {
    build: 'bun run build',
    test: 'bun test',
    run: 'bun run dev',
  },
  testStatus: 'pass',
  architectureDecisions: ['Use JSON file as source of truth for project memory'],
});

const makeFileEntry = (): FileEntry => ({
  path: 'src/project-memory.ts',
  createdBy: 'story-001',
  lastModifiedBy: 'story-001',
  exports: ['ProjectMemoryManager', 'StoryManifestWriter'],
  description: 'Holds project memory schemas and manager implementations',
});

const makeArtifactEntry = (): ArtifactEntry => ({
  type: 'architecture-plan',
  id: 'artifact-001',
  path: 'artifacts/architecture-plan.json',
  createdAt: new Date().toISOString(),
  relatedStories: ['story-001'],
});

const makeProjectMemory = (): ProjectMemory => {
  const now = new Date().toISOString();
  return {
    projectId: 'proj-001',
    createdAt: now,
    updatedAt: now,
    stack: makeStack(),
    stories: [makeStoryManifest()],
    sharedDecisions: ['Persist memory at project-level workspace'],
    knownConstraints: ['Schema validation must pass before writes'],
    fileIndex: [makeFileEntry()],
    artifactIndex: [makeArtifactEntry()],
  };
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-project-memory-'));
  workspaceManager = new WorkspaceManager(tmpDir);
  projectMemoryManager = new ProjectMemoryManager(workspaceManager);
  storyManifestWriter = new StoryManifestWriter(workspaceManager);
  ws = workspaceManager.createWorkspace('proj-001', 'story-001');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ProjectMemoryManager', () => {
  it('initialize creates project-memory.json and returns fresh memory', () => {
    const stack = makeStack();
    const created = projectMemoryManager.initialize('proj-001', stack);

    const fullPath = path.join(tmpDir, 'proj-001', 'project', 'project-memory.json');
    expect(fs.existsSync(fullPath)).toBe(true);
    expect(created.projectId).toBe('proj-001');
    expect(created.stack).toEqual(stack);
    expect(created.stories).toEqual([]);
    expect(created.sharedDecisions).toEqual([]);
    expect(created.knownConstraints).toEqual([]);
    expect(created.fileIndex).toEqual([]);
    expect(created.artifactIndex).toEqual([]);
  });

  it('save and load round-trip project memory', () => {
    const memory = makeProjectMemory();
    projectMemoryManager.save('proj-001', memory);

    const loaded = projectMemoryManager.load('proj-001');
    expect(loaded).toEqual(memory);
  });

  it('addStoryManifest appends manifest', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const manifest = makeStoryManifest();

    projectMemoryManager.addStoryManifest('proj-001', manifest);

    const loaded = projectMemoryManager.load('proj-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.stories).toHaveLength(1);
    expect(loaded!.stories[0]).toEqual(manifest);
  });

  it('addFileEntry appends file index entry', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const entry = makeFileEntry();

    projectMemoryManager.addFileEntry('proj-001', entry);

    const loaded = projectMemoryManager.load('proj-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.fileIndex).toHaveLength(1);
    expect(loaded!.fileIndex[0]).toEqual(entry);
  });

  it('addArtifactEntry appends artifact index entry', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const entry = makeArtifactEntry();

    projectMemoryManager.addArtifactEntry('proj-001', entry);

    const loaded = projectMemoryManager.load('proj-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.artifactIndex).toHaveLength(1);
    expect(loaded!.artifactIndex[0]).toEqual(entry);
  });

  it('getArtifactsByType returns only matching type entries', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const plan: ArtifactEntry = {
      type: 'global-architecture-plan',
      id: 'plan-001',
      path: 'artifacts/global-plan.json',
      createdAt: new Date().toISOString(),
      planLevel: 'global',
      relatedStories: ['story-001'],
    };
    const checkpoint: ArtifactEntry = {
      type: 'sprint-checkpoint',
      id: 'ckpt-001',
      path: 'artifacts/checkpoint.json',
      createdAt: new Date().toISOString(),
      relatedStories: ['story-001'],
    };
    projectMemoryManager.addArtifactEntry('proj-001', plan);
    projectMemoryManager.addArtifactEntry('proj-001', checkpoint);

    const results = projectMemoryManager.getArtifactsByType('proj-001', 'global-architecture-plan');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('plan-001');
  });

  it('getArtifactsByType returns empty array when no entries match', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const results = projectMemoryManager.getArtifactsByType('proj-001', 'run-telemetry');
    expect(results).toEqual([]);
  });

  it('getArtifactsByType returns empty array when memory does not exist', () => {
    const results = projectMemoryManager.getArtifactsByType('proj-unknown', 'architecture-plan');
    expect(results).toEqual([]);
  });

  it('getArtifactsBySprintId returns only entries with matching sprintId', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const sprintEntry: ArtifactEntry = {
      type: 'sprint-architecture-plan',
      id: 'sprint-plan-001',
      path: 'artifacts/sprint-plan.json',
      createdAt: new Date().toISOString(),
      sprintId: 'sprint-42',
      relatedStories: ['story-001'],
    };
    const otherSprint: ArtifactEntry = {
      type: 'sprint-architecture-plan',
      id: 'sprint-plan-002',
      path: 'artifacts/sprint-plan-002.json',
      createdAt: new Date().toISOString(),
      sprintId: 'sprint-99',
      relatedStories: ['story-002'],
    };
    projectMemoryManager.addArtifactEntry('proj-001', sprintEntry);
    projectMemoryManager.addArtifactEntry('proj-001', otherSprint);

    const results = projectMemoryManager.getArtifactsBySprintId('proj-001', 'sprint-42');
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('sprint-plan-001');
  });

  it('getArtifactsBySprintId returns empty array when memory does not exist', () => {
    const results = projectMemoryManager.getArtifactsBySprintId('proj-unknown', 'sprint-1');
    expect(results).toEqual([]);
  });

  it('getSupersessionChain returns single entry when no supersedes link', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const entry: ArtifactEntry = {
      type: 'architecture-plan',
      id: 'plan-v1',
      path: 'artifacts/plan-v1.json',
      createdAt: new Date().toISOString(),
      relatedStories: [],
    };
    projectMemoryManager.addArtifactEntry('proj-001', entry);

    const chain = projectMemoryManager.getSupersessionChain('proj-001', 'plan-v1');
    expect(chain).toHaveLength(1);
    expect(chain[0]!.id).toBe('plan-v1');
  });

  it('getSupersessionChain walks supersedes links from newest to oldest', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const v1: ArtifactEntry = {
      type: 'architecture-plan',
      id: 'plan-v1',
      path: 'artifacts/plan-v1.json',
      createdAt: new Date().toISOString(),
      relatedStories: [],
    };
    const v2: ArtifactEntry = {
      type: 'architecture-plan',
      id: 'plan-v2',
      path: 'artifacts/plan-v2.json',
      createdAt: new Date().toISOString(),
      relatedStories: [],
      supersedes: 'plan-v1',
    };
    const v3: ArtifactEntry = {
      type: 'architecture-plan',
      id: 'plan-v3',
      path: 'artifacts/plan-v3.json',
      createdAt: new Date().toISOString(),
      relatedStories: [],
      supersedes: 'plan-v2',
    };
    projectMemoryManager.addArtifactEntry('proj-001', v1);
    projectMemoryManager.addArtifactEntry('proj-001', v2);
    projectMemoryManager.addArtifactEntry('proj-001', v3);

    const chain = projectMemoryManager.getSupersessionChain('proj-001', 'plan-v3');
    expect(chain).toHaveLength(3);
    expect(chain.map((e) => e.id)).toEqual(['plan-v3', 'plan-v2', 'plan-v1']);
  });

  it('getSupersessionChain halts on cycle to prevent infinite loop', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    // Intentionally corrupt: a1 supersedes a2, a2 supersedes a1
    const a1: ArtifactEntry = {
      type: 'architecture-plan',
      id: 'a1',
      path: 'artifacts/a1.json',
      createdAt: new Date().toISOString(),
      relatedStories: [],
      supersedes: 'a2',
    };
    const a2: ArtifactEntry = {
      type: 'architecture-plan',
      id: 'a2',
      path: 'artifacts/a2.json',
      createdAt: new Date().toISOString(),
      relatedStories: [],
      supersedes: 'a1',
    };
    projectMemoryManager.addArtifactEntry('proj-001', a1);
    projectMemoryManager.addArtifactEntry('proj-001', a2);

    const chain = projectMemoryManager.getSupersessionChain('proj-001', 'a1');
    expect(chain).toHaveLength(2);
    expect(chain.map((e) => e.id)).toEqual(['a1', 'a2']);
  });

  it('getSupersessionChain returns empty array when artifact id not found', () => {
    projectMemoryManager.initialize('proj-001', makeStack());
    const chain = projectMemoryManager.getSupersessionChain('proj-001', 'nonexistent');
    expect(chain).toEqual([]);
  });

  it('getSupersessionChain returns empty array when memory does not exist', () => {
    const chain = projectMemoryManager.getSupersessionChain('proj-unknown', 'plan-v1');
    expect(chain).toEqual([]);
  });

  it('load returns null if project-memory.json does not exist', () => {
    const loaded = projectMemoryManager.load('proj-001');
    expect(loaded).toBeNull();
  });
});

describe('StoryManifestWriter', () => {
  it('write and read round-trip story manifest', () => {
    const manifest = makeStoryManifest();

    storyManifestWriter.write(ws, manifest);
    const loaded = storyManifestWriter.read(ws);

    expect(loaded).toEqual(manifest);
  });

  it('read returns null when story-manifest.json does not exist', () => {
    const loaded = storyManifestWriter.read(ws);
    expect(loaded).toBeNull();
  });
});
