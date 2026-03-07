import Anthropic from '@anthropic-ai/sdk';
import type { LlmClient, LlmRequest } from '@splinty/core';

// ─── Anthropic Provider ───────────────────────────────────────────────────────
//
// Wraps @anthropic-ai/sdk. Reads ANTHROPIC_API_KEY from the environment when
// no client is injected — identical behaviour to the previous BaseAgent default.

export class AnthropicClient implements LlmClient {
  private readonly anthropic: Anthropic;

  /**
   * @param client - Optional pre-constructed Anthropic SDK instance.
   *   Omit in production (reads ANTHROPIC_API_KEY from env).
   *   Inject a mock in tests.
   */
  constructor(client?: Anthropic) {
    this.anthropic = client ?? new Anthropic();
  }

  async complete(request: LlmRequest): Promise<string> {
    const { model, systemPrompt, userMessage, maxTokens = 4096, temperature = 0.7 } = request;

    const message = await this.anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Anthropic returned no text block in response');
    }

    return textBlock.text;
  }
}
