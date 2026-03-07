import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitHubCopilotClient, runDeviceFlow } from './github-copilot-client';
import type { LlmRequest } from '@splinty/core';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const baseRequest: LlmRequest = {
  model: 'gpt-4o',
  systemPrompt: 'You are a helpful assistant.',
  userMessage: 'Say hello.',
};

function makeCompletionResponse(content: string) {
  return { choices: [{ message: { content } }] };
}

type FetchHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

function makeMockFetch(handler: FetchHandler): typeof fetch {
  return handler as unknown as typeof fetch;
}

/** Create a temp dir for token storage and clean it up after each test. */
function useTempTokenDir(): { tokenPath: () => string } {
  let tmpDir = '';
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  return { tokenPath: () => path.join(tmpDir, 'copilot-token.json') };
}

// ─── runDeviceFlow() ───────────────────────────────────────────────────────────

describe('runDeviceFlow()', () => {
  it('requests a device code, then polls and returns the access token', async () => {
    const calls: { url: string; body: unknown }[] = [];

    const mockFetch = makeMockFetch((url, init) => {
      const body = JSON.parse(init.body as string);
      calls.push({ url, body });

      if (url.includes('device/code')) {
        return new Response(
          JSON.stringify({
            device_code: 'dev_code_abc',
            user_code: 'ABCD-1234',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('access_token')) {
        return new Response(
          JSON.stringify({ access_token: 'gho_test_token_xyz' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response('Not found', { status: 404 });
    });

    const noopSleep = async (_ms: number) => {};
    const token = await runDeviceFlow(mockFetch, noopSleep);

    expect(token).toBe('gho_test_token_xyz');

    // First call: device code request
    expect(calls[0]!.url).toContain('device/code');
    expect(calls[0]!.body).toMatchObject({ client_id: 'Ov23li8tweQw6odWQebz', scope: 'read:user' });

    // Second call: token poll
    expect(calls[1]!.url).toContain('access_token');
    expect(calls[1]!.body).toMatchObject({
      client_id: 'Ov23li8tweQw6odWQebz',
      device_code: 'dev_code_abc',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
  });

  it('retries on authorization_pending before succeeding', async () => {
    let pollCount = 0;
    const mockFetch = makeMockFetch((url) => {
      if (url.includes('device/code')) {
        return new Response(
          JSON.stringify({
            device_code: 'dc',
            user_code: 'XXXX-9999',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 1,
          }),
          { status: 200 },
        );
      }

      pollCount++;
      if (pollCount < 3) {
        return new Response(JSON.stringify({ error: 'authorization_pending' }), { status: 200 });
      }
      return new Response(JSON.stringify({ access_token: 'gho_after_pending' }), { status: 200 });
    });

    const noopSleep = async (_ms: number) => {};
    const token = await runDeviceFlow(mockFetch, noopSleep);
    expect(token).toBe('gho_after_pending');
    expect(pollCount).toBe(3);
  });

  it('handles slow_down by increasing interval', async () => {
    const sleepCalls: number[] = [];
    let pollCount = 0;

    const mockFetch = makeMockFetch((url) => {
      if (url.includes('device/code')) {
        return new Response(
          JSON.stringify({
            device_code: 'dc',
            user_code: 'SLOW-1234',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
          }),
          { status: 200 },
        );
      }

      pollCount++;
      if (pollCount === 1) {
        return new Response(JSON.stringify({ error: 'slow_down', interval: 10 }), { status: 200 });
      }
      return new Response(JSON.stringify({ access_token: 'gho_slow_token' }), { status: 200 });
    });

    const token = await runDeviceFlow(mockFetch, async (ms) => { sleepCalls.push(ms); });

    expect(token).toBe('gho_slow_token');
    // After slow_down with server interval=10, next sleep should be 10000 + safety margin
    expect(sleepCalls[1]).toBeGreaterThanOrEqual(10_000);
  });

  it('throws on expired_token error', async () => {
    const mockFetch = makeMockFetch((url) => {
      if (url.includes('device/code')) {
        return new Response(
          JSON.stringify({ device_code: 'dc', user_code: 'EXPD-1234', verification_uri: 'https://github.com/login/device', expires_in: 1, interval: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: 'expired_token' }), { status: 200 });
    });

    await expect(runDeviceFlow(mockFetch, async () => {})).rejects.toThrow('expired');
  });

  it('throws on access_denied error', async () => {
    const mockFetch = makeMockFetch((url) => {
      if (url.includes('device/code')) {
        return new Response(
          JSON.stringify({ device_code: 'dc', user_code: 'DENY-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: 'access_denied' }), { status: 200 });
    });

    await expect(runDeviceFlow(mockFetch, async () => {})).rejects.toThrow('denied');
  });

  it('throws when device code request fails', async () => {
    const mockFetch = makeMockFetch(() =>
      new Response('Service unavailable', { status: 503, statusText: 'Service Unavailable' }),
    );

    await expect(runDeviceFlow(mockFetch, async () => {})).rejects.toThrow('503');
  });
});

// ─── GitHubCopilotClient — constructor & auth state ───────────────────────────

describe('GitHubCopilotClient — constructor & auth state', () => {
  const { tokenPath } = useTempTokenDir();

  it('is not authenticated when no token file exists', () => {
    const client = new GitHubCopilotClient({ tokenPath: tokenPath() });
    expect(client.isAuthenticated()).toBe(false);
  });

  it('is authenticated when token is passed directly', () => {
    const client = new GitHubCopilotClient({ token: 'gho_direct', tokenPath: tokenPath() });
    expect(client.isAuthenticated()).toBe(true);
  });

  it('is authenticated when token file exists on disk', () => {
    const tp = tokenPath();
    fs.mkdirSync(path.dirname(tp), { recursive: true });
    fs.writeFileSync(tp, JSON.stringify({ accessToken: 'gho_cached', storedAt: new Date().toISOString() }));

    const client = new GitHubCopilotClient({ tokenPath: tp });
    expect(client.isAuthenticated()).toBe(true);
  });
});

// ─── GitHubCopilotClient.login() ──────────────────────────────────────────────

describe('GitHubCopilotClient.login()', () => {
  const { tokenPath } = useTempTokenDir();

  it('runs device flow and persists token to disk', async () => {
    const mockFetch = makeMockFetch((url) => {
      if (url.includes('device/code')) {
        return new Response(
          JSON.stringify({ device_code: 'dc', user_code: 'LGNI-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ access_token: 'gho_login_token' }), { status: 200 });
    });

    const tp = tokenPath();
    const client = new GitHubCopilotClient({ tokenPath: tp }, mockFetch);
    await client.login(false);

    // Token should be persisted
    const raw = fs.readFileSync(tp, 'utf-8');
    const stored = JSON.parse(raw);
    expect(stored.accessToken).toBe('gho_login_token');

    // Client should now be authenticated
    expect(client.isAuthenticated()).toBe(true);
  });

  it('skips device flow when token already exists (no force)', async () => {
    const tp = tokenPath();
    fs.mkdirSync(path.dirname(tp), { recursive: true });
    fs.writeFileSync(tp, JSON.stringify({ accessToken: 'gho_existing', storedAt: new Date().toISOString() }));

    let fetchCalled = false;
    const mockFetch = makeMockFetch(() => { fetchCalled = true; return new Response('', { status: 200 }); });

    const client = new GitHubCopilotClient({ tokenPath: tp }, mockFetch);
    await client.login(false);

    expect(fetchCalled).toBe(false);
  });

  it('re-runs device flow when force=true even if token exists', async () => {
    const tp = tokenPath();
    fs.mkdirSync(path.dirname(tp), { recursive: true });
    fs.writeFileSync(tp, JSON.stringify({ accessToken: 'gho_old', storedAt: new Date().toISOString() }));

    const mockFetch = makeMockFetch((url) => {
      if (url.includes('device/code')) {
        return new Response(
          JSON.stringify({ device_code: 'dc', user_code: 'FORC-1234', verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ access_token: 'gho_fresh_token' }), { status: 200 });
    });

    const client = new GitHubCopilotClient({ tokenPath: tp }, mockFetch);
    await client.login(true);

    const raw = fs.readFileSync(tp, 'utf-8');
    expect(JSON.parse(raw).accessToken).toBe('gho_fresh_token');
  });
});

// ─── GitHubCopilotClient.logout() ─────────────────────────────────────────────

describe('GitHubCopilotClient.logout()', () => {
  const { tokenPath } = useTempTokenDir();

  it('removes the token file and marks client as not authenticated', () => {
    const tp = tokenPath();
    fs.mkdirSync(path.dirname(tp), { recursive: true });
    fs.writeFileSync(tp, JSON.stringify({ accessToken: 'gho_to_remove', storedAt: new Date().toISOString() }));

    const client = new GitHubCopilotClient({ tokenPath: tp });
    expect(client.isAuthenticated()).toBe(true);

    client.logout();

    expect(client.isAuthenticated()).toBe(false);
  });

  it('does not throw when token file does not exist', () => {
    const client = new GitHubCopilotClient({ tokenPath: tokenPath() });
    expect(() => client.logout()).not.toThrow();
  });
});

// ─── GitHubCopilotClient.complete() ───────────────────────────────────────────

describe('GitHubCopilotClient.complete()', () => {
  const { tokenPath } = useTempTokenDir();

  it('throws with helpful message when not authenticated', async () => {
    const client = new GitHubCopilotClient({ tokenPath: tokenPath() });
    await expect(client.complete(baseRequest)).rejects.toThrow('splinty auth');
  });

  it('sends POST with correct Copilot headers and body', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};

    const mockFetch = makeMockFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(JSON.stringify(makeCompletionResponse('Hello!')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = new GitHubCopilotClient(
      { token: 'gho_test', endpoint: 'https://test.copilot/chat', tokenPath: tokenPath() },
      mockFetch,
    );

    await client.complete(baseRequest);

    expect(capturedUrl).toBe('https://test.copilot/chat');
    expect(capturedInit.method).toBe('POST');

    const headers = capturedInit.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer gho_test');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Openai-Intent']).toBe('conversation-edits');
    expect(headers['x-initiator']).toBe('agent');
    expect(headers['User-Agent']).toBe('splinty');

    const body = JSON.parse(capturedInit.body as string);
    expect(body.model).toBe('gpt-4o');
    expect(body.messages[0]!.role).toBe('system');
    expect(body.messages[0]!.content).toBe('You are a helpful assistant.');
    expect(body.messages[1]!.role).toBe('user');
    expect(body.messages[1]!.content).toBe('Say hello.');
  });

  it('returns the content string from choices[0].message.content', async () => {
    const mockFetch = makeMockFetch(() =>
      new Response(JSON.stringify(makeCompletionResponse('Copilot says hi')), { status: 200 }),
    );

    const client = new GitHubCopilotClient(
      { token: 'gho_test', endpoint: 'https://test.copilot', tokenPath: tokenPath() },
      mockFetch,
    );
    const result = await client.complete(baseRequest);
    expect(result).toBe('Copilot says hi');
  });

  it('passes maxTokens and temperature to the request body', async () => {
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = makeMockFetch((_, init) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify(makeCompletionResponse('ok')), { status: 200 });
    });

    const client = new GitHubCopilotClient(
      { token: 'gho_test', endpoint: 'https://test.copilot', tokenPath: tokenPath() },
      mockFetch,
    );
    await client.complete({ ...baseRequest, maxTokens: 512, temperature: 0.1 });
    expect(capturedBody['max_tokens']).toBe(512);
    expect(capturedBody['temperature']).toBe(0.1);
  });

  it('throws with re-auth hint on 401 and clears bad token', async () => {
    const tp = tokenPath();
    fs.mkdirSync(path.dirname(tp), { recursive: true });
    fs.writeFileSync(tp, JSON.stringify({ accessToken: 'gho_expired', storedAt: new Date().toISOString() }));

    const mockFetch = makeMockFetch(() =>
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    const client = new GitHubCopilotClient({ tokenPath: tp }, mockFetch);
    await expect(client.complete(baseRequest)).rejects.toThrow('splinty auth');

    // Token file should be cleared
    const stored = JSON.parse(fs.readFileSync(tp, 'utf-8'));
    expect(stored.accessToken).toBe('');
  });

  it('throws on non-ok HTTP response (500)', async () => {
    const mockFetch = makeMockFetch(() =>
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    );

    const client = new GitHubCopilotClient(
      { token: 'gho_test', endpoint: 'https://test.copilot', tokenPath: tokenPath() },
      mockFetch,
    );
    await expect(client.complete(baseRequest)).rejects.toThrow('500');
  });

  it('throws when choices[0].message.content is null', async () => {
    const mockFetch = makeMockFetch(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), { status: 200 }),
    );

    const client = new GitHubCopilotClient(
      { token: 'gho_test', endpoint: 'https://test.copilot', tokenPath: tokenPath() },
      mockFetch,
    );
    await expect(client.complete(baseRequest)).rejects.toThrow('empty response');
  });

  it('throws when choices array is empty', async () => {
    const mockFetch = makeMockFetch(() =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    );

    const client = new GitHubCopilotClient(
      { token: 'gho_test', endpoint: 'https://test.copilot', tokenPath: tokenPath() },
      mockFetch,
    );
    await expect(client.complete(baseRequest)).rejects.toThrow('empty response');
  });

  it('uses token from disk cache when no token passed in constructor', async () => {
    const tp = tokenPath();
    fs.mkdirSync(path.dirname(tp), { recursive: true });
    fs.writeFileSync(tp, JSON.stringify({ accessToken: 'gho_from_disk', storedAt: new Date().toISOString() }));

    let capturedAuthHeader = '';
    const mockFetch = makeMockFetch((_, init) => {
      capturedAuthHeader = (init.headers as Record<string, string>)['Authorization'] ?? '';
      return new Response(JSON.stringify(makeCompletionResponse('ok')), { status: 200 });
    });

    const client = new GitHubCopilotClient(
      { tokenPath: tp, endpoint: 'https://test.copilot' },
      mockFetch,
    );
    await client.complete(baseRequest);
    expect(capturedAuthHeader).toBe('Bearer gho_from_disk');
  });
});
