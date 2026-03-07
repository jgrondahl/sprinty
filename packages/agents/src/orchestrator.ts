import {
  AgentPersona,
  StoryState,
  LedgerManager,
  HandoffManager,
  WorkspaceManager,
  StoryStateMachine,
  type LlmClient,
  type Story,
  type HandoffDocument,
  type AppBuilderResult,
  type AgentConfig,
} from '@splinty/core';
import {
  BusinessOwnerAgent,
  ProductOwnerAgent,
  ArchitectAgent,
  DeveloperAgent,
  SoundEngineerAgent,
  QAEngineerAgent,
  AgentCallError,
} from './index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  projectId: string;
  workspaceBaseDir?: string;
  /**
   * Default LLM client used by all agents that don't have a persona-specific
   * override. Falls back to AnthropicClient (reads ANTHROPIC_API_KEY) when omitted.
   */
  defaultClient?: LlmClient;
  /**
   * Per-persona LLM client overrides. Any persona listed here uses its own
   * client; all others fall back to defaultClient.
   *
   * Example — run QA on GitHub Copilot, everything else on Anthropic:
   * ```ts
   * clients: { [AgentPersona.QA_ENGINEER]: new GitHubCopilotClient() }
   * ```
   */
  clients?: Partial<Record<AgentPersona, LlmClient>>;
  /** Injectable git factory — forwarded to DeveloperAgent */
  gitFactory?: Parameters<DeveloperAgent['setGitFactory']>[0];
  /** Injectable GitHub PR creator — called after QA PASS */
  createPullRequest?: (
    story: Story,
    branchName: string,
    commitSha: string
  ) => Promise<string>;
}

// ─── Agent Config Factories ───────────────────────────────────────────────────

function makeConfig(persona: AgentPersona, model: string): AgentConfig {
  return {
    persona,
    model,
    systemPrompt: `${persona} system prompt`,
    maxRetries: 3,
    temperature: 0.7,
  };
}

const AGENT_CONFIGS: Record<AgentPersona, AgentConfig> = {
  [AgentPersona.BUSINESS_OWNER]: makeConfig(
    AgentPersona.BUSINESS_OWNER,
    'claude-3-5-sonnet-20241022'
  ),
  [AgentPersona.PRODUCT_OWNER]: makeConfig(
    AgentPersona.PRODUCT_OWNER,
    'claude-3-5-sonnet-20241022'
  ),
  [AgentPersona.ARCHITECT]: makeConfig(AgentPersona.ARCHITECT, 'claude-3-5-sonnet-20241022'),
  [AgentPersona.DEVELOPER]: makeConfig(AgentPersona.DEVELOPER, 'claude-3-5-sonnet-20241022'),
  [AgentPersona.SOUND_ENGINEER]: makeConfig(
    AgentPersona.SOUND_ENGINEER,
    'claude-3-5-sonnet-20241022'
  ),
  [AgentPersona.QA_ENGINEER]: makeConfig(AgentPersona.QA_ENGINEER, 'claude-3-haiku-20240307'),
  [AgentPersona.ORCHESTRATOR]: makeConfig(
    AgentPersona.ORCHESTRATOR,
    'claude-3-5-sonnet-20241022'
  ),
};

// ─── SprintOrchestrator ───────────────────────────────────────────────────────

export class SprintOrchestrator {
  private readonly config: OrchestratorConfig;
  private readonly ledger: LedgerManager;
  private readonly handoffMgr: HandoffManager;
  private readonly workspaceMgr: WorkspaceManager;
  private readonly stateMachine: StoryStateMachine;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.ledger = new LedgerManager(config.workspaceBaseDir);
    this.handoffMgr = new HandoffManager();
    this.workspaceMgr = new WorkspaceManager(config.workspaceBaseDir ?? '.splinty');
    this.stateMachine = new StoryStateMachine();
  }

  /**
   * Run the full pipeline for a batch of stories.
   * Each story is processed independently — failures are isolated.
   */
  async run(stories: Story[]): Promise<AppBuilderResult[]> {
    // Ensure ledger exists
    try {
      this.ledger.getSnapshot(this.config.projectId);
    } catch {
      this.ledger.init(this.config.projectId);
    }

    // Process all stories concurrently, isolating failures
    const results = await Promise.allSettled(
      stories.map((story) => this.runStory(story))
    );

    return results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      // Failure — mark blocked and return a failed result
      const story = stories[i]!;
      this.markBlocked(story, result.reason);
      return this.makeFailedResult(story, result.reason);
    });
  }

  // ── Per-story pipeline ─────────────────────────────────────────────────────

  private async runStory(story: Story): Promise<AppBuilderResult> {
    const startTime = Date.now();

    // Create (or reuse) workspace for this story
    const ws = this.workspaceMgr.createWorkspace(this.config.projectId, story.id);

    // Register story in ledger
    this.ledger.upsertStory(this.config.projectId, story);

    // Build shared agent dependencies
    // Resolve client for each persona: per-persona override → defaultClient → AnthropicClient default
    const clientFor = (persona: AgentPersona): LlmClient | undefined =>
      this.config.clients?.[persona] ?? this.config.defaultClient;

    const biz = new BusinessOwnerAgent(
      AGENT_CONFIGS[AgentPersona.BUSINESS_OWNER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.BUSINESS_OWNER)
    );
    biz.setWorkspace(ws);

    const po = new ProductOwnerAgent(
      AGENT_CONFIGS[AgentPersona.PRODUCT_OWNER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.PRODUCT_OWNER)
    );
    po.setWorkspace(ws);

    const architect = new ArchitectAgent(
      AGENT_CONFIGS[AgentPersona.ARCHITECT]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.ARCHITECT)
    );
    architect.setWorkspace(ws);

    const dev = new DeveloperAgent(
      AGENT_CONFIGS[AgentPersona.DEVELOPER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.DEVELOPER)
    );
    dev.setWorkspace(ws);
    if (this.config.gitFactory) dev.setGitFactory(this.config.gitFactory);

    const soundEng = new SoundEngineerAgent(
      AGENT_CONFIGS[AgentPersona.SOUND_ENGINEER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.SOUND_ENGINEER)
    );
    soundEng.setWorkspace(ws);

    const qa = new QAEngineerAgent(
      AGENT_CONFIGS[AgentPersona.QA_ENGINEER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.QA_ENGINEER)
    );
    qa.setWorkspace(ws);

    // ── Pipeline execution ─────────────────────────────────────────────────

    let currentStory = story;
    let handoff: HandoffDocument | null = null;

    // Step 1: RAW → EPIC (BusinessOwner)
    handoff = await biz.execute(handoff, currentStory);
    currentStory = this.reloadStory(ws, story.id, currentStory);
    this.updateLedger(currentStory, AgentPersona.BUSINESS_OWNER);

    // Step 2: EPIC → USER_STORY (ProductOwner)
    handoff = await po.execute(handoff, currentStory);
    currentStory = this.reloadStory(ws, story.id, currentStory);
    this.updateLedger(currentStory, AgentPersona.PRODUCT_OWNER);

    // Step 3: USER_STORY → REFINED → SPRINT_READY (Orchestrator transitions)
    currentStory = this.stateMachine.transition(currentStory, StoryState.REFINED);
    this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
    currentStory = this.stateMachine.transition(currentStory, StoryState.SPRINT_READY);
    this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
    this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(currentStory, null, 2));

    // Step 4: SPRINT_READY → IN_PROGRESS (Architect)
    handoff = await architect.execute(handoff, currentStory);
    currentStory = this.reloadStory(ws, story.id, currentStory);
    this.updateLedger(currentStory, AgentPersona.ARCHITECT);

    // Step 5 (conditional): Sound Engineer if audio domain
    if (handoff.stateOfWorld['soundEngineerRequired'] === 'true') {
      handoff = await soundEng.execute(handoff, currentStory);
      this.updateLedger(currentStory, AgentPersona.SOUND_ENGINEER);
    }

    // Step 6: IN_PROGRESS → IN_REVIEW (Developer)
    handoff = await dev.execute(handoff, currentStory);
    currentStory = this.reloadStory(ws, story.id, currentStory);
    this.updateLedger(currentStory, AgentPersona.DEVELOPER);

    // Step 7: QA loop (max 3 attempts to handle rework cycle)
    let qaAttempts = 0;
    const maxQaAttempts = 3;

    while (qaAttempts < maxQaAttempts) {
      qaAttempts++;
      handoff = await qa.execute(handoff, currentStory);
      currentStory = this.reloadStory(ws, story.id, currentStory);

      const verdict = handoff.stateOfWorld['verdict'];

      if (verdict === 'PASS') {
        this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
        break;
      }

      if (verdict === 'BLOCKED') {
        this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
        throw new Error(`Story ${story.id} QA BLOCKED: ${handoff.stateOfWorld['failedAC'] ?? ''}`);
      }

      // FAIL — rework: developer gets another pass
      this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
      handoff = await dev.execute(handoff, currentStory);
      currentStory = this.reloadStory(ws, story.id, currentStory);
      this.updateLedger(currentStory, AgentPersona.DEVELOPER);
    }

    // Step 8: DONE → PR_OPEN
    const branchName = handoff.stateOfWorld['branchName'] ?? `story/${story.id}`;
    const commitSha = handoff.stateOfWorld['commitSha'] ?? '';

    let prUrl = '';
    if (this.config.createPullRequest) {
      prUrl = await this.config.createPullRequest(currentStory, branchName, commitSha);
    }

    currentStory = this.stateMachine.transition(currentStory, StoryState.PR_OPEN);
    this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(currentStory, null, 2));
    this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);

    const duration = Date.now() - startTime;

    return {
      storyId: story.id,
      gitBranch: branchName,
      prUrl: prUrl || undefined,
      commitShas: commitSha ? [commitSha] : [],
      testResults: { passed: 1, failed: 0, skipped: 0 },
      duration,
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Reload story from workspace JSON if it exists, otherwise return current.
   */
  private reloadStory(ws: ReturnType<WorkspaceManager['createWorkspace']>, storyId: string, fallback: Story): Story {
    try {
      const raw = this.workspaceMgr.readFile(ws, 'story.json');
      return JSON.parse(raw) as Story;
    } catch {
      return fallback;
    }
  }

  private updateLedger(story: Story, agent: AgentPersona): void {
    try {
      this.ledger.updateState(this.config.projectId, story.id, story.state, agent);
    } catch {
      // Non-fatal: ledger update errors should not abort the pipeline
    }
  }

  private markBlocked(story: Story, err: unknown): void {
    try {
      this.ledger.updateState(
        this.config.projectId,
        story.id,
        story.state,
        AgentPersona.ORCHESTRATOR
      );
    } catch {
      // ignore
    }

    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Splinty] Story ${story.id} BLOCKED: ${msg}`);
  }

  private makeFailedResult(story: Story, err: unknown): AppBuilderResult {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      storyId: story.id,
      gitBranch: `story/${story.id}`,
      prUrl: undefined,
      commitShas: [],
      testResults: { passed: 0, failed: 1, skipped: 0 },
      duration: 0,
    };
  }
}
