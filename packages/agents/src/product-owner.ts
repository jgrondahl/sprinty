import {
  AgentPersona,
  StoryState,
  type HandoffDocument,
  type Story,
} from '@splinty/core';
import { StoryStateMachine } from '@splinty/core';
import { BaseAgent } from './base-agent';

const PRODUCT_OWNER_SYSTEM_PROMPT = `You are the Product Owner in a SCRUM team. You are the User Advocate and Backlog Owner. Your role is to:
1. Transform epic summaries into well-formed user stories (As a <user>, I want <goal>, So that <reason>)
2. Write Gherkin-style acceptance criteria (Given/When/Then)
3. Apply MoSCoW prioritization (MUST/SHOULD/COULD/WONT)
4. Estimate story points (1, 2, 3, 5, 8, 13, 21 — Fibonacci scale)
5. Identify the story domain (e.g. 'auth', 'audio', 'payments', 'notifications', 'general')
6. Assign relevant tags (e.g. 'audio', 'realtime', 'security', 'ml')

IMPORTANT:
- Do NOT include implementation details — user stories only (no code, no architecture)
- EVERY story MUST have at least 1 acceptance criterion
- Use precise, testable acceptance criteria

Respond ONLY with a valid JSON object matching this structure:
{
  "title": "string — user story title in 'As a... I want... So that...' format",
  "description": "string — expanded story description",
  "acceptanceCriteria": ["string — Gherkin Given/When/Then scenario 1", "..."],
  "priority": "MUST" | "SHOULD" | "COULD" | "WONT",
  "storyPoints": number,
  "domain": "string — primary domain",
  "tags": ["string", "..."]
}`;

export class ProductOwnerAgent extends BaseAgent {
  private stateMachine = new StoryStateMachine();

  async execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    // Transition: EPIC → USER_STORY
    const userStory = this.stateMachine.transition(story, StoryState.USER_STORY);

    const businessContext = handoff
      ? `Business Goals: ${handoff.stateOfWorld['businessGoals'] ?? 'N/A'}
         Epic Summary: ${handoff.stateOfWorld['epicSummary'] ?? 'N/A'}
         Success Metrics: ${handoff.stateOfWorld['successMetrics'] ?? 'N/A'}` : `Title: ${story.title}
         Description: ${story.description}`;

    const userMessage = `Generate a well-formed user story with Gherkin acceptance criteria from this epic:

${businessContext}

Story Title: ${story.title}

Return a JSON object with keys: title, description, acceptanceCriteria (array of Gherkin strings), priority (MUST/SHOULD/COULD/WONT), storyPoints (Fibonacci number), domain (string), tags (string array).`;

    const rawResponse = await this.callClaude({
      systemPrompt: PRODUCT_OWNER_SYSTEM_PROMPT,
      userMessage,
    });

    // Parse JSON — strip markdown fences if present
    let parsed: {
      title?: string;
      description?: string;
      acceptanceCriteria?: unknown[];
      priority?: string;
      storyPoints?: unknown;
      domain?: string;
      tags?: unknown[];
    };

    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      throw new Error(
        `ProductOwnerAgent: Claude returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    // Validate required keys
    if (!parsed.title) throw new Error("ProductOwnerAgent: missing 'title' in response");
    if (!parsed.acceptanceCriteria || !Array.isArray(parsed.acceptanceCriteria) || parsed.acceptanceCriteria.length === 0) {
      throw new Error('ProductOwnerAgent: story must have at least 1 acceptance criterion');
    }
    if (!parsed.priority) throw new Error("ProductOwnerAgent: missing 'priority' in response");
    if (!parsed.domain) throw new Error("ProductOwnerAgent: missing 'domain' in response");

    // Build updated story
    const updatedStory: Story = {
      ...userStory,
      title: parsed.title,
      description: parsed.description ?? userStory.description,
      acceptanceCriteria: parsed.acceptanceCriteria.map(String),
      storyPoints: typeof parsed.storyPoints === 'number' ? parsed.storyPoints : undefined,
      domain: parsed.domain,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      updatedAt: new Date().toISOString(),
    };

    // Save updated story.json to workspace
    if (this.currentWorkspace) {
      this.workspaceManager.writeFile(
        this.currentWorkspace,
        'story.json',
        JSON.stringify(updatedStory, null, 2)
      );
    }

    return this.buildHandoff(
      updatedStory,
      AgentPersona.ORCHESTRATOR,
      {
        title: updatedStory.title,
        description: updatedStory.description,
        acceptanceCriteria: updatedStory.acceptanceCriteria.join('\n---\n'),
        priority: parsed.priority,
        storyPoints: String(updatedStory.storyPoints ?? 0),
        domain: updatedStory.domain,
        tags: updatedStory.tags.join(','),
      },
      'Refine the story and route to Architect for technical design',
      []
    );
  }
}
