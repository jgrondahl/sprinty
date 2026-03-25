import { describe, expect, it } from 'bun:test';
import { hashPassword, verifyPassword } from './password';

describe('password helpers', () => {
  it('hashes and verifies password', async () => {
    const hash = await hashPassword('Test1234!');
    expect(hash).toBeString();
    expect(hash.length).toBeGreaterThan(20);

    const valid = await verifyPassword('Test1234!', hash);
    const invalid = await verifyPassword('wrong', hash);
    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });
});
