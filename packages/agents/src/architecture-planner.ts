import {
  AgentPersona,
  ArchitecturePlanManager,
  ArchitecturePlanSchema,
  scorePlan,
  validatePlan,
  type AgentConfig,
  type ArchitectureConstraint,
  type ArchitectureDecision,
  type ArchitecturePlan,
  type EvidenceSummary,
  type ExecutionGroup,
  type HandoffDocument,
  type HandoffManager,
  type LlmClient,
  type ModuleDefinition,
  type PlanRevisionTrigger,
  type PlanQualityScore,
  type Story,
  type StoryModuleMapping,
  type TechStackDecision,
  type WorkspaceManager,
  type WorkspaceState,
} from '@splinty/core';
import { BaseAgent } from './base-agent';

// ─── Public Types ─────────────────────────────────────────────────────────────

export interface PlanSprintOptions {
  stories: Story[];
  projectId: string;
  sprintId: string;
  existingGlobalPlan?: ArchitecturePlan;
}

export interface PlanSprintResult {
  globalPlan: ArchitecturePlan;
  sprintPlan: ArchitecturePlan;
  globalScore: PlanQualityScore;
  sprintScore: PlanQualityScore;
}

export interface ReviseSprintOptions {
  trigger: PlanRevisionTrigger;
  evidence: EvidenceSummary;
  currentSprintPlan: ArchitecturePlan;
  globalPlan: ArchitecturePlan;
  stories: Story[];
}

export interface ReviseSprintResult {
  revisedPlan: ArchitecturePlan;
  score: PlanQualityScore;
  supersededPlanId: string;
  newDecision: ArchitectureDecision;
}

// ─── Internal Pass Types ──────────────────────────────────────────────────────

interface PassAResult {
  domains: string[];
  sharedConcerns: string[];
  technicalRequirements: string[];
  storyDomainMap: Record<string, string>;
}

interface PassBResult {
  techStack: TechStackDecision;
  modules: ModuleDefinition[];
  decisions: ArchitectureDecision[];
}

interface GlobalPlanDraft {
  constraints: ArchitectureConstraint[];
  storyModuleMapping: StoryModuleMapping[];
  executionOrder: ExecutionGroup[];
}

interface PassCContext {
  scope: 'global' | 'sprint';
  stories: Story[];
  sprintId?: string;
  globalPlan?: ArchitecturePlan;
}

interface RevisionLlmResult {
  modules: ModuleDefinition[];
  constraints: ArchitectureConstraint[];
  storyModuleMapping: StoryModuleMapping[];
  executionOrder: ExecutionGroup[];
  newDecision: ArchitectureDecision;
}

type FailingGlobalPass = 'A' | 'B' | 'C';

// ─── Prompts ──────────────────────────────────────────────────────────────────

const PASS_A_SYSTEM_PROMPT = `You are the Architecture Fact Extraction Pass (Pass A).

TASK:
Extract project-wide facts from all stories. Identify cross-cutting concerns and domain boundaries.

RESPONSE FORMAT (JSON ONLY):
{
  "domains": ["string"],
  "sharedConcerns": ["string"],
  "technicalRequirements": ["string"],
  "storyDomainMap": {
    "<storyId>": "<primary-domain>"
  }
}

RULES:
1. Return strict JSON only. No markdown, no commentary.
2. domains must include all primary domains visible in stories.
3. storyDomainMap must contain every input storyId exactly once.
4. sharedConcerns should include security/observability/testing/integration concerns when applicable.
5. technicalRequirements should be implementation-agnostic requirements, not low-level code tasks.`;

const PASS_B_SYSTEM_PROMPT = `You are the Architecture Stack and Module Design Pass (Pass B).

TASK:
Choose a coherent tech stack and top-level module boundaries from extracted facts.

RESPONSE FORMAT (JSON ONLY):
{
  "techStack": {
    "language": "string",
    "runtime": "string",
    "framework": "string",
    "database": "string (optional)",
    "testFramework": "string",
    "buildTool": "string",
    "rationale": "string"
  },
  "modules": [
    {
      "name": "string",
      "description": "string",
      "responsibility": "string",
      "directory": "string",
      "exposedInterfaces": ["string"],
      "dependencies": ["string"],
      "owningStories": ["string"]
    }
  ],
  "decisions": [
    {
      "id": "string",
      "title": "string",
      "context": "string",
      "decision": "string",
      "consequences": "string",
      "status": "accepted|proposed|superseded"
    }
  ]
}

RULES:
1. Return strict JSON only.
2. modules must be top-level and implement clear boundaries.
3. Each module must own at least one story.
4. dependency graph must be acyclic and only reference known modules.
5. decisions must mention and justify the chosen stack.`;

const PASS_C_GLOBAL_SYSTEM_PROMPT = `You are the Architecture Constraint and Execution Pass (Pass C, Global scope).

TASK:
Produce global constraints, story-module mapping, and execution waves.

RESPONSE FORMAT (JSON ONLY):
{
  "constraints": [
    {
      "id": "string",
      "type": "dependency|naming|pattern|boundary|technology",
      "description": "string",
      "rule": "string",
      "severity": "error|warning"
    }
  ],
  "storyModuleMapping": [
    {
      "storyId": "string",
      "modules": ["string"],
      "primaryModule": "string",
      "estimatedFiles": ["string"]
    }
  ],
  "executionOrder": [
    {
      "groupId": 1,
      "storyIds": ["string"],
      "rationale": "string",
      "dependsOn": [0]
    }
  ]
}

RULES:
1. Return strict JSON only.
2. storyModuleMapping must include every story exactly once.
3. constraints must be enforceable and specific.
4. executionOrder must use positive groupId values and valid dependsOn references.
5. Include technology constraints that explicitly reference the selected language/framework/test stack.`;

const PASS_C_SPRINT_SYSTEM_PROMPT = `You are the Sprint-Level Architecture Constraint and Execution Pass (Pass C, Sprint scope).

TASK:
Using an approved global plan, produce sprint-scoped mapping, constraints, and execution groups.

RESPONSE FORMAT (JSON ONLY):
{
  "constraints": [
    {
      "id": "string",
      "type": "dependency|naming|pattern|boundary|technology",
      "description": "string",
      "rule": "string",
      "severity": "error|warning"
    }
  ],
  "storyModuleMapping": [
    {
      "storyId": "string",
      "modules": ["string"],
      "primaryModule": "string",
      "estimatedFiles": ["string"]
    }
  ],
  "executionOrder": [
    {
      "groupId": 1,
      "storyIds": ["string"],
      "rationale": "string",
      "dependsOn": [0]
    }
  ]
}

RULES:
1. Return strict JSON only.
2. Reuse global module boundaries; do not invent a new stack.
3. storyModuleMapping must cover all sprint stories.
4. Constraints may narrow global constraints but must not contradict them.
5. executionOrder should prioritize dependency-safe delivery slices.`;

const PASS_REVISION_SYSTEM_PROMPT = `You are the Sprint Architecture Revision Pass.

TASK:
Revise an existing sprint-level architecture plan based on a revision trigger and summarized evidence.
You are revising an existing plan, NOT creating a new plan from scratch.

INPUTS PROVIDED:
- Revision trigger (reason, context, evidence pointers)
- Evidence summary (failing modules, violated constraints, missing capabilities, resource limit failures, affected files)
- Current sprint plan
- Global plan modules (reference only)
- Sprint stories

RESPONSE FORMAT (JSON ONLY):
{
  "modules": [
    {
      "name": "string",
      "description": "string",
      "responsibility": "string",
      "directory": "string",
      "exposedInterfaces": ["string"],
      "dependencies": ["string"],
      "owningStories": ["string"]
    }
  ],
  "constraints": [
    {
      "id": "string",
      "type": "dependency|naming|pattern|boundary|technology",
      "description": "string",
      "rule": "string",
      "severity": "error|warning"
    }
  ],
  "storyModuleMapping": [
    {
      "storyId": "string",
      "modules": ["string"],
      "primaryModule": "string",
      "estimatedFiles": ["string"]
    }
  ],
  "executionOrder": [
    {
      "groupId": 1,
      "storyIds": ["string"],
      "rationale": "string",
      "dependsOn": [0]
    }
  ],
  "newDecision": {
    "id": "string",
    "title": "string",
    "context": "string",
    "decision": "string",
    "consequences": "string",
    "status": "accepted|proposed|superseded"
  }
}

RULES:
1. Return strict JSON only. No markdown, no commentary.
2. Preserve as much of the current sprint plan as possible.
3. Do NOT change the tech stack.
4. Do NOT remove constraints wholesale; only relax or adjust specific constraints that are causing the issue.
5. Preserve existing module boundaries that are not implicated by the trigger/evidence.
6. Ensure storyModuleMapping covers every provided story exactly once.
7. Ensure executionOrder uses positive groupId values and valid dependsOn references.
8. newDecision must clearly explain what changed and why, grounded in the trigger and evidence.`;

// ─── Architecture Planner Agent ───────────────────────────────────────────────

export class ArchitecturePlannerAgent extends BaseAgent {
  private passCContext: PassCContext | null = null;

  constructor(
    config: AgentConfig,
    workspaceManager: WorkspaceManager,
    handoffManager: HandoffManager,
    llmClient?: LlmClient
  ) {
    super(config, workspaceManager, handoffManager, llmClient);

    if (config.persona !== AgentPersona.ARCHITECTURE_PLANNER) {
      throw new Error(
        `ArchitecturePlannerAgent requires persona ${AgentPersona.ARCHITECTURE_PLANNER}, received ${config.persona}`
      );
    }
  }

  // ── BaseAgent compatibility wrapper ────────────────────────────────────────

  async execute(handoff: HandoffDocument | null, story: Story): Promise<HandoffDocument> {
    if (!handoff) {
      throw new Error('ArchitecturePlannerAgent.execute: handoff is required');
    }

    const projectId = handoff.stateOfWorld['projectId'];
    if (!projectId) {
      throw new Error('ArchitecturePlannerAgent.execute: missing projectId in handoff stateOfWorld');
    }

    const sprintId = handoff.stateOfWorld['sprintId'];
    if (!sprintId) {
      throw new Error('ArchitecturePlannerAgent.execute: missing sprintId in handoff stateOfWorld');
    }

    const serializedStories = handoff.stateOfWorld['refinedStories'];
    if (!serializedStories) {
      throw new Error(
        'ArchitecturePlannerAgent.execute: missing refinedStories in handoff stateOfWorld'
      );
    }

    let stories: Story[];
    try {
      const parsed = JSON.parse(serializedStories) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('refinedStories is not an array');
      }
      stories = parsed as Story[];
    } catch (error) {
      throw new Error(
        `ArchitecturePlannerAgent.execute: invalid refinedStories JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    const result = await this.planSprint({
      stories,
      projectId,
      sprintId,
    });

    return this.buildHandoff(
      story,
      AgentPersona.ORCHESTRATOR,
      {
        globalPlanId: result.globalPlan.planId,
        sprintPlanId: result.sprintPlan.planId,
        globalScore: JSON.stringify(result.globalScore),
        sprintScore: JSON.stringify(result.sprintScore),
      },
      'Distribute sprint task digests and orchestrate implementation execution.',
      [
        `artifacts/architecture-plan-${result.globalPlan.planId}.json`,
        `artifacts/architecture-plan-${result.sprintPlan.planId}.json`,
      ]
    );
  }

  // ── Public planner API ─────────────────────────────────────────────────────

  async planSprint(options: PlanSprintOptions): Promise<PlanSprintResult> {
    if (!this.currentWorkspace) {
      throw new Error('ArchitecturePlannerAgent.planSprint: workspace is not set');
    }

    const { stories, projectId, sprintId, existingGlobalPlan } = options;
    if (stories.length === 0) {
      throw new Error('ArchitecturePlannerAgent.planSprint: stories array must not be empty');
    }

    const globalOutcome = await this.planGlobalLevel(stories, projectId, existingGlobalPlan);
    const sprintOutcome = await this.planSprintLevel(globalOutcome.plan, stories, sprintId, projectId);

    const planManager = new ArchitecturePlanManager(this.workspaceManager);
    planManager.save(this.currentWorkspace, globalOutcome.plan);
    planManager.save(this.currentWorkspace, sprintOutcome.plan);

    return {
      globalPlan: globalOutcome.plan,
      sprintPlan: sprintOutcome.plan,
      globalScore: globalOutcome.score,
      sprintScore: sprintOutcome.score,
    };
  }

  async reviseSprint(options: ReviseSprintOptions): Promise<ReviseSprintResult> {
    if (options.currentSprintPlan.level !== 'sprint') {
      throw new Error('ArchitecturePlannerAgent.reviseSprint: currentSprintPlan must be a sprint-level plan');
    }

    if (!this.currentWorkspace) {
      throw new Error('ArchitecturePlannerAgent.reviseSprint: workspace is not set');
    }

    const userMessage = [
      `Trigger: ${JSON.stringify(options.trigger)}`,
      `Evidence: ${JSON.stringify(options.evidence)}`,
      `Current sprint plan: ${JSON.stringify(options.currentSprintPlan)}`,
      `Global plan modules (for reference): ${JSON.stringify(options.globalPlan.modules)}`,
      `Stories: ${JSON.stringify(options.stories)}`,
      'Return only the requested JSON schema.',
    ].join('\n\n');

    let retriesUsed = 0;
    while (true) {
      const rawResponse = await this.callLlm({
        systemPrompt: PASS_REVISION_SYSTEM_PROMPT,
        userMessage,
      });

      const llmResult = this.parseJsonResponse<RevisionLlmResult>(rawResponse, 'PassRevision', [
        'modules',
        'constraints',
        'storyModuleMapping',
        'executionOrder',
        'newDecision',
      ]);

      const revisedPlan = this.assembleRevisedSprintPlan(
        options.currentSprintPlan,
        llmResult,
        options.trigger
      );
      const validation = validatePlan(revisedPlan);
      const score = scorePlan(revisedPlan);

      if (validation.errors.length === 0 && score.status !== 'fail') {
        const planManager = new ArchitecturePlanManager(this.workspaceManager);
        planManager.supersede(this.currentWorkspace, options.currentSprintPlan.planId, revisedPlan);

        return {
          revisedPlan,
          score,
          supersededPlanId: options.currentSprintPlan.planId,
          newDecision: llmResult.newDecision,
        };
      }

      if (retriesUsed >= this.config.maxRetries) {
        throw new Error(
          `ArchitecturePlannerAgent: sprint revision failed quality gate after ${retriesUsed} retry attempt(s). Validation errors: ${validation.errors.join('; ') || 'none'}. Score status: ${score.status}`
        );
      }

      retriesUsed += 1;
    }
  }

  // ── L0 Global Planning ─────────────────────────────────────────────────────

  private async planGlobalLevel(
    stories: Story[],
    projectId: string,
    existingGlobalPlan?: ArchitecturePlan
  ): Promise<{ plan: ArchitecturePlan; score: PlanQualityScore }> {
    let facts = await this.passA_extractFacts(stories, existingGlobalPlan);
    let stack = await this.passB_chooseStack(facts, stories);

    this.passCContext = { scope: 'global', stories };
    let draft = await this.passC_emitConstraints(stack, facts);

    let retriesUsed = 0;
    while (true) {
      const globalPlan = this.assembleGlobalPlan(projectId, stack, draft, existingGlobalPlan);
      const validation = validatePlan(globalPlan);
      const score = scorePlan(globalPlan);

      if (validation.errors.length === 0 && score.status !== 'fail') {
        return { plan: globalPlan, score };
      }

      if (retriesUsed >= this.config.maxRetries) {
        throw new Error(
          `ArchitecturePlannerAgent: global planning failed quality gate after ${retriesUsed} retry attempt(s). Validation errors: ${validation.errors.join('; ') || 'none'}. Score status: ${score.status}`
        );
      }

      retriesUsed += 1;
      const failingPass = this.identifyFailingGlobalPass(validation.errors, score);

      if (failingPass === 'A') {
        facts = await this.passA_extractFacts(stories, existingGlobalPlan);
        stack = await this.passB_chooseStack(facts, stories);
      } else if (failingPass === 'B') {
        stack = await this.passB_chooseStack(facts, stories);
      }

      this.passCContext = { scope: 'global', stories };
      draft = await this.passC_emitConstraints(stack, facts);
    }
  }

  private async passA_extractFacts(
    stories: Story[],
    existingPlan?: ArchitecturePlan
  ): Promise<PassAResult> {
    const userMessage = [
      'Extract architecture facts from these refined sprint stories.',
      `Stories JSON:\n${JSON.stringify(stories, null, 2)}`,
      existingPlan ? `Existing Global Plan JSON:\n${JSON.stringify(existingPlan, null, 2)}` : '',
      'Return only the requested JSON schema.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const rawResponse = await this.callLlm({
      systemPrompt: PASS_A_SYSTEM_PROMPT,
      userMessage,
    });

    const parsed = this.parseJsonResponse<PassAResult>(rawResponse, 'PassA', [
      'domains',
      'sharedConcerns',
      'technicalRequirements',
      'storyDomainMap',
    ]);

    if (!Array.isArray(parsed.domains) || !Array.isArray(parsed.sharedConcerns)) {
      throw new Error('ArchitecturePlannerAgent.PassA: domains/sharedConcerns must be arrays');
    }
    if (!Array.isArray(parsed.technicalRequirements)) {
      throw new Error('ArchitecturePlannerAgent.PassA: technicalRequirements must be an array');
    }
    if (typeof parsed.storyDomainMap !== 'object' || parsed.storyDomainMap === null) {
      throw new Error('ArchitecturePlannerAgent.PassA: storyDomainMap must be an object');
    }

    return parsed;
  }

  private async passB_chooseStack(facts: PassAResult, stories: Story[]): Promise<PassBResult> {
    const userMessage = [
      'Choose the tech stack and top-level module boundaries.',
      `PassA Facts JSON:\n${JSON.stringify(facts, null, 2)}`,
      `Stories JSON:\n${JSON.stringify(stories, null, 2)}`,
      'Return only the requested JSON schema.',
    ].join('\n\n');

    const rawResponse = await this.callLlm({
      systemPrompt: PASS_B_SYSTEM_PROMPT,
      userMessage,
    });

    const parsed = this.parseJsonResponse<PassBResult>(rawResponse, 'PassB', [
      'techStack',
      'modules',
      'decisions',
    ]);

    if (!parsed.techStack || typeof parsed.techStack !== 'object') {
      throw new Error('ArchitecturePlannerAgent.PassB: techStack must be an object');
    }
    if (!Array.isArray(parsed.modules)) {
      throw new Error('ArchitecturePlannerAgent.PassB: modules must be an array');
    }
    if (!Array.isArray(parsed.decisions)) {
      throw new Error('ArchitecturePlannerAgent.PassB: decisions must be an array');
    }

    return parsed;
  }

  private async passC_emitConstraints(
    stack: PassBResult,
    facts: PassAResult
  ): Promise<GlobalPlanDraft> {
    if (!this.passCContext) {
      throw new Error('ArchitecturePlannerAgent.PassC: missing pass C context');
    }

    const isSprintScope = this.passCContext.scope === 'sprint';
    const systemPrompt = isSprintScope ? PASS_C_SPRINT_SYSTEM_PROMPT : PASS_C_GLOBAL_SYSTEM_PROMPT;

    const userMessage = [
      isSprintScope
        ? `Generate sprint-scoped constraints and mapping for sprint '${this.passCContext.sprintId ?? ''}'.`
        : 'Generate global constraints and mapping.',
      `Facts JSON:\n${JSON.stringify(facts, null, 2)}`,
      `Stack JSON:\n${JSON.stringify(stack, null, 2)}`,
      this.passCContext.globalPlan
        ? `Approved Global Plan JSON:\n${JSON.stringify(this.passCContext.globalPlan, null, 2)}`
        : '',
      `Target Stories JSON:\n${JSON.stringify(this.passCContext.stories, null, 2)}`,
      'Return only the requested JSON schema.',
    ]
      .filter(Boolean)
      .join('\n\n');

    const rawResponse = await this.callLlm({
      systemPrompt,
      userMessage,
    });

    const parsed = this.parseJsonResponse<GlobalPlanDraft>(rawResponse, 'PassC', [
      'constraints',
      'storyModuleMapping',
      'executionOrder',
    ]);

    if (!Array.isArray(parsed.constraints)) {
      throw new Error('ArchitecturePlannerAgent.PassC: constraints must be an array');
    }
    if (!Array.isArray(parsed.storyModuleMapping)) {
      throw new Error('ArchitecturePlannerAgent.PassC: storyModuleMapping must be an array');
    }
    if (!Array.isArray(parsed.executionOrder)) {
      throw new Error('ArchitecturePlannerAgent.PassC: executionOrder must be an array');
    }

    return parsed;
  }

  // ── L2 Sprint Planning ──────────────────────────────────────────────────────

  private async planSprintLevel(
    globalPlan: ArchitecturePlan,
    stories: Story[],
    sprintId: string,
    projectId: string
  ): Promise<{ plan: ArchitecturePlan; score: PlanQualityScore }> {
    const synthesizedFacts: PassAResult = {
      domains: [...new Set(stories.map((s) => s.domain))],
      sharedConcerns: globalPlan.constraints.map((constraint) => constraint.description),
      technicalRequirements: globalPlan.constraints.map((constraint) => constraint.rule),
      storyDomainMap: Object.fromEntries(stories.map((story) => [story.id, story.domain])),
    };

    const stackFromGlobal: PassBResult = {
      techStack: globalPlan.techStack,
      modules: globalPlan.modules,
      decisions: globalPlan.decisions,
    };

    let retriesUsed = 0;
    while (true) {
      this.passCContext = {
        scope: 'sprint',
        stories,
        sprintId,
        globalPlan,
      };

      const draft = await this.passC_emitConstraints(stackFromGlobal, synthesizedFacts);
      const sprintPlan = this.assembleSprintPlan(projectId, sprintId, globalPlan, stackFromGlobal, draft);
      const validation = validatePlan(sprintPlan);
      const score = scorePlan(sprintPlan);

      if (validation.errors.length === 0 && score.status !== 'fail') {
        return { plan: sprintPlan, score };
      }

      if (retriesUsed >= this.config.maxRetries) {
        throw new Error(
          `ArchitecturePlannerAgent: sprint planning failed quality gate after ${retriesUsed} retry attempt(s). Validation errors: ${validation.errors.join('; ') || 'none'}. Score status: ${score.status}`
        );
      }

      retriesUsed += 1;
    }
  }

  // ── Assembly + Validation Helpers ──────────────────────────────────────────

  private assembleGlobalPlan(
    projectId: string,
    stack: PassBResult,
    draft: GlobalPlanDraft,
    existingGlobalPlan?: ArchitecturePlan
  ): ArchitecturePlan {
    const now = new Date().toISOString();
    return ArchitecturePlanSchema.parse({
      planId: `${projectId}-global-${Date.now()}`,
      schemaVersion: 1,
      projectId,
      level: 'global',
      scopeKey: 'global',
      status: 'active',
      createdAt: now,
      revisionNumber: 0,
      supersedesPlanId: existingGlobalPlan?.planId,
      techStack: stack.techStack,
      modules: stack.modules,
      storyModuleMapping: draft.storyModuleMapping,
      executionOrder: draft.executionOrder,
      decisions: stack.decisions,
      constraints: draft.constraints,
    });
  }

  private assembleSprintPlan(
    projectId: string,
    sprintId: string,
    globalPlan: ArchitecturePlan,
    stack: PassBResult,
    draft: GlobalPlanDraft
  ): ArchitecturePlan {
    const now = new Date().toISOString();
    return ArchitecturePlanSchema.parse({
      planId: `${projectId}-sprint-${sprintId}-${Date.now()}`,
      schemaVersion: 1,
      projectId,
      level: 'sprint',
      scopeKey: `sprint:${sprintId}`,
      sprintId,
      parentPlanId: globalPlan.planId,
      status: 'active',
      createdAt: now,
      revisionNumber: 0,
      techStack: stack.techStack,
      modules: stack.modules,
      storyModuleMapping: draft.storyModuleMapping,
      executionOrder: draft.executionOrder,
      decisions: stack.decisions,
      constraints: draft.constraints,
    });
  }

  private assembleRevisedSprintPlan(
    current: ArchitecturePlan,
    llmResult: RevisionLlmResult,
    trigger: PlanRevisionTrigger
  ): ArchitecturePlan {
    const now = new Date().toISOString();
    return ArchitecturePlanSchema.parse({
      planId: `${current.projectId}-sprint-${current.sprintId}-rev${current.revisionNumber + 1}-${Date.now()}`,
      schemaVersion: current.schemaVersion,
      projectId: current.projectId,
      level: 'sprint',
      scopeKey: current.scopeKey,
      sprintId: current.sprintId,
      parentPlanId: current.parentPlanId,
      supersedesPlanId: current.planId,
      status: 'active',
      createdAt: now,
      revisionNumber: current.revisionNumber + 1,
      revisionTrigger: trigger,
      techStack: current.techStack,
      modules: llmResult.modules,
      storyModuleMapping: llmResult.storyModuleMapping,
      executionOrder: llmResult.executionOrder,
      decisions: [...current.decisions, llmResult.newDecision],
      constraints: llmResult.constraints,
    });
  }

  private identifyFailingGlobalPass(
    validationErrors: string[],
    score: PlanQualityScore
  ): FailingGlobalPass {
    const validationText = validationErrors.join(' ').toLowerCase();
    const findingsText = score.findings.join(' ').toLowerCase();

    if (validationText.includes('storymodu') && validationText.includes('not owned')) {
      return 'C';
    }

    if (
      validationText.includes('cycle detected') ||
      validationText.includes('unknown dependency') ||
      validationText.includes('interface') ||
      validationText.includes('has no owning stories')
    ) {
      return 'B';
    }

    if (
      findingsText.includes('fan-out') ||
      findingsText.includes('fan-in') ||
      findingsText.includes('high responsibility overlap') ||
      findingsText.includes('cycle detected')
    ) {
      return 'B';
    }

    if (
      findingsText.includes('tech stack language token') ||
      findingsText.includes('tech stack framework token') ||
      findingsText.includes('tech stack test framework token')
    ) {
      return 'C';
    }

    return 'C';
  }

  private parseJsonResponse<T>(
    rawResponse: string,
    passName: string,
    requiredFields: string[]
  ): T {
    const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned) as unknown;
    } catch {
      throw new Error(
        `ArchitecturePlannerAgent.${passName}: LLM returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`ArchitecturePlannerAgent.${passName}: response must be a JSON object`);
    }

    const record = parsed as Record<string, unknown>;
    for (const field of requiredFields) {
      if (!(field in record)) {
        throw new Error(`ArchitecturePlannerAgent.${passName}: missing '${field}' in response`);
      }
    }

    return record as T;
  }
}
