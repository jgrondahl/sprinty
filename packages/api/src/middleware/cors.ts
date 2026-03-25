import { error } from '../utils/response';

export type CorsConfig = {
  origins: string[];
  methods: string[];
  headers: string[];
};

function parseConfiguredOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return ['http://localhost:5173'];
  }

  const parsed = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (parsed.length === 0) {
    return ['http://localhost:5173'];
  }

  return parsed;
}

export const defaultCorsConfig: CorsConfig = {
  origins: parseConfiguredOrigins(process.env['CORS_ORIGINS']),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization', 'X-Request-Id'],
};

function normalizeOrigin(origin: string | null): string {
  return origin ?? '';
}

function isAllowedOrigin(origin: string, config: CorsConfig): boolean {
  if (!origin) {
    return true;
  }

  return config.origins.includes(origin);
}

export function withCorsHeaders(request: Request, response: Response, config: CorsConfig): Response {
  const headers = new Headers(response.headers);
  const requestOrigin = normalizeOrigin(request.headers.get('origin'));

  if (!isAllowedOrigin(requestOrigin, config)) {
    return error('Origin not allowed', 403, 'CORS_ORIGIN_FORBIDDEN');
  }

  headers.set('Access-Control-Allow-Origin', requestOrigin || config.origins[0] || 'http://localhost:5173');
  headers.set('Access-Control-Allow-Methods', config.methods.join(', '));
  headers.set('Access-Control-Allow-Headers', config.headers.join(', '));
  headers.set('Vary', 'Origin');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function handlePreflight(request: Request, config: CorsConfig): Response | null {
  if (request.method !== 'OPTIONS') {
    return null;
  }

  const requestOrigin = normalizeOrigin(request.headers.get('origin'));
  if (!isAllowedOrigin(requestOrigin, config)) {
    return error('Origin not allowed', 403, 'CORS_ORIGIN_FORBIDDEN');
  }

  return withCorsHeaders(request, new Response(null, { status: 204 }), config);
}
