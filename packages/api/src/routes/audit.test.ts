import { describe, expect, it } from 'bun:test';
import { listAudit } from './audit';

describe('audit route', () => {
  it('requires audit-read permission', async () => {
    const req = new Request('http://localhost/api/audit');
    const auth = { userId: 'u1', orgId: 'o1', role: 'member' };

    await expect(listAudit(req, {} as never, auth as never)).rejects.toThrow();
  });

  it('supports org list response shape', async () => {
    const req = new Request('http://localhost/api/audit?offset=0&limit=10');
    const auth = { userId: 'u1', orgId: 'o1', role: 'admin' };
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            offset: () => ({
              limit: async () => [{ id: 'a1' }],
            }),
          }),
        }),
      }),
    };

    const response = await listAudit(req, db as never, auth as never);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { records: Array<{ id: string }> };
    expect(body.records).toHaveLength(1);
    expect(body.records[0]?.id).toBe('a1');
  });

  it('filters by entity when entityType/entityId query provided', async () => {
    const req = new Request('http://localhost/api/audit?entityType=story&entityId=s1');
    const auth = { userId: 'u1', orgId: 'o1', role: 'admin' };
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{ id: 'a2', entityType: 'story', entityId: 's1' }],
          offset: () => ({
            limit: async () => [],
          }),
        }),
      }),
    };

    const response = await listAudit(req, db as never, auth as never);
    const body = (await response.json()) as { records: Array<{ id: string }> };
    expect(body.records).toHaveLength(1);
    expect(body.records[0]?.id).toBe('a2');
  });
});
