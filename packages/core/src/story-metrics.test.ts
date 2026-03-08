import { describe, expect, it } from 'bun:test';
import {
  AppBuilderResultSchema,
  SprintTelemetrySchema,
  StoryMetricsSchema,
} from './types';

const now = new Date().toISOString();

describe('StoryMetricsSchema', () => {
  it('parses valid object', () => {
    const parsed = StoryMetricsSchema.parse({
      storyId: 'story-1',
      totalDurationMs: 1200,
      llmCalls: 4,
      totalTokens: { input: 0, output: 0 },
      sandboxRuns: 1,
      reworkCycles: 2,
      revisionContributions: 0,
      costEstimateUsd: 0,
      agentDurationsMs: {
        DEVELOPER: 500,
        QA_ENGINEER: 300,
      },
      traceId: 'story-1-12345',
    });

    expect(parsed.storyId).toBe('story-1');
    expect(parsed.llmCalls).toBe(4);
  });
});

describe('SprintTelemetrySchema', () => {
  it('parses with stories array', () => {
    const parsed = SprintTelemetrySchema.parse({
      sprintId: 'sprint-1',
      runId: 'run-1',
      startedAt: now,
      completedAt: now,
      stories: [
        {
          storyId: 'story-1',
          totalDurationMs: 100,
          llmCalls: 1,
          totalTokens: { input: 0, output: 0 },
          sandboxRuns: 0,
          reworkCycles: 0,
          revisionContributions: 0,
          costEstimateUsd: 0,
          agentDurationsMs: {},
          traceId: 'story-1-1',
        },
      ],
      totalDurationMs: 100,
      totalLlmCalls: 1,
      totalCostEstimateUsd: 0,
    });

    expect(parsed.stories).toHaveLength(1);
    expect(parsed.sprintId).toBe('sprint-1');
  });
});

describe('AppBuilderResultSchema', () => {
  it('allows optional metrics field', () => {
    const withoutMetrics = AppBuilderResultSchema.parse({
      storyId: 'story-001',
      gitBranch: 'feature/story-001',
      commitShas: ['abc123'],
      testResults: { passed: 5, failed: 0, skipped: 1 },
      duration: 42.5,
    });
    expect(withoutMetrics.metrics).toBeUndefined();

    const withMetrics = AppBuilderResultSchema.parse({
      storyId: 'story-001',
      gitBranch: 'feature/story-001',
      commitShas: ['abc123'],
      testResults: { passed: 5, failed: 0, skipped: 1 },
      duration: 42.5,
      metrics: {
        storyId: 'story-001',
        totalDurationMs: 100,
        llmCalls: 2,
        totalTokens: { input: 0, output: 0 },
        sandboxRuns: 1,
        reworkCycles: 1,
        revisionContributions: 0,
        costEstimateUsd: 0,
        agentDurationsMs: { DEVELOPER: 60 },
        traceId: 'story-001-1',
      },
    });
    expect(withMetrics.metrics?.storyId).toBe('story-001');
  });
});
