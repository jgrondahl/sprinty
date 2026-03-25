import { describe, expect, it } from 'bun:test';
import { handlePreflight, withCorsHeaders } from './cors';

const config = {
  origins: ['http://localhost:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization', 'X-Request-Id'],
};

describe('cors middleware', () => {
  it('allows listed origin', () => {
    const req = new Request('http://localhost/api/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    const response = withCorsHeaders(req, new Response('ok'), config);
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('rejects unlisted origin with 403', async () => {
    const req = new Request('http://localhost/api/health', {
      headers: { Origin: 'http://evil.com' },
    });
    const response = withCorsHeaders(req, new Response('ok'), config);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('CORS_ORIGIN_FORBIDDEN');
  });

  it('handles preflight requests for allowed origin', () => {
    const req = new Request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    const response = handlePreflight(req, config);
    expect(response?.status).toBe(204);
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
  });

  it('rejects preflight for unlisted origin', async () => {
    const req = new Request('http://localhost/api/health', {
      method: 'OPTIONS',
      headers: { Origin: 'http://evil.com' },
    });
    const response = handlePreflight(req, config);
    expect(response?.status).toBe(403);
    const body = (await response?.json()) as { code: string };
    expect(body.code).toBe('CORS_ORIGIN_FORBIDDEN');
  });
});
