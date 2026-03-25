import { ProjectRepository, type DbClient } from '@splinty/db';
import { z } from 'zod';
import { NotFoundError } from '../middleware/error-handler';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { json } from '../utils/response';
import { getLatestSecurityReport, runSecurityScan } from '../services/security-scanner.service';

const ScanBodySchema = z.object({
  workspacePath: z.string().min(1).optional(),
});

export async function triggerSecurityScan(
  req: Request,
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.ORG_MANAGE);
  const body = ScanBodySchema.parse(await req.json());

  const projectRepo = new ProjectRepository(db);
  const project = await projectRepo.findById(projectId, auth.orgId);
  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const workspacePath = body.workspacePath ?? process.cwd();
  const report = await runSecurityScan(db, auth.orgId, projectId, auth.userId, workspacePath);
  return json(report);
}

export async function getSecurityReport(projectId: string, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_READ);
  const report = getLatestSecurityReport(auth.orgId, projectId);
  if (!report) {
    throw new NotFoundError('Security report not found');
  }

  return json(report);
}
