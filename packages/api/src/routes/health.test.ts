import { describe, expect, it } from 'bun:test';
import { getHealth } from './health';

describe('health route', () => {
  it('returns ok status payload', async () => {
    const response = getHealth();
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      status: string;
      version: string;
      uptime: number;
    };

    expect(payload.status).toBe('ok');
    expect(payload.version).toBe('0.1.0');
    expect(typeof payload.uptime).toBe('number');
  });
});
