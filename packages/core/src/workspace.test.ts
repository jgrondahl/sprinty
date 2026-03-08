import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceManager, PathTraversalError, WorkspaceNotFoundError } from './workspace';
import { AgentPersona } from './types';

let tmpDir: string;
let manager: WorkspaceManager;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-test-'));
  manager = new WorkspaceManager(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WorkspaceManager.createWorkspace()', () => {
  it('creates expected directory structure', () => {
    const ws = manager.createWorkspace('proj-1', 'story-1');
    expect(fs.existsSync(ws.basePath)).toBe(true);
    expect(fs.existsSync(path.join(ws.basePath, 'handoffs'))).toBe(true);
    expect(fs.existsSync(path.join(ws.basePath, 'artifacts'))).toBe(true);
    expect(fs.existsSync(path.join(ws.basePath, 'agent.log'))).toBe(true);
    expect(fs.existsSync(path.join(ws.basePath, 'errors.log'))).toBe(true);
  });

  it('returns correct projectId and storyId', () => {
    const ws = manager.createWorkspace('proj-abc', 'story-xyz');
    expect(ws.projectId).toBe('proj-abc');
    expect(ws.storyId).toBe('story-xyz');
  });

  it('basePath contains projectId and storyId', () => {
    const ws = manager.createWorkspace('my-project', 'my-story');
    expect(ws.basePath).toContain('my-project');
    expect(ws.basePath).toContain('my-story');
  });

  it('initializes files and agentsLog as empty', () => {
    const ws = manager.createWorkspace('proj', 'story');
    expect(ws.files).toEqual({});
    expect(ws.agentsLog).toEqual([]);
  });

  it('is idempotent (can be called multiple times)', () => {
    manager.createWorkspace('proj', 'story');
    const ws2 = manager.createWorkspace('proj', 'story');
    expect(fs.existsSync(ws2.basePath)).toBe(true);
  });
});

describe('WorkspaceManager.loadWorkspace()', () => {
  it('rehydrates a workspace from disk', () => {
    const original = manager.createWorkspace('proj', 'story');
    manager.writeFile(original, 'test.txt', 'hello');

    const loaded = manager.loadWorkspace('proj', 'story');
    expect(loaded.projectId).toBe('proj');
    expect(loaded.storyId).toBe('story');
    expect(Object.keys(loaded.files)).toContain('test.txt');
  });

  it('throws WorkspaceNotFoundError for non-existent workspace', () => {
    expect(() => manager.loadWorkspace('ghost', 'story')).toThrow(WorkspaceNotFoundError);
  });

  it('restores agentsLog from disk', () => {
    const ws = manager.createWorkspace('proj', 'story');
    manager.appendLog(ws, AgentPersona.DEVELOPER, 'First message');

    const loaded = manager.loadWorkspace('proj', 'story');
    expect(loaded.agentsLog.length).toBeGreaterThan(0);
    expect(loaded.agentsLog[0]).toContain('DEVELOPER');
    expect(loaded.agentsLog[0]).toContain('First message');
  });
});

describe('WorkspaceManager.readFile() / writeFile()', () => {
  it('writes and reads a file round-trip', () => {
    const ws = manager.createWorkspace('proj', 'story');
    manager.writeFile(ws, 'hello.txt', 'world');
    const content = manager.readFile(ws, 'hello.txt');
    expect(content).toBe('world');
  });

  it('writes inside subdirectory', () => {
    const ws = manager.createWorkspace('proj', 'story');
    manager.writeFile(ws, 'artifacts/out.json', '{"key":"val"}');
    const content = manager.readFile(ws, 'artifacts/out.json');
    expect(content).toBe('{"key":"val"}');
  });

  it('throws if file does not exist', () => {
    const ws = manager.createWorkspace('proj', 'story');
    expect(() => manager.readFile(ws, 'missing.txt')).toThrow();
  });
});

describe('WorkspaceManager.listFiles()', () => {
  it('lists written files', () => {
    const ws = manager.createWorkspace('proj', 'story');
    manager.writeFile(ws, 'a.txt', 'a');
    manager.writeFile(ws, 'b.txt', 'b');
    const files = manager.listFiles(ws);
    expect(files).toContain('a.txt');
    expect(files).toContain('b.txt');
  });
});

describe('WorkspaceManager.appendLog()', () => {
  it('appends log entries to agent.log', () => {
    const ws = manager.createWorkspace('proj', 'story');
    manager.appendLog(ws, AgentPersona.DEVELOPER, 'Started coding');
    manager.appendLog(ws, AgentPersona.QA_ENGINEER, 'Running tests');

    const logPath = path.join(ws.basePath, 'agent.log');
    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content).toContain('DEVELOPER');
    expect(content).toContain('Started coding');
    expect(content).toContain('QA_ENGINEER');
    expect(content).toContain('Running tests');
  });

  it('adds entries to in-memory agentsLog', () => {
    const ws = manager.createWorkspace('proj', 'story');
    manager.appendLog(ws, AgentPersona.ARCHITECT, 'Designed system');
    expect(ws.agentsLog).toHaveLength(1);
    expect(ws.agentsLog[0]).toContain('ARCHITECT');
  });
});

describe('WorkspaceManager path traversal protection', () => {
  it('throws PathTraversalError for ../ escape', () => {
    const ws = manager.createWorkspace('proj', 'story');
    expect(() => manager.writeFile(ws, '../../etc/passwd', 'evil')).toThrow(PathTraversalError);
  });

  it('does not write file outside workspace on traversal attempt', () => {
    const ws = manager.createWorkspace('proj', 'story');
    const escapePath = path.join(tmpDir, 'escaped.txt');
    try {
      manager.writeFile(ws, '../../../escaped.txt', 'evil');
    } catch {
      // expected
    }
    expect(fs.existsSync(escapePath)).toBe(false);
  });
});

describe('ProjectWorkspace methods', () => {
  it('createProjectWorkspace creates project/, project/src/, and project/artifacts/ directories', () => {
    const projectPath = manager.createProjectWorkspace('proj');
    expect(fs.existsSync(projectPath)).toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'src'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, 'artifacts'))).toBe(true);
  });

  it('writeProjectFile + readProjectFile round-trip for a simple file', () => {
    manager.createProjectWorkspace('proj');
    manager.writeProjectFile('proj', 'README.md', '# Hello');
    const content = manager.readProjectFile('proj', 'README.md');
    expect(content).toBe('# Hello');
  });

  it('writeProjectFile creates nested directories', () => {
    manager.createProjectWorkspace('proj');
    manager.writeProjectFile('proj', 'src/auth/service.ts', 'export const ok = true;');
    const fullPath = path.join(manager.getProjectWorkspacePath('proj'), 'src', 'auth', 'service.ts');
    expect(fs.existsSync(fullPath)).toBe(true);
  });

  it('listProjectFiles returns relative paths of written files', () => {
    manager.createProjectWorkspace('proj');
    manager.writeProjectFile('proj', 'src/a.ts', 'a');
    manager.writeProjectFile('proj', 'artifacts/build.txt', 'b');

    const files = manager.listProjectFiles('proj');
    expect(files).toContain('src/a.ts');
    expect(files).toContain('artifacts/build.txt');
  });

  it('listProjectFiles returns [] for empty project workspace', () => {
    manager.createProjectWorkspace('proj');
    const files = manager.listProjectFiles('proj');
    expect(files).toEqual([]);
  });

  it('readProjectFile throws on path traversal', () => {
    manager.createProjectWorkspace('proj');
    expect(() => manager.readProjectFile('proj', '../../../etc/passwd')).toThrow(PathTraversalError);
  });

  it('writeProjectFile throws on path traversal', () => {
    manager.createProjectWorkspace('proj');
    expect(() => manager.writeProjectFile('proj', '../../../etc/passwd', 'evil')).toThrow(PathTraversalError);
  });

  it('promoteFiles copies files from story workspace to project workspace', () => {
    const storyWs = manager.createWorkspace('proj', 'story-1');
    manager.writeFile(storyWs, 'artifacts/src/index.ts', 'export const n = 1;');
    manager.writeFile(storyWs, 'artifacts/src/lib/util.ts', 'export const u = 2;');

    const promoted = manager.promoteFiles('proj', storyWs, 'artifacts/src');

    expect(promoted).toContain('src/index.ts');
    expect(promoted).toContain('src/lib/util.ts');
    expect(manager.readProjectFile('proj', 'src/index.ts')).toBe('export const n = 1;');
    expect(manager.readProjectFile('proj', 'src/lib/util.ts')).toBe('export const u = 2;');
  });

  it('promoteFiles returns [] when source directory does not exist', () => {
    const storyWs = manager.createWorkspace('proj', 'story-1');
    const promoted = manager.promoteFiles('proj', storyWs, 'artifacts/missing');
    expect(promoted).toEqual([]);
  });

  it('promoteFiles preserves directory structure', () => {
    const storyWs = manager.createWorkspace('proj', 'story-1');
    manager.writeFile(storyWs, 'artifacts/src/nested/deep/file.ts', 'x');

    const promoted = manager.promoteFiles('proj', storyWs, 'artifacts/src');

    expect(promoted).toContain('src/nested/deep/file.ts');
    expect(manager.readProjectFile('proj', 'src/nested/deep/file.ts')).toBe('x');
  });
});
