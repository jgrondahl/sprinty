import { describe, it, expect } from 'bun:test';
import {
  StoryState,
  StorySource,
  AgentPersona,
  StorySchema,
  HandoffDocumentSchema,
  AgentConfigSchema,
  WorkspaceStateSchema,
  AppBuilderResultSchema,
} from './types';

const now = new Date().toISOString();

const validStory = {
  id: 'story-001',
  title: 'As a user I want to log in',
  description: 'User authentication flow',
  acceptanceCriteria: ['Given valid credentials, user is logged in'],
  state: StoryState.RAW,
  source: StorySource.FILE,
  workspacePath: '.splinty/proj/stories/story-001',
  createdAt: now,
  updatedAt: now,
};

describe('StorySchema', () => {
  it('parses a valid story', () => {
    const result = StorySchema.parse(validStory);
    expect(result.id).toBe('story-001');
    expect(result.state).toBe(StoryState.RAW);
    expect(result.domain).toBe('general');
    expect(result.tags).toEqual([]);
  });

  it('rejects story missing required title', () => {
    expect(() =>
      StorySchema.parse({ ...validStory, title: '' })
    ).toThrow();
  });

  it('rejects story missing required id', () => {
    const { id: _id, ...noId } = validStory;
    expect(() => StorySchema.parse(noId)).toThrow();
  });

  it('accepts optional storyPoints and sourceId', () => {
    const result = StorySchema.parse({
      ...validStory,
      storyPoints: 5,
      sourceId: 'JIRA-123',
    });
    expect(result.storyPoints).toBe(5);
    expect(result.sourceId).toBe('JIRA-123');
  });

  it('rejects invalid state enum', () => {
    expect(() =>
      StorySchema.parse({ ...validStory, state: 'INVALID_STATE' })
    ).toThrow();
  });
});

describe('HandoffDocumentSchema', () => {
  const validHandoff = {
    fromAgent: AgentPersona.ARCHITECT,
    toAgent: AgentPersona.DEVELOPER,
    storyId: 'story-001',
    status: 'completed',
    stateOfWorld: { 'arch-decision': 'Use REST API' },
    nextGoal: 'Implement the REST endpoints',
    artifacts: ['artifacts/api-spec.json'],
    timestamp: now,
  };

  it('parses a valid handoff document', () => {
    const result = HandoffDocumentSchema.parse(validHandoff);
    expect(result.fromAgent).toBe(AgentPersona.ARCHITECT);
    expect(result.toAgent).toBe(AgentPersona.DEVELOPER);
    expect(result.artifacts).toHaveLength(1);
  });

  it('rejects missing storyId', () => {
    const { storyId: _s, ...noId } = validHandoff;
    expect(() => HandoffDocumentSchema.parse(noId)).toThrow();
  });

  it('defaults artifacts to empty array', () => {
    const { artifacts: _a, ...noArtifacts } = validHandoff;
    const result = HandoffDocumentSchema.parse(noArtifacts);
    expect(result.artifacts).toEqual([]);
  });
});

describe('AgentConfigSchema', () => {
  it('parses valid agent config with defaults', () => {
    const result = AgentConfigSchema.parse({
      persona: AgentPersona.DEVELOPER,
      model: 'claude-sonnet-4-5',
      systemPrompt: 'You are a developer.',
    });
    expect(result.maxRetries).toBe(3);
    expect(result.temperature).toBe(0.7);
  });

  it('rejects temperature out of range', () => {
    expect(() =>
      AgentConfigSchema.parse({
        persona: AgentPersona.DEVELOPER,
        model: 'claude-sonnet-4-5',
        systemPrompt: 'You are a developer.',
        temperature: 2.0,
      })
    ).toThrow();
  });
});

describe('WorkspaceStateSchema', () => {
  it('parses valid workspace state', () => {
    const result = WorkspaceStateSchema.parse({
      projectId: 'proj-001',
      storyId: 'story-001',
      basePath: '.splinty/proj-001/stories/story-001',
    });
    expect(result.files).toEqual({});
    expect(result.agentsLog).toEqual([]);
  });
});

describe('AppBuilderResultSchema', () => {
  it('parses valid app builder result', () => {
    const result = AppBuilderResultSchema.parse({
      storyId: 'story-001',
      gitBranch: 'feature/story-001',
      commitShas: ['abc123'],
      testResults: { passed: 5, failed: 0, skipped: 1 },
      duration: 42.5,
    });
    expect(result.gitBranch).toBe('feature/story-001');
    expect(result.testResults.passed).toBe(5);
  });
});

describe('StoryState enum', () => {
  it('has all 10 states', () => {
    const states = Object.values(StoryState);
    expect(states).toHaveLength(10);
    expect(states).toContain('RAW');
    expect(states).toContain('MERGED');
  });
});

describe('AgentPersona enum', () => {
  it('has all 8 personas', () => {
    const personas = Object.values(AgentPersona);
    expect(personas).toHaveLength(8);
    expect(personas).toContain('ORCHESTRATOR');
    expect(personas).toContain('SOUND_ENGINEER');
    expect(personas).toContain('TECHNICAL_WRITER');
  });
});
