import { describe, expect, it } from 'bun:test';
import { getSecurityReport, triggerSecurityScan } from './security';

describe('security route authorization', () => {
  it('requires org-manage role for triggering scan', async () => {
    const req = new Request('http://localhost/api/projects/p1/security-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const auth = { userId: 'u1', orgId: 'o1', role: 'viewer' };

    await expect(
      triggerSecurityScan(req, 'p1', {} as never, auth as never)
    ).rejects.toThrow();
  });

  it('throws when report is missing', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'admin' };
    await expect(getSecurityReport('project-1', auth as never)).rejects.toThrow();
  });
});
