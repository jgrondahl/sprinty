import { afterEach, describe, expect, it } from 'bun:test';
import { signToken, verifyToken } from './jwt';

describe('jwt helpers', () => {
  afterEach(() => {
    delete process.env['JWT_SECRET'];
  });

  it('signs and verifies token payload', async () => {
    process.env['JWT_SECRET'] = 'super-secret-key';

    const token = await signToken('user-1', 'org-1', 'admin');
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    const payload = await verifyToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.org).toBe('org-1');
    expect(payload.role).toBe('admin');
  });
});
