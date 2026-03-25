import { afterEach, describe, expect, it } from 'bun:test';
import { checkRateLimit, resetRateLimiterForTest } from './rate-limiter';

afterEach(() => {
  resetRateLimiterForTest();
  delete process.env['JWT_SECRET'];
});

describe('rate limiter middleware', () => {
  it('limits auth routes to configured threshold', async () => {
    const config = { authLimitPerMinute: 2, generalLimitPerMinute: 100 };
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'x-real-ip': '1.2.3.4' },
    });

    expect(await checkRateLimit(req, config)).toBeNull();
    expect(await checkRateLimit(req, config)).toBeNull();
    const blocked = await checkRateLimit(req, config);
    expect(blocked?.status).toBe(429);
    const body = (await blocked?.json()) as { code: string };
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('limits general routes using general threshold', async () => {
    const config = { authLimitPerMinute: 5, generalLimitPerMinute: 1 };
    const req = new Request('http://localhost/api/health', {
      headers: { 'x-real-ip': '4.3.2.1' },
    });

    expect(await checkRateLimit(req, config)).toBeNull();
    const blocked = await checkRateLimit(req, config);
    expect(blocked?.status).toBe(429);
  });

  it('returns Retry-After header on limit exceeded', async () => {
    const config = { authLimitPerMinute: 1, generalLimitPerMinute: 100 };
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'x-real-ip': '9.9.9.9' },
    });

    expect(await checkRateLimit(req, config)).toBeNull();
    const blocked = await checkRateLimit(req, config);
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get('Retry-After')).toBeString();
  });

  it('uses JWT subject identity when bearer token is valid', async () => {
    process.env['JWT_SECRET'] = 'test-secret';
    const { signToken } = await import('../auth/jwt');
    const token = await signToken('user-xyz', 'org-1', 'member');
    const config = { authLimitPerMinute: 1, generalLimitPerMinute: 100 };
    const req = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(await checkRateLimit(req, config)).toBeNull();
    const blocked = await checkRateLimit(req, config);
    expect(blocked?.status).toBe(429);
  });
});
