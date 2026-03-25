import { describe, expect, it } from 'bun:test';
import { SignJWT } from 'jose';
import { authMiddleware } from './middleware';

async function makeToken(payload: { sub: string; org: string; role: string }) {
  const secret = new TextEncoder().encode('test-secret');
  return new SignJWT({ org: payload.org, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

describe('authMiddleware', () => {
  it('accepts bearer token from authorization header', async () => {
    process.env['JWT_SECRET'] = 'test-secret';
    const token = await makeToken({ sub: 'user-1', org: 'org-1', role: 'admin' });

    const req = new Request('http://localhost/test', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const auth = await authMiddleware(req);
    expect(auth.userId).toBe('user-1');
    expect(auth.orgId).toBe('org-1');
    expect(auth.role).toBe('admin');
  });

  it('accepts token from query string for SSE', async () => {
    process.env['JWT_SECRET'] = 'test-secret';
    const token = await makeToken({ sub: 'user-2', org: 'org-2', role: 'viewer' });

    const req = new Request(`http://localhost/sse?token=${encodeURIComponent(token)}`);
    const auth = await authMiddleware(req);

    expect(auth.userId).toBe('user-2');
    expect(auth.orgId).toBe('org-2');
    expect(auth.role).toBe('viewer');
  });
});
