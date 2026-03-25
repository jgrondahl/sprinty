import { describe, expect, it } from 'bun:test';
import { VelocityRepository } from './velocity.repo';

describe('VelocityRepository', () => {
  it('returns 0 average for empty project', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: async () => [{ avg: 0 }],
        }),
      }),
    };

    const repo = new VelocityRepository(dbMock as never);
    repo.getByProject = async () => [] as never;
    const average = await repo.getAverageVelocity('project-1', 'org-1', 3);
    expect(average).toBe(0);
  });

  it('computes average from recent completed points', async () => {
    const dbMock = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
            }),
          }),
        }),
      }),
      insert: () => ({ values: () => ({ returning: async () => [] }) }),
    };

    const repo = new VelocityRepository(dbMock as never);
    repo.getByProject = async () =>
      [
        { id: 'a', completedPoints: 10 },
        { id: 'b', completedPoints: 20 },
        { id: 'c', completedPoints: 30 },
      ] as never;

    const average = await repo.getAverageVelocity('project-1', 'org-1', 3);
    expect(average).toBe(20);
  });
});
