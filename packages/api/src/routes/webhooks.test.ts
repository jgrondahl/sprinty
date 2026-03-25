import { describe, expect, it } from 'bun:test';
import { createWebhook, deleteWebhook, listWebhooks, updateWebhook } from './webhooks';

describe('webhooks route', () => {
  it('requires webhook-manage permission', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'viewer' };
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
    };

    await expect(listWebhooks(db as never, auth as never)).rejects.toThrow();
  });

  it('creates webhook with valid payload', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'admin' };
    const req = new Request('http://localhost/api/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/hook',
        secret: 'very-secret-token',
        events: ['story.created'],
      }),
    });

    const db = {
      insert: () => ({
        values: () => ({
          returning: async () => [{ id: 'w1', url: 'https://example.com/hook' }],
        }),
      }),
    };

    const response = await createWebhook(req, db as never, auth as never);
    expect(response.status).toBe(201);
  });

  it('throws when updating missing webhook', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'admin' };
    const req = new Request('http://localhost/api/webhooks/w1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });

    const db = {
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    };

    await expect(updateWebhook(req, 'w1', db as never, auth as never)).rejects.toThrow();
  });

  it('throws when deleting missing webhook', async () => {
    const auth = { userId: 'u1', orgId: 'o1', role: 'admin' };
    const db = {
      delete: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    };

    await expect(deleteWebhook('w1', db as never, auth as never)).rejects.toThrow();
  });
});
