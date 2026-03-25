import { SignJWT, jwtVerify } from 'jose';

export type TokenPayload = {
  sub: string;
  org: string;
  role: string;
  iat?: number;
  exp?: number;
};

function getSecret(): Uint8Array {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(userId: string, orgId: string, role: string): Promise<string> {
  const secret = getSecret();

  return new SignJWT({ org: orgId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
  });

  return {
    sub: String(payload.sub ?? ''),
    org: String(payload.org ?? ''),
    role: String(payload.role ?? ''),
    iat: payload.iat,
    exp: payload.exp,
  };
}
