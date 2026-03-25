import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { AgentPersona } from '../types';
import {
  AgentCapabilityLevel,
  AgentCapabilityProfileSchema,
  DEFAULT_CAPABILITY_PROFILES,
  ToolCategory,
} from './agent-capabilities';

describe('agent capability profiles', () => {
  it('covers all 12 agent personas', () => {
    const personas = Object.values(AgentPersona);
    const covered = Object.keys(DEFAULT_CAPABILITY_PROFILES);
    expect(covered).toHaveLength(personas.length);
    for (const persona of personas) {
      expect(covered).toContain(persona);
    }
  });

  it('defines DEVELOPER as execution profile with sandbox and git', () => {
    const profile = DEFAULT_CAPABILITY_PROFILES[AgentPersona.DEVELOPER];
    expect(profile.level).toBe(AgentCapabilityLevel.EXECUTION);
    expect(profile.allowedTools).toContain(ToolCategory.SANDBOX);
    expect(profile.allowedTools).toContain(ToolCategory.GIT);
    expect(profile.allowedTools).toContain(ToolCategory.FILESYSTEM_WRITE);
    expect(profile.blacklistedTools).toContain('networkFetch');
    expect(profile.canMutateArtifacts).toBe(true);
  });

  it('defines QA_ENGINEER as advisory with read-only tool access', () => {
    const profile = DEFAULT_CAPABILITY_PROFILES[AgentPersona.QA_ENGINEER];
    expect(profile.level).toBe(AgentCapabilityLevel.ADVISORY);
    expect(profile.allowedTools).toEqual([ToolCategory.LLM, ToolCategory.FILESYSTEM_READ]);
    expect(profile.canApprove).toBe(false);
    expect(profile.canMutateArtifacts).toBe(false);
  });

  it('validates canonical profile shape with zod', () => {
    const profile = DEFAULT_CAPABILITY_PROFILES[AgentPersona.ARCHITECT];
    const parsed = AgentCapabilityProfileSchema.parse(profile);
    expect(parsed.persona).toBe(AgentPersona.ARCHITECT);
  });

  it('rejects invalid persona in profile schema', () => {
    expect(() =>
      AgentCapabilityProfileSchema.parse({
        persona: 'INVALID',
        level: AgentCapabilityLevel.ADVISORY,
        allowedTools: [ToolCategory.LLM],
        blacklistedTools: [],
        maxTokenBudget: 1000,
        maxTimeoutMs: 1000,
        outputSchema: z.object({}),
        canPropose: true,
        canApprove: false,
        canMutateArtifacts: false,
      })
    ).toThrow();
  });
});
