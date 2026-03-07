import { StoryState, AgentPersona, type Story } from './types';

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class InvalidStateTransitionError extends Error {
  constructor(from: StoryState, to: StoryState) {
    super(`Cannot transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

// ─── Transition Map ───────────────────────────────────────────────────────────

const TRANSITIONS: Readonly<Record<StoryState, StoryState[]>> = {
  [StoryState.RAW]: [StoryState.EPIC],
  [StoryState.EPIC]: [StoryState.USER_STORY],
  [StoryState.USER_STORY]: [StoryState.REFINED],
  [StoryState.REFINED]: [StoryState.SPRINT_READY],
  [StoryState.SPRINT_READY]: [StoryState.IN_PROGRESS],
  [StoryState.IN_PROGRESS]: [StoryState.IN_REVIEW],
  [StoryState.IN_REVIEW]: [StoryState.DONE, StoryState.IN_PROGRESS], // IN_PROGRESS = rework
  [StoryState.DONE]: [StoryState.PR_OPEN],
  [StoryState.PR_OPEN]: [StoryState.MERGED],
  [StoryState.MERGED]: [],
};

// ─── Responsible Agent Map ────────────────────────────────────────────────────

const RESPONSIBLE_AGENT: Readonly<Record<StoryState, AgentPersona>> = {
  [StoryState.RAW]: AgentPersona.BUSINESS_OWNER,
  [StoryState.EPIC]: AgentPersona.PRODUCT_OWNER,
  [StoryState.USER_STORY]: AgentPersona.PRODUCT_OWNER,
  [StoryState.REFINED]: AgentPersona.ORCHESTRATOR,
  [StoryState.SPRINT_READY]: AgentPersona.ORCHESTRATOR,
  [StoryState.IN_PROGRESS]: AgentPersona.DEVELOPER,
  [StoryState.IN_REVIEW]: AgentPersona.QA_ENGINEER,
  [StoryState.DONE]: AgentPersona.QA_ENGINEER,
  [StoryState.PR_OPEN]: AgentPersona.DEVELOPER,
  [StoryState.MERGED]: AgentPersona.ORCHESTRATOR,
};

// ─── State Machine ────────────────────────────────────────────────────────────

export class StoryStateMachine {
  /**
   * Returns true if transitioning from `from` to `to` is a legal move.
   */
  canTransition(from: StoryState, to: StoryState): boolean {
    return TRANSITIONS[from].includes(to);
  }

  /**
   * Returns all valid next states from the given state.
   */
  getNextStates(current: StoryState): StoryState[] {
    return [...TRANSITIONS[current]];
  }

  /**
   * Returns the agent persona responsible for a story in the given state.
   */
  getResponsibleAgent(state: StoryState): AgentPersona {
    return RESPONSIBLE_AGENT[state];
  }

  /**
   * Transitions a story to a new state. Returns a new Story object with the
   * updated state and updatedAt timestamp. Throws InvalidStateTransitionError
   * if the transition is not legal.
   */
  transition(story: Story, newState: StoryState): Story {
    if (!this.canTransition(story.state, newState)) {
      throw new InvalidStateTransitionError(story.state, newState);
    }

    return {
      ...story,
      state: newState,
      updatedAt: new Date().toISOString(),
    };
  }
}
