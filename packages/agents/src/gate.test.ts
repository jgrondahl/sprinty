import { describe, expect, test } from 'bun:test';
import { SprintOrchestrator, GateRejectedError } from './orchestrator';
import {
  AgentPersona,
  StoryState,
  StorySource,
  type HandoffDocument,
  type HumanGate,
  type PlanRevisionTrigger,
  type Story,
} from '@splinty/core';

class MockHumanGate implements HumanGate {
  public calls = 0;

  constructor(private readonly approved: boolean) {}

  async requestApproval(_trigger: PlanRevisionTrigger): Promise<boolean> {
    this.calls += 1;
    return this.approved;
  }
}

const makeStory = (): Story => ({
  id: 'story-gate',
  title: 'Gate test story',
  description: 'Gate checks',
  acceptanceCriteria: ['works'],
  state: StoryState.RAW,
  source: StorySource.FILE,
  workspacePath: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  domain: 'core',
  tags: [],
  dependsOn: [],
});

const makeHandoff = (stateOfWorld: Record<string, string> = {}): HandoffDocument => ({
  fromAgent: AgentPersona.DEVELOPER,
  toAgent: AgentPersona.QA_ENGINEER,
  storyId: 'story-gate',
  status: 'ready',
  stateOfWorld,
  nextGoal: 'Continue',
  artifacts: [],
  timestamp: '2026-01-01T00:00:00.000Z',
});

const invokeCheckGate = async (
  orchestrator: SprintOrchestrator,
  afterAgent: AgentPersona,
  handoff: HandoffDocument,
  story: Story
): Promise<void> => {
  const method = orchestrator as unknown as {
    checkGate: (after: AgentPersona, gateHandoff: HandoffDocument, gateStory: Story) => Promise<void>;
  };
  await method.checkGate(afterAgent, handoff, story);
};

describe('SprintOrchestrator gate checks', () => {
  test("gate 'never' skips approval", async () => {
    const humanGate = new MockHumanGate(true);
    const orchestrator = new SprintOrchestrator({
      projectId: 'test-proj',
      humanGate,
      gates: [{ after: AgentPersona.ARCHITECT, requireApproval: 'never' }],
    });

    await invokeCheckGate(orchestrator, AgentPersona.ARCHITECT, makeHandoff(), makeStory());
    expect(humanGate.calls).toBe(0);
  });

  test("gate 'always' calls approval", async () => {
    const humanGate = new MockHumanGate(true);
    const orchestrator = new SprintOrchestrator({
      projectId: 'test-proj',
      humanGate,
      gates: [{ after: AgentPersona.ARCHITECT, requireApproval: 'always' }],
    });

    await invokeCheckGate(orchestrator, AgentPersona.ARCHITECT, makeHandoff(), makeStory());
    expect(humanGate.calls).toBe(1);
  });

  test("gate 'always' denial throws GateRejectedError", async () => {
    const humanGate = new MockHumanGate(false);
    const orchestrator = new SprintOrchestrator({
      projectId: 'test-proj',
      humanGate,
      gates: [{ after: AgentPersona.ARCHITECT, requireApproval: 'always' }],
    });

    await expect(invokeCheckGate(orchestrator, AgentPersona.ARCHITECT, makeHandoff(), makeStory())).rejects.toBeInstanceOf(
      GateRejectedError
    );
    expect(humanGate.calls).toBe(1);
  });

  test("gate 'on-cross-service' skips when single service", async () => {
    const humanGate = new MockHumanGate(true);
    const orchestrator = new SprintOrchestrator({
      projectId: 'test-proj',
      humanGate,
      gates: [{ after: AgentPersona.ARCHITECT, requireApproval: 'on-cross-service' }],
    });

    await invokeCheckGate(orchestrator, AgentPersona.ARCHITECT, makeHandoff({ services: 'api' }), makeStory());
    expect(humanGate.calls).toBe(0);
  });
});
