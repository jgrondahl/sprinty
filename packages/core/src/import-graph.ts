import * as path from 'path';
import { WorkspaceManager } from './workspace';

const IMPORT_EXPORT_REGEX = /(?:import|export)\s+(?:.+?\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_REGEX = /require\(['"]([^'"]+)['"]\)/g;
const RESOLUTION_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx'];

export class ImportGraphBuilder {
  constructor(private readonly workspaceManager: WorkspaceManager) {}

  build(projectId: string): Map<string, Set<string>> {
    const files = this.workspaceManager.listProjectFiles(projectId);
    const fileSet = new Set(files);
    const graph = new Map<string, Set<string>>();

    for (const filePath of files) {
      const imports = new Set<string>();
      graph.set(filePath, imports);

      let content = '';
      try {
        content = this.workspaceManager.readProjectFile(projectId, filePath);
      } catch {
        continue;
      }

      for (const specifier of this.extractImportSpecifiers(content)) {
        if (!this.isRelativeImport(specifier)) {
          continue;
        }

        const resolved = this.resolveRelativeImport(filePath, specifier, fileSet);
        imports.add(resolved);
      }
    }

    return graph;
  }

  getTransitiveDependencies(graph: Map<string, Set<string>>, filePath: string): Set<string> {
    const visited = new Set<string>();
    const dependencies = new Set<string>();
    const stack = [...(graph.get(filePath) ?? [])];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || visited.has(current) || current === filePath) {
        continue;
      }

      visited.add(current);
      dependencies.add(current);

      const next = graph.get(current);
      if (!next) {
        continue;
      }

      for (const dep of next) {
        if (!visited.has(dep) && dep !== filePath) {
          stack.push(dep);
        }
      }
    }

    return dependencies;
  }

  getImpactedFiles(graph: Map<string, Set<string>>, changedFile: string): Set<string> {
    const reverseGraph = new Map<string, Set<string>>();

    for (const [file, imports] of graph.entries()) {
      if (!reverseGraph.has(file)) {
        reverseGraph.set(file, new Set());
      }

      for (const imported of imports) {
        if (!reverseGraph.has(imported)) {
          reverseGraph.set(imported, new Set());
        }
        reverseGraph.get(imported)!.add(file);
      }
    }

    const impacted = new Set<string>();
    const visited = new Set<string>([changedFile]);
    const queue = [...(reverseGraph.get(changedFile) ?? [])];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current) || current === changedFile) {
        continue;
      }

      visited.add(current);
      impacted.add(current);

      for (const parent of reverseGraph.get(current) ?? []) {
        if (!visited.has(parent) && parent !== changedFile) {
          queue.push(parent);
        }
      }
    }

    return impacted;
  }

  private extractImportSpecifiers(content: string): string[] {
    const imports: string[] = [];

    for (const regex of [IMPORT_EXPORT_REGEX, REQUIRE_REGEX]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null = regex.exec(content);
      while (match) {
        imports.push(match[1]);
        match = regex.exec(content);
      }
    }

    return imports;
  }

  private isRelativeImport(specifier: string): boolean {
    return specifier.startsWith('./') || specifier.startsWith('../');
  }

  private resolveRelativeImport(filePath: string, specifier: string, fileSet: Set<string>): string {
    const importerDir = path.posix.dirname(filePath);
    const normalizedBaseDir = importerDir === '.' ? '' : importerDir;
    const resolved = path.posix.normalize(path.posix.join(normalizedBaseDir, specifier));

    if (fileSet.has(resolved)) {
      return resolved;
    }

    for (const extension of RESOLUTION_EXTENSIONS) {
      const withExtension = `${resolved}${extension}`;
      if (fileSet.has(withExtension)) {
        return withExtension;
      }
    }

    return resolved;
  }
}
