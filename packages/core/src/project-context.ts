import type { WorkspaceState } from './types';
import {
  type FileContent,
  type ProjectContext,
  ProjectMemorySchema,
  ProjectMemoryManager,
} from './project-memory';
import { WorkspaceManager } from './workspace';

const ALLOWED_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.tsx',
  '.jsx',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.txt',
]);

const MAX_RELEVANT_FILES = 20;

export class ProjectContextBuilder {
  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly memoryManager: ProjectMemoryManager
  ) {}

  build(projectId: string, storyId: string, dependencyGraph: string[]): ProjectContext | null {
    const _storyContext: Pick<WorkspaceState, 'projectId' | 'storyId'> = { projectId, storyId };
    const memory = this.memoryManager.load(projectId);
    if (!memory) {
      return null;
    }

    const relevantFiles: FileContent[] = [];
    const projectFiles = this.workspaceManager.listProjectFiles(projectId);

    for (const filePath of projectFiles) {
      if (relevantFiles.length >= MAX_RELEVANT_FILES) {
        break;
      }

      if (!this.isAllowedFile(filePath)) {
        continue;
      }

      try {
        const content = this.workspaceManager.readProjectFile(projectId, filePath);
        relevantFiles.push({ path: filePath, content });
      } catch {
        continue;
      }
    }

    return {
      memory,
      relevantFiles,
      dependencyGraph,
    };
  }

  buildEmpty(projectId: string): ProjectContext {
    const now = new Date().toISOString();
    const memory = ProjectMemorySchema.parse({
      projectId,
      createdAt: now,
      updatedAt: now,
      stack: {
        language: 'unknown',
        runtime: 'unknown',
        additionalDeps: [],
      },
      stories: [],
      sharedDecisions: [],
      knownConstraints: [],
      fileIndex: [],
      artifactIndex: [],
    });

    return {
      memory,
      relevantFiles: [],
      dependencyGraph: [],
    };
  }

  private isAllowedFile(filePath: string): boolean {
    const lastDot = filePath.lastIndexOf('.');
    if (lastDot === -1) {
      return false;
    }

    const extension = filePath.slice(lastDot).toLowerCase();
    return ALLOWED_EXTENSIONS.has(extension);
  }
}
