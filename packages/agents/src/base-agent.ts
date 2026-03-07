import * as fs from 'fs';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import {
  type AgentConfig,
  type AgentPersona,
  type HandoffDocument,
  type Story,
  type WorkspaceState,
} from '@splinty/core';
import { HandoffManager } from '@splinty/core';
import { WorkspaceManager } from '@splinty/core';

// ─── Custom Errors ────────────────────────────────────────────────────────────

export class AgentCallError extends Error {
  constructor(
    public readonly persona: AgentPersona,
    public readonly attempts: number,
    public readonly lastError: unknown
  ) {
    super(
      `Agent ${persona} failed after ${attempts} attempt(s): ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
    this.name = 'AgentCallError';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClaudeCallOptions {
  systemPrompt: string;
  userMessage: string;
}

// ─── Abstract Base Agent ──────────────────────────────────────────────────────

export abstract class BaseAgent {
  protected readonly config: AgentConfig;
  protected readonly workspaceManager: WorkspaceManager;
  protected readonly handoffManager: HandoffManager;
  protected currentWorkspace: WorkspaceState | null = null;

  // Allow injection of Anthropic client for testing
  protected anthropic: Anthropic;

  constructor(
    config: AgentConfig,
    workspaceManager: WorkspaceManager,
    handoffManager: HandoffManager,
    anthropicClient?: Anthropic
  ) {
    this.config = config;
    this.workspaceManager = workspaceManager;
    this.handoffManager = handoffManager;
    this.anthropic = anthropicClient ?? new Anthropic();
  }

  /**
   * Main agent execution method. Each persona implements this.
   */
  abstract execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument>;

  /**
   * Call Claude with retry-with-backoff. Up to config.maxRetries attempts.
   * Exponential backoff: 1s, 2s, 4s, ...
   * Throws AgentCallError on all attempts failing.
   */
  protected async callClaude(options: ClaudeCallOptions): Promise<string> {
    const { systemPrompt, userMessage } = options;
    const maxAttempts = this.config.maxRetries;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logActivity(`Claude call attempt ${attempt}/${maxAttempts}`);

      try {
        const message = await this.anthropic.messages.create({
          model: this.config.model,
          max_tokens: 4096,
          temperature: this.config.temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        const textBlock = message.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          throw new Error('Claude returned no text block');
        }

        this.logActivity(`Claude call attempt ${attempt} succeeded`);
        return textBlock.text;
      } catch (err) {
        lastError = err;
        this.logActivity(
          `Claude call attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`
        );

        if (attempt < maxAttempts) {
          const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
          await this.sleep(delayMs);
        }
      }
    }

    // All attempts exhausted — log to errors.log and throw
    const error = new AgentCallError(this.config.persona, maxAttempts, lastError);
    this.logError(error.message);
    throw error;
  }

  /**
   * Builds a HandoffDocument from agent output and validates via Zod.
   */
  protected buildHandoff(
    story: Story,
    toAgent: AgentPersona,
    stateOfWorld: Record<string, string>,
    nextGoal: string,
    artifacts: string[] = []
  ): HandoffDocument {
    return this.handoffManager.create(
      this.config.persona,
      toAgent,
      story.id,
      'completed',
      stateOfWorld,
      nextGoal,
      artifacts
    );
  }

  /**
   * Appends a timestamped entry to the workspace agent.log.
   */
  protected logActivity(message: string): void {
    if (!this.currentWorkspace) return;
    this.workspaceManager.appendLog(this.currentWorkspace, this.config.persona, message);
  }

  /**
   * Appends a timestamped error entry to the workspace errors.log.
   */
  protected logError(message: string): void {
    if (!this.currentWorkspace) return;
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [${this.config.persona}] ERROR: ${message}\n`;
    const errorsLogPath = path.join(this.currentWorkspace.basePath, 'errors.log');
    fs.appendFileSync(errorsLogPath, entry, 'utf-8');
  }

  /**
   * Sets the active workspace context for logging.
   */
  setWorkspace(ws: WorkspaceState): void {
    this.currentWorkspace = ws;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
