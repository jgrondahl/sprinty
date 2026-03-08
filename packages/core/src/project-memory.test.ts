import { describe, expect, it } from 'bun:test';
import {
  ArtifactEntrySchema,
  ArtifactTypeSchema,
  FileEntrySchema,
  ProjectContextSchema,
  ProjectMemorySchema,
  StackInfoSchema,
  StoryManifestSchema,
} from './project-memory';

const now = new Date().toISOString();

const validStoryManifest = {
  storyId: 'story-001',
  title: 'Implement login flow',
  completedAt: now,
  filesCreated: ['src/login.ts'],
  filesModified: ['src/app.ts'],
  keyExports: ['login'],
  dependencies: ['zod'],
  commands: {
    build: 'bunx tsc --noEmit',
    test: 'bun test',
    run: 'bun run src/index.ts',
  },
  testStatus: 'pass' as const,
  architectureDecisions: ['Use token-based auth'],
};

const validProjectMemory = {
  projectId: 'proj-001',
  createdAt: now,
  updatedAt: now,
  stack: {
    language: 'TypeScript',
    runtime: 'Bun',
  },
  stories: [validStoryManifest],
  sharedDecisions: ['Use zod for validation'],
  knownConstraints: ['No circular imports'],
  fileIndex: [
    {
      path: 'src/login.ts',
      createdBy: 'story-001',
      lastModifiedBy: 'story-001',
      exports: ['login'],
      description: 'Login entrypoint',
    },
  ],
  artifactIndex: [
    {
      type: 'architecture-plan' as const,
      id: 'artifact-001',
      path: 'artifacts/architecture-plan-001.json',
      createdAt: now,
      relatedStories: ['story-001'],
    },
  ],
};

describe('StoryManifestSchema', () => {
  it('parses a valid manifest', () => {
    const result = StoryManifestSchema.parse(validStoryManifest);
    expect(result.storyId).toBe('story-001');
    expect(result.testStatus).toBe('pass');
  });

  it('rejects missing required fields', () => {
    const { storyId: _storyId, ...missingStoryId } = validStoryManifest;
    expect(() => StoryManifestSchema.parse(missingStoryId)).toThrow();
  });

  it('accepts commands.run as optional', () => {
    const { run: _run, ...commandsWithoutRun } = validStoryManifest.commands;
    const result = StoryManifestSchema.parse({
      ...validStoryManifest,
      commands: commandsWithoutRun,
    });
    expect(result.commands.run).toBeUndefined();
  });

  it('rejects missing architectureDecisions', () => {
    const { architectureDecisions: _architectureDecisions, ...missingField } =
      validStoryManifest;
    expect(() => StoryManifestSchema.parse(missingField)).toThrow();
  });
});

describe('FileEntrySchema', () => {
  it('parses a valid file entry', () => {
    const result = FileEntrySchema.parse({
      path: 'src/auth.ts',
      createdBy: 'story-001',
      lastModifiedBy: 'story-002',
      exports: ['authenticate'],
      description: 'Auth module',
    });
    expect(result.path).toBe('src/auth.ts');
  });
});

describe('Artifact schemas', () => {
  it('accepts selected enum values for artifact type', () => {
    expect(ArtifactTypeSchema.parse('global-architecture-plan')).toBe('global-architecture-plan');
    expect(ArtifactTypeSchema.parse('sprint-task-plan')).toBe('sprint-task-plan');
    expect(ArtifactTypeSchema.parse('revision-trigger')).toBe('revision-trigger');
  });

  it('rejects unknown artifact type values', () => {
    expect(() => ArtifactTypeSchema.parse('unknown-type')).toThrow();
  });

  it('parses artifact entry without optional fields', () => {
    const result = ArtifactEntrySchema.parse({
      type: 'architecture-plan',
      id: 'artifact-002',
      path: 'artifacts/architecture-plan-002.json',
      createdAt: now,
      relatedStories: ['story-002'],
    });
    expect(result.planLevel).toBeUndefined();
    expect(result.scopeKey).toBeUndefined();
    expect(result.sprintId).toBeUndefined();
  });

  it('accepts optional supersedes field', () => {
    const result = ArtifactEntrySchema.parse({
      type: 'sprint-checkpoint',
      id: 'artifact-003',
      path: 'artifacts/sprint-checkpoint-003.json',
      createdAt: now,
      relatedStories: ['story-003'],
      supersedes: 'artifact-001',
    });
    expect(result.supersedes).toBe('artifact-001');
  });
});

describe('StackInfoSchema', () => {
  it('parses minimal fields and defaults additionalDeps', () => {
    const result = StackInfoSchema.parse({
      language: 'TypeScript',
      runtime: 'Bun',
    });
    expect(result.language).toBe('TypeScript');
    expect(result.runtime).toBe('Bun');
    expect(result.additionalDeps).toEqual([]);
  });
});

describe('ProjectMemorySchema', () => {
  it('parses with empty stories, fileIndex, and artifactIndex arrays', () => {
    const result = ProjectMemorySchema.parse({
      ...validProjectMemory,
      stories: [],
      fileIndex: [],
      artifactIndex: [],
    });
    expect(result.stories).toEqual([]);
    expect(result.fileIndex).toEqual([]);
    expect(result.artifactIndex).toEqual([]);
  });

  it('parses nested StoryManifest entries', () => {
    const result = ProjectMemorySchema.parse(validProjectMemory);
    expect(result.stories[0]).toMatchObject({
      storyId: 'story-001',
      title: 'Implement login flow',
    });
  });
});

describe('ProjectContextSchema', () => {
  it('parses with empty relevantFiles', () => {
    const result = ProjectContextSchema.parse({
      memory: validProjectMemory,
      relevantFiles: [],
      dependencyGraph: ['story-000'],
    });
    expect(result.relevantFiles).toEqual([]);
  });

  it('parses with FileContent entries', () => {
    const result = ProjectContextSchema.parse({
      memory: validProjectMemory,
      relevantFiles: [{ path: 'src/login.ts', content: 'export const login = () => {};' }],
      dependencyGraph: ['story-000', 'story-010'],
    });
    expect(result).toMatchObject({
      relevantFiles: [{ path: 'src/login.ts' }],
      dependencyGraph: ['story-000', 'story-010'],
    });
  });
});
