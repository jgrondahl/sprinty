import type { DbClient } from '@splinty/db';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { json } from '../utils/response';
import { MetricsAggregator } from '../services/metrics-aggregator';

export async function getOrgMetrics(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.AUDIT_READ);
  const aggregator = new MetricsAggregator(db);
  const data = await aggregator.getOrgMetrics(auth.orgId);
  return json(data);
}

export async function getProjectMetrics(projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_READ);
  const aggregator = new MetricsAggregator(db);
  const data = await aggregator.getProjectMetrics(projectId, auth.orgId);
  return json(data);
}

export async function getTrends(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.AUDIT_READ);
  const aggregator = new MetricsAggregator(db);
  const data = await aggregator.getTrends(auth.orgId);
  return json({ trends: data });
}

export async function getProjectComparison(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.AUDIT_READ);
  const aggregator = new MetricsAggregator(db);
  const data = await aggregator.getOrgMetrics(auth.orgId);

  return json({
    projects: data.aggregate.map((project) => ({
      projectName: project.projectName,
      totalStories: project.throughputStories,
      avgVelocity: project.averageVelocity,
      totalCostUsd: project.totalCostUsd,
      totalLlmCalls: project.totalLlmCalls,
      totalCompletedPoints: project.recentCompletedPoints,
      totalPlannedPoints: project.recentPlannedPoints,
      successRate:
        project.recentPlannedPoints > 0
          ? project.recentCompletedPoints / project.recentPlannedPoints
          : 0,
    })),
  });
}

export async function getProjectVelocity(projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_READ);
  const aggregator = new MetricsAggregator(db);
  const data = await aggregator.getProjectMetrics(projectId, auth.orgId);
  return json({
    projectId,
    averageVelocity: data.averageVelocity,
    plannedPoints: data.recentPlannedPoints,
    completedPoints: data.recentCompletedPoints,
  });
}
