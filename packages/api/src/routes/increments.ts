import {
  AuditRepository,
  ArtifactVersionRepository,
  ArtifactLineageRepository,
  type DbClient,
} from '@splinty/db';
import { IncrementPayloadSchema } from '@splinty/db/src/schemas/artifact-payloads';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

export async function createIncrement(
  req: Request,
  projectId: string,
  sprintId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.ARTIFACT_VERSION_WRITE);

  const payload = IncrementPayloadSchema.parse(await req.json());

  const artifactRepo = new ArtifactVersionRepository(db);
  const lineageRepo = new ArtifactLineageRepository(db);
  const audit = new AuditRepository(db);

  const artifactVersion = await artifactRepo.create({
    artifactType: 'increment',
    artifactId: sprintId,
    version: 1,
    snapshotData: payload as unknown as Record<string, unknown>,
    createdBy: auth.userId,
  });

  for (const storyId of payload.completedStoryIds) {
    await lineageRepo.create({
      parentType: 'story',
      parentId: storyId,
      childType: 'increment',
      childId: artifactVersion.id,
      relationshipType: 'derived_from',
    });
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'INCREMENT_CREATED',
    entityType: 'artifact_version',
    entityId: artifactVersion.id,
    diff: { snapshotData: payload },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'increment.created', {
    artifactVersionId: artifactVersion.id,
    projectId,
    sprintId,
  });

  return json(artifactVersion, 201);
}
