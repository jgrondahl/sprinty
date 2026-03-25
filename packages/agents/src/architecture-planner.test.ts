import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ArchitecturePlannerAgent } from './architecture-planner';
import { AgentCallError } from './base-agent';
import {
  AgentPersona,
  ArchitecturePlanSchema,
  ArchitecturePlanManager,
  HandoffManager,
  StorySource,
  StoryState,
  validatePlan,
  type AgentConfig,
  type ArchitecturePlan,
  type HandoffDocument,
  type LlmClient,
  type LlmRequest,
  type EvidenceSummary,
  type PlanRevisionTrigger,
  type Story,
  type WorkspaceState,
  WorkspaceManager,
} from '@splinty/core';

const now = new Date().toISOString();

const plannerConfig: AgentConfig = {
  persona: AgentPersona.ARCHITECTURE_PLANNER,
  model: 'claude-3-5-sonnet-20241022',
  systemPrompt: 'Architecture planner system prompt',
  maxRetries: 3,
  temperature: 0.4,
};

const makeStories = (): Story[] => [
  {
    id: 'story-auth',
    title: 'As a user, I want to authenticate',
    description: 'Auth and session lifecycle support',
    acceptanceCriteria: ['User can login', 'Session is validated'],
    dependsOn: [],
    state: StoryState.REFINED,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'auth',
    tags: ['auth', 'security'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'story-payments',
    title: 'As a customer, I want to pay',
    description: 'Payment capture and transaction status tracking',
    acceptanceCriteria: ['Payment is captured', 'Status is persisted'],
    dependsOn: [],
    state: StoryState.REFINED,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'payments',
    tags: ['payments', 'billing'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'story-notifications',
    title: 'As a user, I want notification updates',
    description: 'Outbound notification dispatching',
    acceptanceCriteria: ['Notification sent on payment outcome'],
    dependsOn: [],
    state: StoryState.REFINED,
    source: StorySource.FILE,
    workspacePath: '',
    domain: 'notifications',
    tags: ['notifications'],
    createdAt: now,
    updatedAt: now,
  },
];

const makePassAResponse = (stories: Story[]) => ({
  domains: [...new Set(stories.map((story) => story.domain))],
  sharedConcerns: ['security', 'observability', 'testing', 'idempotency'],
  technicalRequirements: ['audit logging', 'retry-safe APIs', 'structured telemetry'],
  storyDomainMap: Object.fromEntries(stories.map((story) => [story.id, story.domain])),
});

const makePassBResponse = (stories: Story[]) => ({
  techStack: {
    language: 'TypeScript',
    runtime: 'Node.js 20',
    framework: 'Express',
    database: 'PostgreSQL',
    testFramework: 'Bun',
    buildTool: 'tsc',
    rationale: 'TypeScript and Express align with API-heavy modular backend delivery.',
  },
  modules: [
    {
      name: 'shared',
      description: 'Shared primitives and cross-cutting support',
      responsibility: 'Provide shared logging, config, and error primitives',
      directory: 'src/modules/shared',
      exposedInterfaces: ['SharedLogger', 'SharedClock'],
      dependencies: [],
      owningStories: stories.map((story) => story.id),
    },
    {
      name: 'auth',
      description: 'Authentication and authorization capabilities',
      responsibility: 'Manage credentials, sessions, and identity verification',
      directory: 'src/modules/auth',
      exposedInterfaces: ['AuthService'],
      dependencies: ['shared'],
      owningStories: ['story-auth'],
    },
    {
      name: 'payments',
      description: 'Payment orchestration domain',
      responsibility: 'Handle payment intent, capture, and settlement coordination',
      directory: 'src/modules/payments',
      exposedInterfaces: ['PaymentService'],
      dependencies: ['shared', 'auth'],
      owningStories: ['story-payments'],
    },
    {
      name: 'notifications',
      description: 'Outbound notification dispatch domain',
      responsibility: 'Deliver user-visible notification messages across channels',
      directory: 'src/modules/notifications',
      exposedInterfaces: ['NotificationService'],
      dependencies: ['shared'],
      owningStories: ['story-notifications'],
    },
  ],
  decisions: [
    {
      id: 'ADR-001',
      title: 'Adopt TypeScript backend',
      context: 'Need strict contracts and maintainable service boundaries',
      decision: 'Use TypeScript, Express, and Bun tests for all modules',
      consequences: 'Unified developer ergonomics and predictable CI behavior',
      status: 'accepted',
    },
  ],
});

const makePassCGlobalResponse = (stories: Story[]) => ({
  constraints: [
    {
      id: 'CONST-001',
      type: 'technology',
      description: 'All services must run TypeScript and Express with Bun tests',
      rule: 'Use TypeScript + Express + Bun for module APIs and tests',
      severity: 'error',
    },
    {
      id: 'CONST-002',
      type: 'boundary',
      description: 'Payments may depend only on auth and shared',
      rule: 'payments -> auth,shared',
      severity: 'error',
    },
  ],
  storyModuleMapping: [
    {
      storyId: 'story-auth',
      modules: ['auth', 'shared'],
      primaryModule: 'auth',
      estimatedFiles: ['src/modules/auth/service.ts', 'src/modules/shared/logger.ts'],
    },
    {
      storyId: 'story-payments',
      modules: ['payments', 'auth', 'shared'],
      primaryModule: 'payments',
      estimatedFiles: ['src/modules/payments/service.ts', 'src/modules/payments/repo.ts'],
    },
    {
      storyId: 'story-notifications',
      modules: ['notifications', 'shared'],
      primaryModule: 'notifications',
      estimatedFiles: ['src/modules/notifications/service.ts'],
    },
  ],
  executionOrder: [
    {
      groupId: 1,
      storyIds: [stories[0]!.id],
      rationale: 'Build auth primitives first',
      dependsOn: [],
    },
    {
      groupId: 2,
      storyIds: [stories[1]!.id],
      rationale: 'Payments layer depends on auth contracts',
      dependsOn: [1],
    },
    {
      groupId: 3,
      storyIds: [stories[2]!.id],
      rationale: 'Notification hooks land after payment events exist',
      dependsOn: [2],
    },
  ],
});

const makePassCSprintResponse = (stories: Story[]) => ({
  constraints: [
    {
      id: 'SCONST-001',
      type: 'technology',
      description: 'Sprint code must preserve TypeScript and Express conventions with Bun tests',
      rule: 'Implement sprint scope using TypeScript, Express, Bun test suite',
      severity: 'error',
    },
    {
      id: 'SCONST-002',
      type: 'pattern',
      description: 'All public handlers include structured logging',
      rule: 'Use shared logger middleware in route handlers',
      severity: 'warning',
    },
  ],
  storyModuleMapping: [
    {
      storyId: 'story-auth',
      modules: ['auth', 'shared'],
      primaryModule: 'auth',
      estimatedFiles: ['src/modules/auth/handlers/login.ts'],
    },
    {
      storyId: 'story-payments',
      modules: ['payments', 'auth', 'shared'],
      primaryModule: 'payments',
      estimatedFiles: ['src/modules/payments/handlers/capture.ts'],
    },
    {
      storyId: 'story-notifications',
      modules: ['notifications', 'shared'],
      primaryModule: 'notifications',
      estimatedFiles: ['src/modules/notifications/handlers/send.ts'],
    },
  ],
  executionOrder: [
    {
      groupId: 1,
      storyIds: [stories[0]!.id, stories[1]!.id],
      rationale: 'Parallelize auth and payments shell work',
      dependsOn: [],
    },
    {
      groupId: 2,
      storyIds: [stories[2]!.id],
      rationale: 'Notifications finalize once payment events are wired',
      dependsOn: [1],
    },
  ],
});

const makePlanRevisionTrigger = (): PlanRevisionTrigger => ({
  reason: 'architecture-violation',
  level: 'sprint',
  taskId: 'task-payments-capture',
  module: 'payments',
  description: 'Payment capture flow violates boundary constraints under retry conditions',
  evidence: ['constraint dep-boundary-payments-auth violated twice', 'missing idempotent capture adapter'],
  timestamp: now,
});

const makeEvidenceSummary = (): EvidenceSummary => ({
  triggerId: 'trigger-001',
  level: 'sprint',
  failingModules: ['payments'],
  violatedConstraintIds: ['dep-boundary-payments-auth'],
  missingCapabilities: ['idempotent payment capture adapter'],
  resourceLimitFailures: [
    {
      taskId: 'task-payments-capture',
      limit: 'runtime',
      actual: 920,
      configured: 700,
    },
  ],
  affectedFiles: ['src/modules/payments/capture.ts'],
  artifactRefs: ['artifacts/enforcement-report-task-payments-capture.json'],
});

const makeGlobalPlan = (stories: Story[]): ArchitecturePlan => {
  const passB = makePassBResponse(stories);
  const passC = makePassCGlobalResponse(stories);
  return ArchitecturePlanSchema.parse({
    planId: 'proj-planner-global-base',
    schemaVersion: 1,
    projectId: 'proj-planner',
    level: 'global',
    scopeKey: 'global',
    status: 'active',
    createdAt: now,
    revisionNumber: 0,
    techStack: passB.techStack,
    modules: passB.modules,
    storyModuleMapping: passC.storyModuleMapping,
    executionOrder: passC.executionOrder,
    decisions: passB.decisions,
    constraints: passC.constraints,
  });
};

const makeCurrentSprintPlan = (stories: Story[], globalPlan?: ArchitecturePlan): ArchitecturePlan => {
  const passB = makePassBResponse(stories);
  const passC = makePassCSprintResponse(stories);
  const parentGlobal = globalPlan ?? makeGlobalPlan(stories);
  return ArchitecturePlanSchema.parse({
    planId: 'proj-planner-sprint-sprint-1-current',
    schemaVersion: 1,
    projectId: 'proj-planner',
    level: 'sprint',
    scopeKey: 'sprint:sprint-1',
    sprintId: 'sprint-1',
    parentPlanId: parentGlobal.planId,
    status: 'active',
    createdAt: now,
    revisionNumber: 0,
    techStack: passB.techStack,
    modules: passB.modules,
    storyModuleMapping: passC.storyModuleMapping,
    executionOrder: passC.executionOrder,
    decisions: passB.decisions,
    constraints: passC.constraints,
  });
};

const makeRevisionLlmResponse = (stories: Story[]) => {
  const passB = makePassBResponse(stories);
  return {
    modules: passB.modules.map((module) =>
      module.name === 'payments'
        ? {
            ...module,
            exposedInterfaces: [...module.exposedInterfaces, 'PaymentCaptureAdapter'],
          }
        : module
    ),
    constraints: [
      {
        id: 'SCONST-001',
        type: 'technology',
        description: 'Sprint code must preserve TypeScript and Express conventions with Bun tests',
        rule: 'Implement sprint scope using TypeScript, Express, Bun test suite',
        severity: 'error',
      },
      {
        id: 'SCONST-REV-001',
        type: 'boundary',
        description: 'Payments may call auth only through exported adapter interface',
        rule: 'payments -> auth:AuthService only via PaymentCaptureAdapter',
        severity: 'error',
      },
    ],
    storyModuleMapping: makePassCSprintResponse(stories).storyModuleMapping,
    executionOrder: makePassCSprintResponse(stories).executionOrder,
    newDecision: {
      id: 'ADR-REV-001',
      title: 'Revise payment/auth integration under constraint pressure',
      context: 'Enforcement evidence shows repeated boundary violations in payment capture flow',
      decision: 'Add explicit PaymentCaptureAdapter contract and tighten boundary rule for auth calls',
      consequences: 'Preserves module topology while reducing integration drift risk',
      status: 'accepted',
    },
  };
};

function makeMockSequentialClient(
  responses: (object | Error)[],
  options?: { fencedIndices?: number[] }
): {
  client: LlmClient;
  calls: { n: number };
  requests: LlmRequest[];
} {
  let idx = 0;
  const calls = { n: 0 };
  const requests: LlmRequest[] = [];

  return {
    calls,
    requests,
    client: {
      complete: async (request) => {
        requests.push(request);
        calls.n += 1;

        const response = idx < responses.length ? responses[idx] : responses[responses.length - 1];
        idx += 1;

        if (response instanceof Error) {
          throw response;
        }

        const serialized = JSON.stringify(response);
        if (options?.fencedIndices?.includes(idx - 1)) {
          return `\`\`\`json\n${serialized}\n\`\`\``;
        }
        return serialized;
      },
    },
  };
}

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-arch-planner-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj-planner', 'story-planner');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ArchitecturePlannerAgent', () => {
  it('planSprint() produces valid global + sprint plans with passing quality scores', async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const result = await agent.planSprint({
      stories,
      projectId: 'proj-planner',
      sprintId: 'sprint-1',
    });

    expect(validatePlan(result.globalPlan).valid).toBe(true);
    expect(validatePlan(result.sprintPlan).valid).toBe(true);
    expect(result.globalScore.status).toBe('pass');
    expect(result.sprintScore.status).toBe('pass');
  });

  it('planSprint() saves both plans via ArchitecturePlanManager', async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-1' });

    const planManager = new ArchitecturePlanManager(wsMgr);
    const loadedGlobal = planManager.load(ws, result.globalPlan.planId);
    const loadedSprint = planManager.load(ws, result.sprintPlan.planId);

    expect(loadedGlobal?.planId).toBe(result.globalPlan.planId);
    expect(loadedSprint?.planId).toBe(result.sprintPlan.planId);
  });

  it("planSprint() global plan has level='global' and scopeKey='global'", async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-2' });

    expect(result.globalPlan.level).toBe('global');
    expect(result.globalPlan.scopeKey).toBe('global');
  });

  it('planSprint() sprint plan has level=\'sprint\' and correct sprintId', async () => {
    const stories = makeStories();
    const sprintId = 'sprint-abc';
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId });

    expect(result.sprintPlan.level).toBe('sprint');
    expect(result.sprintPlan.sprintId).toBe(sprintId);
    expect(result.sprintPlan.scopeKey).toBe(`sprint:${sprintId}`);
  });

  it('planSprint() sprint plan references global plan via parentPlanId', async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-parent' });

    expect(result.sprintPlan.parentPlanId).toBe(result.globalPlan.planId);
  });

  it('execute() extracts stories from handoff stateOfWorld and calls planSprint', async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);
    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const planResult = {
      globalPlan: {
        planId: 'global-id',
      } as ArchitecturePlan,
      sprintPlan: {
        planId: 'sprint-id',
      } as ArchitecturePlan,
      globalScore: {
        cohesion: 90,
        dependencySanity: 90,
        stackConsistency: 90,
        overall: 90,
        status: 'pass',
        findings: [],
      },
      sprintScore: {
        cohesion: 90,
        dependencySanity: 90,
        stackConsistency: 90,
        overall: 90,
        status: 'pass',
        findings: [],
      },
    };

    let called = false;
    // @ts-ignore - patching public method for test assertion
    agent.planSprint = async (options) => {
      called = true;
      expect(options.projectId).toBe('proj-planner');
      expect(options.sprintId).toBe('sprint-9');
      expect(options.stories).toHaveLength(stories.length);
      return planResult;
    };

    const handoff: HandoffDocument = {
      fromAgent: AgentPersona.ORCHESTRATOR,
      toAgent: AgentPersona.ARCHITECTURE_PLANNER,
      storyId: stories[0]!.id,
      status: 'completed',
      stateOfWorld: {
        refinedStories: JSON.stringify(stories),
        projectId: 'proj-planner',
        sprintId: 'sprint-9',
      },
      nextGoal: 'Plan architecture',
      artifacts: [],
      timestamp: now,
    };

    const result = await agent.execute(handoff, stories[0]!);
    expect(called).toBe(true);
    expect(result.stateOfWorld['globalPlanId']).toBe('global-id');
    expect(result.stateOfWorld['sprintPlanId']).toBe('sprint-id');
  });

  it('execute() throws on missing projectId in handoff', async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([makePassAResponse(stories)]);
    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const handoff: HandoffDocument = {
      fromAgent: AgentPersona.ORCHESTRATOR,
      toAgent: AgentPersona.ARCHITECTURE_PLANNER,
      storyId: stories[0]!.id,
      status: 'completed',
      stateOfWorld: {
        refinedStories: JSON.stringify(stories),
        sprintId: 'sprint-x',
      },
      nextGoal: 'Plan architecture',
      artifacts: [],
      timestamp: now,
    };

    await expect(agent.execute(handoff, stories[0]!)).rejects.toThrow('missing projectId');
  });

  it('execute() throws on missing refinedStories in handoff', async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([makePassAResponse(stories)]);
    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);

    const handoff: HandoffDocument = {
      fromAgent: AgentPersona.ORCHESTRATOR,
      toAgent: AgentPersona.ARCHITECTURE_PLANNER,
      storyId: stories[0]!.id,
      status: 'completed',
      stateOfWorld: {
        projectId: 'proj-planner',
        sprintId: 'sprint-x',
      },
      nextGoal: 'Plan architecture',
      artifacts: [],
      timestamp: now,
    };

    await expect(agent.execute(handoff, stories[0]!)).rejects.toThrow('missing refinedStories');
  });

  it('passA extracts domains from all stories', async () => {
    const stories = makeStories();
    const mock = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
    agent.setWorkspace(ws);
    await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-passA' });

    expect(mock.requests[0]?.userMessage).toContain('story-auth');
    expect(mock.requests[0]?.userMessage).toContain('story-payments');
    expect(mock.requests[0]?.userMessage).toContain('story-notifications');
    expect(mock.requests[0]?.userMessage).toContain('notifications');
  });

  it('passB chooses tech stack reflected in final plan', async () => {
    const stories = makeStories();
    const passB = makePassBResponse(stories);
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      passB,
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-passB' });

    expect(result.globalPlan.techStack.language).toBe(passB.techStack.language);
    expect(result.globalPlan.techStack.framework).toBe(passB.techStack.framework);
  });

  it('passC produces constraints reflected in final plan', async () => {
    const stories = makeStories();
    const passC = makePassCGlobalResponse(stories);
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      passC,
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-passC' });

    expect(result.globalPlan.constraints.map((constraint) => constraint.id)).toContain('CONST-001');
  });

  it('retries failing pass when quality score fails', async () => {
    const stories = makeStories();

    const poorPassB = {
      ...makePassBResponse(stories),
      decisions: [
        {
          id: 'ADR-WEAK',
          title: 'Keep options open',
          context: 'Initial draft is intentionally generic',
          decision: 'Use internal coding standards and postpone stack-specific constraints',
          consequences: 'High risk of architecture drift without explicit stack anchors',
          status: 'accepted',
        },
      ],
      modules: [
        {
          name: 'auth',
          description: 'Auth module',
          responsibility: 'sync state and process shared data for user actions',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService'],
          dependencies: [],
          owningStories: ['story-auth'],
        },
        {
          name: 'payments',
          description: 'Payments module',
          responsibility: 'sync state and process shared data for user actions',
          directory: 'src/modules/payments',
          exposedInterfaces: ['PaymentService'],
          dependencies: [],
          owningStories: ['story-payments'],
        },
        {
          name: 'notifications',
          description: 'Notifications module',
          responsibility: 'sync state and process shared data for user actions',
          directory: 'src/modules/notifications',
          exposedInterfaces: ['NotificationService'],
          dependencies: [],
          owningStories: ['story-notifications'],
        },
        {
          name: 'shared',
          description: 'Shared module',
          responsibility: 'sync state and process shared data for user actions',
          directory: 'src/modules/shared',
          exposedInterfaces: ['SharedService'],
          dependencies: [],
          owningStories: ['story-auth', 'story-payments', 'story-notifications'],
        },
      ],
    };

    const poorPassC = {
      ...makePassCGlobalResponse(stories),
      constraints: [
        {
          id: 'CONST-WEAK',
          type: 'boundary',
          description: 'Keep dependencies constrained',
          rule: 'No module may import private internals of another module',
          severity: 'warning',
        },
      ],
    };

    const goodPassB = makePassBResponse(stories);
    const goodPassC = makePassCGlobalResponse(stories);
    const sprintPassC = makePassCSprintResponse(stories);

    const mock = makeMockSequentialClient([
      makePassAResponse(stories),
      poorPassB,
      poorPassC,
      goodPassB,
      goodPassC,
      goodPassC,
      sprintPassC,
      sprintPassC,
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
    agent.setWorkspace(ws);

    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-retry' });

    expect(mock.calls.n).toBeGreaterThanOrEqual(6);
    expect(result.globalScore.status).toBe('pass');
  });

  it('throws AgentCallError when all retry attempts exhausted on LLM failure', async () => {
    const stories = makeStories();
    const mock = makeMockSequentialClient([
      new Error('upstream down'),
      new Error('upstream down'),
      new Error('upstream down'),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
    agent.setWorkspace(ws);
    // @ts-ignore
    agent['sleep'] = () => Promise.resolve();

    await expect(
      agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-error' })
    ).rejects.toThrow(AgentCallError);
  });

  it('strips markdown fences from LLM responses', async () => {
    const stories = makeStories();
    const mock = makeMockSequentialClient(
      [
        makePassAResponse(stories),
        makePassBResponse(stories),
        makePassCGlobalResponse(stories),
        makePassCSprintResponse(stories),
      ],
      { fencedIndices: [0, 1, 2, 3] }
    );

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-fenced' });

    expect(result.globalPlan.planId).toContain('proj-planner-global-');
    expect(result.sprintPlan.planId).toContain('proj-planner-sprint-sprint-fenced-');
  });

  it('handles existing global plan (evolution mode)', async () => {
    const stories = makeStories();
    const existingGlobalPlan: ArchitecturePlan = {
      planId: 'old-global-plan',
      schemaVersion: 1,
      projectId: 'proj-planner',
      level: 'global',
      scopeKey: 'global',
      status: 'active',
      createdAt: now,
      revisionNumber: 0,
      techStack: makePassBResponse(stories).techStack,
      modules: makePassBResponse(stories).modules,
      storyModuleMapping: makePassCGlobalResponse(stories).storyModuleMapping,
      executionOrder: makePassCGlobalResponse(stories).executionOrder,
      decisions: makePassBResponse(stories).decisions,
      constraints: makePassCGlobalResponse(stories).constraints,
    };

    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({
      stories,
      projectId: 'proj-planner',
      sprintId: 'sprint-evolve',
      existingGlobalPlan,
    });

    expect(result.globalPlan.supersedesPlanId).toBe('old-global-plan');
  });

  it('sprint plan storyModuleMapping covers all input stories', async () => {
    const stories = makeStories();
    const { client } = makeMockSequentialClient([
      makePassAResponse(stories),
      makePassBResponse(stories),
      makePassCGlobalResponse(stories),
      makePassCSprintResponse(stories),
    ]);

    const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, client);
    agent.setWorkspace(ws);
    const result = await agent.planSprint({
      stories,
      projectId: 'proj-planner',
      sprintId: 'sprint-coverage',
    });

    const mapped = new Set(result.sprintPlan.storyModuleMapping.map((mapping) => mapping.storyId));
    for (const story of stories) {
      expect(mapped.has(story.id)).toBe(true);
    }
  });

  describe('reviseSprint', () => {
    it('happy path revises sprint plan, appends decision, and supersedes existing plan', async () => {
      const stories = makeStories();
      const trigger = makePlanRevisionTrigger();
      const evidence = makeEvidenceSummary();
      const globalPlan = makeGlobalPlan(stories);
      const currentSprintPlan = makeCurrentSprintPlan(stories, globalPlan);
      const revision = makeRevisionLlmResponse(stories);
      const mock = makeMockSequentialClient([revision]);

      const planManager = new ArchitecturePlanManager(wsMgr);
      planManager.save(ws, currentSprintPlan);

      const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
      agent.setWorkspace(ws);

      const result = await agent.reviseSprint({
        trigger,
        evidence,
        currentSprintPlan,
        globalPlan,
        stories,
      });

      expect(result.revisedPlan.revisionNumber).toBe(currentSprintPlan.revisionNumber + 1);
      expect(result.revisedPlan.supersedesPlanId).toBe(currentSprintPlan.planId);
      expect(result.revisedPlan.revisionTrigger?.reason).toBe(trigger.reason);
      expect(result.revisedPlan.decisions).toHaveLength(currentSprintPlan.decisions.length + 1);
      expect(result.newDecision.id).toBe('ADR-REV-001');

      const stale = planManager.load(ws, currentSprintPlan.planId);
      const revised = planManager.load(ws, result.revisedPlan.planId);
      expect(stale?.status).toBe('stale');
      expect(stale?.supersededByPlanId).toBe(result.revisedPlan.planId);
      expect(revised?.status).toBe('active');
      expect(result.supersededPlanId).toBe(currentSprintPlan.planId);
    });

    it('preserves tech stack from current sprint plan', async () => {
      const stories = makeStories();
      const globalPlan = makeGlobalPlan(stories);
      const currentSprintPlan = makeCurrentSprintPlan(stories, globalPlan);
      const mock = makeMockSequentialClient([makeRevisionLlmResponse(stories)]);

      const planManager = new ArchitecturePlanManager(wsMgr);
      planManager.save(ws, currentSprintPlan);

      const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
      agent.setWorkspace(ws);

      const result = await agent.reviseSprint({
        trigger: makePlanRevisionTrigger(),
        evidence: makeEvidenceSummary(),
        currentSprintPlan,
        globalPlan,
        stories,
      });

      expect(result.revisedPlan.techStack).toEqual(currentSprintPlan.techStack);
    });

    it('persists via supersede by staling old plan and creating new plan artifact', async () => {
      const stories = makeStories();
      const globalPlan = makeGlobalPlan(stories);
      const currentSprintPlan = makeCurrentSprintPlan(stories, globalPlan);
      const mock = makeMockSequentialClient([makeRevisionLlmResponse(stories)]);

      const planManager = new ArchitecturePlanManager(wsMgr);
      planManager.save(ws, currentSprintPlan);

      const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
      agent.setWorkspace(ws);
      const result = await agent.reviseSprint({
        trigger: makePlanRevisionTrigger(),
        evidence: makeEvidenceSummary(),
        currentSprintPlan,
        globalPlan,
        stories,
      });

      const artifactsDir = path.join(ws.basePath, 'artifacts');
      const oldPath = path.join(artifactsDir, `architecture-plan-${currentSprintPlan.planId}.json`);
      const newPath = path.join(artifactsDir, `architecture-plan-${result.revisedPlan.planId}.json`);

      expect(fs.existsSync(oldPath)).toBe(true);
      expect(fs.existsSync(newPath)).toBe(true);
      expect(planManager.load(ws, currentSprintPlan.planId)?.status).toBe('stale');
      expect(planManager.load(ws, result.revisedPlan.planId)?.status).toBe('active');
    });

    it('throws on non-sprint current plan', async () => {
      const stories = makeStories();
      const globalPlan = makeGlobalPlan(stories);
      const mock = makeMockSequentialClient([makeRevisionLlmResponse(stories)]);
      const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
      agent.setWorkspace(ws);

      await expect(
        agent.reviseSprint({
          trigger: makePlanRevisionTrigger(),
          evidence: makeEvidenceSummary(),
          currentSprintPlan: globalPlan,
          globalPlan,
          stories,
        })
      ).rejects.toThrow('currentSprintPlan must be a sprint-level plan');
    });

    it('throws without workspace', async () => {
      const stories = makeStories();
      const globalPlan = makeGlobalPlan(stories);
      const currentSprintPlan = makeCurrentSprintPlan(stories, globalPlan);
      const mock = makeMockSequentialClient([makeRevisionLlmResponse(stories)]);
      const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);

      await expect(
        agent.reviseSprint({
          trigger: makePlanRevisionTrigger(),
          evidence: makeEvidenceSummary(),
          currentSprintPlan,
          globalPlan,
          stories,
        })
      ).rejects.toThrow('workspace is not set');
    });

    it('retries on validation failure then succeeds', async () => {
      const stories = makeStories();
      const globalPlan = makeGlobalPlan(stories);
      const currentSprintPlan = makeCurrentSprintPlan(stories, globalPlan);
      const invalid = {
        ...makeRevisionLlmResponse(stories),
        storyModuleMapping: [
          {
            ...makePassCSprintResponse(stories).storyModuleMapping[0],
            storyId: 'story-missing',
          },
          ...makePassCSprintResponse(stories).storyModuleMapping.slice(1),
        ],
      };
      const valid = makeRevisionLlmResponse(stories);
      const mock = makeMockSequentialClient([invalid, valid]);

      const planManager = new ArchitecturePlanManager(wsMgr);
      planManager.save(ws, currentSprintPlan);

      const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
      agent.setWorkspace(ws);

      const result = await agent.reviseSprint({
        trigger: makePlanRevisionTrigger(),
        evidence: makeEvidenceSummary(),
        currentSprintPlan,
        globalPlan,
        stories,
      });

      expect(mock.calls.n).toBe(2);
      expect(validatePlan(result.revisedPlan).valid).toBe(true);
    });

    it('throws after max retries exhausted', async () => {
      const stories = makeStories();
      const globalPlan = makeGlobalPlan(stories);
      const currentSprintPlan = makeCurrentSprintPlan(stories, globalPlan);
      const invalid = {
        ...makeRevisionLlmResponse(stories),
        storyModuleMapping: [
          {
            ...makePassCSprintResponse(stories).storyModuleMapping[0],
            storyId: 'story-missing',
          },
          ...makePassCSprintResponse(stories).storyModuleMapping.slice(1),
        ],
      };
      const strictConfig: AgentConfig = { ...plannerConfig, maxRetries: 1 };
      const mock = makeMockSequentialClient([invalid, invalid]);

      const planManager = new ArchitecturePlanManager(wsMgr);
      planManager.save(ws, currentSprintPlan);

      const agent = new ArchitecturePlannerAgent(strictConfig, wsMgr, handoffMgr, mock.client);
      agent.setWorkspace(ws);

      await expect(
        agent.reviseSprint({
          trigger: makePlanRevisionTrigger(),
          evidence: makeEvidenceSummary(),
          currentSprintPlan,
          globalPlan,
          stories,
        })
      ).rejects.toThrow('after 1 retry attempt(s)');
    });

    it('includes trigger and evidence in LLM user message', async () => {
      const stories = makeStories();
      const trigger = makePlanRevisionTrigger();
      const evidence = makeEvidenceSummary();
      const globalPlan = makeGlobalPlan(stories);
      const currentSprintPlan = makeCurrentSprintPlan(stories, globalPlan);
      const mock = makeMockSequentialClient([makeRevisionLlmResponse(stories)]);

      const planManager = new ArchitecturePlanManager(wsMgr);
      planManager.save(ws, currentSprintPlan);

      const agent = new ArchitecturePlannerAgent(plannerConfig, wsMgr, handoffMgr, mock.client);
      agent.setWorkspace(ws);
      await agent.reviseSprint({
        trigger,
        evidence,
        currentSprintPlan,
        globalPlan,
        stories,
      });

      expect(mock.requests[0]?.userMessage).toContain('"reason":"architecture-violation"');
      expect(mock.requests[0]?.userMessage).toContain('"triggerId":"trigger-001"');
      expect(mock.requests[0]?.userMessage).toContain('"failingModules":["payments"]');
    });
  });

  it('validates plan and rejects cyclic dependencies', async () => {
    const stories = makeStories();
    const cyclicPassB = {
      ...makePassBResponse(stories),
      modules: [
        {
          name: 'auth',
          description: 'auth',
          responsibility: 'auth responsibility',
          directory: 'src/modules/auth',
          exposedInterfaces: ['AuthService'],
          dependencies: ['payments'],
          owningStories: ['story-auth'],
        },
        {
          name: 'payments',
          description: 'payments',
          responsibility: 'payments responsibility',
          directory: 'src/modules/payments',
          exposedInterfaces: ['PaymentService'],
          dependencies: ['auth'],
          owningStories: ['story-payments'],
        },
        {
          name: 'notifications',
          description: 'notifications',
          responsibility: 'notifications responsibility',
          directory: 'src/modules/notifications',
          exposedInterfaces: ['NotificationService'],
          dependencies: ['auth'],
          owningStories: ['story-notifications'],
        },
      ],
    };

    const mock = makeMockSequentialClient([
      makePassAResponse(stories),
      cyclicPassB,
      makePassCGlobalResponse(stories),
      cyclicPassB,
      makePassCGlobalResponse(stories),
    ]);

    const strictConfig: AgentConfig = { ...plannerConfig, maxRetries: 1 };
    const agent = new ArchitecturePlannerAgent(strictConfig, wsMgr, handoffMgr, mock.client);
    agent.setWorkspace(ws);

    await expect(
      agent.planSprint({ stories, projectId: 'proj-planner', sprintId: 'sprint-cycle' })
    ).rejects.toThrow('Cycle detected');
  });
});
