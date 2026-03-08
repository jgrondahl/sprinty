import Docker from 'dockerode';
import { PassThrough } from 'stream';
import {
  type ExecOpts,
  type ResourceLimitViolation,
  type ResourceUsage,
  type SandboxConfig,
  type SandboxEnvironment,
  type SandboxResult,
  SandboxExecError,
  SandboxInitError,
} from './sandbox';

const OUTPUT_LIMIT_BYTES = 10 * 1024;

export class DockerSandbox implements SandboxEnvironment {
  private readonly docker: Docker;
  private container: Docker.Container | null = null;
  private config: SandboxConfig | null = null;

  constructor(docker?: Docker) {
    this.docker = docker ?? new Docker();
  }

  async init(config: SandboxConfig): Promise<void> {
    await this.cleanup();

    try {
      const hostConfig = {
        Memory: config.memoryLimitMb * 1024 * 1024,
        NanoCpus: Math.floor(config.cpuLimit * 1e9),
        NanoCPUs: Math.floor(config.cpuLimit * 1e9),
        NetworkMode: config.networkEnabled ? 'bridge' : 'none',
      } as Docker.HostConfig & { NanoCPUs: number };

      const container = await this.docker.createContainer({
        Image: config.image,
        Cmd: ['sleep', 'infinity'],
        WorkingDir: config.workDir,
        HostConfig: hostConfig,
      });

      await container.start();
      this.container = container;
      this.config = config;
    } catch (cause) {
      throw new SandboxInitError('Failed to create/start Docker sandbox container', cause);
    }
  }

  async execute(command: string, opts?: ExecOpts): Promise<SandboxResult> {
    const container = this.requireContainer(command);
    const config = this.requireConfig(command);
    const timeoutMs = opts?.timeoutMs ?? config.timeoutMs;
    const startedAt = Date.now();

    try {
      const env = opts?.env
        ? Object.entries(opts.env).map(([key, value]) => `${key}=${value}`)
        : undefined;

      const exec = await container.exec({
        Cmd: ['sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        Env: env,
        WorkingDir: opts?.workDir,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      this.docker.modem.demuxStream(stream, stdout, stderr);

      let timedOut = false;
      let streamError: unknown;

      const streamDone = new Promise<void>((resolve) => {
        let settled = false;

        const finish = (err?: unknown): void => {
          if (settled) return;
          settled = true;
          if (err !== undefined) {
            streamError = err;
          }
          stdout.end();
          stderr.end();
          resolve();
        };

        stream.once('end', () => finish());
        stream.once('close', () => finish());
        stream.once('error', (err) => finish(err));
      });

      const timeoutHandle = setTimeout(() => {
        timedOut = true;
        stream.destroy();
        void container
          .stop({ t: 0 })
          .catch(() => undefined)
          .then(() => container.start().catch(() => undefined));
      }, timeoutMs);

      await streamDone;
      clearTimeout(timeoutHandle);

      const durationMs = Date.now() - startedAt;
      const stdoutText = truncateUtf8(Buffer.concat(stdoutChunks), OUTPUT_LIMIT_BYTES);
      const stderrText = truncateUtf8(Buffer.concat(stderrChunks), OUTPUT_LIMIT_BYTES);
      const resourceUsage = await this.captureResourceUsage(container);

      if (timedOut) {
        const resourceLimitViolation: ResourceLimitViolation = {
          limit: 'runtime',
          configured: timeoutMs,
          actual: durationMs,
          description: `Command exceeded timeout of ${timeoutMs}ms`,
        };

        return {
          exitCode: 137,
          stdout: stdoutText,
          stderr: stderrText,
          durationMs,
          command,
          resourceUsage,
          resourceLimitViolation,
        };
      }

      if (streamError !== undefined) {
        throw new SandboxExecError(command, 'Failed while streaming exec output', streamError);
      }

      const inspect = await exec.inspect();
      const exitCode = inspect.ExitCode ?? 1;

      const result: SandboxResult = {
        exitCode,
        stdout: stdoutText,
        stderr: stderrText,
        durationMs,
        command,
        resourceUsage,
      };

      if (exitCode === 137) {
        result.resourceLimitViolation = {
          limit: 'memory',
          configured: config.memoryLimitMb,
          actual: resourceUsage?.peakMemoryMb ?? config.memoryLimitMb,
          description: `Process terminated with exit code 137 (likely OOM kill)`,
        };
      }

      return result;
    } catch (cause) {
      if (cause instanceof SandboxExecError) {
        throw cause;
      }
      throw new SandboxExecError(command, 'Docker exec infrastructure failure', cause);
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const container = this.requireContainer(`writeFile:${path}`);

    try {
      const tarBuffer = createSingleFileTar(path, Buffer.from(content, 'utf8'));
      await container.putArchive(tarBuffer, { path: '/' });
    } catch (cause) {
      throw new SandboxExecError(`writeFile:${path}`, 'Failed to write file into container', cause);
    }
  }

  async readFile(path: string): Promise<string> {
    const container = this.requireContainer(`readFile:${path}`);

    try {
      const archiveStream = await container.getArchive({ path });
      const tarBuffer = await readAll(archiveStream);
      return extractFirstFileFromTar(tarBuffer).toString('utf8');
    } catch (cause) {
      throw new SandboxExecError(`readFile:${path}`, 'Failed to read file from container', cause);
    }
  }

  async cleanup(): Promise<void> {
    const container = this.container;
    this.container = null;
    this.config = null;

    if (!container) {
      return;
    }

    try {
      await container.stop({ t: 0 });
    } catch {
    }

    try {
      await container.remove({ force: true });
    } catch {
    }
  }

  private requireContainer(command: string): Docker.Container {
    if (!this.container) {
      throw new SandboxExecError(command, 'Sandbox container is not initialized');
    }
    return this.container;
  }

  private requireConfig(command: string): SandboxConfig {
    if (!this.config) {
      throw new SandboxExecError(command, 'Sandbox configuration is not initialized');
    }
    return this.config;
  }

  private async captureResourceUsage(container: Docker.Container): Promise<ResourceUsage | undefined> {
    try {
      const stats = await container.stats({ stream: false });
      const memoryMb = stats.memory_stats.usage / (1024 * 1024);
      const diskBytes =
        stats.blkio_stats?.io_service_bytes_recursive?.reduce((sum, entry) => sum + entry.value, 0) ?? 0;

      const cpuTotal = stats.cpu_stats.cpu_usage.total_usage;
      const preCpuTotal = stats.precpu_stats.cpu_usage.total_usage;
      const systemTotal = stats.cpu_stats.system_cpu_usage;
      const preSystemTotal = stats.precpu_stats.system_cpu_usage;
      const cpuDelta = cpuTotal - preCpuTotal;
      const systemDelta = systemTotal - preSystemTotal;
      const cpuCount = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage.length || 1;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

      return {
        peakCpuPercent: cpuPercent,
        peakMemoryMb: memoryMb,
        diskUsageMb: diskBytes / (1024 * 1024),
      };
    } catch {
      return undefined;
    }
  }
}

function truncateUtf8(buffer: Buffer, maxBytes: number): string {
  if (buffer.length <= maxBytes) {
    return buffer.toString('utf8');
  }
  return buffer.subarray(0, maxBytes).toString('utf8');
}

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.once('end', () => resolve(Buffer.concat(chunks)));
    stream.once('error', (err) => reject(err));
  });
}

function createSingleFileTar(targetPath: string, content: Buffer): Buffer {
  const normalized = normalizeTarPath(targetPath);
  const { name, prefix } = splitTarPath(normalized);
  const header = Buffer.alloc(512, 0);

  writeStringField(header, 0, 100, name);
  writeOctalField(header, 100, 8, 0o644);
  writeOctalField(header, 108, 8, 0);
  writeOctalField(header, 116, 8, 0);
  writeOctalField(header, 124, 12, content.length);
  writeOctalField(header, 136, 12, Math.floor(Date.now() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = '0'.charCodeAt(0);
  writeStringField(header, 157, 100, '');
  writeStringField(header, 257, 6, 'ustar');
  writeStringField(header, 263, 2, '00');
  writeStringField(header, 265, 32, 'root');
  writeStringField(header, 297, 32, 'root');
  writeOctalField(header, 329, 8, 0);
  writeOctalField(header, 337, 8, 0);
  writeStringField(header, 345, 155, prefix);

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeChecksumField(header, checksum);

  const contentPadding = (512 - (content.length % 512)) % 512;
  const padding = Buffer.alloc(contentPadding, 0);
  const end = Buffer.alloc(1024, 0);

  return Buffer.concat([header, content, padding, end]);
}

function extractFirstFileFromTar(tarBuffer: Buffer): Buffer {
  let offset = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);

    if (isAllZeros(header)) {
      break;
    }

    const size = parseOctalField(header, 124, 12);
    const typeFlag = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;

    if (contentEnd > tarBuffer.length) {
      throw new Error('Invalid tar archive: truncated entry');
    }

    if (typeFlag === '0') {
      return tarBuffer.subarray(contentStart, contentEnd);
    }

    const padded = 512 * Math.ceil(size / 512);
    offset = contentStart + padded;
  }

  throw new Error('No file entry found in tar archive');
}

function normalizeTarPath(input: string): string {
  const withoutDrive = input.replace(/^[A-Za-z]:/, '');
  return withoutDrive.replace(/^\/+/, '').replace(/\\/g, '/');
}

function splitTarPath(filePath: string): { name: string; prefix: string } {
  if (Buffer.byteLength(filePath, 'utf8') <= 100) {
    return { name: filePath, prefix: '' };
  }

  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash <= 0) {
    throw new Error(`Tar path too long and cannot be split: ${filePath}`);
  }

  const prefix = filePath.slice(0, lastSlash);
  const name = filePath.slice(lastSlash + 1);

  if (Buffer.byteLength(name, 'utf8') > 100 || Buffer.byteLength(prefix, 'utf8') > 155) {
    throw new Error(`Tar path exceeds ustar limits: ${filePath}`);
  }

  return { name, prefix };
}

function writeStringField(buffer: Buffer, offset: number, length: number, value: string): void {
  const encoded = Buffer.from(value, 'utf8');
  encoded.copy(buffer, offset, 0, Math.min(encoded.length, length));
}

function writeOctalField(buffer: Buffer, offset: number, length: number, value: number): void {
  const octal = value.toString(8);
  const text = octal.padStart(length - 1, '0');
  writeStringField(buffer, offset, length - 1, text);
  buffer[offset + length - 1] = 0;
}

function writeChecksumField(buffer: Buffer, checksum: number): void {
  const octal = checksum.toString(8).padStart(6, '0');
  writeStringField(buffer, 148, 6, octal);
  buffer[154] = 0;
  buffer[155] = 0x20;
}

function parseOctalField(buffer: Buffer, offset: number, length: number): number {
  const field = buffer
    .subarray(offset, offset + length)
    .toString('utf8')
    .replace(/\0/g, '')
    .trim();

  return field.length > 0 ? Number.parseInt(field, 8) : 0;
}

function isAllZeros(buffer: Buffer): boolean {
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] !== 0) {
      return false;
    }
  }
  return true;
}
