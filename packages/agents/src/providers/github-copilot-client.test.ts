import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { GitHubCopilotClient } from './github-copilot-client';
import type { LlmRequest } from '@splinty/core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const baseRequest: LlmRequest = {
  model: 'gpt-4o',
  systemPrompt: 'You are a helpful assistant.',
  userMessage: 'Say hello.',
};

function makeOkResponse(content: string) {
  return {
    choices: [{ message: { content } }],
  };
}

/** Replace global fetch with a mock and restore it afterward. */
function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const original = global.fetch;
  // @ts-ignore — test-only global override
  global.fetch = handler;
  return () => {
    global.fetch = original;
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GitHubCopilotClient — constructor', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    const saved = process.env['GITHUB_TOKEN'];
    restoreEnv = () => {
      if (saved === undefined) delete process.env['GITHUB_TOKEN'];
      else process.env['GITHUB_TOKEN'] = saved;
    };
  });

  afterEach(() => {
    restoreEnv();
  });

  it('throws when no token and GITHUB_TOKEN env var is absent', () => {
    delete process.env['GITHUB_TOKEN'];
    expect(() => new GitHubCopilotClient()).toThrow('GITHUB_TOKEN');
  });

  it('constructs successfully when token is passed directly', () => {
    expect(() => new GitHubCopilotClient('ghp_test_token', 'http://localhost')).not.toThrow();
  });

  it('constructs successfully from GITHUB_TOKEN env var', () => {
    process.env['GITHUB_TOKEN'] = 'ghp_env_token';
    expect(() => new GitHubCopilotClient(undefined, 'http://localhost')).not.toThrow();
  });
});

describe('GitHubCopilotClient.complete()', () => {
  it('sends POST with correct headers and body', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};

    const restore = mockFetch((url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return new Response(
        JSON.stringify(makeOkResponse('Hello!')),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    try {
      const client = new GitHubCopilotClient('ghp_test', 'https://test.endpoint/chat');
      await client.complete(baseRequest);

      expect(capturedUrl).toBe('https://test.endpoint/chat');
      expect(capturedInit.method).toBe('POST');
      const headers = capturedInit.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer ghp_test');
      expect(headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(capturedInit.body as string);
      expect(body.model).toBe('gpt-4o');
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toBe('You are a helpful assistant.');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toBe('Say hello.');
    } finally {
      restore();
    }
  });

  it('returns the content string from choices[0].message.content', async () => {
    const restore = mockFetch(() =>
      new Response(JSON.stringify(makeOkResponse('World response')), { status: 200 })
    );

    try {
      const client = new GitHubCopilotClient('ghp_test', 'https://test.endpoint');
      const result = await client.complete(baseRequest);
      expect(result).toBe('World response');
    } finally {
      restore();
    }
  });

  it('passes maxTokens and temperature to the request body', async () => {
    let capturedBody: Record<string, unknown> = {};

    const restore = mockFetch((_, init) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify(makeOkResponse('ok')), { status: 200 });
    });

    try {
      const client = new GitHubCopilotClient('ghp_test', 'https://test.endpoint');
      await client.complete({ ...baseRequest, maxTokens: 512, temperature: 0.1 });
      expect(capturedBody['max_tokens']).toBe(512);
      expect(capturedBody['temperature']).toBe(0.1);
    } finally {
      restore();
    }
  });

  it('throws on non-ok HTTP response (401)', async () => {
    const restore = mockFetch(() =>
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' })
    );

    try {
      const client = new GitHubCopilotClient('ghp_bad', 'https://test.endpoint');
      await expect(client.complete(baseRequest)).rejects.toThrow('401');
    } finally {
      restore();
    }
  });

  it('throws on non-ok HTTP response (500)', async () => {
    const restore = mockFetch(() =>
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' })
    );

    try {
      const client = new GitHubCopilotClient('ghp_test', 'https://test.endpoint');
      await expect(client.complete(baseRequest)).rejects.toThrow('500');
    } finally {
      restore();
    }
  });

  it('throws when choices[0].message.content is null', async () => {
    const emptyResp = { choices: [{ message: { content: null } }] };
    const restore = mockFetch(() =>
      new Response(JSON.stringify(emptyResp), { status: 200 })
    );

    try {
      const client = new GitHubCopilotClient('ghp_test', 'https://test.endpoint');
      await expect(client.complete(baseRequest)).rejects.toThrow('empty response');
    } finally {
      restore();
    }
  });

  it('throws when choices array is empty', async () => {
    const emptyResp = { choices: [] };
    const restore = mockFetch(() =>
      new Response(JSON.stringify(emptyResp), { status: 200 })
    );

    try {
      const client = new GitHubCopilotClient('ghp_test', 'https://test.endpoint');
      await expect(client.complete(baseRequest)).rejects.toThrow('empty response');
    } finally {
      restore();
    }
  });
});
