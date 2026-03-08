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

const MIGRATION_ENGINEER_SYSTEM_PROMPT = `You are a Senior Database Migration Engineer on a SCRUM delivery team.
Your responsibilities:
- Generate reliable SQL migration files for schema changes
- Generate rollback SQL for every migration
- Optionally generate seed SQL when useful for initial/test data
- Keep migrations deterministic, ordered, and production-safe

Output requirements:
- Respond ONLY with valid JSON
- Include all required fields exactly as requested

Return JSON with this exact shape:
{
  "migrations": [
    {
      "name": "string",
      "up": "string",
      "down": "string"
    }
  ],
  "seedData": "string (optional)"
}`;

type MigrationEngineerResponse = {
  migrations?: Array<{
    name?: string;
    up?: string;
    down?: string;
  }>;
  seedData?: string;
};

export class MigrationEngineerAgent extends BaseAgent {
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
    const dataModel = handoff?.stateOfWorld['dataModel'];

    const userMessage = `Generate database migrations for this project.

Project ID: ${projectId}
Tech Stack: ${techStack}
Services: ${services}
${dataModel ? `Data Model: ${dataModel}\n` : ''}
Story Title: ${story.title}
Story Domain: ${story.domain}
Story Tags: ${story.tags.join(', ')}

Return JSON with migrations (name, up, down) and optional seedData.`;

    const rawResponse = await this.callClaude({
      systemPrompt: MIGRATION_ENGINEER_SYSTEM_PROMPT,
      userMessage,
    });

    let parsed: MigrationEngineerResponse;
    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned) as MigrationEngineerResponse;
    } catch {
      throw new Error(
        `MigrationEngineerAgent: LLM returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (!parsed.migrations || !Array.isArray(parsed.migrations)) {
      throw new Error("MigrationEngineerAgent: missing 'migrations' array in response");
    }

    for (const [index, migration] of parsed.migrations.entries()) {
      if (!migration || typeof migration.name !== 'string' || migration.name.trim().length === 0) {
        throw new Error(
          `MigrationEngineerAgent: migrations[${index}] missing required 'name'`
        );
      }
      if (!migration || typeof migration.up !== 'string' || migration.up.trim().length === 0) {
        throw new Error(
          `MigrationEngineerAgent: migrations[${index}] missing required 'up'`
        );
      }
      if (!migration || typeof migration.down !== 'string' || migration.down.trim().length === 0) {
        throw new Error(
          `MigrationEngineerAgent: migrations[${index}] missing required 'down'`
        );
      }
    }

    const artifacts: Array<{ path: string; description: string }> = [];

    if (this.currentWorkspace) {
      for (const migration of parsed.migrations) {
        const upPath = `artifacts/migrations/${migration.name}.up.sql`;
        const downPath = `artifacts/migrations/${migration.name}.down.sql`;

        this.workspaceManager.writeFile(this.currentWorkspace, upPath, migration.up!);
        this.logActivity(`Wrote ${upPath}`);
        artifacts.push({ path: upPath, description: `Migration up SQL for ${migration.name}` });

        this.workspaceManager.writeFile(this.currentWorkspace, downPath, migration.down!);
        this.logActivity(`Wrote ${downPath}`);
        artifacts.push({ path: downPath, description: `Migration down SQL for ${migration.name}` });
      }

      if (typeof parsed.seedData === 'string' && parsed.seedData.trim().length > 0) {
        const seedPath = 'artifacts/migrations/seed.sql';
        this.workspaceManager.writeFile(this.currentWorkspace, seedPath, parsed.seedData);
        this.logActivity(`Wrote ${seedPath}`);
        artifacts.push({ path: seedPath, description: 'Optional seed SQL data' });
      }
    }

    const stateOfWorld = {
      migrationArtifactsGenerated: artifacts.map((artifact) => artifact.path).join(','),
      migrationCount: String(parsed.migrations.length),
      hasSeedData: String(typeof parsed.seedData === 'string' && parsed.seedData.trim().length > 0),
    };

    const nextGoal = 'Generate infrastructure configs for containerised database and migration runner';

    return this.buildHandoff(
      story,
      AgentPersona.INFRASTRUCTURE_ENGINEER,
      stateOfWorld,
      nextGoal,
      artifacts.map((artifact) => artifact.path)
    );
  }
}
