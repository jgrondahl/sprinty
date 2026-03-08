import {
  AgentPersona,
  type AgentConfig,
  type HandoffDocument,
  HandoffManager,
  type IntegrationSandbox,
  type LlmClient,
  type Story,
  WorkspaceManager,
} from '@splinty/core';
import { BaseAgent } from './base-agent';

const INTEGRATION_TEST_ENGINEER_SYSTEM_PROMPT = `You are a Senior Integration Test Engineer on a SCRUM delivery team.
Your responsibilities:
- Generate cross-service integration tests for HTTP/API endpoints
- Generate service-to-service contract verification tests
- Focus on realistic workflows and failure conditions

Output requirements:
- Respond ONLY with valid JSON
- Include all required fields exactly as requested

Return JSON with this exact shape:
{
  "tests": [
    {
      "name": "string",
      "service": "string",
      "script": "string"
    }
  ],
  "testRunner": "string (optional)"
}`;

type IntegrationTestEngineerResponse = {
  tests?: Array<{
    name?: string;
    service?: string;
    script?: string;
  }>;
  testRunner?: string;
};

export class IntegrationTestEngineerAgent extends BaseAgent {
  private integrationSandbox: IntegrationSandbox | null = null;

  constructor(
    config: AgentConfig,
    workspaceManager: WorkspaceManager,
    handoffManager: HandoffManager,
    llmClient?: LlmClient
  ) {
    super(config, workspaceManager, handoffManager, llmClient);
  }

  setIntegrationSandbox(sandbox: IntegrationSandbox): void {
    this.integrationSandbox = sandbox;
  }

  async execute(handoff: HandoffDocument | null, story: Story): Promise<HandoffDocument> {
    const techStack = handoff?.stateOfWorld['techStack'] ?? 'Unknown';
    const services = handoff?.stateOfWorld['services'] ?? 'Unknown';
    const projectId = handoff?.stateOfWorld['projectId'] ?? 'Unknown';
    const serviceUrls = handoff?.stateOfWorld['serviceUrls'];

    const userMessage = `Generate integration tests for this project.

Project ID: ${projectId}
Tech Stack: ${techStack}
Services: ${services}
${serviceUrls ? `Service URLs: ${serviceUrls}\n` : ''}Story Title: ${story.title}
Story Description: ${story.description}
Story Domain: ${story.domain}
Story Tags: ${story.tags.join(', ')}
Acceptance Criteria:
${story.acceptanceCriteria.join('\n')}

Return JSON with tests[] (name, service, script) and optional testRunner.`;

    const rawResponse = await this.callClaude({
      systemPrompt: INTEGRATION_TEST_ENGINEER_SYSTEM_PROMPT,
      userMessage,
    });

    let parsed: IntegrationTestEngineerResponse;
    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned) as IntegrationTestEngineerResponse;
    } catch {
      throw new Error(
        `IntegrationTestEngineerAgent: LLM returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (!parsed.tests || !Array.isArray(parsed.tests)) {
      throw new Error("IntegrationTestEngineerAgent: missing 'tests' array in response");
    }

    for (const [index, test] of parsed.tests.entries()) {
      if (!test || typeof test.name !== 'string' || test.name.trim().length === 0) {
        throw new Error(`IntegrationTestEngineerAgent: tests[${index}] missing required 'name'`);
      }
      if (!test || typeof test.service !== 'string' || test.service.trim().length === 0) {
        throw new Error(`IntegrationTestEngineerAgent: tests[${index}] missing required 'service'`);
      }
      if (!test || typeof test.script !== 'string' || test.script.trim().length === 0) {
        throw new Error(`IntegrationTestEngineerAgent: tests[${index}] missing required 'script'`);
      }
    }

    const artifacts: string[] = [];
    if (this.currentWorkspace) {
      for (const test of parsed.tests) {
        const filePath = `artifacts/integration-tests/${test.name}.sh`;
        this.workspaceManager.writeFile(this.currentWorkspace, filePath, test.script!);
        artifacts.push(filePath);
        this.logActivity(`Wrote ${filePath}`);
      }

      if (typeof parsed.testRunner === 'string' && parsed.testRunner.trim().length > 0) {
        const runnerPath = 'artifacts/integration-tests/runner.sh';
        this.workspaceManager.writeFile(this.currentWorkspace, runnerPath, parsed.testRunner);
        artifacts.push(runnerPath);
        this.logActivity(`Wrote ${runnerPath}`);
      }
    }

    const stateOfWorld: Record<string, string> = {
      integrationTestsGenerated: String(parsed.tests.length),
      integrationTestArtifacts: artifacts.join(','),
    };

    if (this.integrationSandbox) {
      const summaries: string[] = [];
      for (const test of parsed.tests) {
        const result = await this.integrationSandbox.executeInService(test.service!, test.script!);
        summaries.push(`${test.name}:${result.exitCode}`);
      }
      stateOfWorld['integrationTestExecutionSummary'] = summaries.join('|');
    }

    const nextGoal = 'Document the integration test results and service contracts';

    return this.buildHandoff(
      story,
      AgentPersona.TECHNICAL_WRITER,
      stateOfWorld,
      nextGoal,
      artifacts
    );
  }
}
