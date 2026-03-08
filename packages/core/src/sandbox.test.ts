import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SandboxConfigSchema,
  SandboxResultSchema,
  ResourceUsageSchema,
  ResourceLimitViolationSchema,
  SandboxImageLockfileSchema,
  ExecOptsSchema,
  type SandboxConfig,
  type SandboxResult,
  type SandboxEnvironment,
} from './sandbox';
import {
  MockSandbox,
  makeSuccessResult,
  makeFailResult,
} from './sandbox-mock';

// ─── Zod Schema Validation ──────────────────────────────────────────────────

describe('SandboxConfigSchema', () => {
  it('validates a valid config', () => {
    const config = SandboxConfigSchema.parse({
      image: 'node:20-slim@sha256:abc123',
      timeoutMs: 30000,
      memoryLimitMb: 256,
      cpuLimit: 0.5,
      networkEnabled: false,
      workDir: '/app',
    });
    expect(config.image).toBe('node:20-slim@sha256:abc123');
    expect(config.maxDiskMb).toBe(500);
    expect(config.networkEnabled).toBe(false);
  });

  it('applies default for maxDiskMb', () => {
    const config = SandboxConfigSchema.parse({
      image: 'node:20',
      timeoutMs: 10000,
      memoryLimitMb: 128,
      cpuLimit: 1,
      workDir: '/work',
    });
    expect(config.maxDiskMb).toBe(500);
    expect(config.networkEnabled).toBe(false);
  });

  it('rejects empty image', () => {
    expect(() =>
      SandboxConfigSchema.parse({
        image: '',
        timeoutMs: 10000,
        memoryLimitMb: 128,
        cpuLimit: 1,
        workDir: '/work',
      })
    ).toThrow();
  });

  it('rejects negative timeoutMs', () => {
    expect(() =>
      SandboxConfigSchema.parse({
        image: 'node:20',
        timeoutMs: -1,
        memoryLimitMb: 128,
        cpuLimit: 1,
        workDir: '/work',
      })
    ).toThrow();
  });

  it('rejects zero memoryLimitMb', () => {
    expect(() =>
      SandboxConfigSchema.parse({
        image: 'node:20',
        timeoutMs: 10000,
        memoryLimitMb: 0,
        cpuLimit: 1,
        workDir: '/work',
      })
    ).toThrow();
  });
});

describe('SandboxResultSchema', () => {
  it('validates a minimal result', () => {
    const result = SandboxResultSchema.parse({
      exitCode: 0,
      stdout: 'hello',
      stderr: '',
      durationMs: 150,
      command: 'echo hello',
    });
    expect(result.exitCode).toBe(0);
    expect(result.resourceUsage).toBeUndefined();
    expect(result.resourceLimitViolation).toBeUndefined();
  });

  it('validates a result with resource usage', () => {
    const result = SandboxResultSchema.parse({
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 500,
      command: 'npm test',
      resourceUsage: {
        peakCpuPercent: 85.5,
        peakMemoryMb: 120,
        diskUsageMb: 45,
      },
    });
    expect(result.resourceUsage?.peakCpuPercent).toBe(85.5);
  });

  it('validates a result with resource limit violation', () => {
    const result = SandboxResultSchema.parse({
      exitCode: 137,
      stdout: '',
      stderr: 'Killed',
      durationMs: 30000,
      command: 'npm run build',
      resourceLimitViolation: {
        limit: 'memory',
        configured: 256,
        actual: 512,
        description: 'Container exceeded 256MB memory limit',
      },
    });
    expect(result.resourceLimitViolation?.limit).toBe('memory');
  });
});

describe('ResourceUsageSchema', () => {
  it('validates resource usage', () => {
    const usage = ResourceUsageSchema.parse({
      peakCpuPercent: 95.2,
      peakMemoryMb: 200,
      diskUsageMb: 50,
    });
    expect(usage.peakMemoryMb).toBe(200);
  });
});

describe('ResourceLimitViolationSchema', () => {
  it('validates all limit types', () => {
    for (const limit of ['cpu', 'memory', 'runtime', 'disk'] as const) {
      const violation = ResourceLimitViolationSchema.parse({
        limit,
        configured: 100,
        actual: 200,
        description: `${limit} limit exceeded`,
      });
      expect(violation.limit).toBe(limit);
    }
  });

  it('rejects invalid limit type', () => {
    expect(() =>
      ResourceLimitViolationSchema.parse({
        limit: 'network',
        configured: 100,
        actual: 200,
        description: 'not valid',
      })
    ).toThrow();
  });
});

describe('ExecOptsSchema', () => {
  it('validates with all fields', () => {
    const opts = ExecOptsSchema.parse({
      timeoutMs: 5000,
      env: { NODE_ENV: 'test' },
      workDir: '/app/src',
    });
    expect(opts.timeoutMs).toBe(5000);
    expect(opts.env?.NODE_ENV).toBe('test');
  });

  it('validates empty object', () => {
    const opts = ExecOptsSchema.parse({});
    expect(opts.timeoutMs).toBeUndefined();
    expect(opts.env).toBeUndefined();
  });
});

describe('SandboxImageLockfileSchema', () => {
  it('validates a lockfile with entries', () => {
    const lockfile = SandboxImageLockfileSchema.parse({
      schemaVersion: 1,
      images: [
        {
          runtime: 'node',
          image: 'node:20-slim',
          digest: 'sha256:abc123def456',
          updatedAt: '2026-01-15T10:00:00.000Z',
        },
        {
          runtime: 'python',
          image: 'python:3.12-slim',
          digest: 'sha256:789xyz',
          updatedAt: '2026-01-15T10:00:00.000Z',
        },
      ],
    });
    expect(lockfile.images).toHaveLength(2);
    expect(lockfile.images[0]!.runtime).toBe('node');
  });

  it('validates an empty lockfile', () => {
    const lockfile = SandboxImageLockfileSchema.parse({
      schemaVersion: 1,
      images: [],
    });
    expect(lockfile.images).toHaveLength(0);
  });

  it('rejects invalid runtime', () => {
    expect(() =>
      SandboxImageLockfileSchema.parse({
        schemaVersion: 1,
        images: [
          {
            runtime: 'ruby',
            image: 'ruby:3.2',
            digest: 'sha256:abc',
            updatedAt: '2026-01-15T10:00:00.000Z',
          },
        ],
      })
    ).toThrow();
  });
});

// ─── MockSandbox ─────────────────────────────────────────────────────────────

describe('MockSandbox', () => {
  let sandbox: MockSandbox;
  const testConfig: SandboxConfig = {
    image: 'node:20-slim',
    timeoutMs: 30000,
    memoryLimitMb: 256,
    cpuLimit: 0.5,
    networkEnabled: false,
    workDir: '/app',
    maxDiskMb: 500,
  };

  beforeEach(() => {
    sandbox = new MockSandbox();
  });

  it('tracks init call and sets initialized flag', async () => {
    await sandbox.init(testConfig);
    expect(sandbox.initialized).toBe(true);
    expect(sandbox.calls).toHaveLength(1);
    expect(sandbox.calls[0]!.method).toBe('init');
  });

  it('returns default success result for execute', async () => {
    const result = await sandbox.execute('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.command).toBe('echo hello');
  });

  it('returns queued execute results in order', async () => {
    const mock = new MockSandbox({
      executeResults: [
        makeSuccessResult('npm install', 'added 100 packages'),
        makeSuccessResult('npm run build'),
        makeFailResult('npm test', 'FAIL: 2 tests failed', 1),
      ],
    });

    const r1 = await mock.execute('npm install');
    expect(r1.exitCode).toBe(0);
    expect(r1.stdout).toBe('added 100 packages');

    const r2 = await mock.execute('npm run build');
    expect(r2.exitCode).toBe(0);

    const r3 = await mock.execute('npm test');
    expect(r3.exitCode).toBe(1);
    expect(r3.stderr).toBe('FAIL: 2 tests failed');
  });

  it('falls back to default result after queue is exhausted', async () => {
    const mock = new MockSandbox({
      executeResults: [makeSuccessResult('first')],
    });

    await mock.execute('first');
    const fallback = await mock.execute('second');
    expect(fallback.exitCode).toBe(0);
    expect(fallback.command).toBe('second');
  });

  it('stores and retrieves written files', async () => {
    await sandbox.writeFile('/app/src/index.ts', 'console.log("hi")');
    const content = await sandbox.readFile('/app/src/index.ts');
    expect(content).toBe('console.log("hi")');
  });

  it('readFile throws for missing files', async () => {
    await expect(sandbox.readFile('/missing')).rejects.toThrow('file not found');
  });

  it('readFile returns preconfigured results', async () => {
    const mock = new MockSandbox({
      readFileResults: { '/app/package.json': '{"name":"test"}' },
    });
    const content = await mock.readFile('/app/package.json');
    expect(content).toBe('{"name":"test"}');
  });

  it('tracks cleanup and sets cleanedUp flag', async () => {
    await sandbox.cleanup();
    expect(sandbox.cleanedUp).toBe(true);
    expect(sandbox.calls).toHaveLength(1);
    expect(sandbox.calls[0]!.method).toBe('cleanup');
  });

  it('throws configured init error', async () => {
    const mock = new MockSandbox({
      initError: new Error('Docker not found'),
    });
    await expect(mock.init(testConfig)).rejects.toThrow('Docker not found');
  });

  it('throws configured execute error', async () => {
    const mock = new MockSandbox({
      executeError: new Error('Container died'),
    });
    await expect(mock.execute('ls')).rejects.toThrow('Container died');
  });

  it('getExecuteCalls filters only execute calls', async () => {
    await sandbox.init(testConfig);
    await sandbox.execute('npm install');
    await sandbox.writeFile('/app/x', 'y');
    await sandbox.execute('npm test');

    const execCalls = sandbox.getExecuteCalls();
    expect(execCalls).toHaveLength(2);
    expect(execCalls[0]!.command).toBe('npm install');
    expect(execCalls[1]!.command).toBe('npm test');
  });

  it('getWrittenFiles returns all written files', async () => {
    await sandbox.writeFile('/a', '1');
    await sandbox.writeFile('/b', '2');

    const files = sandbox.getWrittenFiles();
    expect(files.size).toBe(2);
    expect(files.get('/a')).toBe('1');
    expect(files.get('/b')).toBe('2');
  });

  it('satisfies SandboxEnvironment interface', () => {
    const env: SandboxEnvironment = sandbox;
    expect(typeof env.init).toBe('function');
    expect(typeof env.execute).toBe('function');
    expect(typeof env.writeFile).toBe('function');
    expect(typeof env.readFile).toBe('function');
    expect(typeof env.cleanup).toBe('function');
  });

  it('records call timestamps', async () => {
    const before = Date.now();
    await sandbox.init(testConfig);
    await sandbox.execute('test');
    const after = Date.now();

    for (const call of sandbox.calls) {
      expect(call.timestamp).toBeGreaterThanOrEqual(before);
      expect(call.timestamp).toBeLessThanOrEqual(after);
    }
  });
});

// ─── Helper Functions ────────────────────────────────────────────────────────

describe('makeSuccessResult', () => {
  it('creates a success result with defaults', () => {
    const result = makeSuccessResult('echo ok');
    expect(result.exitCode).toBe(0);
    expect(result.command).toBe('echo ok');
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('creates a success result with custom stdout', () => {
    const result = makeSuccessResult('ls', 'file1\nfile2');
    expect(result.stdout).toBe('file1\nfile2');
  });
});

describe('makeFailResult', () => {
  it('creates a fail result with defaults', () => {
    const result = makeFailResult('npm test', 'FAIL');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('FAIL');
  });

  it('creates a fail result with custom exit code', () => {
    const result = makeFailResult('build', 'error', 2);
    expect(result.exitCode).toBe(2);
  });
});
