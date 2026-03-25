import {
  StoryMetricsRepository,
  VelocityRepository,
  ProjectRepository,
  type DbClient,
} from '@splinty/db';

type ProjectMetrics = {
  projectId: string;
  projectName: string;
  averageVelocity: number;
  recentCompletedPoints: number;
  recentPlannedPoints: number;
  throughputStories: number;
  totalCostUsd: number;
  totalLlmCalls: number;
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export class MetricsAggregator {
  constructor(private readonly db: DbClient) {}

  async getProjectMetrics(projectId: string, orgId: string): Promise<ProjectMetrics> {
    const projectRepo = new ProjectRepository(this.db);
    const velocityRepo = new VelocityRepository(this.db);
    const storyMetricsRepo = new StoryMetricsRepository(this.db);

    const project = await projectRepo.findById(projectId, orgId);
    const velocityRows = await velocityRepo.getByProject(projectId, orgId, 10);
    const averageVelocity = await velocityRepo.getAverageVelocity(projectId, orgId, 5);

    let throughputStories = 0;
    let totalCostUsd = 0;
    let totalLlmCalls = 0;
    for (const row of velocityRows) {
      const metrics = await storyMetricsRepo.findBySprint(row.sprintId, orgId);
      throughputStories += metrics.length;
      totalCostUsd += metrics.reduce((sum, item) => sum + Number(item.costEstimateUsd), 0);
      totalLlmCalls += metrics.reduce((sum, item) => sum + item.llmCalls, 0);
    }

    return {
      projectId,
      projectName: project?.name ?? 'Unknown Project',
      averageVelocity,
      recentCompletedPoints: velocityRows.reduce((sum, row) => sum + row.completedPoints, 0),
      recentPlannedPoints: velocityRows.reduce((sum, row) => sum + row.plannedPoints, 0),
      throughputStories,
      totalCostUsd,
      totalLlmCalls,
    };
  }

  async getOrgMetrics(orgId: string): Promise<{
    projects: number;
    aggregate: ProjectMetrics[];
    totalSprintsCompleted: number;
    totalStoriesCompleted: number;
    averageVelocity: number;
    totalCostUsd: number;
    totalLlmCalls: number;
    averageSprintDurationMs: number;
  }> {
    const projectRepo = new ProjectRepository(this.db);
    const projects = await projectRepo.listByOrg(orgId);

    const aggregate: ProjectMetrics[] = [];
    for (const project of projects) {
      aggregate.push(await this.getProjectMetrics(project.id, orgId));
    }

    const totalStoriesCompleted = aggregate.reduce((sum, project) => sum + project.throughputStories, 0);
    const totalCostUsd = aggregate.reduce((sum, project) => sum + project.totalCostUsd, 0);
    const totalLlmCalls = aggregate.reduce((sum, project) => sum + project.totalLlmCalls, 0);
    const totalPlanned = aggregate.reduce((sum, project) => sum + project.recentPlannedPoints, 0);
    const totalCompleted = aggregate.reduce((sum, project) => sum + project.recentCompletedPoints, 0);
    const averageVelocity = aggregate.length > 0
      ? aggregate.reduce((sum, project) => sum + project.averageVelocity, 0) / aggregate.length
      : 0;

    return {
      projects: projects.length,
      aggregate,
      totalSprintsCompleted: totalPlanned > 0 ? aggregate.length : 0,
      totalStoriesCompleted,
      averageVelocity,
      totalCostUsd,
      totalLlmCalls,
      averageSprintDurationMs: 0,
    };
  }

  async getTrends(orgId: string): Promise<Array<{ month: string; completedPoints: number; plannedPoints: number }>> {
    const projectRepo = new ProjectRepository(this.db);
    const velocityRepo = new VelocityRepository(this.db);
    const projects = await projectRepo.listByOrg(orgId);

    const byMonth = new Map<string, { completedPoints: number; plannedPoints: number }>();

    for (const project of projects) {
      const rows = await velocityRepo.getByProject(project.id, orgId, 24);
      for (const row of rows) {
        const key = monthKey(row.createdAt);
        const existing = byMonth.get(key) ?? { completedPoints: 0, plannedPoints: 0 };
        existing.completedPoints += row.completedPoints;
        existing.plannedPoints += row.plannedPoints;
        byMonth.set(key, existing);
      }
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));
  }
}
