import * as fs from 'fs';
import * as path from 'path';
import { type WorkspaceState, type AgentPersona } from './types';

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class PathTraversalError extends Error {
  constructor(requestedPath: string) {
    super(`Path traversal detected: ${requestedPath}`);
    this.name = 'PathTraversalError';
  }
}

export class WorkspaceNotFoundError extends Error {
  constructor(projectId: string, storyId: string) {
    super(`Workspace not found for project=${projectId} story=${storyId}`);
    this.name = 'WorkspaceNotFoundError';
  }
}

// ─── Workspace Manager ────────────────────────────────────────────────────────

export class WorkspaceManager {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.env['SPLINTY_WORKSPACE_DIR'] ?? '.splinty';
  }

  // ── Path helpers ────────────────────────────────────────────────────────────

  getWorkspacePath(projectId: string, storyId: string): string {
    return path.join(this.baseDir, projectId, 'stories', storyId);
  }

  getProjectWorkspacePath(projectId: string): string {
    return path.join(this.getProjectPath(projectId), 'project');
  }

  private getProjectPath(projectId: string): string {
    return path.join(this.baseDir, projectId);
  }

  /**
   * Resolves and validates that `relativePath` stays inside the workspace.
   * Throws PathTraversalError if the resolved path escapes the workspace root.
   */
  private resolveSafe(ws: WorkspaceState, relativePath: string): string {
    const normalized = path.normalize(relativePath);
    const resolved = path.resolve(ws.basePath, normalized);
    const base = path.resolve(ws.basePath);

    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new PathTraversalError(relativePath);
    }
    return resolved;
  }

  private resolveProjectSafe(projectId: string, relativePath: string): string {
    const normalized = path.normalize(relativePath);
    const basePath = this.getProjectWorkspacePath(projectId);
    const resolved = path.resolve(basePath, normalized);
    const base = path.resolve(basePath);

    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new PathTraversalError(relativePath);
    }
    return resolved;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Creates the workspace directory structure for a story and returns the
   * initial WorkspaceState.
   */
  createWorkspace(projectId: string, storyId: string): WorkspaceState {
    const basePath = this.getWorkspacePath(projectId, storyId);

    const dirs = [
      basePath,
      path.join(basePath, 'handoffs'),
      path.join(basePath, 'artifacts'),
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Touch required files
    const agentLog = path.join(basePath, 'agent.log');
    const errorsLog = path.join(basePath, 'errors.log');
    if (!fs.existsSync(agentLog)) fs.writeFileSync(agentLog, '');
    if (!fs.existsSync(errorsLog)) fs.writeFileSync(errorsLog, '');

    return {
      projectId,
      storyId,
      basePath,
      files: {},
      agentsLog: [],
    };
  }

  createProjectWorkspace(projectId: string): string {
    const projectPath = this.getProjectWorkspacePath(projectId);
    const dirs = [
      projectPath,
      path.join(projectPath, 'src'),
      path.join(projectPath, 'artifacts'),
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return projectPath;
  }

  /**
   * Loads (rehydrates) an existing workspace from disk. Returns a WorkspaceState
   * populated with all file paths found in the directory.
   */
  loadWorkspace(projectId: string, storyId: string): WorkspaceState {
    const basePath = this.getWorkspacePath(projectId, storyId);

    if (!fs.existsSync(basePath)) {
      throw new WorkspaceNotFoundError(projectId, storyId);
    }

    const files: Record<string, string> = {};
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          const rel = path.relative(basePath, fullPath);
          files[rel] = fullPath;
        }
      }
    };
    walk(basePath);

    const agentLogPath = path.join(basePath, 'agent.log');
    let agentsLog: string[] = [];
    if (fs.existsSync(agentLogPath)) {
      const raw = fs.readFileSync(agentLogPath, 'utf-8');
      agentsLog = raw.split('\n').filter(Boolean);
    }

    return {
      projectId,
      storyId,
      basePath,
      files,
      agentsLog,
    };
  }

  // ── File I/O ────────────────────────────────────────────────────────────────

  readFile(ws: WorkspaceState, relativePath: string): string {
    const fullPath = this.resolveSafe(ws, relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found in workspace: ${relativePath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  writeFile(ws: WorkspaceState, relativePath: string, content: string): void {
    const fullPath = this.resolveSafe(ws, relativePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    // Keep the in-memory index up to date
    ws.files[relativePath] = fullPath;
  }

  readProjectFile(projectId: string, relativePath: string): string {
    const fullPath = this.resolveProjectSafe(projectId, relativePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found in project workspace: ${relativePath}`);
    }
    return fs.readFileSync(fullPath, 'utf-8');
  }

  writeProjectFile(projectId: string, relativePath: string, content: string): void {
    const fullPath = this.resolveProjectSafe(projectId, relativePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  listProjectFiles(projectId: string): string[] {
    const projectPath = this.getProjectWorkspacePath(projectId);
    if (!fs.existsSync(projectPath)) return [];

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          files.push(path.relative(projectPath, fullPath).split(path.sep).join('/'));
        }
      }
    };

    walk(projectPath);
    return files;
  }

  promoteFiles(projectId: string, storyWs: WorkspaceState, srcPattern: string): string[] {
    const srcRoot = path.join(storyWs.basePath, srcPattern);
    if (!fs.existsSync(srcRoot)) return [];

    const stat = fs.statSync(srcRoot);
    if (!stat.isDirectory()) return [];

    const projectPath = this.createProjectWorkspace(projectId);
    const destinationRoot = path.join(projectPath, 'src');
    const promoted: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const sourcePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(sourcePath);
        } else {
          const relFromSourceRoot = path.relative(srcRoot, sourcePath);
          const destinationPath = path.join(destinationRoot, relFromSourceRoot);
          fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
          fs.copyFileSync(sourcePath, destinationPath);
          promoted.push(path.relative(projectPath, destinationPath).split(path.sep).join('/'));
        }
      }
    };

    walk(srcRoot);
    return promoted;
  }

  listFiles(ws: WorkspaceState): string[] {
    return Object.keys(ws.files);
  }

  getServiceWorkspacePath(projectId: string, serviceName: string): string {
    return path.join(this.baseDir, projectId, 'services', serviceName);
  }

  createServiceWorkspace(projectId: string, serviceName: string): WorkspaceState {
    const basePath = this.getServiceWorkspacePath(projectId, serviceName);

    const dirs = [
      basePath,
      path.join(basePath, 'handoffs'),
      path.join(basePath, 'artifacts'),
      path.join(basePath, 'src'),
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const agentLog = path.join(basePath, 'agent.log');
    const errorsLog = path.join(basePath, 'errors.log');
    if (!fs.existsSync(agentLog)) fs.writeFileSync(agentLog, '');
    if (!fs.existsSync(errorsLog)) fs.writeFileSync(errorsLog, '');

    return {
      projectId,
      storyId: `service:${serviceName}`,
      basePath,
      files: {},
      agentsLog: [],
    };
  }

  listServiceNames(projectId: string): string[] {
    const servicesDir = path.join(this.baseDir, projectId, 'services');
    if (!fs.existsSync(servicesDir)) return [];
    return fs
      .readdirSync(servicesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  }

  /**
   * Appends a timestamped log entry to `agent.log` inside the workspace.
   */
  appendLog(ws: WorkspaceState, agentPersona: AgentPersona, message: string): void {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${agentPersona}] ${message}`;
    const logPath = path.join(ws.basePath, 'agent.log');
    fs.appendFileSync(logPath, entry + '\n', 'utf-8');
    ws.agentsLog.push(entry);
  }
}
