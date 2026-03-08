import {
  AgentPersona,
  StoryState,
  ArchitecturePlanManager,
  TelemetryRetentionManager,
  ProjectMemoryManager,
  StoryManifestWriter,
  ProjectContextBuilder,
  RetrievalTracker,
  topologicalSortStories,
  detectFileConflicts,
  DefaultHumanGate,
  SprintCheckpointManager,
  LedgerManager,
  HandoffManager,
  ResumeManager,
  WorkspaceManager,
  StoryStateMachine,
  TaskDecomposer,
  buildEvidenceSummary,
  classifyRevisionLevel,
  type LlmClient,
  type Story,
  type HandoffDocument,
  type AppBuilderResult,
  type StoryMetrics,
  type SprintTelemetry,
  type AgentConfig,
  type ArchitecturePlan,
  type HumanGate,
  type GateConfig,
  type PlanRevisionTrigger,
  type PlannedSprintState,
  type ResumePoint,
  type SandboxEnvironment,
  type SandboxConfig,
  type SprintCheckpoint,
  type WorkspaceState,
  type ArchitectureEnforcer,
  type StoryManifest,
  type ProjectContext,
  type ArtifactEntry,
  type PipelineConfig,
  type StoryContext,
  type ServiceDefinition,
  type ServiceGuardrails,
  type ServiceApprovalGate,
  type RetentionConfig,
  ServiceCountGuard,
  SprintTaskPlanSchema,
} from '@splinty/core';
import * as path from 'path';
import { ArchitecturePlannerAgent } from './architecture-planner';
import {
  BusinessOwnerAgent,
  ProductOwnerAgent,
  ArchitectAgent,
  DeveloperAgent,
  SoundEngineerAgent,
  QAEngineerAgent,
  TechnicalWriterAgent,
  AgentCallError,
} from './index';

const isArchitecturePlan = (value: unknown): value is import('@splinty/core').ArchitecturePlan => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['planId'] === 'string' &&
    typeof candidate['projectId'] === 'string' &&
    typeof candidate['scopeKey'] === 'string' &&
    (candidate['level'] === 'global' || candidate['level'] === 'sprint') &&
    Array.isArray(candidate['modules']) &&
    Array.isArray(candidate['constraints']) &&
    Array.isArray(candidate['storyModuleMapping']) &&
    Array.isArray(candidate['executionOrder'])
  );
};

const isImplementationTask = (value: unknown): value is import('@splinty/core').ImplementationTask => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['taskId'] === 'string' &&
    Array.isArray(candidate['storyIds']) &&
    typeof candidate['module'] === 'string' &&
    Array.isArray(candidate['targetFiles']) &&
    Array.isArray(candidate['ownedFiles']) &&
    Array.isArray(candidate['dependencies']) &&
    Array.isArray(candidate['inputs']) &&
    Array.isArray(candidate['expectedOutputs']) &&
    Array.isArray(candidate['acceptanceCriteria'])
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  projectId: string;
  /** Pipeline execution mode. 'story' = existing per-story pipeline. 'planned-sprint' = architecture-first multi-story pipeline. */
  executionMode?: 'story' | 'planned-sprint';
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
  /**
   * Override the model used by all agents (unless a per-persona override is set).
   * Useful when switching providers — e.g. GitHub Copilot uses 'gpt-4o' instead
   * of Anthropic model strings like 'claude-3-5-sonnet-20241022'.
   */
  defaultModel?: string;
  /**
   * Override the model used by lightweight agents (currently QA_ENGINEER).
   * Defaults to the same as defaultModel when set, or the built-in default.
   */
  lightModel?: string;
  /** Injectable git factory — forwarded to DeveloperAgent */
  gitFactory?: Parameters<DeveloperAgent['setGitFactory']>[0];
  /** Injectable GitHub PR creator — called after QA PASS */
  createPullRequest?: (
    story: Story,
    branchName: string,
    commitSha: string
  ) => Promise<string>;
  /** Optional sandbox for compile→test loop in DeveloperAgent */
  sandbox?: SandboxEnvironment;
  /** Config for sandbox initialization (image, limits, etc.) */
  sandboxConfig?: SandboxConfig;
  /** Optional architecture enforcer for plan-based validation in planned-sprint mode */
  enforcer?: ArchitectureEnforcer;
  pipeline?: PipelineConfig;
  /** Guardrails for multi-service architecture proposals */
  serviceGuardrails?: ServiceGuardrails;
  /** Injectable gate for service count approval (defaults to auto-reject when requireHumanApproval is false, otherwise throws) */
  serviceApprovalGate?: ServiceApprovalGate;
  humanGate?: HumanGate;
  gates?: GateConfig[];
  telemetryRetention?: RetentionConfig;
}

type RevisionPlanner = Pick<ArchitecturePlannerAgent, 'reviseSprint'>;
type RevisionDecomposer = Pick<TaskDecomposer, 'decompose'>;

interface ExecuteRevisionLoopOptions {
  state: PlannedSprintState;
  trigger: PlanRevisionTrigger;
  planner: RevisionPlanner;
  decomposer: RevisionDecomposer;
  stories: Story[];
  humanGate: HumanGate;
  globalPlan: ArchitecturePlan;
}

class StoryMetricsCollector {
  private startTime = Date.now();
  private llmCalls = 0;
  private sandboxRuns = 0;
  private reworkCycles = 0;
  private revisionContributions = 0;
  private agentDurationsMs: Record<string, number> = {};
  private agentStartTime: number | null = null;
  private lastAgent: string | null = null;

  startAgent(agent: string): void {
    if (this.lastAgent && this.agentStartTime !== null) {
      this.endAgent(this.lastAgent);
    }
    this.lastAgent = agent;
    this.agentStartTime = Date.now();
  }

  endAgent(agent: string): void {
    if (this.lastAgent !== agent || this.agentStartTime === null) {
      return;
    }
    const elapsed = Math.max(0, Date.now() - this.agentStartTime);
    this.agentDurationsMs[agent] = (this.agentDurationsMs[agent] ?? 0) + elapsed;
    this.agentStartTime = null;
    this.lastAgent = null;
  }

  recordLlmCall(): void {
    this.llmCalls += 1;
  }

  recordSandboxRun(): void {
    this.sandboxRuns += 1;
  }

  recordRework(): void {
    this.reworkCycles += 1;
  }

  recordRevision(): void {
    this.revisionContributions += 1;
  }

  build(storyId: string): StoryMetrics {
    if (this.lastAgent) {
      this.endAgent(this.lastAgent);
    }
    return {
      storyId,
      totalDurationMs: Math.max(0, Date.now() - this.startTime),
      llmCalls: this.llmCalls,
      totalTokens: { input: 0, output: 0 },
      sandboxRuns: this.sandboxRuns,
      reworkCycles: this.reworkCycles,
      revisionContributions: this.revisionContributions,
      costEstimateUsd: 0,
      agentDurationsMs: { ...this.agentDurationsMs },
      traceId: `${storyId}-${Date.now()}`,
    };
  }
}

export class GateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GateRejectedError';
  }
}

export async function executeRevisionLoop(options: ExecuteRevisionLoopOptions): Promise<PlannedSprintState> {
  const {
    state,
    trigger,
    planner,
    decomposer,
    stories,
    humanGate,
    globalPlan,
  } = options;

  const revisionLevel = classifyRevisionLevel(trigger, trigger.evidence);
  if (revisionLevel === 'global') {
    const approved = await humanGate.requestApproval(trigger);
    if (!approved) {
      return state;
    }
  }

  if (revisionLevel === 'sprint' && state.revisionCount >= state.maxRevisions) {
    const approved = await humanGate.requestApproval(trigger);
    if (!approved) {
      return state;
    }
  }

  const evidence = buildEvidenceSummary(trigger, []);
  const revision = await planner.reviseSprint({
    trigger,
    evidence,
    currentSprintPlan: state.currentSprintPlan,
    globalPlan,
    stories,
  });
  const taskPlan = decomposer.decompose(revision.revisedPlan, stories);

  const nextRevisionCount = state.revisionCount + 1;
  const nextStoryRevisionCounts = { ...state.storyRevisionCounts };
  for (const story of stories) {
    nextStoryRevisionCounts[story.id] = (nextStoryRevisionCounts[story.id] ?? 0) + 1;
  }

  return {
    ...state,
    currentSprintPlan: revision.revisedPlan,
    taskPlan,
    revisionCount: nextRevisionCount,
    storyRevisionCounts: nextStoryRevisionCounts,
  };
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

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_LIGHT_MODEL = 'claude-3-haiku-20240307';

const defaultPipeline: PipelineConfig = {
  steps: [
    { agent: AgentPersona.BUSINESS_OWNER },
    { agent: AgentPersona.PRODUCT_OWNER },
    { agent: AgentPersona.ARCHITECT },
    {
      agent: AgentPersona.SOUND_ENGINEER,
      condition: (ctx) => ctx.requiresAudio,
    },
    { agent: AgentPersona.DEVELOPER, retries: 3 },
    { agent: AgentPersona.QA_ENGINEER, retries: 3 },
    { agent: AgentPersona.TECHNICAL_WRITER },
  ],
};

function buildAgentConfigs(
  model: string = DEFAULT_MODEL,
  lightModel: string = DEFAULT_LIGHT_MODEL,
): Record<AgentPersona, AgentConfig> {
  return {
    [AgentPersona.BUSINESS_OWNER]: makeConfig(AgentPersona.BUSINESS_OWNER, model),
    [AgentPersona.PRODUCT_OWNER]: makeConfig(AgentPersona.PRODUCT_OWNER, model),
    [AgentPersona.ARCHITECT]: makeConfig(AgentPersona.ARCHITECT, model),
    [AgentPersona.DEVELOPER]: makeConfig(AgentPersona.DEVELOPER, model),
    [AgentPersona.SOUND_ENGINEER]: makeConfig(AgentPersona.SOUND_ENGINEER, model),
    [AgentPersona.MIGRATION_ENGINEER]: makeConfig(AgentPersona.MIGRATION_ENGINEER, model),
    [AgentPersona.INFRASTRUCTURE_ENGINEER]: makeConfig(AgentPersona.INFRASTRUCTURE_ENGINEER, model),
    [AgentPersona.INTEGRATION_TEST_ENGINEER]: makeConfig(AgentPersona.INTEGRATION_TEST_ENGINEER, model),
    [AgentPersona.QA_ENGINEER]: makeConfig(AgentPersona.QA_ENGINEER, lightModel),
    [AgentPersona.TECHNICAL_WRITER]: makeConfig(AgentPersona.TECHNICAL_WRITER, model),
    [AgentPersona.ARCHITECTURE_PLANNER]: makeConfig(AgentPersona.ARCHITECTURE_PLANNER, model),
    [AgentPersona.ORCHESTRATOR]: makeConfig(AgentPersona.ORCHESTRATOR, model),
  };
}

// ─── SprintOrchestrator ───────────────────────────────────────────────────────

export class SprintOrchestrator {
  private readonly config: OrchestratorConfig;
  private readonly ledger: LedgerManager;
  private readonly handoffMgr: HandoffManager;
  private readonly workspaceMgr: WorkspaceManager;
  private readonly resumeMgr: ResumeManager;
  private readonly architecturePlanMgr: ArchitecturePlanManager;
  private readonly checkpointMgr: SprintCheckpointManager;
  private readonly stateMachine: StoryStateMachine;
  private readonly projectMemoryMgr: ProjectMemoryManager;
  private readonly manifestWriter: StoryManifestWriter;
  private readonly contextBuilder: ProjectContextBuilder;
  private readonly humanGate: HumanGate;
  private readonly gates: GateConfig[];
  private readonly retrievalTracker: RetrievalTracker = new RetrievalTracker();
  private plannedSprintState: PlannedSprintState | null = null;

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.ledger = new LedgerManager(config.workspaceBaseDir);
    this.handoffMgr = new HandoffManager();
    this.workspaceMgr = new WorkspaceManager(config.workspaceBaseDir ?? '.splinty');
    this.resumeMgr = new ResumeManager(this.workspaceMgr);
    this.architecturePlanMgr = new ArchitecturePlanManager(this.workspaceMgr);
    this.checkpointMgr = new SprintCheckpointManager(this.workspaceMgr);
    this.stateMachine = new StoryStateMachine();
    this.projectMemoryMgr = new ProjectMemoryManager(this.workspaceMgr);
    this.manifestWriter = new StoryManifestWriter(this.workspaceMgr);
    this.contextBuilder = new ProjectContextBuilder(this.workspaceMgr, this.projectMemoryMgr);
    this.humanGate = config.humanGate ?? new DefaultHumanGate();
    this.gates = config.gates ?? [];
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

    if (this.config.executionMode === 'planned-sprint') {
      return this.runPlannedSprint(stories);
    }

    const sortedStories = topologicalSortStories(stories);
    this.workspaceMgr.createProjectWorkspace(this.config.projectId);

    const storyFilesMap = new Map<string, string[]>();
    const existingMemory = this.projectMemoryMgr.load(this.config.projectId);
    if (existingMemory) {
      for (const story of sortedStories) {
        const ownedFiles = existingMemory.fileIndex
          .filter((entry) => entry.createdBy === story.id || entry.lastModifiedBy === story.id)
          .map((entry) => entry.path);
        if (ownedFiles.length > 0) {
          storyFilesMap.set(story.id, ownedFiles);
        }
      }
    }
    const conflicts = detectFileConflicts(sortedStories, storyFilesMap);
    for (const [filePath, storyIds] of conflicts.entries()) {
      console.warn(`[Splinty] File conflict: ${filePath} claimed by ${storyIds.join(', ')}`);
    }

    const results: AppBuilderResult[] = [];
    for (const story of sortedStories) {
      const collector = new StoryMetricsCollector();
      try {
        results.push(await this.runStory(story, collector));
      } catch (err) {
        this.markBlocked(story, err);
        results.push(this.makeFailedResult(story, err, collector));
      }
    }

    for (const story of sortedStories) {
      const missedFiles = this.retrievalTracker.computeMissedFiles(story.id);
      if (missedFiles.length > 0) {
        console.warn(`[Splinty] Story ${story.id}: ${missedFiles.length} file(s) not retrieved by developer`);
      }
    }

    return results;
  }

  private async runPlannedSprint(stories: Story[]): Promise<AppBuilderResult[]> {
    const sprintStart = Date.now();
    const sprintStartedAt = new Date(sprintStart).toISOString();
    const sprintWs = this.workspaceMgr.createWorkspace(this.config.projectId, 'sprint');
    const agentConfigs = buildAgentConfigs(this.config.defaultModel, this.config.lightModel);
    const clientFor = (persona: AgentPersona): LlmClient | undefined =>
      this.config.clients?.[persona] ?? this.config.defaultClient;
    const storyCollectors = new Map<string, StoryMetricsCollector>();
    const getCollector = (storyId: string): StoryMetricsCollector => {
      const existing = storyCollectors.get(storyId);
      if (existing) {
        return existing;
      }
      const created = new StoryMetricsCollector();
      storyCollectors.set(storyId, created);
      return created;
    };

    for (const story of stories) {
      this.ledger.upsertStory(this.config.projectId, story);
    }

    const currentStories = new Map<string, Story>(stories.map((story) => [story.id, story]));
    const latestHandoffs = new Map<string, HandoffDocument>();
    const completedStoryIds = new Set<string>();
    const blockedStoryIds = new Set<string>();

    let state: PlannedSprintState;
    const checkpoint = this.loadCheckpoint(sprintWs);

    if (checkpoint) {
      const sprintPlan = this.architecturePlanMgr.load(sprintWs, checkpoint.activeSprintPlanId);
      if (!sprintPlan) {
        throw new Error(`Sprint architecture plan not found: ${checkpoint.activeSprintPlanId}`);
      }

      let taskPlan = sprintPlan
        ? this.readSprintTaskPlan(sprintWs)
        : null;

      if (!taskPlan) {
        taskPlan = {
          sprintId: checkpoint.sprintId,
          planId: sprintPlan.planId,
          parentGlobalPlanId: checkpoint.activeGlobalPlanId,
          schemaVersion: 1,
          tasks: [],
          schedule: checkpoint.remainingTaskSchedule,
          integrationTasks: [],
        };
      }

      state = {
        currentSprintPlan: sprintPlan,
        currentGlobalPlanId: checkpoint.activeGlobalPlanId,
        taskPlan,
        revisionCount: checkpoint.revisionCount,
        maxRevisions: 1,
        storyRevisionCounts: Object.fromEntries(stories.map((story) => [story.id, 0])),
        maxRevisionsPerStory: 1,
        checkpoint,
      };
    } else {
      const biz = new BusinessOwnerAgent(
        agentConfigs[AgentPersona.BUSINESS_OWNER]!,
        this.workspaceMgr,
        this.handoffMgr,
        clientFor(AgentPersona.BUSINESS_OWNER)
      );
      const po = new ProductOwnerAgent(
        agentConfigs[AgentPersona.PRODUCT_OWNER]!,
        this.workspaceMgr,
        this.handoffMgr,
        clientFor(AgentPersona.PRODUCT_OWNER)
      );

      const refinedStories: Story[] = [];
      const storyHandoffs = new Map<string, HandoffDocument>();

      for (const story of stories) {
        const ws = this.workspaceMgr.createWorkspace(this.config.projectId, story.id);
        biz.setWorkspace(ws);
        po.setWorkspace(ws);

        let currentStory = story;
        let handoff: HandoffDocument | null = null;
        const collector = getCollector(story.id);

        collector.startAgent(AgentPersona.BUSINESS_OWNER);
        collector.recordLlmCall();
        try {
          handoff = await biz.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.BUSINESS_OWNER);
        }
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.BUSINESS_OWNER);

        collector.startAgent(AgentPersona.PRODUCT_OWNER);
        collector.recordLlmCall();
        try {
          handoff = await po.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.PRODUCT_OWNER);
        }
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.PRODUCT_OWNER);

        currentStory = this.stateMachine.transition(currentStory, StoryState.REFINED);
        this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
        currentStory = this.stateMachine.transition(currentStory, StoryState.SPRINT_READY);
        this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
        this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(currentStory, null, 2));

        refinedStories.push(currentStory);
        if (handoff) {
          storyHandoffs.set(story.id, handoff);
        }
        currentStories.set(story.id, currentStory);
      }

      const planner = new ArchitecturePlannerAgent(
        agentConfigs[AgentPersona.ARCHITECTURE_PLANNER]!,
        this.workspaceMgr,
        this.handoffMgr,
        clientFor(AgentPersona.ARCHITECTURE_PLANNER)
      );
      planner.setWorkspace(sprintWs);
      const sprintId = `sprint-${Date.now()}`;
      const planResult = await planner.planSprint({
        stories: refinedStories,
        projectId: this.config.projectId,
        sprintId,
      });

      if (this.config.serviceGuardrails) {
        const guard = new ServiceCountGuard(
          this.config.serviceGuardrails,
          this.config.serviceApprovalGate ?? { requestServiceApproval: async () => false }
        );
        const approved = await guard.enforce(planResult.sprintPlan, this.config.projectId);
        if (!approved) {
          throw new Error(
            `Service count guardrail rejected: plan proposes too many services for project ${this.config.projectId}`
          );
        }
      }

      const decomposer = new TaskDecomposer();
      const taskPlan = decomposer.decompose(planResult.sprintPlan, refinedStories);
      this.workspaceMgr.writeFile(
        sprintWs,
        'artifacts/sprint-task-plan.json',
        JSON.stringify(taskPlan, null, 2)
      );

      const artifactNow = new Date().toISOString();
      this.projectMemoryMgr.addArtifactEntry(this.config.projectId, {
        type: 'sprint-architecture-plan',
        id: planResult.sprintPlan.planId,
        path: `artifacts/sprint-plan-${planResult.sprintPlan.planId}.json`,
        createdAt: artifactNow,
        planLevel: 'sprint',
        scopeKey: planResult.sprintPlan.scopeKey,
        sprintId,
        relatedStories: refinedStories.map((s) => s.id),
      });
      this.projectMemoryMgr.addArtifactEntry(this.config.projectId, {
        type: 'sprint-task-plan',
        id: taskPlan.planId,
        path: 'artifacts/sprint-task-plan.json',
        createdAt: artifactNow,
        sprintId,
        relatedStories: refinedStories.map((s) => s.id),
      });

      state = {
        currentSprintPlan: planResult.sprintPlan,
        currentGlobalPlanId: planResult.globalPlan.planId,
        taskPlan,
        revisionCount: 0,
        maxRevisions: 1,
        storyRevisionCounts: Object.fromEntries(refinedStories.map((story) => [story.id, 0])),
        maxRevisionsPerStory: 1,
      };

      this.plannedSprintState = state;
      for (const [storyId, handoff] of storyHandoffs.entries()) {
        latestHandoffs.set(storyId, handoff);
      }
    }

    this.plannedSprintState = state;

    const completedTaskIds = new Set<string>(state.checkpoint?.completedTaskIds ?? []);
    const blockedTaskIds = new Set<string>(state.checkpoint?.blockedTaskIds ?? []);
    for (const task of state.taskPlan.tasks) {
      if (completedTaskIds.has(task.taskId)) {
        for (const storyId of task.storyIds) completedStoryIds.add(storyId);
      }
      if (blockedTaskIds.has(task.taskId)) {
        for (const storyId of task.storyIds) blockedStoryIds.add(storyId);
      }
    }
    const scheduleGroups = [...state.taskPlan.schedule.groups].sort((a, b) => a.groupId - b.groupId);
    const resumeGroupId = state.checkpoint?.lastCompletedGroupId;
    const groupsToRun = resumeGroupId
      ? scheduleGroups.filter((group) => group.groupId > resumeGroupId)
      : scheduleGroups;

    for (const group of groupsToRun) {
      for (const taskId of group.taskIds) {
        if (completedTaskIds.has(taskId) || blockedTaskIds.has(taskId)) {
          continue;
        }

        const task = state.taskPlan.tasks.find((candidate) => candidate.taskId === taskId);
        if (!task) {
          continue;
        }

        const primaryStoryId = task.storyIds.find((id) => currentStories.has(id));
        if (!primaryStoryId) {
          blockedTaskIds.add(task.taskId);
          continue;
        }

        const baseStory = currentStories.get(primaryStoryId)!;
        const ws = this.workspaceMgr.createWorkspace(this.config.projectId, primaryStoryId);
        const dev = new DeveloperAgent(
          agentConfigs[AgentPersona.DEVELOPER]!,
          this.workspaceMgr,
          this.handoffMgr,
          clientFor(AgentPersona.DEVELOPER)
        );
        dev.setWorkspace(ws);
        if (this.config.gitFactory) dev.setGitFactory(this.config.gitFactory);
        if (this.config.sandbox) dev.setSandbox(this.config.sandbox, this.config.sandboxConfig);
        if (this.config.enforcer) dev.setEnforcer(this.config.enforcer, state.currentSprintPlan, task);

        const qa = new QAEngineerAgent(
          agentConfigs[AgentPersona.QA_ENGINEER]!,
          this.workspaceMgr,
          this.handoffMgr,
          clientFor(AgentPersona.QA_ENGINEER)
        );
        qa.setWorkspace(ws);

        const handoff: HandoffDocument = {
          ...this.handoffMgr.create(
            AgentPersona.ORCHESTRATOR,
            AgentPersona.DEVELOPER,
            primaryStoryId,
            'ready',
            {
              techStack: `${state.currentSprintPlan.techStack.language}, ${state.currentSprintPlan.techStack.runtime}, ${state.currentSprintPlan.techStack.framework}`,
              taskId: task.taskId,
              taskModule: task.module,
              taskStoryIds: task.storyIds.join(','),
            },
            `Implement task ${task.taskId}`,
            []
          ),
          architecturePlan: {
            planId: state.currentSprintPlan.planId,
            level: state.currentSprintPlan.level,
            scopeKey: state.currentSprintPlan.scopeKey,
          },
          task: {
            taskId: task.taskId,
            module: task.module,
            type: task.type,
          },
        };

        const projectCtx: ProjectContext | null = this.contextBuilder.build(this.config.projectId, primaryStoryId, []);
        const handoffWithCtx: HandoffDocument = projectCtx
          ? { ...handoff, projectContext: projectCtx }
          : handoff;

        let qaAttempts = 0;
        let taskPassed = false;
        let nextDevInput: HandoffDocument | null = handoffWithCtx;
        const collector = getCollector(primaryStoryId);

        while (qaAttempts < 3) {
          const storyForDev = {
            ...baseStory,
            state: StoryState.IN_PROGRESS,
            updatedAt: new Date().toISOString(),
          };
          collector.startAgent(AgentPersona.DEVELOPER);
          collector.recordLlmCall();
          const devHandoff = await dev.execute(nextDevInput, storyForDev);
          collector.endAgent(AgentPersona.DEVELOPER);
          const devArtifactNow = new Date().toISOString();
          if (devHandoff.stateOfWorld['enforcementReport']) {
            this.projectMemoryMgr.addArtifactEntry(this.config.projectId, {
              type: 'enforcement-report',
              id: `${task.taskId}-enforcement-${devArtifactNow}`,
              path: `artifacts/enforcement-${task.taskId}.json`,
              createdAt: devArtifactNow,
              relatedStories: task.storyIds,
            });
          }
          if (devHandoff.stateOfWorld['sandboxTestResult']) {
            collector.recordSandboxRun();
            this.projectMemoryMgr.addArtifactEntry(this.config.projectId, {
              type: 'sandbox-result',
              id: `${task.taskId}-sandbox-${devArtifactNow}`,
              path: `artifacts/sandbox-${task.taskId}.json`,
              createdAt: devArtifactNow,
              relatedStories: task.storyIds,
            });
          }
          let qaStory = this.reloadStory(ws, primaryStoryId, storyForDev);
          if (qaStory.state !== StoryState.IN_REVIEW) {
            qaStory = {
              ...qaStory,
              state: StoryState.IN_REVIEW,
            };
          }

          collector.startAgent(AgentPersona.QA_ENGINEER);
          collector.recordLlmCall();
          const qaHandoff = await qa.execute(devHandoff, qaStory);
          collector.endAgent(AgentPersona.QA_ENGINEER);
          latestHandoffs.set(primaryStoryId, qaHandoff);
          currentStories.set(primaryStoryId, this.reloadStory(ws, primaryStoryId, qaStory));

          const verdict = qaHandoff.stateOfWorld['verdict'];
          if (verdict === 'PASS') {
            completedTaskIds.add(task.taskId);
            taskPassed = true;
            for (const storyId of task.storyIds) {
              completedStoryIds.add(storyId);
              latestHandoffs.set(storyId, qaHandoff);
            }
            break;
          }

          if (verdict === 'BLOCKED') {
            blockedTaskIds.add(task.taskId);
            for (const storyId of task.storyIds) {
              blockedStoryIds.add(storyId);
            }
            break;
          }

          qaAttempts += 1;
          collector.recordRework();
          nextDevInput = qaHandoff;
        }

        if (!taskPassed && !blockedTaskIds.has(task.taskId)) {
          blockedTaskIds.add(task.taskId);
          for (const storyId of task.storyIds) {
            blockedStoryIds.add(storyId);
          }
        }
      }

      const remainingGroups = scheduleGroups.filter((candidate) => candidate.groupId > group.groupId);
      const checkpointState: PlannedSprintState = {
        ...state,
        checkpoint: {
          checkpointId: state.checkpoint?.checkpointId ??
            (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
              ? crypto.randomUUID()
              : `checkpoint-${Date.now()}`),
          sprintId: state.taskPlan.sprintId,
          runId: state.checkpoint?.runId ?? `${sprintWs.projectId}-${sprintWs.storyId}-${Date.now()}`,
          activeSprintPlanId: state.currentSprintPlan.planId,
          activeGlobalPlanId: state.currentGlobalPlanId,
          revisionCount: state.revisionCount,
          completedTaskIds: [...completedTaskIds],
          blockedTaskIds: [...blockedTaskIds],
          remainingTaskSchedule: { groups: remainingGroups },
          lastCompletedGroupId: group.groupId,
          createdAt: state.checkpoint?.createdAt ?? new Date().toISOString(),
        },
      };
      this.saveCheckpoint(sprintWs, checkpointState);
      state = checkpointState;
    }

    const techWriter = new TechnicalWriterAgent(
      agentConfigs[AgentPersona.TECHNICAL_WRITER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.TECHNICAL_WRITER)
    );

    const results: AppBuilderResult[] = [];
    for (const original of stories) {
      const currentStory = currentStories.get(original.id) ?? original;
      const hasCompletedTask = completedStoryIds.has(original.id);

      if (!hasCompletedTask) {
        const metrics = getCollector(original.id).build(original.id);
        results.push({
          storyId: original.id,
          gitBranch: `story/${original.id}`,
          prUrl: undefined,
          commitShas: [],
          testResults: { passed: 0, failed: 1, skipped: 0 },
          duration: Date.now() - sprintStart,
          metrics,
        });
        continue;
      }

      const ws = this.workspaceMgr.createWorkspace(this.config.projectId, original.id);
      techWriter.setWorkspace(ws);
      const writerInput = latestHandoffs.get(original.id) ?? this.handoffMgr.create(
        AgentPersona.ORCHESTRATOR,
        AgentPersona.TECHNICAL_WRITER,
        original.id,
        'ready',
        {},
        'Write README and docs',
        []
      );

      const collector = getCollector(original.id);
      collector.startAgent(AgentPersona.TECHNICAL_WRITER);
      collector.recordLlmCall();
      const writerHandoff = await techWriter.execute(writerInput, currentStory);
      collector.endAgent(AgentPersona.TECHNICAL_WRITER);
      latestHandoffs.set(original.id, writerHandoff);
      this.updateLedger(currentStory, AgentPersona.TECHNICAL_WRITER);

      const branchName = writerHandoff.stateOfWorld['branchName'] ?? `story/${original.id}`;
      const commitSha = writerHandoff.stateOfWorld['commitSha'] ?? '';
      let prUrl = '';
      if (this.config.createPullRequest) {
        prUrl = await this.config.createPullRequest(currentStory, branchName, commitSha);
      }

      let nextStory = this.reloadStory(ws, original.id, currentStory);
      if (nextStory.state !== StoryState.DONE) {
        nextStory = { ...nextStory, state: StoryState.DONE, updatedAt: new Date().toISOString() };
      }
      nextStory = this.stateMachine.transition(nextStory, StoryState.PR_OPEN);
      this.writeStoryManifest(ws, nextStory, latestHandoffs.get(original.id) ?? null);
      this.promoteAndUpdateMemory(nextStory, ws);
      this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(nextStory, null, 2));
      this.updateLedger(nextStory, AgentPersona.ORCHESTRATOR);
      currentStories.set(original.id, nextStory);

      const metrics = collector.build(original.id);
      results.push({
        storyId: original.id,
        gitBranch: branchName,
        prUrl: prUrl || undefined,
        commitShas: commitSha ? [commitSha] : [],
        testResults: {
          passed: blockedStoryIds.has(original.id) ? 0 : 1,
          failed: blockedStoryIds.has(original.id) ? 1 : 0,
          skipped: 0,
        },
        duration: Date.now() - sprintStart,
        metrics,
      });
    }

    const completedAt = new Date().toISOString();
    const runId = state.checkpoint?.runId ?? `${this.config.projectId}-${state.taskPlan.sprintId}-${sprintStart}`;
    const sprintStoryMetrics = results
      .map((result) => result.metrics)
      .filter((metric): metric is StoryMetrics => metric !== undefined);
    const sprintTelemetry: SprintTelemetry = {
      sprintId: state.taskPlan.sprintId,
      runId,
      startedAt: sprintStartedAt,
      completedAt,
      stories: sprintStoryMetrics,
      totalDurationMs: Math.max(0, Date.now() - sprintStart),
      totalLlmCalls: sprintStoryMetrics.reduce((sum, metric) => sum + metric.llmCalls, 0),
      totalCostEstimateUsd: sprintStoryMetrics.reduce((sum, metric) => sum + metric.costEstimateUsd, 0),
    };
    const telemetryTimestamp = Date.now();
    const telemetryPath = `artifacts/telemetry/sprint-${state.taskPlan.sprintId}-${telemetryTimestamp}.json`;
    this.workspaceMgr.writeFile(sprintWs, telemetryPath, JSON.stringify(sprintTelemetry, null, 2));
    this.projectMemoryMgr.addArtifactEntry(this.config.projectId, {
      type: 'run-telemetry',
      id: `${state.taskPlan.sprintId}-${telemetryTimestamp}`,
      path: telemetryPath,
      createdAt: completedAt,
      sprintId: state.taskPlan.sprintId,
      relatedStories: stories.map((story) => story.id),
    });
    const telemetryDir = path.join(sprintWs.basePath, 'artifacts', 'telemetry');
    await new TelemetryRetentionManager(this.config.telemetryRetention).enforce(telemetryDir);

    if (blockedTaskIds.size === 0) {
      this.checkpointMgr.clear(sprintWs);
    }
    return results;
  }

  // ── Per-story pipeline ─────────────────────────────────────────────────────

  private async runStory(story: Story, collectorParam?: StoryMetricsCollector): Promise<AppBuilderResult> {
    const collector = collectorParam ?? new StoryMetricsCollector();
    const startTime = Date.now();

    // Create (or reuse) workspace for this story
    const ws = this.workspaceMgr.createWorkspace(this.config.projectId, story.id);

    // Register story in ledger
    this.ledger.upsertStory(this.config.projectId, story);

    let currentStory = story;
    let handoff: HandoffDocument | null = null;
    let startStep = 0;

    const resume = this.resumeMgr.load(ws);
    if (resume && resume.storyId === story.id && resume.projectId === this.config.projectId) {
      currentStory = resume.storySnapshot;
      handoff = resume.handoff;
      startStep = resume.pipelineStep + 1;
    }

    const agentConfigs = buildAgentConfigs(this.config.defaultModel, this.config.lightModel);

    const clientFor = (persona: AgentPersona): LlmClient | undefined =>
      this.config.clients?.[persona] ?? this.config.defaultClient;

    const biz = new BusinessOwnerAgent(
      agentConfigs[AgentPersona.BUSINESS_OWNER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.BUSINESS_OWNER)
    );
    biz.setWorkspace(ws);

    const po = new ProductOwnerAgent(
      agentConfigs[AgentPersona.PRODUCT_OWNER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.PRODUCT_OWNER)
    );
    po.setWorkspace(ws);

    const architect = new ArchitectAgent(
      agentConfigs[AgentPersona.ARCHITECT]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.ARCHITECT)
    );
    architect.setWorkspace(ws);

    const dev = new DeveloperAgent(
      agentConfigs[AgentPersona.DEVELOPER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.DEVELOPER)
    );
    dev.setWorkspace(ws);
    if (this.config.gitFactory) dev.setGitFactory(this.config.gitFactory);
    if (this.config.sandbox) dev.setSandbox(this.config.sandbox, this.config.sandboxConfig);

    const soundEng = new SoundEngineerAgent(
      agentConfigs[AgentPersona.SOUND_ENGINEER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.SOUND_ENGINEER)
    );
    soundEng.setWorkspace(ws);

    const qa = new QAEngineerAgent(
      agentConfigs[AgentPersona.QA_ENGINEER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.QA_ENGINEER)
    );
    qa.setWorkspace(ws);

    const techWriter = new TechnicalWriterAgent(
      agentConfigs[AgentPersona.TECHNICAL_WRITER]!,
      this.workspaceMgr,
      this.handoffMgr,
      clientFor(AgentPersona.TECHNICAL_WRITER)
    );
    techWriter.setWorkspace(ws);

    const pipeline = this.config.pipeline ?? defaultPipeline;
    const developerStepRetries = pipeline.steps.find((step) => step.agent === AgentPersona.DEVELOPER)?.retries;

    const applyOrchestratorTransitions = (): void => {
      if (currentStory.state === StoryState.USER_STORY) {
        currentStory = this.stateMachine.transition(currentStory, StoryState.REFINED);
        this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
      }
      if (currentStory.state === StoryState.REFINED) {
        currentStory = this.stateMachine.transition(currentStory, StoryState.SPRINT_READY);
        this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
        this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(currentStory, null, 2));
      }
    };

    for (let stepIndex = 0; stepIndex < pipeline.steps.length; stepIndex++) {
      if (stepIndex < startStep) {
        continue;
      }

      const step = pipeline.steps[stepIndex]!;
      const context: StoryContext = {
        story: currentStory,
        handoff,
        requiresAudio: handoff?.stateOfWorld['soundEngineerRequired'] === 'true',
      };

      if (step.condition && !step.condition(context)) {
        continue;
      }

      if (step.agent === AgentPersona.BUSINESS_OWNER) {
        collector.startAgent(AgentPersona.BUSINESS_OWNER);
        collector.recordLlmCall();
        try {
          handoff = await biz.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.BUSINESS_OWNER);
        }
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.BUSINESS_OWNER);
        this.saveResumePoint(ws, currentStory, AgentPersona.BUSINESS_OWNER, handoff, stepIndex);
        await this.checkGate(AgentPersona.BUSINESS_OWNER, handoff, currentStory);
        continue;
      }

      if (step.agent === AgentPersona.PRODUCT_OWNER) {
        collector.startAgent(AgentPersona.PRODUCT_OWNER);
        collector.recordLlmCall();
        try {
          handoff = await po.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.PRODUCT_OWNER);
        }
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.PRODUCT_OWNER);
        this.saveResumePoint(ws, currentStory, AgentPersona.PRODUCT_OWNER, handoff, stepIndex);
        await this.checkGate(AgentPersona.PRODUCT_OWNER, handoff, currentStory);
        continue;
      }

      if (step.agent === AgentPersona.ARCHITECT) {
        applyOrchestratorTransitions();
        if (handoff && stepIndex > 0) {
          this.saveResumePoint(ws, currentStory, AgentPersona.ORCHESTRATOR, handoff, stepIndex - 1);
        }
        collector.startAgent(AgentPersona.ARCHITECT);
        collector.recordLlmCall();
        try {
          handoff = await architect.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.ARCHITECT);
        }
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.ARCHITECT);
        this.saveResumePoint(ws, currentStory, AgentPersona.ARCHITECT, handoff, stepIndex);
        await this.checkGate(AgentPersona.ARCHITECT, handoff, currentStory);
        continue;
      }

      if (step.agent === AgentPersona.SOUND_ENGINEER) {
        collector.startAgent(AgentPersona.SOUND_ENGINEER);
        collector.recordLlmCall();
        try {
          handoff = await soundEng.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.SOUND_ENGINEER);
        }
        this.updateLedger(currentStory, AgentPersona.SOUND_ENGINEER);
        this.saveResumePoint(ws, currentStory, AgentPersona.SOUND_ENGINEER, handoff, stepIndex);
        await this.checkGate(AgentPersona.SOUND_ENGINEER, handoff, currentStory);
        continue;
      }

      if (step.agent === AgentPersona.DEVELOPER) {
        if (
          this.config.enforcer &&
          isArchitecturePlan(handoff?.architecturePlan) &&
          isImplementationTask(handoff?.task)
        ) {
          dev.setEnforcer(this.config.enforcer, handoff.architecturePlan, handoff.task);
        }
        const projectCtx: ProjectContext | null = this.contextBuilder.build(
          this.config.projectId,
          currentStory.id,
          currentStory.dependsOn ?? []
        );
        if (handoff && projectCtx) {
          handoff = { ...handoff, projectContext: projectCtx };
        }
        const requestedFiles = handoff?.projectContext?.relevantFiles.map((f) => f.path) ?? [];
        collector.startAgent(AgentPersona.DEVELOPER);
        collector.recordLlmCall();
        try {
          handoff = await dev.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.DEVELOPER);
        }
        if (handoff.stateOfWorld['sandboxTestResult']) {
          collector.recordSandboxRun();
        }
        this.retrievalTracker.record({
          storyId: currentStory.id,
          projectId: this.config.projectId,
          requestedFiles,
          retrievedFiles: (handoff?.stateOfWorld['filesRead'] ?? '').split(',').filter(Boolean),
          timestamp: new Date().toISOString(),
        });
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.DEVELOPER);
        this.saveResumePoint(ws, currentStory, AgentPersona.DEVELOPER, handoff, stepIndex);
        await this.checkGate(AgentPersona.DEVELOPER, handoff, currentStory);
        continue;
      }

      if (step.agent === AgentPersona.QA_ENGINEER) {
        let qaAttempts = 0;
        const maxQaAttempts = step.retries ?? developerStepRetries ?? 3;

        while (qaAttempts < maxQaAttempts) {
          qaAttempts++;
          collector.startAgent(AgentPersona.QA_ENGINEER);
          collector.recordLlmCall();
          try {
            handoff = await qa.execute(handoff, currentStory);
          } finally {
            collector.endAgent(AgentPersona.QA_ENGINEER);
          }
          currentStory = this.reloadStory(ws, story.id, currentStory);

          const verdict = handoff.stateOfWorld['verdict'];

          if (verdict === 'PASS') {
            this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
            this.saveResumePoint(ws, currentStory, AgentPersona.QA_ENGINEER, handoff, stepIndex);
            break;
          }

          if (verdict === 'BLOCKED') {
            this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
            this.saveResumePoint(ws, currentStory, AgentPersona.QA_ENGINEER, handoff, stepIndex);
            throw new Error(`Story ${story.id} QA BLOCKED: ${handoff.stateOfWorld['failedAC'] ?? ''}`);
          }

          this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
          if (
            this.config.enforcer &&
            isArchitecturePlan(handoff?.architecturePlan) &&
            isImplementationTask(handoff?.task)
          ) {
            dev.setEnforcer(this.config.enforcer, handoff.architecturePlan, handoff.task);
          }
          collector.recordRework();
          collector.startAgent(AgentPersona.DEVELOPER);
          collector.recordLlmCall();
          try {
            handoff = await dev.execute(handoff, currentStory);
          } finally {
            collector.endAgent(AgentPersona.DEVELOPER);
          }
          if (handoff.stateOfWorld['sandboxTestResult']) {
            collector.recordSandboxRun();
          }
          currentStory = this.reloadStory(ws, story.id, currentStory);
          this.updateLedger(currentStory, AgentPersona.DEVELOPER);
          const developerStepIndex = pipeline.steps.findIndex((pipelineStep) => pipelineStep.agent === AgentPersona.DEVELOPER);
          this.saveResumePoint(
            ws,
            currentStory,
            AgentPersona.DEVELOPER,
            handoff,
            developerStepIndex >= 0 ? developerStepIndex : stepIndex
          );
        }
        continue;
      }

      if (step.agent === AgentPersona.TECHNICAL_WRITER) {
        collector.startAgent(AgentPersona.TECHNICAL_WRITER);
        collector.recordLlmCall();
        try {
          handoff = await techWriter.execute(handoff, currentStory);
        } finally {
          collector.endAgent(AgentPersona.TECHNICAL_WRITER);
        }
        this.updateLedger(currentStory, AgentPersona.TECHNICAL_WRITER);
        this.saveResumePoint(ws, currentStory, AgentPersona.TECHNICAL_WRITER, handoff, stepIndex);
      }
    }

    // Step 9: DONE → PR_OPEN
    const branchName = handoff?.stateOfWorld['branchName'] ?? `story/${story.id}`;
    const commitSha = handoff?.stateOfWorld['commitSha'] ?? '';

    let prUrl = '';
    if (this.config.createPullRequest) {
      prUrl = await this.config.createPullRequest(currentStory, branchName, commitSha);
    }

    if (startStep <= pipeline.steps.length) {
      currentStory = this.stateMachine.transition(currentStory, StoryState.PR_OPEN);
      this.writeStoryManifest(ws, currentStory, handoff);
      this.promoteAndUpdateMemory(currentStory, ws);
      this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(currentStory, null, 2));
      this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
      if (handoff) {
        this.saveResumePoint(ws, currentStory, AgentPersona.ORCHESTRATOR, handoff, pipeline.steps.length);
      }
    }

    this.resumeMgr.clear(ws);

    const duration = Date.now() - startTime;

    return {
      storyId: story.id,
      gitBranch: branchName,
      prUrl: prUrl || undefined,
      commitShas: commitSha ? [commitSha] : [],
      testResults: { passed: 1, failed: 0, skipped: 0 },
      duration,
      metrics: collector.build(story.id),
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

  private saveResumePoint(
    ws: ReturnType<WorkspaceManager['createWorkspace']>,
    story: Story,
    lastAgent: AgentPersona,
    handoff: HandoffDocument,
    pipelineStep: number,
  ): void {
    try {
      const point: ResumePoint = {
        storyId: story.id,
        projectId: this.config.projectId,
        lastCompletedAgent: lastAgent,
        handoffId: `${story.id}-${lastAgent}-${Date.now()}`,
        handoff,
        storySnapshot: story,
        timestamp: new Date().toISOString(),
        pipelineStep,
      };
      this.resumeMgr.save(ws, point);
    } catch {
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

  private makeFailedResult(story: Story, err: unknown, collector?: StoryMetricsCollector): AppBuilderResult {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      storyId: story.id,
      gitBranch: `story/${story.id}`,
      prUrl: undefined,
      commitShas: [],
      testResults: { passed: 0, failed: 1, skipped: 0 },
      duration: 0,
      metrics: collector?.build(story.id),
    };
  }

  private writeStoryManifest(ws: WorkspaceState, story: Story, handoff: HandoffDocument | null): void {
    try {
      const manifest: StoryManifest = {
        storyId: story.id,
        title: story.title,
        completedAt: new Date().toISOString(),
        filesCreated: handoff?.artifacts ?? [],
        filesModified: [],
        keyExports: [],
        dependencies: story.dependsOn ?? [],
        commands: {
          build: handoff?.stateOfWorld['testCommand'] ?? 'bun test',
          test: handoff?.stateOfWorld['testCommand'] ?? 'bun test',
        },
        testStatus: handoff?.stateOfWorld['verdict'] === 'PASS' ? 'pass' : 'skip',
        architectureDecisions: [],
      };
      this.manifestWriter.write(ws, manifest);
      this.projectMemoryMgr.addStoryManifest(this.config.projectId, manifest);
    } catch {
    }
  }

  private promoteAndUpdateMemory(story: Story, ws: WorkspaceState): void {
    try {
      const promoted = this.workspaceMgr.promoteFiles(this.config.projectId, ws, 'artifacts/src');
      for (const filePath of promoted) {
        this.projectMemoryMgr.addFileEntry(this.config.projectId, {
          path: filePath,
          createdBy: story.id,
          lastModifiedBy: story.id,
          exports: [],
          description: `Promoted from story ${story.id}`,
        });
      }
    } catch {
    }
  }

  private async handleRevisionLoop(
    ws: WorkspaceState,
    state: PlannedSprintState,
    trigger: PlanRevisionTrigger,
    planner: RevisionPlanner,
    decomposer: RevisionDecomposer,
    stories: Story[],
    humanGate: HumanGate = this.humanGate
  ): Promise<PlannedSprintState> {
    const effectiveState = this.plannedSprintState ?? state;
    const globalPlan = this.architecturePlanMgr.load(ws, effectiveState.currentGlobalPlanId);
    if (!globalPlan) {
      throw new Error(`Global architecture plan not found: ${effectiveState.currentGlobalPlanId}`);
    }

    const updatedState = await executeRevisionLoop({
      state: effectiveState,
      trigger,
      planner,
      decomposer,
      stories,
      humanGate,
      globalPlan,
    });

    if (updatedState.revisionCount > effectiveState.revisionCount) {
      this.projectMemoryMgr.addArtifactEntry(this.config.projectId, {
        type: 'revision-trigger',
        id: `revision-${updatedState.revisionCount}-${Date.now()}`,
        path: `artifacts/revision-trigger-${updatedState.revisionCount}.json`,
        createdAt: new Date().toISOString(),
        sprintId: updatedState.taskPlan.sprintId,
        relatedStories: stories.map((s) => s.id),
      });
      this.saveCheckpoint(ws, updatedState);
    }
    this.plannedSprintState = updatedState;
    return updatedState;
  }

  protected async checkGate(
    afterAgent: AgentPersona,
    handoff: HandoffDocument,
    story: Story
  ): Promise<void> {
    const gate = this.gates.find((candidate) => candidate.after === afterAgent);
    if (!gate || gate.requireApproval === 'never') {
      return;
    }

    let needsApproval = false;
    if (gate.requireApproval === 'always') {
      needsApproval = true;
    }

    if (gate.requireApproval === 'on-cross-service') {
      const serviceCount = (handoff.stateOfWorld['services'] ?? '')
        .split(',')
        .map((service) => service.trim())
        .filter((service) => service.length > 0).length;
      needsApproval = serviceCount > 1;
    }

    if (gate.requireApproval === 'on-breaking-change') {
      needsApproval = handoff.stateOfWorld['breakingChange'] === 'true';
    }

    if (!needsApproval) {
      return;
    }

    const approved = await this.humanGate.requestApproval({
      reason: 'human-override',
      description: `Gate check after ${afterAgent} for story ${story.id}`,
      evidence: [
        `gate-after:${afterAgent}`,
        `gate-policy:${gate.requireApproval}`,
      ],
      timestamp: new Date().toISOString(),
    });

    if (!approved) {
      throw new GateRejectedError(`Gate rejected after ${afterAgent} for story ${story.id}`);
    }
  }

  private saveCheckpoint(ws: WorkspaceState, state: PlannedSprintState): void {
    const existing = state.checkpoint;
    const checkpoint: SprintCheckpoint = {
      checkpointId: existing?.checkpointId ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `checkpoint-${Date.now()}`),
      sprintId: state.taskPlan.sprintId,
      runId: existing?.runId ?? `${ws.projectId}-${ws.storyId}-${Date.now()}`,
      activeSprintPlanId: state.currentSprintPlan.planId,
      activeGlobalPlanId: state.currentGlobalPlanId,
      revisionCount: state.revisionCount,
      completedTaskIds: existing?.completedTaskIds ?? [],
      blockedTaskIds: existing?.blockedTaskIds ?? [],
      remainingTaskSchedule: existing?.remainingTaskSchedule ?? state.taskPlan.schedule,
      lastCompletedGroupId: existing?.lastCompletedGroupId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    this.checkpointMgr.save(ws, checkpoint);
    this.projectMemoryMgr.addArtifactEntry(this.config.projectId, {
      type: 'sprint-checkpoint',
      id: checkpoint.checkpointId,
      path: `artifacts/checkpoint-${checkpoint.checkpointId}.json`,
      createdAt: checkpoint.createdAt,
      sprintId: checkpoint.sprintId,
      relatedStories: [],
    });
    this.plannedSprintState = {
      ...state,
      checkpoint,
    };
  }

  private loadCheckpoint(ws: WorkspaceState): SprintCheckpoint | null {
    return this.checkpointMgr.load(ws);
  }

  private readSprintTaskPlan(ws: WorkspaceState): import('@splinty/core').SprintTaskPlan | null {
    try {
      const raw = this.workspaceMgr.readFile(ws, 'artifacts/sprint-task-plan.json');
      return SprintTaskPlanSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}
