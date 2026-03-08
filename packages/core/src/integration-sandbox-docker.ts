import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { type IntegrationSandbox, type IntegrationSandboxServiceConfig, type SandboxResult, SandboxInitError } from './sandbox';

const GENERATED_COMPOSE_FILE = 'docker-compose.generated.yml';

export class DockerComposeIntegrationSandbox implements IntegrationSandbox {
  private readonly services = new Map<string, IntegrationSandboxServiceConfig>();
  private readonly composeFilePath: string;

  constructor(private readonly workDir: string) {
    this.composeFilePath = path.join(workDir, GENERATED_COMPOSE_FILE);
  }

  addService(name: string, config: IntegrationSandboxServiceConfig): void {
    this.services.set(name, config);
  }

  async start(): Promise<void> {
    const composeContent = this.renderComposeYaml();
    await fs.mkdir(this.workDir, { recursive: true });
    await fs.writeFile(this.composeFilePath, composeContent, 'utf8');

    try {
      await this.execDockerCompose(['-f', GENERATED_COMPOSE_FILE, 'up', '-d', '--wait']);
    } catch (cause) {
      throw new SandboxInitError('Failed to start docker compose integration sandbox', cause);
    }
  }

  getServiceUrl(name: string): string {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`DockerComposeIntegrationSandbox: service not registered: ${name}`);
    }

    const ports = service.ports;
    if (!ports || Object.keys(ports).length === 0) {
      throw new Error(`DockerComposeIntegrationSandbox: service has no mapped ports: ${name}`);
    }

    const firstInternalPort = Number(Object.keys(ports)[0]);
    const hostPort = ports[firstInternalPort];
    if (!hostPort) {
      throw new Error(`DockerComposeIntegrationSandbox: invalid port mapping for service: ${name}`);
    }

    return `http://localhost:${hostPort}`;
  }

  async executeInService(name: string, command: string): Promise<SandboxResult> {
    const startedAt = Date.now();
    const args = ['-f', GENERATED_COMPOSE_FILE, 'exec', '-T', name, 'sh', '-c', command];

    try {
      const output = await this.execDockerCompose(args);
      return {
        exitCode: 0,
        stdout: output.stdout,
        stderr: output.stderr,
        durationMs: Date.now() - startedAt,
        command,
      };
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number | string | null };
      const maybeCode = typeof err.code === 'number' ? err.code : 1;
      return {
        exitCode: maybeCode,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? (err.message ?? ''),
        durationMs: Date.now() - startedAt,
        command,
      };
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.execDockerCompose(['-f', GENERATED_COMPOSE_FILE, 'down', '-v']);
    } catch {
    }
  }

  private async execDockerCompose(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile('docker', ['compose', ...args], { cwd: this.workDir }, (error, stdout, stderr) => {
        if (error) {
          const enriched = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
          enriched.stdout = stdout;
          enriched.stderr = stderr;
          reject(enriched);
          return;
        }

        resolve({ stdout, stderr });
      });
    });
  }

  private renderComposeYaml(): string {
    const lines: string[] = ['services:'];

    for (const [name, config] of this.services) {
      lines.push(`  ${name}:`);
      lines.push(`    image: ${quoteYaml(config.image)}`);

      if (config.env && Object.keys(config.env).length > 0) {
        lines.push('    environment:');
        for (const [key, value] of Object.entries(config.env)) {
          lines.push(`      ${key}: ${quoteYaml(value)}`);
        }
      }

      if (config.ports && Object.keys(config.ports).length > 0) {
        lines.push('    ports:');
        for (const [internalPort, hostPort] of Object.entries(config.ports)) {
          lines.push(`      - ${quoteYaml(`${hostPort}:${internalPort}`)}`);
        }
      }

      if (config.healthCheck) {
        lines.push('    healthcheck:');
        lines.push(`      test: ["CMD-SHELL", ${quoteYaml(config.healthCheck)}]`);
      }
    }

    return `${lines.join('\n')}\n`;
  }
}

function quoteYaml(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}
