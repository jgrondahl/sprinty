import type {
  SandboxEnvironment,
  SandboxConfig,
  SandboxResult,
  ExecOpts,
} from './sandbox';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MockSandboxCall {
  method: 'init' | 'execute' | 'writeFile' | 'readFile' | 'cleanup';
  args: unknown[];
  timestamp: number;
}

export interface MockSandboxOptions {
  executeResults?: SandboxResult[];
  readFileResults?: Record<string, string>;
  initError?: Error;
  executeError?: Error;
  writeFileError?: Error;
  readFileError?: Error;
  cleanupError?: Error;
}

// ─── MockSandbox ─────────────────────────────────────────────────────────────

export class MockSandbox implements SandboxEnvironment {
  public calls: MockSandboxCall[] = [];
  public files: Map<string, string> = new Map();
  public initialized = false;
  public cleanedUp = false;

  private executeResults: SandboxResult[];
  private executeIndex = 0;
  private readFileResults: Record<string, string>;
  private errors: {
    init?: Error;
    execute?: Error;
    writeFile?: Error;
    readFile?: Error;
    cleanup?: Error;
  };

  constructor(options: MockSandboxOptions = {}) {
    this.executeResults = options.executeResults ?? [];
    this.readFileResults = options.readFileResults ?? {};
    this.errors = {
      init: options.initError,
      execute: options.executeError,
      writeFile: options.writeFileError,
      readFile: options.readFileError,
      cleanup: options.cleanupError,
    };
  }

  async init(_config: SandboxConfig): Promise<void> {
    this.recordCall('init', [_config]);
    if (this.errors.init) throw this.errors.init;
    this.initialized = true;
  }

  async execute(command: string, opts?: ExecOpts): Promise<SandboxResult> {
    this.recordCall('execute', [command, opts]);
    if (this.errors.execute) throw this.errors.execute;

    const result = this.executeResults[this.executeIndex];
    if (result) {
      this.executeIndex++;
      return result;
    }

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 10,
      command,
    };
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.recordCall('writeFile', [path, content]);
    if (this.errors.writeFile) throw this.errors.writeFile;
    this.files.set(path, content);
  }

  async readFile(path: string): Promise<string> {
    this.recordCall('readFile', [path]);
    if (this.errors.readFile) throw this.errors.readFile;

    if (path in this.readFileResults) {
      return this.readFileResults[path]!;
    }

    const content = this.files.get(path);
    if (content !== undefined) return content;
    throw new Error(`MockSandbox: file not found: ${path}`);
  }

  async cleanup(): Promise<void> {
    this.recordCall('cleanup', []);
    if (this.errors.cleanup) throw this.errors.cleanup;
    this.cleanedUp = true;
  }

  getExecuteCalls(): Array<{ command: string; opts?: ExecOpts }> {
    return this.calls
      .filter((c) => c.method === 'execute')
      .map((c) => ({
        command: c.args[0] as string,
        opts: c.args[1] as ExecOpts | undefined,
      }));
  }

  getWrittenFiles(): Map<string, string> {
    return new Map(this.files);
  }

  private recordCall(method: MockSandboxCall['method'], args: unknown[]): void {
    this.calls.push({ method, args, timestamp: Date.now() });
  }
}

export function makeSuccessResult(command: string, stdout = ''): SandboxResult {
  return {
    exitCode: 0,
    stdout,
    stderr: '',
    durationMs: 100,
    command,
  };
}

export function makeFailResult(command: string, stderr: string, exitCode = 1): SandboxResult {
  return {
    exitCode,
    stdout: '',
    stderr,
    durationMs: 100,
    command,
  };
}
