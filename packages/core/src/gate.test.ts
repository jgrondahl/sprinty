import { describe, expect, test } from 'bun:test';
import { AgentPersona } from './types';
import { GateConfigSchema } from './sprint-state';

describe('GateConfigSchema', () => {
  test('parses valid config', () => {
    const parsed = GateConfigSchema.parse({
      after: AgentPersona.ARCHITECT,
      requireApproval: 'always',
      notifyVia: 'cli-prompt',
    });

    expect(parsed.after).toBe(AgentPersona.ARCHITECT);
    expect(parsed.requireApproval).toBe('always');
    expect(parsed.notifyVia).toBe('cli-prompt');
  });

  test('rejects invalid requireApproval', () => {
    expect(() =>
      GateConfigSchema.parse({
        after: AgentPersona.ARCHITECT,
        requireApproval: 'whenever',
      })
    ).toThrow();
  });

  test('allows missing notifyVia', () => {
    const parsed = GateConfigSchema.parse({
      after: AgentPersona.ARCHITECT,
      requireApproval: 'on-cross-service',
    });

    expect(parsed.notifyVia).toBeUndefined();
  });

  test('rejects unknown notifyVia', () => {
    expect(() =>
      GateConfigSchema.parse({
        after: AgentPersona.ARCHITECT,
        requireApproval: 'always',
        notifyVia: 'slack',
      })
    ).toThrow();
  });

  test('parses config with never approval policy', () => {
    const parsed = GateConfigSchema.parse({
      after: AgentPersona.SOUND_ENGINEER,
      requireApproval: 'never',
    });

    expect(parsed.after).toBe(AgentPersona.SOUND_ENGINEER);
    expect(parsed.requireApproval).toBe('never');
  });
});
