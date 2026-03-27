import { type ZodSchema } from 'zod';
import { createDb, type DbClient } from '@splinty/db';
import { handlePreflight, defaultCorsConfig, withCorsHeaders } from './middleware/cors';
import { mapError, NotFoundError } from './middleware/error-handler';
import { createRequestId, withRequestId } from './middleware/request-id';
import { checkRateLimit } from './middleware/rate-limiter';
import { withSecurityHeaders } from './middleware/security-headers';
import { logger } from './lib/logger';
import { getHealth } from './routes/health';
import { login, me, register } from './routes/auth';
import { authMiddleware } from './auth/middleware';
import { createProject, deleteProject, getProject, listProjects, updateProject } from './routes/projects';
import { createEpic, deleteEpic, getEpic, listEpics, reorderEpic, updateEpic } from './routes/epics';
import {
  createStory,
  deleteStory,
  getStory,
  listStories,
  updateStory,
  updateStoryState,
} from './routes/stories';
import { importRoadmap } from './routes/roadmap-import';
import { completeSprint, planSprint, startSprint } from './routes/sprints';
import {
  getOrgMetrics,
  getProjectComparison,
  getProjectMetrics,
  getProjectVelocity,
  getTrends,
} from './routes/metrics';
import { eventStreamManager } from './services/event-stream';
import {
  addMember,
  getCurrentOrg,
  listMembers,
  updateCurrentOrg,
  updateMemberRole,
} from './routes/organizations';
import { getSecurityReport, triggerSecurityScan } from './routes/security';
import { getOrgReport, getProjectReport } from './routes/reports';
import { createWebhook, deleteWebhook, listWebhooks, updateWebhook } from './routes/webhooks';
import { listAudit } from './routes/audit';
import { createProductGoal, listProductGoals, updateProductGoal } from './routes/product-goals';
import { getBacklog, refineStory } from './routes/backlog';
import { assignStories } from './routes/sprint-planning';
import { createIncrement } from './routes/increments';
import { createSprintReview } from './routes/sprint-reviews';
import { createRetrospective } from './routes/retrospectives';
import { createDeliveryRecord, listDeliveryRecords, getDeliveryRecord } from './routes/delivery-records';
import { attachSbom } from './routes/sbom';
import { createAttestation } from './routes/attestations';
import { createPostDeliveryReview } from './routes/post-delivery-reviews';

export type ApiServer = ReturnType<typeof Bun.serve>;

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await req.json();
  return schema.parse(body);
}

type HandlerContext = {
  db: DbClient;
};

type RouteHandler = (req: Request, context: HandlerContext) => Promise<Response> | Response;

function route(req: Request, context: HandlerContext): Promise<Response> | Response {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/health') {
    return getHealth();
  }

  if (req.method === 'POST' && path === '/api/auth/register') {
    return register(req, context.db);
  }

  if (req.method === 'POST' && path === '/api/auth/login') {
    return login(req, context.db);
  }

  if (req.method === 'GET' && path === '/api/auth/me') {
    return me(req, context.db);
  }

  if (path === '/api/projects' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => listProjects(context.db, auth));
  }

  if (path === '/api/projects' && req.method === 'POST') {
    return authMiddleware(req).then((auth) => createProject(req, context.db, auth));
  }

  const projectIdMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectIdMatch && req.method === 'GET') {
    const projectId = projectIdMatch[1]!;
    return authMiddleware(req).then((auth) => getProject(projectId, context.db, auth));
  }

  if (projectIdMatch && req.method === 'PUT') {
    const projectId = projectIdMatch[1]!;
    return authMiddleware(req).then((auth) => updateProject(req, projectId, context.db, auth));
  }

  if (projectIdMatch && req.method === 'DELETE') {
    const projectId = projectIdMatch[1]!;
    return authMiddleware(req).then((auth) => deleteProject(projectId, context.db, auth));
  }

  const projectEpicsMatch = path.match(/^\/api\/projects\/([^/]+)\/epics$/);
  if (projectEpicsMatch && req.method === 'GET') {
    const projectId = projectEpicsMatch[1]!;
    return authMiddleware(req).then((auth) => listEpics(projectId, context.db, auth));
  }

  if (projectEpicsMatch && req.method === 'POST') {
    const projectId = projectEpicsMatch[1]!;
    return authMiddleware(req).then((auth) => createEpic(req, projectId, context.db, auth));
  }

  const epicIdMatch = path.match(/^\/api\/epics\/([^/]+)$/);
  if (epicIdMatch && req.method === 'GET') {
    const epicId = epicIdMatch[1]!;
    return authMiddleware(req).then((auth) => getEpic(epicId, context.db, auth));
  }

  if (epicIdMatch && req.method === 'PUT') {
    const epicId = epicIdMatch[1]!;
    return authMiddleware(req).then((auth) => updateEpic(req, epicId, context.db, auth));
  }

  if (epicIdMatch && req.method === 'DELETE') {
    const epicId = epicIdMatch[1]!;
    return authMiddleware(req).then((auth) => deleteEpic(epicId, context.db, auth));
  }

  const epicReorderMatch = path.match(/^\/api\/epics\/([^/]+)\/reorder$/);
  if (epicReorderMatch && req.method === 'PUT') {
    const epicId = epicReorderMatch[1]!;
    return authMiddleware(req).then((auth) => reorderEpic(req, epicId, context.db, auth));
  }

  const projectStoriesMatch = path.match(/^\/api\/projects\/([^/]+)\/stories$/);
  if (projectStoriesMatch && req.method === 'GET') {
    const projectId = projectStoriesMatch[1]!;
    return authMiddleware(req).then((auth) => listStories(req, projectId, context.db, auth));
  }

  if (projectStoriesMatch && req.method === 'POST') {
    const projectId = projectStoriesMatch[1]!;
    return authMiddleware(req).then((auth) => createStory(req, projectId, context.db, auth));
  }

  const storyIdMatch = path.match(/^\/api\/stories\/([^/]+)$/);
  if (storyIdMatch && req.method === 'GET') {
    const storyId = storyIdMatch[1]!;
    return authMiddleware(req).then((auth) => getStory(storyId, context.db, auth));
  }

  if (storyIdMatch && req.method === 'PUT') {
    const storyId = storyIdMatch[1]!;
    return authMiddleware(req).then((auth) => updateStory(req, storyId, context.db, auth));
  }

  if (storyIdMatch && req.method === 'DELETE') {
    const storyId = storyIdMatch[1]!;
    return authMiddleware(req).then((auth) => deleteStory(storyId, context.db, auth));
  }

  const storyStateMatch = path.match(/^\/api\/stories\/([^/]+)\/state$/);
  if (storyStateMatch && req.method === 'PATCH') {
    const storyId = storyStateMatch[1]!;
    return authMiddleware(req).then((auth) => updateStoryState(req, storyId, context.db, auth));
  }

  const roadmapImportMatch = path.match(/^\/api\/projects\/([^/]+)\/roadmap\/import$/);
  if (roadmapImportMatch && req.method === 'POST') {
    const projectId = roadmapImportMatch[1]!;
    return authMiddleware(req).then((auth) => importRoadmap(req, projectId, context.db, auth));
  }

  const sprintPlanMatch = path.match(/^\/api\/projects\/([^/]+)\/sprints\/plan$/);
  if (sprintPlanMatch && req.method === 'POST') {
    const projectId = sprintPlanMatch[1]!;
    return authMiddleware(req).then((auth) => planSprint(req, projectId, context.db, auth));
  }

  if (path === '/api/sprints/start' && req.method === 'POST') {
    return authMiddleware(req).then((auth) => startSprint(req, context.db, auth));
  }

  if (path === '/api/sprints/complete' && req.method === 'POST') {
    return authMiddleware(req).then((auth) => completeSprint(req, context.db, auth));
  }

  if (path === '/api/organizations/current' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => getCurrentOrg(context.db, auth));
  }

  if (path === '/api/organizations/current' && req.method === 'PUT') {
    return authMiddleware(req).then((auth) => updateCurrentOrg(req, context.db, auth));
  }

  if (path === '/api/organizations/current/members' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => listMembers(context.db, auth));
  }

  if (path === '/api/organizations/current/members' && req.method === 'POST') {
    return authMiddleware(req).then((auth) => addMember(req, context.db, auth));
  }

  const memberMatch = path.match(/^\/api\/organizations\/current\/members\/([^/]+)$/);
  if (memberMatch && req.method === 'PUT') {
    const memberId = memberMatch[1]!;
    return authMiddleware(req).then((auth) => updateMemberRole(req, memberId, context.db, auth));
  }

  if (path === '/api/metrics/org' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => getOrgMetrics(context.db, auth));
  }

  if (path === '/api/metrics/projects' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => getProjectComparison(context.db, auth));
  }

  const projectMetricsMatch = path.match(/^\/api\/metrics\/projects\/([^/]+)$/);
  if (projectMetricsMatch && req.method === 'GET') {
    const projectId = projectMetricsMatch[1]!;
    return authMiddleware(req).then((auth) => getProjectMetrics(projectId, context.db, auth));
  }

  if (path === '/api/metrics/trends' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => getTrends(context.db, auth));
  }

  const projectVelocityMatch = path.match(/^\/api\/projects\/([^/]+)\/velocity$/);
  if (projectVelocityMatch && req.method === 'GET') {
    const projectId = projectVelocityMatch[1]!;
    return authMiddleware(req).then((auth) => getProjectVelocity(projectId, context.db, auth));
  }

  const streamMatch = path.match(/^\/api\/sprints\/([^/]+)\/stream$/);
  if (streamMatch && req.method === 'GET') {
    const sprintId = streamMatch[1]!;
    return authMiddleware(req).then(async () => {
      const client = eventStreamManager.subscribe(sprintId);
      await client.writer.write(new TextEncoder().encode(': connected\n\n'));

      const headers = new Headers({
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      });

      return new Response(client.stream, { status: 200, headers });
    });
  }

  const securityMatch = path.match(/^\/api\/projects\/([^/]+)\/security-scan$/);
  if (securityMatch && req.method === 'POST') {
    const projectId = securityMatch[1]!;
    return authMiddleware(req).then((auth) => triggerSecurityScan(req, projectId, context.db, auth));
  }

  const securityReportMatch = path.match(/^\/api\/projects\/([^/]+)\/security-report$/);
  if (securityReportMatch && req.method === 'GET') {
    const projectId = securityReportMatch[1]!;
    return authMiddleware(req).then((auth) => getSecurityReport(projectId, auth));
  }

  const projectReportMatch = path.match(/^\/api\/projects\/([^/]+)\/report$/);
  if (projectReportMatch && req.method === 'GET') {
    const projectId = projectReportMatch[1]!;
    return authMiddleware(req).then((auth) => getProjectReport(projectId, context.db, auth));
  }

  if (path === '/api/reports/org' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => getOrgReport(context.db, auth));
  }

  if (path === '/api/webhooks' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => listWebhooks(context.db, auth));
  }

  if (path === '/api/webhooks' && req.method === 'POST') {
    return authMiddleware(req).then((auth) => createWebhook(req, context.db, auth));
  }

  const webhookIdMatch = path.match(/^\/api\/webhooks\/([^/]+)$/);
  if (webhookIdMatch && req.method === 'PUT') {
    const webhookId = webhookIdMatch[1]!;
    return authMiddleware(req).then((auth) => updateWebhook(req, webhookId, context.db, auth));
  }

  if (webhookIdMatch && req.method === 'DELETE') {
    const webhookId = webhookIdMatch[1]!;
    return authMiddleware(req).then((auth) => deleteWebhook(webhookId, context.db, auth));
  }

  if (path === '/api/audit' && req.method === 'GET') {
    return authMiddleware(req).then((auth) => listAudit(req, context.db, auth));
  }

  // --- Product Goals ---
  const productGoalMatch = path.match(/^\/api\/projects\/([^/]+)\/product-goal$/);
  if (productGoalMatch && req.method === 'POST') {
    const projectId = productGoalMatch[1]!;
    return authMiddleware(req).then((auth) => createProductGoal(req, projectId, context.db, auth));
  }

  if (productGoalMatch && req.method === 'GET') {
    const projectId = productGoalMatch[1]!;
    return authMiddleware(req).then((auth) => listProductGoals(req, projectId, context.db, auth));
  }

  const goalIdMatch = path.match(/^\/api\/product-goals\/([^/]+)$/);
  if (goalIdMatch && req.method === 'PATCH') {
    const goalId = goalIdMatch[1]!;
    return authMiddleware(req).then((auth) => updateProductGoal(req, goalId, context.db, auth));
  }

  // --- Backlog ---
  const backlogMatch = path.match(/^\/api\/projects\/([^/]+)\/backlog$/);
  if (backlogMatch && req.method === 'GET') {
    const projectId = backlogMatch[1]!;
    return authMiddleware(req).then((auth) => getBacklog(req, projectId, context.db, auth));
  }

  const backlogRefineMatch = path.match(/^\/api\/projects\/([^/]+)\/backlog\/refine$/);
  if (backlogRefineMatch && req.method === 'POST') {
    const projectId = backlogRefineMatch[1]!;
    return authMiddleware(req).then((auth) => refineStory(req, projectId, context.db, auth));
  }

  // --- Sprint-scoped routes (assign-stories, increment, review, retrospective) ---
  const sprintAssignMatch = path.match(/^\/api\/projects\/([^/]+)\/sprints\/([^/]+)\/assign-stories$/);
  if (sprintAssignMatch && req.method === 'POST') {
    const projectId = sprintAssignMatch[1]!;
    const sprintId = sprintAssignMatch[2]!;
    return authMiddleware(req).then((auth) => assignStories(req, projectId, sprintId, context.db, auth));
  }

  const sprintIncrementMatch = path.match(/^\/api\/projects\/([^/]+)\/sprints\/([^/]+)\/increment$/);
  if (sprintIncrementMatch && req.method === 'POST') {
    const projectId = sprintIncrementMatch[1]!;
    const sprintId = sprintIncrementMatch[2]!;
    return authMiddleware(req).then((auth) => createIncrement(req, projectId, sprintId, context.db, auth));
  }

  const sprintReviewMatch = path.match(/^\/api\/projects\/([^/]+)\/sprints\/([^/]+)\/review$/);
  if (sprintReviewMatch && req.method === 'POST') {
    const projectId = sprintReviewMatch[1]!;
    const sprintId = sprintReviewMatch[2]!;
    return authMiddleware(req).then((auth) => createSprintReview(req, projectId, sprintId, context.db, auth));
  }

  const sprintRetroMatch = path.match(/^\/api\/projects\/([^/]+)\/sprints\/([^/]+)\/retrospective$/);
  if (sprintRetroMatch && req.method === 'POST') {
    const projectId = sprintRetroMatch[1]!;
    const sprintId = sprintRetroMatch[2]!;
    return authMiddleware(req).then((auth) => createRetrospective(req, projectId, sprintId, context.db, auth));
  }

  // --- Delivery Records ---
  const projectDeliveryMatch = path.match(/^\/api\/projects\/([^/]+)\/delivery-records$/);
  if (projectDeliveryMatch && req.method === 'POST') {
    const projectId = projectDeliveryMatch[1]!;
    return authMiddleware(req).then((auth) => createDeliveryRecord(req, projectId, context.db, auth));
  }

  if (projectDeliveryMatch && req.method === 'GET') {
    const projectId = projectDeliveryMatch[1]!;
    return authMiddleware(req).then((auth) => listDeliveryRecords(req, projectId, context.db, auth));
  }

  const deliveryPostReviewMatch = path.match(/^\/api\/delivery-records\/([^/]+)\/post-review$/);
  if (deliveryPostReviewMatch && req.method === 'POST') {
    const deliveryId = deliveryPostReviewMatch[1]!;
    return authMiddleware(req).then((auth) => createPostDeliveryReview(req, deliveryId, context.db, auth));
  }

  const deliveryIdMatch = path.match(/^\/api\/delivery-records\/([^/]+)$/);
  if (deliveryIdMatch && req.method === 'GET') {
    const deliveryId = deliveryIdMatch[1]!;
    return authMiddleware(req).then((auth) => getDeliveryRecord(req, deliveryId, context.db, auth));
  }

  // --- Release Candidate seam routes (SBOM, Attestation) ---
  const rcSbomMatch = path.match(/^\/api\/release-candidates\/([^/]+)\/sbom$/);
  if (rcSbomMatch && req.method === 'POST') {
    const releaseCandidateId = rcSbomMatch[1]!;
    return authMiddleware(req).then((auth) => attachSbom(req, releaseCandidateId, context.db, auth));
  }

  const rcAttestMatch = path.match(/^\/api\/release-candidates\/([^/]+)\/attest$/);
  if (rcAttestMatch && req.method === 'POST') {
    const releaseCandidateId = rcAttestMatch[1]!;
    return authMiddleware(req).then((auth) => createAttestation(req, releaseCandidateId, context.db, auth));
  }

  throw new NotFoundError('Not Found', 'NOT_FOUND');
}

function withLogging(req: Request, response: Response, startedAt: number, requestId: string): void {
  const durationMs = Date.now() - startedAt;
  const path = new URL(req.url).pathname;
  logger.info({ reqId: requestId, method: req.method, path, statusCode: response.status, durationMs }, 'http_request');
}

export function createServer(db: DbClient, port: number): ApiServer {
  setInterval(() => {
    void eventStreamManager.heartbeat();
  }, 15000);

  return Bun.serve({
    port,
    async fetch(req) {
      const requestId = createRequestId();
      const startedAt = Date.now();

      try {
        const preflight = handlePreflight(req, defaultCorsConfig);
        if (preflight) {
          const secured = withSecurityHeaders(preflight);
          return withRequestId(secured, requestId);
        }

        const rateLimited = await checkRateLimit(req);
        if (rateLimited) {
          const withCors = withCorsHeaders(req, rateLimited, defaultCorsConfig);
          const secured = withSecurityHeaders(withCors);
          const response = withRequestId(secured, requestId);
          withLogging(req, response, startedAt, requestId);
          return response;
        }

        const routed = await route(req, { db });
        const withCors = withCorsHeaders(req, routed, defaultCorsConfig);
        const secured = withSecurityHeaders(withCors);
        const response = withRequestId(secured, requestId);
        withLogging(req, response, startedAt, requestId);
        return response;
      } catch (err) {
        const mapped = mapError(err);
        const withCors = withCorsHeaders(req, mapped, defaultCorsConfig);
        const secured = withSecurityHeaders(withCors);
        const response = withRequestId(secured, requestId);
        withLogging(req, response, startedAt, requestId);
        return response;
      }
    },
    error(err) {
      return mapError(err);
    },
  });
}

export function createServerFromEnv(): ApiServer {
  const connectionString = process.env['DATABASE_URL'] ?? '';
  const port = Number(process.env['PORT'] ?? '3000');
  const db = createDb(connectionString);
  return createServer(db, port);
}
