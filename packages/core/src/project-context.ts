import type { WorkspaceState } from './types';
import {
  type FileContent,
  type ProjectContext,
  ProjectMemorySchema,
  ProjectMemoryManager,
} from './project-memory';
import { WorkspaceManager } from './workspace';
import { ImportGraphBuilder } from './import-graph';

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
  private readonly importGraphBuilder: ImportGraphBuilder;

  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly memoryManager: ProjectMemoryManager
  ) {
    this.importGraphBuilder = new ImportGraphBuilder(workspaceManager);
  }

  build(
    projectId: string,
    storyId: string,
    dependencyGraph: string[],
    targetFiles: string[] = []
  ): ProjectContext | null {
    const _storyContext: Pick<WorkspaceState, 'projectId' | 'storyId'> = { projectId, storyId };
    const memory = this.memoryManager.load(projectId);
    if (!memory) {
      return null;
    }

    const allProjectFiles = this.workspaceManager.listProjectFiles(projectId);
    const projectFileSet = new Set(allProjectFiles);

    const priorityFiles = new Set<string>();

    if (targetFiles.length > 0) {
      const graph = this.importGraphBuilder.build(projectId);
      for (const target of targetFiles) {
        if (projectFileSet.has(target) && this.isAllowedFile(target)) {
          priorityFiles.add(target);
        }
        for (const dep of this.importGraphBuilder.getTransitiveDependencies(graph, target)) {
          if (projectFileSet.has(dep) && this.isAllowedFile(dep)) {
            priorityFiles.add(dep);
          }
        }
      }
    }

    const relevantFiles: FileContent[] = [];

    for (const filePath of priorityFiles) {
      if (relevantFiles.length >= MAX_RELEVANT_FILES) {
        break;
      }
      try {
        const content = this.workspaceManager.readProjectFile(projectId, filePath);
        relevantFiles.push({ path: filePath, content });
      } catch {
        continue;
      }
    }

    for (const filePath of allProjectFiles) {
      if (relevantFiles.length >= MAX_RELEVANT_FILES) {
        break;
      }
      if (priorityFiles.has(filePath)) {
        continue;
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
