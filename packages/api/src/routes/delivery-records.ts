import { z } from 'zod';
import {
  AuditRepository,
  ArtifactVersionRepository,
  ArtifactLineageRepository,
  DeliveryRecordRepository,
  type DbClient,
} from '@splinty/db';
import { NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';
import { WebhookDispatcher } from '../services/webhook-dispatcher';

const CreateDeliveryRecordSchema = z.object({
  environment: z.string().min(1),
  deployedVersion: z.string().min(1),
  releaseCandidateId: z.string().optional(),
  incrementId: z.string().optional(),
  deploymentWindow: z.object({ start: z.string(), end: z.string() }).nullable().optional(),
  approvedBy: z.string().optional(),
  evidenceReferences: z.array(z.string()).default([]),
});

export async function createDeliveryRecord(req: Request, projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.DELIVERY_RECORD_WRITE);
  const body = CreateDeliveryRecordSchema.parse(await req.json());

  const deliveryRepo = new DeliveryRecordRepository(db);
  const artifactRepo = new ArtifactVersionRepository(db);
  const audit = new AuditRepository(db);

  const record = await deliveryRepo.create({
    environment: body.environment,
    deployedVersion: body.deployedVersion,
    projectId,
    orgId: auth.orgId,
    releaseCandidateId: body.releaseCandidateId,
    incrementId: body.incrementId,
    deploymentWindow: body.deploymentWindow,
    approvedBy: body.approvedBy,
    evidenceReferences: body.evidenceReferences,
  });

  const artifactVersion = await artifactRepo.create({
    artifactType: 'delivery_record',
    artifactId: record.id,
    version: 1,
    snapshotData: { ...body, projectId } as unknown as Record<string, unknown>,
    createdBy: auth.userId,
  });

  if (body.releaseCandidateId) {
    const lineageRepo = new ArtifactLineageRepository(db);
    await lineageRepo.create({
      parentType: 'release_candidate',
      parentId: body.releaseCandidateId,
      childType: 'delivery_record',
      childId: artifactVersion.id,
      relationshipType: 'derived_from',
    });
  }

  await audit.append({
    orgId: auth.orgId,
    userId: auth.userId,
    action: 'DELIVERY_RECORD_CREATED',
    entityType: 'delivery_record',
    entityId: record.id,
    diff: { after: record },
  });

  const dispatcher = new WebhookDispatcher(db);
  await dispatcher.dispatch(auth.orgId, 'delivery_record.created', {
    deliveryRecordId: record.id,
    projectId,
  });

  return json(record, 201);
}

export async function listDeliveryRecords(req: Request, projectId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.DELIVERY_RECORD_READ);

  const url = new URL(req.url);
  const environment = url.searchParams.get('environment');

  const deliveryRepo = new DeliveryRecordRepository(db);

  const records = environment
    ? await deliveryRepo.findByEnvironment(projectId, environment, auth.orgId)
    : await deliveryRepo.findByProjectId(projectId, auth.orgId);

  return json({ records }, 200);
}

export async function getDeliveryRecord(req: Request, deliveryId: string, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.DELIVERY_RECORD_READ);

  const deliveryRepo = new DeliveryRecordRepository(db);
  const record = await deliveryRepo.findById(deliveryId, auth.orgId);

  if (!record) {
    throw new NotFoundError('Delivery record not found');
  }

  return json(record, 200);
}
