import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { LlmClient, LlmRequest } from '@splinty/core';

// ─── GitHub Copilot Provider ───────────────────────────────────────────────────
//
// Authenticates via GitHub's OAuth Device Flow (the same flow used by the
// GitHub CLI and OpenCode) and calls the GitHub Copilot chat completions API.
//
// Auth flow:
//   1. POST https://github.com/login/device/code  → device_code + user_code
//   2. User visits github.com/login/device and enters user_code
//   3. Poll https://github.com/login/oauth/access_token until authorized
//   4. Store access_token in ~/.splinty/copilot-token.json
//   5. Use access_token as Bearer for all Copilot API calls
//
// Endpoint: https://api.githubcopilot.com/chat/completions
//
// Requires a paid GitHub Copilot subscription (Pro, Pro+, Business, Enterprise).
//
// Suggested models (pass as AgentConfig.model):
//   'gpt-4o'                       — strong general-purpose
//   'gpt-4o-mini'                  — fast + cheap (good for QA agent)
//   'claude-3.5-sonnet'            — Anthropic via Copilot
//   'o3-mini'                      — OpenAI reasoning model

// ─── Constants ────────────────────────────────────────────────────────────────

// GitHub's public OAuth app client ID used for Copilot device flow auth.
// This is the same client ID used by OpenCode and GitHub CLI tooling.
const COPILOT_CLIENT_ID = 'Ov23li8tweQw6odWQebz';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const COPILOT_API_ENDPOINT = 'https://api.githubcopilot.com/chat/completions';

// How long to wait between token poll retries (ms), plus a safety buffer for
// clock skew / timer drift.
const POLL_SAFETY_MARGIN_MS = 3_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

// ─── Token Storage ────────────────────────────────────────────────────────────

interface StoredToken {
  accessToken: string;
  storedAt: string; // ISO date
}

function defaultTokenPath(): string {
  return path.join(os.homedir(), '.splinty', 'copilot-token.json');
}

function readStoredToken(tokenPath: string): string | null {
  try {
    const raw = fs.readFileSync(tokenPath, 'utf-8');
    const parsed = JSON.parse(raw) as StoredToken;
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

function writeStoredToken(tokenPath: string, accessToken: string): void {
  const dir = path.dirname(tokenPath);
  fs.mkdirSync(dir, { recursive: true });
  const data: StoredToken = { accessToken, storedAt: new Date().toISOString() };
  fs.writeFileSync(tokenPath, JSON.stringify(data, null, 2), 'utf-8');
}

// ─── GitHub OAuth Device Flow ─────────────────────────────────────────────────

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
  interval?: number;
}

/**
 * Runs the full GitHub OAuth device flow.
 *
 * Prints the verification URL and user code to stdout, then polls until the
 * user completes authorization. Returns the access token.
 *
 * @param fetchFn - Injectable fetch (defaults to global fetch; override in tests)
 * @param sleepFn - Injectable sleep (defaults to real timer; override in tests)
 */
export async function runDeviceFlow(
  fetchFn: typeof fetch = fetch,
  sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<string> {
  // Step 1: Request device + user code
  const deviceResp = await fetchFn(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'splinty',
    },
    body: JSON.stringify({ client_id: COPILOT_CLIENT_ID, scope: 'read:user' }),
  });

  if (!deviceResp.ok) {
    throw new Error(
      `GitHub device flow failed (${deviceResp.status}): ${await deviceResp.text().catch(() => '')}`,
    );
  }

  const deviceData = (await deviceResp.json()) as DeviceCodeResponse;
  const pollIntervalMs = (deviceData.interval ?? 5) * 1_000;

  // Step 2: Prompt the user
  console.log('\nTo connect Splinty to GitHub Copilot:');
  console.log(`  1. Open: ${deviceData.verification_uri}`);
  console.log(`  2. Enter code: ${deviceData.user_code}`);
  console.log('\nWaiting for authorization...');

  // Step 3: Poll
  let currentIntervalMs = pollIntervalMs;

  while (true) {
    await sleepFn(currentIntervalMs + POLL_SAFETY_MARGIN_MS);

    const tokenResp = await fetchFn(ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'splinty',
      },
      body: JSON.stringify({
        client_id: COPILOT_CLIENT_ID,
        device_code: deviceData.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!tokenResp.ok) {
      throw new Error(`GitHub token poll failed (${tokenResp.status})`);
    }

    const tokenData = (await tokenResp.json()) as AccessTokenResponse;

    if (tokenData.access_token) {
      console.log('GitHub Copilot authorization successful.');
      return tokenData.access_token;
    }

    switch (tokenData.error) {
      case 'authorization_pending':
        // Still waiting — keep polling at the current interval
        break;

      case 'slow_down': {
        // RFC 8628 §3.5: add 5s to the polling interval (permanent increase)
        const serverInterval = tokenData.interval;
        currentIntervalMs =
          serverInterval && serverInterval > 0
            ? serverInterval * 1_000
            : currentIntervalMs + 5_000;
        break;
      }

      case 'expired_token':
        throw new Error(
          'Device code expired. Run `splinty auth` again to restart the authorization flow.',
        );

      case 'access_denied':
        throw new Error('GitHub Copilot authorization was denied by the user.');

      default:
        if (tokenData.error) {
          throw new Error(`GitHub OAuth error: ${tokenData.error}`);
        }
        // Unknown state — keep polling
        break;
    }
  }
}

// ─── OpenAI-Compatible API shapes ─────────────────────────────────────────────

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

// ─── GitHubCopilotClient ───────────────────────────────────────────────────────

export interface GitHubCopilotClientOptions {
  /**
   * Access token obtained from the device flow.
   * When provided, skips token cache lookup and device flow entirely.
   * Useful for tests and for callers that manage their own token.
   */
  token?: string;

  /**
   * Path to the JSON file where the access token is cached between runs.
   * Defaults to ~/.splinty/copilot-token.json.
   */
  tokenPath?: string;

  /**
   * Override the Copilot completions endpoint.
   * Defaults to https://api.githubcopilot.com/chat/completions.
   * Useful for tests and GitHub Enterprise deployments.
   */
  endpoint?: string;
}

export class GitHubCopilotClient implements LlmClient {
  private readonly tokenPath: string;
  private readonly endpoint: string;

  /**
   * Resolved token — set after the first successful auth (lazy).
   * Starts null; populated by `ensureAuthenticated()`.
   */
  private resolvedToken: string | null;

  /**
   * Injectable fetch — replaced in unit tests.
   */
  private readonly fetchFn: typeof fetch;

  constructor(options: GitHubCopilotClientOptions = {}, fetchFn: typeof fetch = fetch) {
    this.tokenPath = options.tokenPath ?? defaultTokenPath();
    this.endpoint = options.endpoint ?? COPILOT_API_ENDPOINT;
    this.resolvedToken = options.token ?? null;
    this.fetchFn = fetchFn;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Runs the GitHub OAuth device flow and persists the resulting token to disk.
   * Call this once (e.g. from `splinty auth`) before running the pipeline.
   *
   * If a cached token already exists, this is a no-op unless `force` is true.
   */
  async login(force = false): Promise<void> {
    if (!force && readStoredToken(this.tokenPath)) {
      console.log('Already authenticated with GitHub Copilot.');
      return;
    }

    const token = await runDeviceFlow(this.fetchFn);
    writeStoredToken(this.tokenPath, token);
    this.resolvedToken = token;
  }

  /**
   * Clears the stored token, requiring re-authentication on next use.
   */
  logout(): void {
    try {
      fs.unlinkSync(this.tokenPath);
    } catch {
      // File may not exist — that's fine
    }
    this.resolvedToken = null;
    console.log('GitHub Copilot token removed.');
  }

  /**
   * Returns true if a token is cached on disk (does not validate it against the API).
   */
  isAuthenticated(): boolean {
    return this.resolvedToken !== null || readStoredToken(this.tokenPath) !== null;
  }

  /**
   * Implements LlmClient.complete().
   * Automatically loads a cached token if available; throws with a clear
   * message if the user needs to run `splinty auth` first.
   */
  async complete(request: LlmRequest): Promise<string> {
    const token = await this.ensureAuthenticated();
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

    const response = await this.fetchFn(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'splinty',
        'Openai-Intent': 'conversation-edits',
        'x-initiator': 'agent',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');

      // Surface a helpful message for the most common failure: expired / revoked token
      if (response.status === 401) {
        // Clear the bad token so the next run prompts for re-auth
        this.resolvedToken = null;
        writeStoredToken(this.tokenPath, ''); // clear on disk too
        throw new Error(
          `GitHub Copilot authentication failed (401). ` +
            `Run \`splinty auth\` to re-authenticate.\nDetail: ${text}`,
        );
      }

      throw new Error(
        `GitHub Copilot API error ${response.status} ${response.statusText}: ${text}`,
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('GitHub Copilot API returned an empty response');
    }

    return content;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Returns the resolved token, loading it from the disk cache if needed.
   * Throws if no token is available, directing the user to run `splinty auth`.
   */
  private async ensureAuthenticated(): Promise<string> {
    if (this.resolvedToken) return this.resolvedToken;

    const cached = readStoredToken(this.tokenPath);
    if (cached) {
      this.resolvedToken = cached;
      return cached;
    }

    throw new Error(
      'Not authenticated with GitHub Copilot. ' +
        'Run `splinty auth` to complete the device authorization flow.',
    );
  }
}
