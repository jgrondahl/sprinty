import type { LlmClient, LlmRequest } from '@splinty/core';

// ─── GitHub Copilot / GitHub Models Provider ──────────────────────────────────
//
// Calls the GitHub Models inference endpoint, which exposes an OpenAI-compatible
// chat completions API. Authenticates via GITHUB_TOKEN — the same token already
// used by the GitHub Issues integration.
//
// Endpoint: https://models.inference.ai.azure.com/chat/completions
// Docs: https://docs.github.com/en/github-models
//
// Suggested models (pass as AgentConfig.model):
//   'gpt-4o'                     — strong general-purpose
//   'gpt-4o-mini'                — fast + cheap (good for QA agent)
//   'meta-llama-3.1-405b-instruct' — open-weight alternative

const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com/chat/completions';

interface OpenAIChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
}

export class GitHubCopilotClient implements LlmClient {
  private readonly token: string;
  private readonly endpoint: string;

  /**
   * @param token   - GitHub personal access token with `models:read` scope.
   *   Defaults to process.env.GITHUB_TOKEN.
   * @param endpoint - Override the inference endpoint (useful for tests).
   */
  constructor(token?: string, endpoint?: string) {
    const resolvedToken = token ?? process.env['GITHUB_TOKEN'];
    if (!resolvedToken) {
      throw new Error(
        'GitHubCopilotClient requires a GitHub token. ' +
          'Set the GITHUB_TOKEN environment variable or pass a token to the constructor.'
      );
    }
    this.token = resolvedToken;
    this.endpoint = endpoint ?? GITHUB_MODELS_ENDPOINT;
  }

  async complete(request: LlmRequest): Promise<string> {
    const { model, systemPrompt, userMessage, maxTokens = 4096, temperature = 0.7 } = request;

    const body: OpenAIChatRequest = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature,
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `GitHub Models API error ${response.status} ${response.statusText}: ${text}`
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('GitHub Models API returned an empty response');
    }

    return content;
  }
}
