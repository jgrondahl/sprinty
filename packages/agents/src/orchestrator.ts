import {
  AgentPersona,
  StoryState,
  ArchitecturePlanManager,
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
  type AgentConfig,
  type ArchitecturePlan,
  type HumanGate,
  type PlanRevisionTrigger,
  type PlannedSprintState,
  type ResumePoint,
  type SandboxEnvironment,
  type SandboxConfig,
  type SprintCheckpoint,
  type WorkspaceState,
  type ArchitectureEnforcer,
  SprintTaskPlanSchema,
} from '@splinty/core';
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
  humanGate?: HumanGate;
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

const PIPELINE_STEPS: Record<string, number> = {
  BUSINESS_OWNER: 0,
  PRODUCT_OWNER: 1,
  ORCHESTRATOR_TRANSITIONS: 2,
  ARCHITECT: 3,
  SOUND_ENGINEER: 4,
  DEVELOPER: 5,
  QA_LOOP: 6,
  TECHNICAL_WRITER: 7,
  PR_OPEN: 8,
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
  private readonly humanGate: HumanGate;
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
    this.humanGate = config.humanGate ?? new DefaultHumanGate();
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

  private async runPlannedSprint(stories: Story[]): Promise<AppBuilderResult[]> {
    const sprintStart = Date.now();
    const sprintWs = this.workspaceMgr.createWorkspace(this.config.projectId, 'sprint');
    const agentConfigs = buildAgentConfigs(this.config.defaultModel, this.config.lightModel);
    const clientFor = (persona: AgentPersona): LlmClient | undefined =>
      this.config.clients?.[persona] ?? this.config.defaultClient;

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

        handoff = await biz.execute(handoff, currentStory);
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.BUSINESS_OWNER);

        handoff = await po.execute(handoff, currentStory);
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

      const decomposer = new TaskDecomposer();
      const taskPlan = decomposer.decompose(planResult.sprintPlan, refinedStories);
      this.workspaceMgr.writeFile(
        sprintWs,
        'artifacts/sprint-task-plan.json',
        JSON.stringify(taskPlan, null, 2)
      );

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

        let qaAttempts = 0;
        let taskPassed = false;
        let nextDevInput: HandoffDocument | null = handoff;

        while (qaAttempts < 3) {
          const storyForDev = {
            ...baseStory,
            state: StoryState.IN_PROGRESS,
            updatedAt: new Date().toISOString(),
          };
          const devHandoff = await dev.execute(nextDevInput, storyForDev);
          let qaStory = this.reloadStory(ws, primaryStoryId, storyForDev);
          if (qaStory.state !== StoryState.IN_REVIEW) {
            qaStory = {
              ...qaStory,
              state: StoryState.IN_REVIEW,
            };
          }

          const qaHandoff = await qa.execute(devHandoff, qaStory);
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
        results.push({
          storyId: original.id,
          gitBranch: `story/${original.id}`,
          prUrl: undefined,
          commitShas: [],
          testResults: { passed: 0, failed: 1, skipped: 0 },
          duration: Date.now() - sprintStart,
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

      const writerHandoff = await techWriter.execute(writerInput, currentStory);
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
      this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(nextStory, null, 2));
      this.updateLedger(nextStory, AgentPersona.ORCHESTRATOR);
      currentStories.set(original.id, nextStory);

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
      });
    }

    if (blockedTaskIds.size === 0) {
      this.checkpointMgr.clear(sprintWs);
    }
    return results;
  }

  // ── Per-story pipeline ─────────────────────────────────────────────────────

  private async runStory(story: Story): Promise<AppBuilderResult> {
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

    // ── Pipeline execution ─────────────────────────────────────────────────

    // Step 1: RAW → EPIC (BusinessOwner)
    if (startStep <= PIPELINE_STEPS['BUSINESS_OWNER']!) {
      handoff = await biz.execute(handoff, currentStory);
      currentStory = this.reloadStory(ws, story.id, currentStory);
      this.updateLedger(currentStory, AgentPersona.BUSINESS_OWNER);
      this.saveResumePoint(ws, currentStory, AgentPersona.BUSINESS_OWNER, handoff, PIPELINE_STEPS['BUSINESS_OWNER']!);
    }

    // Step 2: EPIC → USER_STORY (ProductOwner)
    if (startStep <= PIPELINE_STEPS['PRODUCT_OWNER']!) {
      handoff = await po.execute(handoff, currentStory);
      currentStory = this.reloadStory(ws, story.id, currentStory);
      this.updateLedger(currentStory, AgentPersona.PRODUCT_OWNER);
      this.saveResumePoint(ws, currentStory, AgentPersona.PRODUCT_OWNER, handoff, PIPELINE_STEPS['PRODUCT_OWNER']!);
    }

    // Step 3: USER_STORY → REFINED → SPRINT_READY (Orchestrator transitions)
    if (startStep <= PIPELINE_STEPS['ORCHESTRATOR_TRANSITIONS']!) {
      currentStory = this.stateMachine.transition(currentStory, StoryState.REFINED);
      this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
      currentStory = this.stateMachine.transition(currentStory, StoryState.SPRINT_READY);
      this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
      this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(currentStory, null, 2));
      if (handoff) {
        this.saveResumePoint(
          ws,
          currentStory,
          AgentPersona.ORCHESTRATOR,
          handoff,
          PIPELINE_STEPS['ORCHESTRATOR_TRANSITIONS']!
        );
      }
    }

    // Step 4: SPRINT_READY → IN_PROGRESS (Architect)
    if (startStep <= PIPELINE_STEPS['ARCHITECT']!) {
      handoff = await architect.execute(handoff, currentStory);
      currentStory = this.reloadStory(ws, story.id, currentStory);
      this.updateLedger(currentStory, AgentPersona.ARCHITECT);
      this.saveResumePoint(ws, currentStory, AgentPersona.ARCHITECT, handoff, PIPELINE_STEPS['ARCHITECT']!);
    }

    // Step 5 (conditional): Sound Engineer if audio domain
    if (startStep <= PIPELINE_STEPS['SOUND_ENGINEER']! && handoff?.stateOfWorld['soundEngineerRequired'] === 'true') {
      handoff = await soundEng.execute(handoff, currentStory);
      this.updateLedger(currentStory, AgentPersona.SOUND_ENGINEER);
      this.saveResumePoint(ws, currentStory, AgentPersona.SOUND_ENGINEER, handoff, PIPELINE_STEPS['SOUND_ENGINEER']!);
    }

    // Step 6: IN_PROGRESS → IN_REVIEW (Developer)
    if (startStep <= PIPELINE_STEPS['DEVELOPER']!) {
      if (
        this.config.enforcer &&
        isArchitecturePlan(handoff?.architecturePlan) &&
        isImplementationTask(handoff?.task)
      ) {
        dev.setEnforcer(this.config.enforcer, handoff.architecturePlan, handoff.task);
      }
      handoff = await dev.execute(handoff, currentStory);
      currentStory = this.reloadStory(ws, story.id, currentStory);
      this.updateLedger(currentStory, AgentPersona.DEVELOPER);
      this.saveResumePoint(ws, currentStory, AgentPersona.DEVELOPER, handoff, PIPELINE_STEPS['DEVELOPER']!);
    }

    // Step 7: QA loop (max 3 attempts to handle rework cycle)
    if (startStep <= PIPELINE_STEPS['QA_LOOP']!) {
      let qaAttempts = 0;
      const maxQaAttempts = 3;

      while (qaAttempts < maxQaAttempts) {
        qaAttempts++;
        handoff = await qa.execute(handoff, currentStory);
        currentStory = this.reloadStory(ws, story.id, currentStory);

        const verdict = handoff.stateOfWorld['verdict'];

        if (verdict === 'PASS') {
          this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
          this.saveResumePoint(ws, currentStory, AgentPersona.QA_ENGINEER, handoff, PIPELINE_STEPS['QA_LOOP']!);
          break;
        }

        if (verdict === 'BLOCKED') {
          this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
          this.saveResumePoint(ws, currentStory, AgentPersona.QA_ENGINEER, handoff, PIPELINE_STEPS['QA_LOOP']!);
          throw new Error(`Story ${story.id} QA BLOCKED: ${handoff.stateOfWorld['failedAC'] ?? ''}`);
        }

        // FAIL — rework: developer gets another pass
        this.updateLedger(currentStory, AgentPersona.QA_ENGINEER);
        if (
          this.config.enforcer &&
          isArchitecturePlan(handoff?.architecturePlan) &&
          isImplementationTask(handoff?.task)
        ) {
          dev.setEnforcer(this.config.enforcer, handoff.architecturePlan, handoff.task);
        }
        handoff = await dev.execute(handoff, currentStory);
        currentStory = this.reloadStory(ws, story.id, currentStory);
        this.updateLedger(currentStory, AgentPersona.DEVELOPER);
        this.saveResumePoint(ws, currentStory, AgentPersona.DEVELOPER, handoff, PIPELINE_STEPS['DEVELOPER']!);
      }
    }

    // Step 8: README generation (Technical Writer)
    if (startStep <= PIPELINE_STEPS['TECHNICAL_WRITER']!) {
      handoff = await techWriter.execute(handoff, currentStory);
      this.updateLedger(currentStory, AgentPersona.TECHNICAL_WRITER);
      this.saveResumePoint(ws, currentStory, AgentPersona.TECHNICAL_WRITER, handoff, PIPELINE_STEPS['TECHNICAL_WRITER']!);
    }

    // Step 9: DONE → PR_OPEN
    const branchName = handoff?.stateOfWorld['branchName'] ?? `story/${story.id}`;
    const commitSha = handoff?.stateOfWorld['commitSha'] ?? '';

    let prUrl = '';
    if (this.config.createPullRequest) {
      prUrl = await this.config.createPullRequest(currentStory, branchName, commitSha);
    }

    if (startStep <= PIPELINE_STEPS['PR_OPEN']!) {
      currentStory = this.stateMachine.transition(currentStory, StoryState.PR_OPEN);
      this.workspaceMgr.writeFile(ws, 'story.json', JSON.stringify(currentStory, null, 2));
      this.updateLedger(currentStory, AgentPersona.ORCHESTRATOR);
      if (handoff) {
        this.saveResumePoint(ws, currentStory, AgentPersona.ORCHESTRATOR, handoff, PIPELINE_STEPS['PR_OPEN']!);
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
      this.saveCheckpoint(ws, updatedState);
    }
    this.plannedSprintState = updatedState;
    return updatedState;
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
