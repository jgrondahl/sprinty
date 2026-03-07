// ─── LLM Client Abstraction ───────────────────────────────────────────────────
//
// LlmClient is the single interface all agent personas use to call an LLM.
// Concrete implementations live in packages/agents/src/providers/.
// This interface intentionally lives in @splinty/core so that any package
// (cli, integrations, future packages) can reference the type without
// depending on packages/agents.

export interface LlmRequest {
  /** Model identifier — interpreted by the concrete provider (e.g. 'claude-3-5-sonnet-20241022', 'gpt-4o'). */
  model: string;
  /** System-level instructions for the agent persona. */
  systemPrompt: string;
  /** The user turn content. */
  userMessage: string;
  /** Maximum tokens to generate. Defaults to 4096 if omitted. */
  maxTokens?: number;
  /** Sampling temperature 0–1. Defaults to 0.7 if omitted. */
  temperature?: number;
}

export interface LlmClient {
  /**
   * Send a single-turn completion request and return the text response.
   * Implementations are responsible for mapping LlmRequest fields to their
   * provider's API shape. Retry logic lives in BaseAgent — implementations
   * should throw on any non-retryable or retryable error and let the caller
   * decide whether to retry.
   */
  complete(request: LlmRequest): Promise<string>;
}
