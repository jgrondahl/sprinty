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
