import {
  AuditRepository,
  ArtifactVersionRepository,
  ArtifactLineageRepository,
  type DbClient,
} from '@splinty/db';
import { RetrospectivePayloadSchema } from '@splinty/db/src/schemas/artifact-payloads';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

export async function createRetrospective(
  req: Request,
  projectId: string,
  sprintId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.ARTIFACT_VERSION_WRITE);

  const payload = RetrospectivePayloadSchema.parse(await req.json());

  const artifactRepo = new ArtifactVersionRepository(db);
  const lineageRepo = new ArtifactLineageRepository(db);
  const audit = new AuditRepository(db);

  const artifactVersion = await artifactRepo.create({
    artifactType: 'retrospective',
    artifactId: sprintId,
    version: 1,
    snapshotData: payload as unknown as Record<string, unknown>,
    createdBy: auth.userId,
  });

  if (payload.sprintId) {
    await lineageRepo.create({
      parentType: 'sprint_review',
      parentId: payload.sprintId,
      childType: 'retrospective',
      childId: artifactVersion.id,
      relationshipType: 'derived_from',
    });
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'RETROSPECTIVE_CREATED',
    entityType: 'artifact_version',
    entityId: artifactVersion.id,
    diff: { snapshotData: payload },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'retrospective.created', {
    artifactVersionId: artifactVersion.id,
    projectId,
    sprintId,
  });

  return json(artifactVersion, 201);
}
