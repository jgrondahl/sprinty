import { z } from 'zod';
import type { WorkspaceState } from './types';
import { WorkspaceManager } from './workspace';

export const StoryManifestSchema = z.object({
  storyId: z.string(),
  title: z.string(),
  completedAt: z.string().datetime(),
  filesCreated: z.array(z.string()),
  filesModified: z.array(z.string()),
  keyExports: z.array(z.string()),
  dependencies: z.array(z.string()),
  commands: z.object({
    build: z.string(),
    test: z.string(),
    run: z.string().optional(),
  }),
  testStatus: z.enum(['pass', 'fail', 'skip']),
  architectureDecisions: z.array(z.string()),
});
export type StoryManifest = z.infer<typeof StoryManifestSchema>;

export const FileEntrySchema = z.object({
  path: z.string(),
  createdBy: z.string(),
  lastModifiedBy: z.string(),
  exports: z.array(z.string()),
  description: z.string(),
});
export type FileEntry = z.infer<typeof FileEntrySchema>;

export const ArtifactTypeSchema = z.enum([
  'global-architecture-plan',
  'sprint-architecture-plan',
  'architecture-plan',
  'sprint-task-plan',
  'sprint-checkpoint',
  'enforcement-report',
  'sandbox-result',
  'architecture-decision',
  'run-telemetry',
  'revision-trigger',
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const ArtifactEntrySchema = z.object({
  type: ArtifactTypeSchema,
  id: z.string(),
  path: z.string(),
  createdAt: z.string().datetime(),
  planLevel: z.enum(['global', 'sprint']).optional(),
  scopeKey: z.string().optional(),
  sprintId: z.string().optional(),
  relatedStories: z.array(z.string()),
  supersedes: z.string().optional(),
  parentRef: z.string().optional(),
});
export type ArtifactEntry = z.infer<typeof ArtifactEntrySchema>;

export const StackInfoSchema = z.object({
  language: z.string(),
  runtime: z.string(),
  framework: z.string().optional(),
  packageManager: z.string().optional(),
  testFramework: z.string().optional(),
  additionalDeps: z.array(z.string()).default([]),
});
export type StackInfo = z.infer<typeof StackInfoSchema>;

export const ProjectMemorySchema = z.object({
  projectId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  stack: StackInfoSchema,
  stories: z.array(StoryManifestSchema),
  sharedDecisions: z.array(z.string()),
  knownConstraints: z.array(z.string()),
  fileIndex: z.array(FileEntrySchema),
  artifactIndex: z.array(ArtifactEntrySchema),
});
export type ProjectMemory = z.infer<typeof ProjectMemorySchema>;

export const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
});
export type FileContent = z.infer<typeof FileContentSchema>;

export const ProjectContextSchema = z.object({
  memory: ProjectMemorySchema,
  relevantFiles: z.array(FileContentSchema),
  dependencyGraph: z.array(z.string()),
});
export type ProjectContext = z.infer<typeof ProjectContextSchema>;

const PROJECT_MEMORY_FILE = 'project-memory.json';
const STORY_MANIFEST_FILE = 'story-manifest.json';

export class ProjectMemoryManager {
  constructor(private readonly workspaceManager: WorkspaceManager) {}

  load(projectId: string): ProjectMemory | null {
    try {
      const raw = this.workspaceManager.readProjectFile(projectId, PROJECT_MEMORY_FILE);
      return ProjectMemorySchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  save(projectId: string, memory: ProjectMemory): void {
    const validated = ProjectMemorySchema.parse(memory);
    this.workspaceManager.writeProjectFile(
      projectId,
      PROJECT_MEMORY_FILE,
      JSON.stringify(validated, null, 2)
    );
  }

  initialize(projectId: string, stack: StackInfo): ProjectMemory {
    const now = new Date().toISOString();
    const memory: ProjectMemory = {
      projectId,
      createdAt: now,
      updatedAt: now,
      stack,
      stories: [],
      sharedDecisions: [],
      knownConstraints: [],
      fileIndex: [],
      artifactIndex: [],
    };

    this.save(projectId, memory);
    return memory;
  }

  addStoryManifest(projectId: string, manifest: StoryManifest): void {
    const memory =
      this.load(projectId) ??
      this.initialize(projectId, {
        language: 'unknown',
        runtime: 'unknown',
        additionalDeps: [],
      });

    memory.stories.push(manifest);
    memory.updatedAt = new Date().toISOString();
    this.save(projectId, memory);
  }

  addFileEntry(projectId: string, entry: FileEntry): void {
    const memory =
      this.load(projectId) ??
      this.initialize(projectId, {
        language: 'unknown',
        runtime: 'unknown',
        additionalDeps: [],
      });

    memory.fileIndex.push(entry);
    memory.updatedAt = new Date().toISOString();
    this.save(projectId, memory);
  }

  addArtifactEntry(projectId: string, entry: ArtifactEntry): void {
    const memory =
      this.load(projectId) ??
      this.initialize(projectId, {
        language: 'unknown',
        runtime: 'unknown',
        additionalDeps: [],
      });

    memory.artifactIndex.push(entry);
    memory.updatedAt = new Date().toISOString();
    this.save(projectId, memory);
  }

  getArtifactsByType(projectId: string, type: ArtifactType): ArtifactEntry[] {
    const memory = this.load(projectId);
    if (!memory) return [];
    return memory.artifactIndex.filter((a) => a.type === type);
  }

  getArtifactsBySprintId(projectId: string, sprintId: string): ArtifactEntry[] {
    const memory = this.load(projectId);
    if (!memory) return [];
    return memory.artifactIndex.filter((a) => a.sprintId === sprintId);
  }

  getSupersessionChain(projectId: string, artifactId: string): ArtifactEntry[] {
    const memory = this.load(projectId);
    if (!memory) return [];
    const index = memory.artifactIndex;
    const chain: ArtifactEntry[] = [];
    let currentId: string | undefined = artifactId;
    const visited = new Set<string>();
    while (currentId !== undefined) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      const entry = index.find((a) => a.id === currentId);
      if (!entry) break;
      chain.push(entry);
      currentId = entry.supersedes;
    }
    return chain;
  }
}

export class StoryManifestWriter {
  constructor(private readonly workspaceManager: WorkspaceManager) {}

  write(ws: WorkspaceState, manifest: StoryManifest): void {
    const validated = StoryManifestSchema.parse(manifest);
    this.workspaceManager.writeFile(ws, STORY_MANIFEST_FILE, JSON.stringify(validated, null, 2));
  }

  read(ws: WorkspaceState): StoryManifest | null {
    try {
      const raw = this.workspaceManager.readFile(ws, STORY_MANIFEST_FILE);
      return StoryManifestSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
