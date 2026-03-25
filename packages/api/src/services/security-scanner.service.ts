import { scanCodeForVulnerabilities, type SecurityReport } from '@splinty/agents';
import { AuditRepository, type DbClient } from '@splinty/db';

const latestReports = new Map<string, SecurityReport>();

function reportKey(orgId: string, projectId: string): string {
  return `${orgId}:${projectId}`;
}

export async function runSecurityScan(
  db: DbClient,
  orgId: string,
  projectId: string,
  userId: string,
  workspacePath: string
): Promise<SecurityReport> {
  const audit = new AuditRepository(db);
  await audit.append({
    orgId,
    userId,
    action: 'SECURITY_SCAN_STARTED',
    entityType: 'project',
    entityId: projectId,
    diff: { workspacePath },
  });

  const report = await scanCodeForVulnerabilities(workspacePath);
  latestReports.set(reportKey(orgId, projectId), report);

  await audit.append({
    orgId,
    userId,
    action: 'SECURITY_SCAN_COMPLETED',
    entityType: 'project',
    entityId: projectId,
    diff: {
      findings: report.findings.length,
      summary: report.summary,
    },
  });

  return report;
}

export function getLatestSecurityReport(orgId: string, projectId: string): SecurityReport | null {
  return latestReports.get(reportKey(orgId, projectId)) ?? null;
}
