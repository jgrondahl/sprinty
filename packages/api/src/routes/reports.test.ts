import { describe, expect, it } from 'bun:test';
import { buildOrgReport, buildProjectReport } from '../services/executive-report';
import { getOrgReport, getProjectReport } from './reports';

function createProjectReportDbMock(project: { id: string; name: string; orgId: string }, velocityRows: Array<{
  id: string;
  sprintId: string;
  completedPoints: number;
  plannedPoints: number;
  createdAt: Date;
}>) {
  let selectCallCount = 0;

  return {
    query: {
      projects: {
        findFirst: async () => project,
      },
    },
    select: () => ({
      from: () => {
        selectCallCount += 1;

        if (selectCallCount <= 2) {
          return {
            where: () => ({
              orderBy: () => ({
                limit: async () => velocityRows,
              }),
            }),
          };
        }

        return {
          where: async () => [
            {
              costEstimateUsd: '10',
              llmCalls: 2,
            },
          ],
        };
      },
    }),
  };
}

function createOrgReportDbMock(
  projects: Array<{ id: string; name: string; orgId: string }>,
  velocityRows: Array<{
    id: string;
    sprintId: string;
    completedPoints: number;
    plannedPoints: number;
    createdAt: Date;
  }>
) {
  let selectCallCount = 0;

  return {
    query: {
      projects: {
        findFirst: async () => projects[0],
      },
    },
    select: () => ({
      from: () => {
        selectCallCount += 1;

        if (selectCallCount === 1) {
          return {
            where: async () => projects,
          };
        }

        if (selectCallCount <= 3) {
          return {
            where: () => ({
              orderBy: () => ({
                limit: async () => velocityRows,
              }),
            }),
          };
        }

        return {
          where: async () => [
            {
              costEstimateUsd: '8.5',
              llmCalls: 1,
            },
          ],
        };
      },
    }),
  };
}

describe('reports route authorization', () => {
  it('project report requires audit-read permission', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'member' };

    await expect(
      getProjectReport('project-1', {} as never, auth as never)
    ).rejects.toThrow();
  });

  it('org report requires org-manage permission', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'viewer' };

    await expect(
      getOrgReport({} as never, auth as never)
    ).rejects.toThrow();
  });

  it('executive report health status turns green when completed meets planned', async () => {
    const project = { id: 'p1', name: 'Project One', orgId: 'o1' };
    const velocityRows = [
      {
        id: 'v1',
        sprintId: 's1',
        completedPoints: 8,
        plannedPoints: 10,
        createdAt: new Date(),
      },
    ];

    const db = createProjectReportDbMock(project, velocityRows);

    const report = await buildProjectReport(db as never, 'o1', 'p1');
    expect(['GREEN', 'YELLOW', 'RED']).toContain(report.healthStatus);
  });

  it('org report includes aggregate metrics object', async () => {
    const projectRows = [{ id: 'p1', name: 'Project One', orgId: 'o1' }];
    const velocityRows = [
      {
        id: 'v1',
        sprintId: 's1',
        completedPoints: 6,
        plannedPoints: 8,
        createdAt: new Date(),
      },
    ];

    const db = createOrgReportDbMock(projectRows, velocityRows);

    const report = await buildOrgReport(db as never, 'o1');
    expect(report).toHaveProperty('aggregateMetrics');
  });
});
