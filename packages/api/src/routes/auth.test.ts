import { describe, expect, it } from 'bun:test';
import type { DbClient } from '@splinty/db';
import { login, register } from './auth';

function makeRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('auth routes', () => {
  it('register returns token and user payload', async () => {
    process.env['JWT_SECRET'] = 'test-secret';

    const dbMock = {
      insert: () => ({
        values: (input: Record<string, unknown>) => ({
          returning: async () =>
            input['slug']
              ? [
                  {
                    id: 'org-1',
                    name: input['name'],
                    slug: input['slug'],
                  },
                ]
              : [
                  {
                    id: 'user-1',
                    orgId: input['orgId'],
                    email: input['email'],
                    name: input['name'],
                    role: input['role'] ?? 'admin',
                    passwordHash: input['passwordHash'],
                  },
                ],
        }),
      }),
      query: {
        users: {
          findFirst: async () => null,
        },
      },
    };

    const response = await register(
      makeRequest('http://localhost/api/auth/register', {
        email: 'test@example.com',
        password: 'Test1234!',
        name: 'Tester',
        orgName: 'Test Org',
      }),
      dbMock as never as DbClient
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { token: string; user: { email: string } };
    expect(body.token).toBeString();
    expect(body.user.email).toBe('test@example.com');
  });

  it('login returns token for valid credentials', async () => {
    process.env['JWT_SECRET'] = 'test-secret';
    const passwordHash = await Bun.password.hash('Test1234!');

    const dbMock = {
      query: {
        users: {
          findFirst: async () => ({
            id: 'user-1',
            orgId: 'org-1',
            role: 'admin',
            email: 'test@example.com',
            passwordHash,
          }),
        },
      },
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    const response = await login(
      makeRequest('http://localhost/api/auth/login', {
        email: 'test@example.com',
        password: 'Test1234!',
        orgId: '11111111-1111-1111-1111-111111111111',
      }),
      dbMock as never as DbClient
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    expect(body.token).toBeString();
  });
});
