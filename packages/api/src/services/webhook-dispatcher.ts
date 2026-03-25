import { createHmac } from 'crypto';
import {
  WebhookRepository,
  type DbClient,
} from '@splinty/db';

type WebhookEventPayload = {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
};

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export class WebhookDispatcher {
  constructor(private readonly db: DbClient) {}

  async dispatch(orgId: string, event: string, data: Record<string, unknown>): Promise<void> {
    const repo = new WebhookRepository(this.db);
    const hooks = await repo.listByEvent(orgId, event);
    const activeHooks = hooks.filter((hook) => hook.active);

    const payload: WebhookEventPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    await Promise.all(
      activeHooks.map(async (hook) => {
        const signature = sign(hook.secret, body);
        try {
          await fetch(hook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Splinty-Event': event,
              'X-Splinty-Signature': signature,
            },
            body,
          });
        } catch {
          return;
        }
      })
    );
  }
}
