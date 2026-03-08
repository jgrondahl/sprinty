import { describe, it, expect } from 'bun:test';
import { MockIntegrationSandbox } from './integration-sandbox-mock';

describe('MockIntegrationSandbox', () => {
  it('addService + getServiceUrl', () => {
    const sandbox = new MockIntegrationSandbox();
    sandbox.addService('api', { image: 'node:20' });

    expect(sandbox.services.get('api')).toEqual({ image: 'node:20' });
    expect(sandbox.getServiceUrl('api')).toBe('http://mock-api:80');
  });

  it('executeInService with queued result', async () => {
    const sandbox = new MockIntegrationSandbox({
      executeResults: [
        {
          exitCode: 1,
          stdout: 'partial',
          stderr: 'failed',
          durationMs: 23,
          command: 'curl -f http://api:3000/health',
        },
      ],
    });

    const result = await sandbox.executeInService('api', 'curl -f http://api:3000/health');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe('failed');
  });

  it('executeInService default success result', async () => {
    const sandbox = new MockIntegrationSandbox();
    const result = await sandbox.executeInService('web', 'npm test');

    expect(result.exitCode).toBe(0);
    expect(result.command).toBe('npm test');
  });

  it('cleanup no-op does not throw', async () => {
    const sandbox = new MockIntegrationSandbox();
    await expect(sandbox.cleanup()).resolves.toBeUndefined();
  });
});
