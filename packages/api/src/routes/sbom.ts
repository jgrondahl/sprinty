import {
  AuditRepository,
  ArtifactVersionRepository,
  ArtifactLineageRepository,
  type DbClient,
} from '@splinty/db';
import { SbomManifestPayloadSchema } from '@splinty/db/src/schemas/artifact-payloads';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

export async function attachSbom(
  req: Request,
  releaseCandidateId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.ARTIFACT_VERSION_WRITE);

  const payload = SbomManifestPayloadSchema.parse(await req.json());

  const artifactRepo = new ArtifactVersionRepository(db);
  const lineageRepo = new ArtifactLineageRepository(db);
  const audit = new AuditRepository(db);

  const artifactVersion = await artifactRepo.create({
    artifactType: 'sbom_manifest',
    artifactId: releaseCandidateId,
    version: 1,
    snapshotData: payload as unknown as Record<string, unknown>,
    createdBy: auth.userId,
  });

  await lineageRepo.create({
    parentType: 'release_candidate',
    parentId: releaseCandidateId,
    childType: 'sbom_manifest',
    childId: artifactVersion.id,
    relationshipType: 'verified_by',
  });

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'SBOM_ATTACHED',
    entityType: 'artifact_version',
    entityId: artifactVersion.id,
    diff: { snapshotData: payload },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'sbom.attached', {
    artifactVersionId: artifactVersion.id,
    releaseCandidateId,
  });

  return json(artifactVersion, 201);
}
