import {
  AgentPersona,
  StoryState,
  type HandoffDocument,
  type Story,
} from '@splinty/core';
import { StoryStateMachine } from '@splinty/core';
import { BaseAgent } from './base-agent';

const ARCHITECT_SYSTEM_PROMPT = `You are the Lead Software Architect on a SCRUM team. Your principles:
- Clean Architecture (separation of concerns, dependency inversion)
- Domain-driven design — let the story domain drive tech stack decisions
- You produce Architecture Decision Records (ADRs) in MADR format
- You produce Mermaid C4 context diagrams

RULES:
1. Analyze the story domain and tags to select an appropriate tech stack — do NOT default to TypeScript/Node for everything
2. If the story involves 'audio', 'ml', 'signal-processing', or similar domains, set soundEngineerRequired to true
3. Design components, data models, and API contracts at an architectural level only — no implementation code
4. Your ADR must include: Title, Status, Context, Decision, Consequences
5. Your Mermaid diagram must be a valid C4Context or C4Container diagram

Respond ONLY with a valid JSON object:
{
  "adr": "string — full ADR markdown content",
  "diagram": "string — full Mermaid diagram (C4Context or C4Container)",
  "techStack": "string — chosen tech stack summary",
  "soundEngineerRequired": boolean,
  "soundEngineerRationale": "string — reason why sound engineer is or is not needed (required even if false)"
}`;

export class ArchitectAgent extends BaseAgent {
  private stateMachine = new StoryStateMachine();

  async execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    // Transition: SPRINT_READY → IN_PROGRESS
    const inProgressStory = this.stateMachine.transition(story, StoryState.IN_PROGRESS);

    // Build context from handoff and story
    const acceptanceCriteria = handoff?.stateOfWorld['acceptanceCriteria'] ?? story.acceptanceCriteria.join('\n');
    const domain = story.domain;
    const tags = story.tags.join(', ');

    const userMessage = `Design the architecture for this user story:

Title: ${story.title}
Description: ${story.description}
Domain: ${domain}
Tags: ${tags}
Acceptance Criteria:
${acceptanceCriteria}

${handoff ? `Business Context: ${handoff.stateOfWorld['businessGoals'] ?? ''}` : ''}

Produce:
1. An ADR (Architecture Decision Record) in MADR format
2. A Mermaid C4 diagram
3. Tech stack recommendation based on the domain
4. Set soundEngineerRequired = true if domain/tags indicate audio, ML, or signal-processing work

Return the JSON object as specified.`;

    const rawResponse = await this.callClaude({
      systemPrompt: ARCHITECT_SYSTEM_PROMPT,
      userMessage,
    });

    // Parse JSON — strip markdown fences if present
    let parsed: {
      adr?: string;
      diagram?: string;
      techStack?: string;
      soundEngineerRequired?: boolean;
      soundEngineerRationale?: string;
    };

    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      throw new Error(
        `ArchitectAgent: Claude returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    // Validate required fields
    if (!parsed.adr) throw new Error("ArchitectAgent: missing 'adr' in response");
    if (!parsed.diagram) throw new Error("ArchitectAgent: missing 'diagram' in response");
    if (parsed.soundEngineerRequired === undefined) {
      throw new Error("ArchitectAgent: missing 'soundEngineerRequired' in response");
    }

    // Write artifacts to workspace
    if (this.currentWorkspace) {
      this.workspaceManager.writeFile(this.currentWorkspace, 'artifacts/architecture.md', parsed.adr);
      this.workspaceManager.writeFile(this.currentWorkspace, 'artifacts/diagram.mmd', parsed.diagram);
      this.logActivity(`Architecture artifacts written: architecture.md, diagram.mmd`);
    }

    // Also check story tags/domain for audio — belt and suspenders
    const isAudio =
      parsed.soundEngineerRequired === true ||
      story.tags.includes('audio') ||
      story.domain.includes('audio');

    const soundEngineerRequired = isAudio;

    return this.buildHandoff(
      inProgressStory,
      AgentPersona.DEVELOPER,
      {
        techStack: parsed.techStack ?? '',
        soundEngineerRequired: String(soundEngineerRequired),
        soundEngineerRationale: parsed.soundEngineerRationale ?? '',
        architecturePath: 'artifacts/architecture.md',
        diagramPath: 'artifacts/diagram.mmd',
      },
      'Implement the architecture: generate source files, write tests, create git branch and commit',
      ['artifacts/architecture.md', 'artifacts/diagram.mmd']
    );
  }
}
