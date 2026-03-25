import {
  OrganizationRepository,
  UserRepository,
  type DbClient,
} from '@splinty/db';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../middleware/error-handler';
import { json } from '../utils/response';
import type { AuthContext } from '../auth/middleware';
import { Permission, requirePermission } from '../auth/rbac';

const UpdateOrgSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
});

const AddMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['admin', 'member', 'viewer', 'service-account']).default('member'),
  password: z.string().min(8),
});

const UpdateMemberSchema = z.object({
  role: z.enum(['admin', 'member', 'viewer', 'service-account']),
});

export async function getCurrentOrg(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.PROJECT_READ);
  const repo = new OrganizationRepository(db);
  const org = await repo.findById(auth.orgId);
  if (!org) {
    throw new NotFoundError('Organization not found');
  }
  return json(org);
}

export async function updateCurrentOrg(
  req: Request,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.ORG_MANAGE);
  const patch = UpdateOrgSchema.parse(await req.json());
  const repo = new OrganizationRepository(db);
  const updated = await repo.update(auth.orgId, patch);
  if (!updated) {
    throw new NotFoundError('Organization not found');
  }
  return json(updated);
}

export async function listMembers(db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.USER_MANAGE);
  const repo = new UserRepository(db);
  const members = await repo.listByOrg(auth.orgId);
  return json({ members });
}

export async function addMember(req: Request, db: DbClient, auth: AuthContext): Promise<Response> {
  requirePermission(auth, Permission.USER_MANAGE);
  const body = AddMemberSchema.parse(await req.json());
  const repo = new UserRepository(db);

  const existing = await repo.findByEmail(body.email, auth.orgId);
  if (existing) {
    throw new BadRequestError('Member already exists', 'MEMBER_EXISTS');
  }

  const passwordHash = await Bun.password.hash(body.password, {
    algorithm: 'argon2id',
    memoryCost: 4,
    timeCost: 3,
  });

  const member = await repo.create({
    orgId: auth.orgId,
    email: body.email,
    name: body.name,
    role: body.role,
    passwordHash,
  });

  return json(member, 201);
}

export async function updateMemberRole(
  req: Request,
  memberId: string,
  db: DbClient,
  auth: AuthContext
): Promise<Response> {
  requirePermission(auth, Permission.USER_MANAGE);
  const body = UpdateMemberSchema.parse(await req.json());
  const repo = new UserRepository(db);
  const updated = await repo.update(memberId, auth.orgId, { role: body.role });
  if (!updated) {
    throw new NotFoundError('Member not found');
  }

  return json(updated);
}
