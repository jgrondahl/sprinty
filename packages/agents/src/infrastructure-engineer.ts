import {
  AgentPersona,
  type AgentConfig,
  type HandoffDocument,
  type LlmClient,
  type Story,
  HandoffManager,
  WorkspaceManager,
} from '@splinty/core';
import { BaseAgent } from './base-agent';

const INFRASTRUCTURE_ENGINEER_SYSTEM_PROMPT = `You are a Senior Infrastructure Engineer on a SCRUM delivery team.
Your responsibilities:
- Generate production-ready Dockerfiles for each service
- Generate a docker-compose.yml that wires all services for local/dev orchestration
- Generate a GitHub Actions CI configuration (build/test/lint)
- Optionally generate a deployment manifest when deployment details are clear

Output requirements:
- Respond ONLY with valid JSON
- Include all required fields exactly as requested

Return JSON with this exact shape:
{
  "dockerfiles": [{ "service": "string", "content": "string" }],
  "dockerCompose": "string",
  "ciConfig": "string",
  "deployManifest": "string (optional)"
}`;

type InfrastructureEngineerResponse = {
  dockerfiles?: Array<{ service?: string; content?: string }>;
  dockerCompose?: string;
  ciConfig?: string;
  deployManifest?: string;
};

export class InfrastructureEngineerAgent extends BaseAgent {
  constructor(
    config: AgentConfig,
    workspaceManager: WorkspaceManager,
    handoffManager: HandoffManager,
    llmClient?: LlmClient
  ) {
    super(config, workspaceManager, handoffManager, llmClient);
  }

  async execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    const techStack = handoff?.stateOfWorld['techStack'] ?? 'Unknown';
    const services = handoff?.stateOfWorld['services'] ?? 'Unknown';
    const projectId = handoff?.stateOfWorld['projectId'] ?? 'Unknown';

    const userMessage = `Generate infrastructure artifacts for this project.

Project ID: ${projectId}
Tech Stack: ${techStack}
Services: ${services}

Story Title: ${story.title}
Story Domain: ${story.domain}
Story Tags: ${story.tags.join(', ')}

Return JSON with dockerfiles, dockerCompose, ciConfig, and optional deployManifest.`;

    const rawResponse = await this.callClaude({
      systemPrompt: INFRASTRUCTURE_ENGINEER_SYSTEM_PROMPT,
      userMessage,
    });

    let parsed: InfrastructureEngineerResponse;
    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned) as InfrastructureEngineerResponse;
    } catch {
      throw new Error(
        `InfrastructureEngineerAgent: LLM returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (!parsed.dockerfiles || !Array.isArray(parsed.dockerfiles)) {
      throw new Error("InfrastructureEngineerAgent: missing 'dockerfiles' array in response");
    }
    if (typeof parsed.dockerCompose !== 'string' || parsed.dockerCompose.trim().length === 0) {
      throw new Error("InfrastructureEngineerAgent: missing 'dockerCompose' in response");
    }
    if (typeof parsed.ciConfig !== 'string' || parsed.ciConfig.trim().length === 0) {
      throw new Error("InfrastructureEngineerAgent: missing 'ciConfig' in response");
    }

    for (const [index, dockerfile] of parsed.dockerfiles.entries()) {
      if (!dockerfile || typeof dockerfile.service !== 'string' || dockerfile.service.trim().length === 0) {
        throw new Error(
          `InfrastructureEngineerAgent: dockerfiles[${index}] missing required 'service'`
        );
      }
      if (!dockerfile || typeof dockerfile.content !== 'string' || dockerfile.content.trim().length === 0) {
        throw new Error(
          `InfrastructureEngineerAgent: dockerfiles[${index}] missing required 'content'`
        );
      }
    }

    const artifacts: Array<{ path: string; description: string }> = [];

    if (this.currentWorkspace) {
      for (const df of parsed.dockerfiles) {
        const filePath = `artifacts/Dockerfile.${df.service}`;
        this.workspaceManager.writeFile(this.currentWorkspace, filePath, df.content!);
        this.logActivity(`Wrote ${filePath}`);
        artifacts.push({ path: filePath, description: `Dockerfile for service ${df.service}` });
      }

      const composePath = 'artifacts/docker-compose.yml';
      this.workspaceManager.writeFile(this.currentWorkspace, composePath, parsed.dockerCompose);
      this.logActivity(`Wrote ${composePath}`);
      artifacts.push({ path: composePath, description: 'Docker Compose orchestration config' });

      const ciPath = 'artifacts/ci.yml';
      this.workspaceManager.writeFile(this.currentWorkspace, ciPath, parsed.ciConfig);
      this.logActivity(`Wrote ${ciPath}`);
      artifacts.push({ path: ciPath, description: 'GitHub Actions CI configuration' });

      if (typeof parsed.deployManifest === 'string' && parsed.deployManifest.trim().length > 0) {
        const deployPath = 'artifacts/deploy-manifest.yml';
        this.workspaceManager.writeFile(this.currentWorkspace, deployPath, parsed.deployManifest);
        this.logActivity(`Wrote ${deployPath}`);
        artifacts.push({ path: deployPath, description: 'Deployment manifest' });
      }
    }

    const stateOfWorld = {
      infraArtifactsGenerated: artifacts.map((artifact) => artifact.path).join(','),
      dockerServiceCount: String(parsed.dockerfiles.length),
      hasDeployManifest: String(
        typeof parsed.deployManifest === 'string' && parsed.deployManifest.trim().length > 0
      ),
    };

    const nextGoal = 'Document the infrastructure setup and deployment procedures';

    return this.buildHandoff(
      story,
      AgentPersona.TECHNICAL_WRITER,
      stateOfWorld,
      nextGoal,
      artifacts.map((artifact) => artifact.path)
    );
  }
}
