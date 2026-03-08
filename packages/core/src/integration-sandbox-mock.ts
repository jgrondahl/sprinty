import type {
  IntegrationSandbox,
  IntegrationSandboxServiceConfig,
  SandboxResult,
} from './sandbox';

export interface MockIntegrationSandboxOptions {
  executeResults?: SandboxResult[];
}

export class MockIntegrationSandbox implements IntegrationSandbox {
  public readonly services = new Map<string, IntegrationSandboxServiceConfig>();
  public readonly executeCalls: Array<{ name: string; command: string }> = [];

  private readonly executeResults: SandboxResult[];
  private executeIndex = 0;

  constructor(options: MockIntegrationSandboxOptions = {}) {
    this.executeResults = options.executeResults ?? [];
  }

  addService(name: string, config: IntegrationSandboxServiceConfig): void {
    this.services.set(name, config);
  }

  async start(): Promise<void> {
    return Promise.resolve();
  }

  getServiceUrl(name: string): string {
    return `http://mock-${name}:80`;
  }

  async executeInService(name: string, command: string): Promise<SandboxResult> {
    this.executeCalls.push({ name, command });

    const queued = this.executeResults[this.executeIndex];
    if (queued) {
      this.executeIndex += 1;
      return queued;
    }

    return {
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 10,
      command,
    };
  }

  async cleanup(): Promise<void> {
    return Promise.resolve();
  }
}
