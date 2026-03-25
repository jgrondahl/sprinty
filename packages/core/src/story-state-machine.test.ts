import { describe, it, expect, beforeEach } from 'bun:test';
import { StoryStateMachine, InvalidStateTransitionError } from './story-state-machine';
import { StoryState, AgentPersona, StorySource, type Story } from './types';

const now = new Date().toISOString();

function makeStory(state: StoryState): Story {
  return {
    id: 'story-001',
    title: 'Test story',
    description: 'desc',
    acceptanceCriteria: [],
    dependsOn: [],
    state,
    source: StorySource.FILE,
    workspacePath: '.splinty/proj/stories/story-001',
    domain: 'general',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('StoryStateMachine', () => {
  let machine: StoryStateMachine;

  beforeEach(() => {
    machine = new StoryStateMachine();
  });

  describe('canTransition()', () => {
    it('returns true for RAW → EPIC', () => {
      expect(machine.canTransition(StoryState.RAW, StoryState.EPIC)).toBe(true);
    });

    it('returns false for RAW → MERGED (illegal jump)', () => {
      expect(machine.canTransition(StoryState.RAW, StoryState.MERGED)).toBe(false);
    });

    it('returns false for MERGED → any state (terminal)', () => {
      for (const s of Object.values(StoryState)) {
        expect(machine.canTransition(StoryState.MERGED, s)).toBe(false);
      }
    });

    it('allows IN_REVIEW → IN_PROGRESS (rework)', () => {
      expect(machine.canTransition(StoryState.IN_REVIEW, StoryState.IN_PROGRESS)).toBe(true);
    });

    it('allows IN_REVIEW → DONE (approved)', () => {
      expect(machine.canTransition(StoryState.IN_REVIEW, StoryState.DONE)).toBe(true);
    });
  });

  describe('getNextStates()', () => {
    it('returns [EPIC] for RAW', () => {
      expect(machine.getNextStates(StoryState.RAW)).toEqual([StoryState.EPIC]);
    });

    it('returns [DONE, IN_PROGRESS] for IN_REVIEW', () => {
      const next = machine.getNextStates(StoryState.IN_REVIEW);
      expect(next).toContain(StoryState.DONE);
      expect(next).toContain(StoryState.IN_PROGRESS);
    });

    it('returns empty array for MERGED', () => {
      expect(machine.getNextStates(StoryState.MERGED)).toEqual([]);
    });
  });

  describe('getResponsibleAgent()', () => {
    it('returns BUSINESS_OWNER for RAW', () => {
      expect(machine.getResponsibleAgent(StoryState.RAW)).toBe(AgentPersona.BUSINESS_OWNER);
    });

    it('returns DEVELOPER for IN_PROGRESS', () => {
      expect(machine.getResponsibleAgent(StoryState.IN_PROGRESS)).toBe(AgentPersona.DEVELOPER);
    });

    it('returns QA_ENGINEER for IN_REVIEW', () => {
      expect(machine.getResponsibleAgent(StoryState.IN_REVIEW)).toBe(AgentPersona.QA_ENGINEER);
    });

    it('returns ORCHESTRATOR for MERGED', () => {
      expect(machine.getResponsibleAgent(StoryState.MERGED)).toBe(AgentPersona.ORCHESTRATOR);
    });
  });

  describe('transition()', () => {
    it('transitions RAW → EPIC successfully', () => {
      const story = makeStory(StoryState.RAW);
      const result = machine.transition(story, StoryState.EPIC);
      expect(result.state).toBe(StoryState.EPIC);
      expect(result.id).toBe(story.id);
    });

    it('transitions through all valid states in sequence', () => {
      const sequence = [
        StoryState.RAW,
        StoryState.EPIC,
        StoryState.USER_STORY,
        StoryState.REFINED,
        StoryState.SPRINT_READY,
        StoryState.IN_PROGRESS,
        StoryState.IN_REVIEW,
        StoryState.DONE,
        StoryState.PR_OPEN,
        StoryState.MERGED,
      ];
      let story = makeStory(StoryState.RAW);
      for (let i = 1; i < sequence.length; i++) {
        story = machine.transition(story, sequence[i]);
        expect(story.state).toBe(sequence[i]);
      }
    });

    it('does not mutate original story', () => {
      const story = makeStory(StoryState.RAW);
      machine.transition(story, StoryState.EPIC);
      expect(story.state).toBe(StoryState.RAW);
    });

    it('throws InvalidStateTransitionError for illegal transition', () => {
      const story = makeStory(StoryState.RAW);
      expect(() => machine.transition(story, StoryState.MERGED)).toThrow(InvalidStateTransitionError);
    });

    it('error message describes the illegal transition', () => {
      const story = makeStory(StoryState.RAW);
      expect(() => machine.transition(story, StoryState.MERGED)).toThrow(
        'Cannot transition from RAW to MERGED'
      );
    });

    it('throws on RAW → IN_PROGRESS (skips states)', () => {
      const story = makeStory(StoryState.RAW);
      expect(() => machine.transition(story, StoryState.IN_PROGRESS)).toThrow(InvalidStateTransitionError);
    });

    it('throws on attempting to leave MERGED (terminal)', () => {
      const story = makeStory(StoryState.MERGED);
      expect(() => machine.transition(story, StoryState.RAW)).toThrow(InvalidStateTransitionError);
    });

    it('updates updatedAt on transition', () => {
      const story = makeStory(StoryState.RAW);
      const before = new Date(story.updatedAt).getTime();
      const result = machine.transition(story, StoryState.EPIC);
      const after = new Date(result.updatedAt).getTime();
      expect(after).toBeGreaterThanOrEqual(before);
    });
  });
});
