import { UnauthorizedError } from '../middleware/error-handler';
import { verifyToken } from './jwt';

export type AuthContext = {
  userId: string;
  orgId: string;
  role: string;
};

export async function authMiddleware(req: Request): Promise<AuthContext> {
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token') ?? undefined;
  const header = req.headers.get('authorization');

  if (queryToken) {
    const payload = await verifyToken(queryToken);
    if (!payload.sub || !payload.org || !payload.role) {
      throw new UnauthorizedError('Invalid token payload');
    }

    return {
      userId: payload.sub,
      orgId: payload.org,
      role: payload.role,
    };
  }

  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }

  const payload = await verifyToken(token);
  if (!payload.sub || !payload.org || !payload.role) {
    throw new UnauthorizedError('Invalid token payload');
  }

  return {
    userId: payload.sub,
    orgId: payload.org,
    role: payload.role,
  };
}
