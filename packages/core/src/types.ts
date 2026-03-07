import { z } from 'zod';

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
  QA_ENGINEER = 'QA_ENGINEER',
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
  workspacePath: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const HandoffDocumentSchema = z.object({
  fromAgent: z.nativeEnum(AgentPersona),
  toAgent: z.nativeEnum(AgentPersona),
  storyId: z.string().min(1),
  status: z.string().min(1),
  stateOfWorld: z.record(z.string(), z.string()),
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

export const WorkspaceStateSchema = z.object({
  projectId: z.string().min(1),
  storyId: z.string().min(1),
  basePath: z.string().min(1),
  files: z.record(z.string(), z.string()).default({}),
  agentsLog: z.array(z.string()).default([]),
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
});

// ─── TypeScript Types (inferred from Zod) ────────────────────────────────────

export type Story = z.infer<typeof StorySchema>;
export type HandoffDocument = z.infer<typeof HandoffDocumentSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
export type AppBuilderResult = z.infer<typeof AppBuilderResultSchema>;
