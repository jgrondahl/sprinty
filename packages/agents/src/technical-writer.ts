import {
  AgentPersona,
  type HandoffDocument,
  type Story,
} from '@splinty/core';
import { BaseAgent } from './base-agent';

const TECHNICAL_WRITER_SYSTEM_PROMPT = `You are a Senior Technical Writer on a SCRUM team. Your responsibilities:
- Produce clear, professional documentation for engineers and end users
- Generate a complete README based on story scope, architecture, implementation, and QA evidence
- Include setup, usage, testing, and operational guidance where relevant
- Keep docs accurate to the provided code and artifacts

Respond ONLY with a valid JSON object:
{
  "readme": "string — full README.md content in markdown",
  "additionalDocs": [{ "path": "string — relative path (e.g. 'CONTRIBUTING.md')", "content": "string — full file content" }]
}`;

export interface TechnicalWriterResponse {
  readme: string;
  additionalDocs: Array<{ path: string; content: string }>;
}

export class TechnicalWriterAgent extends BaseAgent {
  async execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    const generatedFilesRaw = handoff?.stateOfWorld['generatedFiles'] ?? '';
    const generatedFiles = generatedFilesRaw
      ? generatedFilesRaw.split(',').filter(Boolean)
      : [];

    const branchName = handoff?.stateOfWorld['branchName'] ?? `story/${story.id}`;
    const commitSha = handoff?.stateOfWorld['commitSha'] ?? '';
    const techStack = handoff?.stateOfWorld['techStack'] ?? 'Unknown';

    const sourceFileContents: string[] = [];
    if (this.currentWorkspace) {
      for (const filePath of generatedFiles) {
        try {
          const content = this.workspaceManager.readFile(this.currentWorkspace, filePath);
          sourceFileContents.push(`--- ${filePath} ---\n${content}`);
        } catch {
          sourceFileContents.push(`--- ${filePath} --- [FILE NOT FOUND]`);
        }
      }
    }

    let qaReport = '';
    if (this.currentWorkspace) {
      try {
        qaReport = this.workspaceManager.readFile(this.currentWorkspace, 'artifacts/qa-report.md');
      } catch {
        qaReport = '';
      }
    }

    let architecture = '';
    if (this.currentWorkspace) {
      try {
        architecture = this.workspaceManager.readFile(this.currentWorkspace, 'artifacts/architecture.md');
      } catch {
        architecture = '';
      }
    }

    const acceptanceCriteria = story.acceptanceCriteria.join('\n');
    const filesSection =
      sourceFileContents.length > 0
        ? sourceFileContents.join('\n\n')
        : 'No source files available.';

    const userMessage = `Generate technical documentation for the completed story.

Story: ${story.title}
Description: ${story.description}
Branch: ${branchName}
Tech Stack: ${techStack}

Acceptance Criteria:
${acceptanceCriteria}

Source Files:
${filesSection}

QA Report:
${qaReport || 'No QA report available.'}

Architecture:
${architecture || 'No architecture document available.'}

Return JSON with readme and additionalDocs.`;

    const rawResponse = await this.callLlm({
      systemPrompt: TECHNICAL_WRITER_SYSTEM_PROMPT,
      userMessage,
    });

    let parsed: Partial<TechnicalWriterResponse>;
    try {
      const cleaned = rawResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      parsed = JSON.parse(cleaned) as Partial<TechnicalWriterResponse>;
    } catch {
      throw new Error(
        `TechnicalWriterAgent: LLM returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (typeof parsed.readme !== 'string' || parsed.readme.trim().length === 0) {
      throw new Error('TechnicalWriterAgent: readme must be a non-empty string');
    }

    const additionalDocs = parsed.additionalDocs ?? [];
    const artifacts: string[] = [];

    if (this.currentWorkspace) {
      const readmePath = 'artifacts/README.md';
      this.workspaceManager.writeFile(this.currentWorkspace, readmePath, parsed.readme);
      artifacts.push(readmePath);

      for (const doc of additionalDocs) {
        const relPath = `artifacts/${doc.path}`;
        this.workspaceManager.writeFile(this.currentWorkspace, relPath, doc.content);
        artifacts.push(relPath);
      }

      this.logActivity(
        `README generated at artifacts/README.md | Additional docs: ${additionalDocs.length}`
      );
    }

    return this.buildHandoff(
      story,
      AgentPersona.ORCHESTRATOR,
      {
        branchName,
        commitSha,
        readmePath: 'artifacts/README.md',
      },
      'README generated — open pull request',
      artifacts
    );
  }
}
