import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ImportGraphBuilder } from './import-graph';
import { WorkspaceManager } from './workspace';

let tmpDir: string;
let workspaceManager: WorkspaceManager;
let importGraphBuilder: ImportGraphBuilder;

const projectId = 'proj-import-graph';

const depsOf = (graph: Map<string, Set<string>>, filePath: string): string[] => {
  return [...(graph.get(filePath) ?? new Set())].sort();
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-import-graph-'));
  workspaceManager = new WorkspaceManager(tmpDir);
  workspaceManager.createProjectWorkspace(projectId);
  importGraphBuilder = new ImportGraphBuilder(workspaceManager);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ImportGraphBuilder.build()', () => {
  it('returns empty map for empty project', () => {
    const graph = importGraphBuilder.build(projectId);
    expect(graph.size).toBe(0);
  });

  it('includes single file with empty dependency set', () => {
    workspaceManager.writeProjectFile(projectId, 'src/a.ts', 'export const a = 1;');

    const graph = importGraphBuilder.build(projectId);
    expect(graph.size).toBe(1);
    expect(graph.has('src/a.ts')).toBe(true);
    expect(depsOf(graph, 'src/a.ts')).toEqual([]);
  });

  it('builds edge for relative import between two files', () => {
    workspaceManager.writeProjectFile(projectId, 'src/b.ts', 'export const b = 2;');
    workspaceManager.writeProjectFile(projectId, 'src/a.ts', "import { b } from './b';\nexport const a = b;");

    const graph = importGraphBuilder.build(projectId);
    expect(depsOf(graph, 'src/a.ts')).toEqual(['src/b.ts']);
    expect(depsOf(graph, 'src/b.ts')).toEqual([]);
  });

  it('resolves relative imports with and without explicit extension', () => {
    workspaceManager.writeProjectFile(projectId, 'src/b.ts', 'export const b = 1;');
    workspaceManager.writeProjectFile(projectId, 'src/d.ts', 'export const d = 2;');
    workspaceManager.writeProjectFile(projectId, 'src/a.ts', "import { b } from './b';\nexport const a = b;");
    workspaceManager.writeProjectFile(projectId, 'src/c.ts', "import { d } from './d.ts';\nexport const c = d;");

    const graph = importGraphBuilder.build(projectId);
    expect(depsOf(graph, 'src/a.ts')).toEqual(['src/b.ts']);
    expect(depsOf(graph, 'src/c.ts')).toEqual(['src/d.ts']);
  });

  it('excludes non-relative package imports from graph', () => {
    workspaceManager.writeProjectFile(projectId, 'src/local.ts', 'export const local = 1;');
    workspaceManager.writeProjectFile(
      projectId,
      'src/a.ts',
      "import React from 'react';\nimport fs from 'fs';\nimport { local } from './local';\nexport const a = local;"
    );

    const graph = importGraphBuilder.build(projectId);
    expect(depsOf(graph, 'src/a.ts')).toEqual(['src/local.ts']);
  });
});

describe('ImportGraphBuilder.getTransitiveDependencies()', () => {
  it('returns direct dependency for single edge', () => {
    const graph = new Map<string, Set<string>>([
      ['src/a.ts', new Set(['src/b.ts'])],
      ['src/b.ts', new Set()],
    ]);

    const deps = importGraphBuilder.getTransitiveDependencies(graph, 'src/a.ts');
    expect([...deps].sort()).toEqual(['src/b.ts']);
  });

  it('returns full transitive chain', () => {
    const graph = new Map<string, Set<string>>([
      ['src/a.ts', new Set(['src/b.ts'])],
      ['src/b.ts', new Set(['src/c.ts'])],
      ['src/c.ts', new Set()],
    ]);

    const deps = importGraphBuilder.getTransitiveDependencies(graph, 'src/a.ts');
    expect([...deps].sort()).toEqual(['src/b.ts', 'src/c.ts']);
  });

  it('handles cycles without infinite loop and excludes source file', () => {
    const graph = new Map<string, Set<string>>([
      ['src/a.ts', new Set(['src/b.ts'])],
      ['src/b.ts', new Set(['src/a.ts'])],
    ]);

    const deps = importGraphBuilder.getTransitiveDependencies(graph, 'src/a.ts');
    expect([...deps].sort()).toEqual(['src/b.ts']);
  });
});

describe('ImportGraphBuilder.getImpactedFiles()', () => {
  it('returns empty set when changed file has no importers', () => {
    const graph = new Map<string, Set<string>>([
      ['src/a.ts', new Set()],
      ['src/b.ts', new Set()],
    ]);

    const impacted = importGraphBuilder.getImpactedFiles(graph, 'src/a.ts');
    expect([...impacted]).toEqual([]);
  });

  it('returns direct importer for changed file', () => {
    const graph = new Map<string, Set<string>>([
      ['src/a.ts', new Set(['src/b.ts'])],
      ['src/b.ts', new Set()],
    ]);

    const impacted = importGraphBuilder.getImpactedFiles(graph, 'src/b.ts');
    expect([...impacted].sort()).toEqual(['src/a.ts']);
  });

  it('returns transitive importers in reverse dependency chain', () => {
    const graph = new Map<string, Set<string>>([
      ['src/c.ts', new Set(['src/b.ts'])],
      ['src/b.ts', new Set(['src/a.ts'])],
      ['src/a.ts', new Set()],
    ]);

    const impacted = importGraphBuilder.getImpactedFiles(graph, 'src/a.ts');
    expect([...impacted].sort()).toEqual(['src/b.ts', 'src/c.ts']);
  });
});
