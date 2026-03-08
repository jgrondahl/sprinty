import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProjectContextBuilder } from './project-context';
import { ProjectMemoryManager, ProjectMemorySchema } from './project-memory';
import { WorkspaceManager } from './workspace';

let tmpDir: string;
let workspaceManager: WorkspaceManager;
let memoryManager: ProjectMemoryManager;
let contextBuilder: ProjectContextBuilder;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-project-context-'));
  workspaceManager = new WorkspaceManager(tmpDir);
  memoryManager = new ProjectMemoryManager(workspaceManager);
  contextBuilder = new ProjectContextBuilder(workspaceManager, memoryManager);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ProjectContextBuilder.build()', () => {
  it('returns null when no project memory exists', () => {
    const context = contextBuilder.build('proj-1', 'story-1', ['story-0']);
    expect(context).toBeNull();
  });

  it('returns ProjectContext when project memory exists', () => {
    const projectId = 'proj-2';
    memoryManager.initialize(projectId, {
      language: 'typescript',
      runtime: 'bun',
      additionalDeps: [],
    });
    workspaceManager.writeProjectFile(projectId, 'src/hello.ts', 'export const hello = "world";');

    const context = contextBuilder.build(projectId, 'story-2', ['story-1']);

    expect(context).not.toBeNull();
    expect(context!.memory.projectId).toBe(projectId);
    expect(context!.dependencyGraph).toEqual(['story-1']);
    expect(context!.relevantFiles.some((file) => file.path === 'src/hello.ts')).toBe(true);
  });

  it('reads only allowed file extensions', () => {
    const projectId = 'proj-extensions';
    memoryManager.initialize(projectId, {
      language: 'typescript',
      runtime: 'bun',
      additionalDeps: [],
    });
    workspaceManager.writeProjectFile(projectId, 'src/allowed.ts', 'export const ok = true;');
    workspaceManager.writeProjectFile(projectId, 'bin/blocked.exe', 'binary-ish');

    const context = contextBuilder.build(projectId, 'story-ext', []);

    expect(context).not.toBeNull();
    expect(context!.relevantFiles.some((file) => file.path === 'src/allowed.ts')).toBe(true);
    expect(context!.relevantFiles.some((file) => file.path === 'bin/blocked.exe')).toBe(false);
  });

  it('respects the 20-file cap', () => {
    const projectId = 'proj-cap';
    memoryManager.initialize(projectId, {
      language: 'typescript',
      runtime: 'bun',
      additionalDeps: [],
    });

    for (let i = 0; i < 25; i++) {
      workspaceManager.writeProjectFile(projectId, `src/file-${i}.ts`, `export const file${i} = ${i};`);
    }

    const context = contextBuilder.build(projectId, 'story-cap', []);

    expect(context).not.toBeNull();
    expect(context!.relevantFiles.length).toBeLessThanOrEqual(20);
  });
});

describe('ProjectContextBuilder.buildEmpty()', () => {
  it('returns valid empty ProjectContext with correct projectId', () => {
    const context = contextBuilder.buildEmpty('proj-empty');

    const parsed = ProjectMemorySchema.parse(context.memory);
    expect(parsed.projectId).toBe('proj-empty');
    expect(parsed.stack.language).toBe('unknown');
    expect(parsed.stack.runtime).toBe('unknown');
    expect(parsed.stack.additionalDeps).toEqual([]);
    expect(parsed.stories).toEqual([]);
    expect(parsed.sharedDecisions).toEqual([]);
    expect(parsed.knownConstraints).toEqual([]);
    expect(parsed.fileIndex).toEqual([]);
    expect(parsed.artifactIndex).toEqual([]);
    expect(context.relevantFiles).toEqual([]);
    expect(context.dependencyGraph).toEqual([]);
  });
});

describe('ProjectContextBuilder.build() — target files with import graph expansion', () => {
  it('prioritises target files over other project files', () => {
    const projectId = 'proj-priority';
    memoryManager.initialize(projectId, { language: 'typescript', runtime: 'bun', additionalDeps: [] });

    for (let i = 0; i < 18; i++) {
      workspaceManager.writeProjectFile(projectId, `src/extra-${i}.ts`, `export const x${i} = ${i};`);
    }
    workspaceManager.writeProjectFile(projectId, 'src/target.ts', 'export const target = true;');

    const context = contextBuilder.build(projectId, 'story-1', [], ['src/target.ts']);

    expect(context).not.toBeNull();
    const paths = context!.relevantFiles.map((f) => f.path);
    expect(paths[0]).toBe('src/target.ts');
  });

  it('expands target files to include transitive import dependencies', () => {
    const projectId = 'proj-transitive';
    memoryManager.initialize(projectId, { language: 'typescript', runtime: 'bun', additionalDeps: [] });

    workspaceManager.writeProjectFile(projectId, 'src/service.ts', `import { helper } from './helper';\nexport const service = () => helper();`);
    workspaceManager.writeProjectFile(projectId, 'src/helper.ts', `import { util } from './util';\nexport const helper = () => util();`);
    workspaceManager.writeProjectFile(projectId, 'src/util.ts', 'export const util = () => "done";');
    workspaceManager.writeProjectFile(projectId, 'src/unrelated.ts', 'export const unrelated = true;');

    const context = contextBuilder.build(projectId, 'story-1', [], ['src/service.ts']);

    expect(context).not.toBeNull();
    const paths = new Set(context!.relevantFiles.map((f) => f.path));
    expect(paths.has('src/service.ts')).toBe(true);
    expect(paths.has('src/helper.ts')).toBe(true);
    expect(paths.has('src/util.ts')).toBe(true);
  });

  it('includes remaining files up to cap after priority files', () => {
    const projectId = 'proj-fill';
    memoryManager.initialize(projectId, { language: 'typescript', runtime: 'bun', additionalDeps: [] });

    workspaceManager.writeProjectFile(projectId, 'src/target.ts', 'export const t = 1;');
    for (let i = 0; i < 25; i++) {
      workspaceManager.writeProjectFile(projectId, `src/other-${i}.ts`, `export const o${i} = ${i};`);
    }

    const context = contextBuilder.build(projectId, 'story-1', [], ['src/target.ts']);

    expect(context).not.toBeNull();
    expect(context!.relevantFiles.length).toBeLessThanOrEqual(20);
    const paths = context!.relevantFiles.map((f) => f.path);
    expect(paths[0]).toBe('src/target.ts');
  });

  it('falls back to flat scan when no targetFiles provided', () => {
    const projectId = 'proj-fallback';
    memoryManager.initialize(projectId, { language: 'typescript', runtime: 'bun', additionalDeps: [] });

    workspaceManager.writeProjectFile(projectId, 'src/a.ts', 'export const a = 1;');
    workspaceManager.writeProjectFile(projectId, 'src/b.ts', 'export const b = 2;');

    const context = contextBuilder.build(projectId, 'story-1', []);

    expect(context).not.toBeNull();
    const paths = new Set(context!.relevantFiles.map((f) => f.path));
    expect(paths.has('src/a.ts')).toBe(true);
    expect(paths.has('src/b.ts')).toBe(true);
  });
});
