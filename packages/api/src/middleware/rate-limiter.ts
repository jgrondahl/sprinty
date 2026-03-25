import { error } from '../utils/response';
import { verifyToken } from '../auth/jwt';

type RateLimitConfig = {
  authLimitPerMinute: number;
  generalLimitPerMinute: number;
};

type Bucket = {
  tokens: number;
  lastRefillAt: number;
  expiresAt: number;
};

const WINDOW_MS = 60_000;
const cleanupIntervalMs = 60_000;
const buckets = new Map<string, Bucket>();

const authPaths = new Set(['/api/auth/login', '/api/auth/register']);

const defaultRateLimitConfig: RateLimitConfig = {
  authLimitPerMinute: Number(process.env['RATE_LIMIT_AUTH'] ?? '5'),
  generalLimitPerMinute: Number(process.env['RATE_LIMIT_GENERAL'] ?? '100'),
};

async function getClientIdentity(req: Request): Promise<string> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload.sub) {
        return `user:${payload.sub}`;
      }
    } catch (_err) {
      return `token:${token}`;
    }
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice('Bearer '.length).trim();
    if (bearer) {
      try {
        const payload = await verifyToken(bearer);
        if (payload.sub) {
          return `user:${payload.sub}`;
        }
      } catch (_err) {
        return `bearer:${bearer}`;
      }
    }
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) {
      return `ip:${firstIp}`;
    }
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return `ip:${realIp}`;
  }

  return 'ip:unknown';
}

function getLimit(path: string, config: RateLimitConfig): number {
  if (authPaths.has(path)) {
    return config.authLimitPerMinute;
  }

  return config.generalLimitPerMinute;
}

function currentBucket(key: string, now: number, capacity: number): Bucket {
  const existing = buckets.get(key);
  if (existing && existing.expiresAt > now) {
    return existing;
  }

  const fresh: Bucket = {
    tokens: capacity,
    lastRefillAt: now,
    expiresAt: now + WINDOW_MS,
  };
  buckets.set(key, fresh);
  return fresh;
}

function refillBucket(bucket: Bucket, now: number, capacity: number): void {
  const refillRatePerMs = capacity / WINDOW_MS;
  const elapsedMs = now - bucket.lastRefillAt;
  if (elapsedMs <= 0) {
    return;
  }

  const refillAmount = elapsedMs * refillRatePerMs;
  bucket.tokens = Math.min(capacity, bucket.tokens + refillAmount);
  bucket.lastRefillAt = now;
  bucket.expiresAt = now + WINDOW_MS;
}

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.expiresAt <= now) {
      buckets.delete(key);
    }
  }
}

let cleanupHandle: ReturnType<typeof setInterval> | undefined;

function ensureCleanupLoop(): void {
  if (cleanupHandle) {
    return;
  }

  cleanupHandle = setInterval(() => {
    pruneExpiredBuckets(Date.now());
  }, cleanupIntervalMs);
}

export async function checkRateLimit(req: Request, config: RateLimitConfig = defaultRateLimitConfig): Promise<Response | null> {
  ensureCleanupLoop();
  const now = Date.now();
  const path = new URL(req.url).pathname;
  const identity = await getClientIdentity(req);
  const limit = getLimit(path, config);
  const key = `${identity}:${path}`;
  const bucket = currentBucket(key, now, limit);
  refillBucket(bucket, now, limit);

  if (bucket.tokens < 1) {
    const refillRatePerMs = limit / WINDOW_MS;
    const missingTokens = 1 - bucket.tokens;
    const retryAfterSeconds = Math.max(1, Math.ceil(missingTokens / (refillRatePerMs * 1000)));
    return error('Too Many Requests', 429, 'RATE_LIMIT_EXCEEDED', {
      'Retry-After': String(retryAfterSeconds),
    });
  }

  bucket.tokens -= 1;
  return null;
}

export function resetRateLimiterForTest(): void {
  buckets.clear();
}
