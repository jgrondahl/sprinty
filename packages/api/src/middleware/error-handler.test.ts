import { describe, expect, it } from 'bun:test';
import { mapError, NotFoundError, UnauthorizedError } from './error-handler';

describe('error handler', () => {
  it('maps known api errors with status and code', async () => {
    const response = mapError(new NotFoundError('Missing thing'));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe('NOT_FOUND');
    expect(body.error).toBe('Missing thing');
  });

  it('maps unknown errors to internal error', async () => {
    const response = mapError(new Error('boom'));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('maps unauthorized error correctly', async () => {
    const response = mapError(new UnauthorizedError('No token'));
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string; code: string };
    expect(body.code).toBe('UNAUTHORIZED');
  });
});
