import { OrganizationRepository, UserRepository, type DbClient } from '@splinty/db';
import { z } from 'zod';
import { BadRequestError, UnauthorizedError } from '../middleware/error-handler';
import { json } from '../utils/response';
import { authMiddleware } from '../auth/middleware';
import { hashPassword, verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  orgName: z.string().min(1).optional(),
  orgId: z.string().uuid().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  orgId: z.string().uuid().optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export async function register(req: Request, db: DbClient): Promise<Response> {
  const body = RegisterSchema.parse(await req.json());
  const orgRepo = new OrganizationRepository(db);
  const userRepo = new UserRepository(db);

  let orgId = body.orgId;
  if (!orgId) {
    if (!body.orgName) {
      throw new BadRequestError('orgName or orgId is required');
    }

    const createdOrg = await orgRepo.create({
      name: body.orgName,
      slug: `${slugify(body.orgName)}-${Date.now()}`,
    });
    orgId = createdOrg.id;
  }

  const existing = await userRepo.findByEmail(body.email, orgId);
  if (existing) {
    throw new BadRequestError('User already exists', 'USER_EXISTS');
  }

  const passwordHash = await hashPassword(body.password);
  const user = await userRepo.create({
    orgId,
    email: body.email,
    passwordHash,
    name: body.name,
    role: 'admin',
  });

  const token = await signToken(user.id, user.orgId, user.role);
  return json(
    {
      token,
      user: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
    201
  );
}

export async function login(req: Request, db: DbClient): Promise<Response> {
  const body = LoginSchema.parse(await req.json());
  const userRepo = new UserRepository(db);

  const user = body.orgId
    ? await userRepo.findByEmail(body.email, body.orgId)
    : (await userRepo.findByEmailAny(body.email))[0] ?? null;
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordValid = await verifyPassword(body.password, user.passwordHash);
  if (!passwordValid) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = await signToken(user.id, user.orgId, user.role);
  return json({ token });
}

export async function me(req: Request, db: DbClient): Promise<Response> {
  const auth = await authMiddleware(req);
  const userRepo = new UserRepository(db);
  const user = await userRepo.findById(auth.userId, auth.orgId);
  if (!user) {
    throw new UnauthorizedError('User not found');
  }

  return json({
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
  });
}
