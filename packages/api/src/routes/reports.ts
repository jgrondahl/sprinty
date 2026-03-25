import type { DbClient } from '@splinty/db';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { json } from '../utils/response';
import { buildOrgReport, buildProjectReport } from '../services/executive-report';

export async function getProjectReport(
  projectId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.AUDIT_READ);
  const report = await buildProjectReport(db, auth.orgId, projectId);
  return json(report);
}

export async function getOrgReport(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.ORG_MANAGE);
  const report = await buildOrgReport(db, auth.orgId);
  return json(report);
}
