import { describe, expect, it } from 'bun:test';
import { getOrgMetrics, getProjectComparison, getProjectVelocity, getTrends } from './metrics';

describe('metrics route authorization', () => {
  it('org metrics requires audit-read permission', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'member' };

    await expect(
      getOrgMetrics({} as never, auth as never)
    ).rejects.toThrow();
  });

  it('project comparison requires audit-read permission', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'viewer' };

    await expect(
      getProjectComparison({} as never, auth as never)
    ).rejects.toThrow();
  });

  it('trends requires audit-read permission', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'member' };

    await expect(
      getTrends({} as never, auth as never)
    ).rejects.toThrow();
  });

  it('project velocity requires project-read permission', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'viewer' };
    const db = {
      query: {
        projects: {
          findFirst: async () => ({ id: 'project-1', orgId: 'o1', name: 'Project' }),
        },
      },
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [],
            }),
            offset: () => ({
              limit: async () => [],
            }),
          }),
        }),
      }),
    };

    await expect(
      getProjectVelocity('project-1', db as never, auth as never)
    ).resolves.toBeDefined();
  });
});
