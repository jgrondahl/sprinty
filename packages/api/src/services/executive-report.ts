import { ProjectRepository, type DbClient } from '@splinty/db';
import { MetricsAggregator } from './metrics-aggregator';

type Health = 'GREEN' | 'YELLOW' | 'RED';

function computeHealth(completed: number, planned: number): Health {
  if (planned <= 0) {
    return 'YELLOW';
  }

  const ratio = completed / planned;
  if (ratio >= 0.8) {
    return 'GREEN';
  }
  if (ratio >= 0.5) {
    return 'YELLOW';
  }
  return 'RED';
}

export async function buildProjectReport(db: DbClient, orgId: string, projectId: string) {
  const aggregator = new MetricsAggregator(db);
  const metrics = await aggregator.getProjectMetrics(projectId, orgId);

  return {
    projectId,
    projectName: metrics.projectName,
    healthStatus: computeHealth(metrics.recentCompletedPoints, metrics.recentPlannedPoints),
    metrics,
    riskIndicators: {
      lowThroughput: metrics.throughputStories < 3,
      velocityDecline: metrics.recentPlannedPoints > 0 && metrics.recentCompletedPoints < metrics.recentPlannedPoints,
      highCost: metrics.totalCostUsd > 100,
    },
  };
}

export async function buildOrgReport(db: DbClient, orgId: string) {
  const projectRepo = new ProjectRepository(db);
  const projects = await projectRepo.listByOrg(orgId);

  const reports = await Promise.all(
    projects.map((project) => buildProjectReport(db, orgId, project.id))
  );

  return {
    orgId,
    projectCount: projects.length,
    aggregateMetrics: {
      totalStoriesDelivered: reports.reduce((sum, report) => sum + report.metrics.throughputStories, 0),
      averageVelocity:
        reports.length > 0
          ? reports.reduce((sum, report) => sum + report.metrics.averageVelocity, 0) / reports.length
          : 0,
      totalCostUsd: reports.reduce((sum, report) => sum + report.metrics.totalCostUsd, 0),
    },
    reports,
  };
}
