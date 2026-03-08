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
