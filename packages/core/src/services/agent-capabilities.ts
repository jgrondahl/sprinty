import { z, type ZodTypeAny } from 'zod';
import { AgentPersona } from '../types';

export enum AgentCapabilityLevel {
  ADVISORY = 'advisory',
  GENERATION = 'generation',
  MUTATION = 'mutation',
  EXECUTION = 'execution',
}

export enum ToolCategory {
  LLM = 'llm',
  FILESYSTEM_READ = 'filesystem_read',
  FILESYSTEM_WRITE = 'filesystem_write',
  SANDBOX = 'sandbox',
  GIT = 'git',
  NETWORK = 'network',
}

export type AgentCapabilityProfile = {
  persona: AgentPersona;
  level: AgentCapabilityLevel;
  allowedTools: ToolCategory[];
  blacklistedTools: string[];
  maxTokenBudget: number;
  maxTimeoutMs: number;
  outputSchema: ZodTypeAny;
  canPropose: boolean;
  canApprove: boolean;
  canMutateArtifacts: boolean;
};

const OutputSchemaType = z.custom<ZodTypeAny>((value) => value instanceof z.ZodType, {
  message: 'outputSchema must be a Zod schema',
});

export const AgentCapabilityProfileSchema = z.object({
  persona: z.nativeEnum(AgentPersona),
  level: z.nativeEnum(AgentCapabilityLevel),
  allowedTools: z.array(z.nativeEnum(ToolCategory)).min(1),
  blacklistedTools: z.array(z.string()),
  maxTokenBudget: z.number().int().positive(),
  maxTimeoutMs: z.number().int().positive(),
  outputSchema: OutputSchemaType,
  canPropose: z.boolean(),
  canApprove: z.boolean(),
  canMutateArtifacts: z.boolean(),
});

const DefaultOutputSchema = z.record(z.unknown());

export const DEFAULT_CAPABILITY_PROFILES: Record<AgentPersona, AgentCapabilityProfile> = {
  [AgentPersona.BUSINESS_OWNER]: {
    persona: AgentPersona.BUSINESS_OWNER,
    level: AgentCapabilityLevel.ADVISORY,
    allowedTools: [ToolCategory.LLM],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 16_000,
    maxTimeoutMs: 30_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: true,
    canMutateArtifacts: false,
  },
  [AgentPersona.PRODUCT_OWNER]: {
    persona: AgentPersona.PRODUCT_OWNER,
    level: AgentCapabilityLevel.GENERATION,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 20_000,
    maxTimeoutMs: 45_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: true,
    canMutateArtifacts: false,
  },
  [AgentPersona.ARCHITECT]: {
    persona: AgentPersona.ARCHITECT,
    level: AgentCapabilityLevel.GENERATION,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 24_000,
    maxTimeoutMs: 60_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: false,
  },
  [AgentPersona.DEVELOPER]: {
    persona: AgentPersona.DEVELOPER,
    level: AgentCapabilityLevel.EXECUTION,
    allowedTools: [
      ToolCategory.LLM,
      ToolCategory.FILESYSTEM_READ,
      ToolCategory.FILESYSTEM_WRITE,
      ToolCategory.SANDBOX,
      ToolCategory.GIT,
    ],
    blacklistedTools: ['networkFetch'],
    maxTokenBudget: 32_000,
    maxTimeoutMs: 120_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: true,
  },
  [AgentPersona.SOUND_ENGINEER]: {
    persona: AgentPersona.SOUND_ENGINEER,
    level: AgentCapabilityLevel.ADVISORY,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 16_000,
    maxTimeoutMs: 30_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: false,
  },
  [AgentPersona.MIGRATION_ENGINEER]: {
    persona: AgentPersona.MIGRATION_ENGINEER,
    level: AgentCapabilityLevel.MUTATION,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ, ToolCategory.FILESYSTEM_WRITE],
    blacklistedTools: ['networkFetch', 'gitPush'],
    maxTokenBudget: 24_000,
    maxTimeoutMs: 60_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: true,
  },
  [AgentPersona.INFRASTRUCTURE_ENGINEER]: {
    persona: AgentPersona.INFRASTRUCTURE_ENGINEER,
    level: AgentCapabilityLevel.MUTATION,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ, ToolCategory.FILESYSTEM_WRITE],
    blacklistedTools: ['networkFetch', 'gitPush'],
    maxTokenBudget: 24_000,
    maxTimeoutMs: 60_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: true,
  },
  [AgentPersona.INTEGRATION_TEST_ENGINEER]: {
    persona: AgentPersona.INTEGRATION_TEST_ENGINEER,
    level: AgentCapabilityLevel.EXECUTION,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ, ToolCategory.SANDBOX],
    blacklistedTools: ['gitPush', 'networkFetch'],
    maxTokenBudget: 24_000,
    maxTimeoutMs: 90_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: false,
  },
  [AgentPersona.QA_ENGINEER]: {
    persona: AgentPersona.QA_ENGINEER,
    level: AgentCapabilityLevel.ADVISORY,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 20_000,
    maxTimeoutMs: 45_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: false,
  },
  [AgentPersona.TECHNICAL_WRITER]: {
    persona: AgentPersona.TECHNICAL_WRITER,
    level: AgentCapabilityLevel.GENERATION,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ, ToolCategory.FILESYSTEM_WRITE],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 20_000,
    maxTimeoutMs: 45_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: true,
  },
  [AgentPersona.ARCHITECTURE_PLANNER]: {
    persona: AgentPersona.ARCHITECTURE_PLANNER,
    level: AgentCapabilityLevel.GENERATION,
    allowedTools: [ToolCategory.LLM, ToolCategory.FILESYSTEM_READ],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 24_000,
    maxTimeoutMs: 60_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: false,
  },
  [AgentPersona.ORCHESTRATOR]: {
    persona: AgentPersona.ORCHESTRATOR,
    level: AgentCapabilityLevel.ADVISORY,
    allowedTools: [ToolCategory.LLM],
    blacklistedTools: ['executeCommand', 'gitPush', 'networkFetch'],
    maxTokenBudget: 16_000,
    maxTimeoutMs: 30_000,
    outputSchema: DefaultOutputSchema,
    canPropose: true,
    canApprove: false,
    canMutateArtifacts: false,
  },
};

export function getAgentCapabilityProfile(persona: AgentPersona): AgentCapabilityProfile {
  return DEFAULT_CAPABILITY_PROFILES[persona];
}
