import * as fs from 'fs';
import * as path from 'path';
import {
  AgentPersona,
  StoryState,
  type HandoffDocument,
  type Story,
} from '@splinty/core';
import { WorkspaceManager, HandoffManager } from '@splinty/core';
import { StoryStateMachine } from '@splinty/core';
import { BaseAgent } from './base-agent';

const BUSINESS_OWNER_SYSTEM_PROMPT = `You are the Business Owner in a SCRUM team. Your role is to:
1. Translate raw user ideas into clear business goals
2. Define measurable success metrics (OKRs)
3. Identify key risks and dependencies
4. Size the epic at a high level (XS/S/M/L/XL)
5. Frame the work in terms of user/business value, NOT technical implementation

Respond ONLY with a valid JSON object matching this structure:
{
  "businessGoals": "string — core business objective",
  "successMetrics": "string — measurable KPIs",
  "riskFactors": "string — top 3 risks",
  "epicSummary": "string — 1-paragraph epic description"
}`;

export class BusinessOwnerAgent extends BaseAgent {
  private stateMachine = new StoryStateMachine();

  async execute(
    _handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    // Transition: RAW → EPIC
    const epicStory = this.stateMachine.transition(story, StoryState.EPIC);

    const userMessage = `Analyze this raw idea and produce business goals:

Title: ${story.title}
Description: ${story.description}

Return a JSON object with keys: businessGoals, successMetrics, riskFactors, epicSummary.`;

    const rawResponse = await this.callClaude({
      systemPrompt: BUSINESS_OWNER_SYSTEM_PROMPT,
      userMessage,
    });

    // Parse JSON response — retry on parse failure is handled by callClaude's retry wrapper
    let parsed: Record<string, string>;
    try {
      // Strip markdown code fences if present
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`BusinessOwnerAgent: Claude returned non-JSON response: ${rawResponse.slice(0, 200)}`);
    }

    // Validate all required keys present
    const required = ['businessGoals', 'successMetrics', 'riskFactors', 'epicSummary'];
    for (const key of required) {
      if (!parsed[key]) {
        throw new Error(`BusinessOwnerAgent: Claude response missing key '${key}'`);
      }
    }

    // Save updated story.json with new state
    if (this.currentWorkspace) {
      this.workspaceManager.writeFile(
        this.currentWorkspace,
        'story.json',
        JSON.stringify({ ...epicStory }, null, 2)
      );
    }

    return this.buildHandoff(
      epicStory,
      AgentPersona.PRODUCT_OWNER,
      {
        businessGoals: parsed['businessGoals']!,
        successMetrics: parsed['successMetrics']!,
        riskFactors: parsed['riskFactors']!,
        epicSummary: parsed['epicSummary']!,
      },
      'Generate well-formed user stories with Gherkin acceptance criteria from the epic summary',
      []
    );
  }
}
