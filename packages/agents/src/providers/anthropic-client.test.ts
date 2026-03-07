import { describe, it, expect } from 'bun:test';
import { AnthropicClient } from './anthropic-client';
import type { LlmRequest } from '@splinty/core';

// ─── Minimal Anthropic SDK mock ───────────────────────────────────────────────
//
// AnthropicClient accepts an optional pre-constructed Anthropic instance.
// We pass a mock object that satisfies the subset of the SDK we actually use.

function makeSdkMock(textContent: string) {
  return {
    messages: {
      create: async (params: Record<string, unknown>) => ({
        _params: params, // capture for assertions
        content: [{ type: 'text', text: textContent }],
      }),
    },
  };
}

function makeSdkMockError(err: Error) {
  return {
    messages: {
      create: async () => {
        throw err;
      },
    },
  };
}

function makeSdkMockNoText() {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'image', source: { type: 'url', url: 'https://example.com/img.png' } }],
      }),
    },
  };
}

const baseRequest: LlmRequest = {
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'You are a helpful assistant.',
  userMessage: 'Say hello.',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AnthropicClient.complete()', () => {
  it('returns text from the first text block', async () => {
    // @ts-ignore — mock satisfies the subset we use
    const client = new AnthropicClient(makeSdkMock('Hello there!'));
    const result = await client.complete(baseRequest);
    expect(result).toBe('Hello there!');
  });

  it('passes model, temperature, maxTokens, system and user message to SDK', async () => {
    let captured: Record<string, unknown> = {};
    const sdk = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          captured = params;
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
    };

    // @ts-ignore
    const client = new AnthropicClient(sdk);
    await client.complete({
      model: 'claude-3-haiku-20240307',
      systemPrompt: 'sys',
      userMessage: 'msg',
      maxTokens: 1024,
      temperature: 0.3,
    });

    expect(captured['model']).toBe('claude-3-haiku-20240307');
    expect(captured['system']).toBe('sys');
    expect(captured['max_tokens']).toBe(1024);
    expect(captured['temperature']).toBe(0.3);
    const messages = captured['messages'] as Array<{ role: string; content: string }>;
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('msg');
  });

  it('uses default maxTokens=4096 and temperature=0.7 when not provided', async () => {
    let captured: Record<string, unknown> = {};
    const sdk = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          captured = params;
          return { content: [{ type: 'text', text: 'ok' }] };
        },
      },
    };

    // @ts-ignore
    const client = new AnthropicClient(sdk);
    await client.complete(baseRequest);

    expect(captured['max_tokens']).toBe(4096);
    expect(captured['temperature']).toBe(0.7);
  });

  it('throws when the response contains no text block', async () => {
    // @ts-ignore
    const client = new AnthropicClient(makeSdkMockNoText());
    await expect(client.complete(baseRequest)).rejects.toThrow('no text block');
  });

  it('propagates SDK errors', async () => {
    const sdkError = new Error('SDK network error');
    // @ts-ignore
    const client = new AnthropicClient(makeSdkMockError(sdkError));
    await expect(client.complete(baseRequest)).rejects.toThrow('SDK network error');
  });
});
