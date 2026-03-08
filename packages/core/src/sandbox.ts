import { z } from 'zod';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const ResourceUsageSchema = z.object({
  peakCpuPercent: z.number(),
  peakMemoryMb: z.number(),
  diskUsageMb: z.number(),
});

export const ResourceLimitViolationSchema = z.object({
  limit: z.enum(['cpu', 'memory', 'runtime', 'disk']),
  configured: z.number(),
  actual: z.number(),
  description: z.string(),
});

export const SandboxResultSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number(),
  command: z.string(),
  resourceUsage: ResourceUsageSchema.optional(),
  resourceLimitViolation: ResourceLimitViolationSchema.optional(),
});

export const SandboxConfigSchema = z.object({
  image: z.string().min(1),
  timeoutMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  cpuLimit: z.number().positive(),
  networkEnabled: z.boolean().default(false),
  workDir: z.string().min(1),
  maxDiskMb: z.number().int().positive().optional().default(500),
});

export const ExecOptsSchema = z.object({
  timeoutMs: z.number().int().positive().optional(),
  env: z.record(z.string(), z.string()).optional(),
  workDir: z.string().optional(),
});

export const SandboxImageEntrySchema = z.object({
  runtime: z.enum(['node', 'python']),
  image: z.string().min(1),
  digest: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export const SandboxImageLockfileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  images: z.array(SandboxImageEntrySchema),
});

// ─── TypeScript Types (inferred from Zod) ────────────────────────────────────

export type ResourceUsage = z.infer<typeof ResourceUsageSchema>;
export type ResourceLimitViolation = z.infer<typeof ResourceLimitViolationSchema>;
export type SandboxResult = z.infer<typeof SandboxResultSchema>;
export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type ExecOpts = z.infer<typeof ExecOptsSchema>;
export type SandboxImageEntry = z.infer<typeof SandboxImageEntrySchema>;
export type SandboxImageLockfile = z.infer<typeof SandboxImageLockfileSchema>;

// ─── SandboxEnvironment Interface ────────────────────────────────────────────

/**
 * Abstraction for running generated code in an isolated environment.
 * Production: Docker containers. Tests: MockSandbox.
 */
export interface SandboxEnvironment {
  /** Initialize the sandbox with the given configuration (e.g. pull image, create container). */
  init(config: SandboxConfig): Promise<void>;

  /** Execute a command inside the sandbox and return structured results. */
  execute(command: string, opts?: ExecOpts): Promise<SandboxResult>;

  /** Write a file into the sandbox filesystem. */
  writeFile(path: string, content: string): Promise<void>;

  /** Read a file from the sandbox filesystem. */
  readFile(path: string): Promise<string>;

  /** Tear down the sandbox (remove container, clean up resources). */
  cleanup(): Promise<void>;
}

export interface IntegrationSandboxServiceConfig {
  /** Docker image to use for this service */
  image: string;
  /** Environment variables to inject */
  env?: Record<string, string>;
  /** Exposed port mappings: key=internal port, value=host port */
  ports?: Record<number, number>;
  /** Health-check command (runs inside container) */
  healthCheck?: string;
}

export interface IntegrationSandbox {
  /** Register a service before starting the sandbox. Must be called before start(). */
  addService(name: string, config: IntegrationSandboxServiceConfig): void;

  /** Start all registered services. */
  start(): Promise<void>;

  /** Get the base URL for a named service (e.g. "http://localhost:3001"). */
  getServiceUrl(name: string): string;

  /** Execute a shell command inside a named service's container. */
  executeInService(name: string, command: string): Promise<SandboxResult>;

  /** Stop and remove all containers. */
  cleanup(): Promise<void>;
}

// ─── Custom Errors ───────────────────────────────────────────────────────────

export class SandboxInitError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(`SandboxInitError: ${message}`);
    this.name = 'SandboxInitError';
  }
}

export class SandboxExecError extends Error {
  constructor(
    public readonly command: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`SandboxExecError [${command}]: ${message}`);
    this.name = 'SandboxExecError';
  }
}

export class SandboxTimeoutError extends Error {
  constructor(
    public readonly command: string,
    public readonly timeoutMs: number
  ) {
    super(`SandboxTimeoutError: command "${command}" exceeded ${timeoutMs}ms timeout`);
    this.name = 'SandboxTimeoutError';
  }
}
