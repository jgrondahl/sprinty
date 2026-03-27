import { z } from 'zod';
import {
  ArchitecturePlanRefSchema,
  SprintTaskPlanRefSchema,
  ImplementationTaskRefSchema,
} from './architecture-plan';
import { ProjectContextSchema } from './project-memory';

// ─── Enums ───────────────────────────────────────────────────────────────────

export enum StoryState {
  RAW = 'RAW',
  EPIC = 'EPIC',
  USER_STORY = 'USER_STORY',
  REFINED = 'REFINED',
  SPRINT_READY = 'SPRINT_READY',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
  PR_OPEN = 'PR_OPEN',
  MERGED = 'MERGED',
}

export enum StorySource {
  FILE = 'FILE',
  JIRA = 'JIRA',
  GITHUB = 'GITHUB',
}

export enum AgentPersona {
  BUSINESS_OWNER = 'BUSINESS_OWNER',
  PRODUCT_OWNER = 'PRODUCT_OWNER',
  ARCHITECT = 'ARCHITECT',
  DEVELOPER = 'DEVELOPER',
  SOUND_ENGINEER = 'SOUND_ENGINEER',
  MIGRATION_ENGINEER = 'MIGRATION_ENGINEER',
  INFRASTRUCTURE_ENGINEER = 'INFRASTRUCTURE_ENGINEER',
  INTEGRATION_TEST_ENGINEER = 'INTEGRATION_TEST_ENGINEER',
  QA_ENGINEER = 'QA_ENGINEER',
  TECHNICAL_WRITER = 'TECHNICAL_WRITER',
  ARCHITECTURE_PLANNER = 'ARCHITECTURE_PLANNER',
  ORCHESTRATOR = 'ORCHESTRATOR',
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const StorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  acceptanceCriteria: z.array(z.string()),
  state: z.nativeEnum(StoryState),
  source: z.nativeEnum(StorySource),
  sourceId: z.string().optional(),
  storyPoints: z.number().int().positive().optional(),
  domain: z.string().default('general'),
  tags: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
  workspacePath: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sortOrder: z.number().int().optional(),
  readiness: z.string().optional(),
});

export const HandoffDocumentSchema = z.object({
  fromAgent: z.nativeEnum(AgentPersona),
  toAgent: z.nativeEnum(AgentPersona),
  storyId: z.string().min(1),
  status: z.string().min(1),
  stateOfWorld: z.record(z.string(), z.string()),
  architecturePlan: ArchitecturePlanRefSchema.optional(),
  sprintTaskPlan: SprintTaskPlanRefSchema.optional(),
  task: ImplementationTaskRefSchema.optional(),
  projectContext: ProjectContextSchema.optional(),
  nextGoal: z.string().min(1),
  artifacts: z.array(z.string()).default([]),
  timestamp: z.string().datetime(),
});

export const AgentConfigSchema = z.object({
  persona: z.nativeEnum(AgentPersona),
  model: z.string().min(1),
  systemPrompt: z.string().min(1),
  maxRetries: z.number().int().positive().default(3),
  temperature: z.number().min(0).max(1).default(0.7),
});

export const ModelConfigSchema = z.object({
  model: z.string().min(1),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const WorkspaceStateSchema = z.object({
  projectId: z.string().min(1),
  storyId: z.string().min(1),
  basePath: z.string().min(1),
  files: z.record(z.string(), z.string()).default({}),
  agentsLog: z.array(z.string()).default([]),
});

export const ArchitectureMetricsSchema = z.object({
  planId: z.string().min(1),
  revisionCount: z.number().int().min(0),
  boundaryViolations: z.number().int().min(0),
  dependencyViolations: z.number().int().min(0),
  namingViolations: z.number().int().min(0),
  patternViolations: z.number().int().min(0),
  constraintsSatisfied: z.number().int().min(0),
  constraintsTotal: z.number().int().min(0),
});

export const StoryMetricsSchema = z.object({
  storyId: z.string().min(1),
  totalDurationMs: z.number().int().min(0),
  llmCalls: z.number().int().min(0),
  totalTokens: z.object({
    input: z.number().int().min(0),
    output: z.number().int().min(0),
  }),
  sandboxRuns: z.number().int().min(0),
  reworkCycles: z.number().int().min(0),
  revisionContributions: z.number().int().min(0),
  costEstimateUsd: z.number().min(0),
  agentDurationsMs: z.record(z.string(), z.number().int().min(0)).default({}),
  traceId: z.string().min(1),
  architectureMetrics: ArchitectureMetricsSchema.optional(),
});

export const AppBuilderResultSchema = z.object({
  storyId: z.string().min(1),
  gitBranch: z.string(),
  prUrl: z.string().url().optional(),
  commitShas: z.array(z.string()).default([]),
  testResults: z.object({
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
    skipped: z.number().int().min(0),
  }),
  duration: z.number().positive(),
  metrics: StoryMetricsSchema.optional(),
});

export const ExecutionMetricsSchema = z.object({
  totalTasks: z.number().int().min(0),
  completedTasks: z.number().int().min(0),
  failedTasks: z.number().int().min(0),
  blockedTasks: z.number().int().min(0),
  totalRetries: z.number().int().min(0),
  architectureRevisions: z.number().int().min(0),
  averageTaskDurationMs: z.number().min(0),
  totalDurationMs: z.number().int().min(0),
});

export const AggregateSandboxTelemetrySchema = z.object({
  totalRuns: z.number().int().min(0),
  successfulRuns: z.number().int().min(0),
  failedRuns: z.number().int().min(0),
  resourceLimitViolations: z.number().int().min(0),
  peakCpuPercent: z.number().min(0),
  peakMemoryMb: z.number().min(0),
  totalDiskUsageMb: z.number().min(0),
  totalSandboxRuntimeMs: z.number().int().min(0),
});

export const SprintTelemetrySchema = z.object({
  sprintId: z.string().min(1),
  runId: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  stories: z.array(StoryMetricsSchema),
  totalDurationMs: z.number().int().min(0),
  totalLlmCalls: z.number().int().min(0),
  totalCostEstimateUsd: z.number().min(0),
  execution: ExecutionMetricsSchema.optional(),
  sandbox: AggregateSandboxTelemetrySchema.optional(),
});

// ─── TypeScript Types (inferred from Zod) ────────────────────────────────────

export type Story = z.infer<typeof StorySchema>;
export type HandoffDocument = z.infer<typeof HandoffDocumentSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
export type ArchitectureMetrics = z.infer<typeof ArchitectureMetricsSchema>;
export type StoryMetrics = z.infer<typeof StoryMetricsSchema>;
export type AppBuilderResult = z.infer<typeof AppBuilderResultSchema>;
export type ExecutionMetrics = z.infer<typeof ExecutionMetricsSchema>;
export type AggregateSandboxTelemetry = z.infer<typeof AggregateSandboxTelemetrySchema>;
export type SprintTelemetry = z.infer<typeof SprintTelemetrySchema>;

export interface StoryContext {
  story: Story;
  handoff: HandoffDocument | null;
  requiresAudio: boolean;
  [key: string]: unknown;
}

export interface PipelineStep {
  agent: AgentPersona;
  condition?: (context: StoryContext) => boolean;
  retries?: number;
  timeout?: number;
}

export interface PipelineConfig {
  steps: PipelineStep[];
}

// ─── Multi-Service Support ────────────────────────────────────────────────────

export const ServiceDefinitionSchema = z.object({
  name: z.string().min(1),
  stack: z.object({
    language: z.string().min(1),
    runtime: z.string().min(1),
    framework: z.string().min(1),
  }),
  repoPath: z.string().min(1),
  dependencies: z.array(z.string()),
  ports: z.array(z.number().int().positive()),
});

export const ServiceGuardrailsSchema = z.object({
  maxServicesPerProject: z.number().int().positive().default(4),
  requireHumanApproval: z.boolean().default(true),
});

export type ServiceDefinition = z.infer<typeof ServiceDefinitionSchema>;
export type ServiceGuardrails = z.infer<typeof ServiceGuardrailsSchema>;
