import {
  AuditRepository,
  ArtifactVersionRepository,
  ArtifactLineageRepository,
  DeliveryRecordRepository,
  type DbClient,
} from '@splinty/db';
import { PostDeliveryReviewPayloadSchema } from '@splinty/db/src/schemas/artifact-payloads';
import { NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

export async function createPostDeliveryReview(
  req: Request,
  deliveryId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.ARTIFACT_VERSION_WRITE);

  const payload = PostDeliveryReviewPayloadSchema.parse(await req.json());

  const deliveryRepo = new DeliveryRecordRepository(db);
  const record = await deliveryRepo.findById(deliveryId, auth.orgId);
  if (!record) {
    throw new NotFoundError('Delivery record not found');
  }

  const artifactRepo = new ArtifactVersionRepository(db);
  const lineageRepo = new ArtifactLineageRepository(db);
  const audit = new AuditRepository(db);

  const artifactVersion = await artifactRepo.create({
    artifactType: 'post_delivery_review',
    artifactId: deliveryId,
    version: 1,
    snapshotData: payload as unknown as Record<string, unknown>,
    createdBy: auth.userId,
  });

  await lineageRepo.create({
    parentType: 'delivery_record',
    parentId: deliveryId,
    childType: 'post_delivery_review',
    childId: artifactVersion.id,
    relationshipType: 'derived_from',
  });

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'POST_DELIVERY_REVIEW_CREATED',
    entityType: 'artifact_version',
    entityId: artifactVersion.id,
    diff: { snapshotData: payload },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'post_delivery_review.created', {
    artifactVersionId: artifactVersion.id,
    deliveryRecordId: deliveryId,
  });

  return json(artifactVersion, 201);
}
