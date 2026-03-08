import * as path from 'path';
import {
  AgentPersona,
  StoryState,
  type HandoffDocument,
  type Story,
  type SandboxResult,
} from '@splinty/core';
import { StoryStateMachine } from '@splinty/core';
import { BaseAgent } from './base-agent';

const QA_SYSTEM_PROMPT = `You are a Senior QA Engineer on a SCRUM team. Your responsibilities:
- Read source files and verify they meet acceptance criteria
- Write edge-case unit tests and integration tests for AC scenarios
- Produce an honest QA report with specific bugs and their severity
- Only approve stories where ALL acceptance criteria are demonstrably met
- Flag blockers immediately rather than guessing

You will receive: source file contents, acceptance criteria, and a test command.

Respond ONLY with a valid JSON object:
{
  "passedAC": ["string — each AC that passed"],
  "failedAC": ["string — each AC that failed"],
  "bugs": [
    { "description": "string", "severity": "critical" | "major" | "minor" }
  ],
  "verdict": "PASS" | "FAIL" | "BLOCKED",
  "additionalTests": [
    { "path": "string — relative path under __tests__/ (e.g. 'qa-login.test.ts')", "content": "string — full test file content" }
  ],
  "report": "string — full markdown QA report"
}

Rules:
- verdict = "PASS" only if failedAC is empty and bugs contains no critical/major items
- verdict = "BLOCKED" if source files are missing or fundamentally broken
- verdict = "FAIL" otherwise`;

export interface QAVerdict {
  passedAC: string[];
  failedAC: string[];
  bugs: Array<{ description: string; severity: string }>;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  additionalTests: Array<{ path: string; content: string }>;
  report: string;
}

const MAX_REWORK_CYCLES = 2;

export class QAEngineerAgent extends BaseAgent {
  private stateMachine = new StoryStateMachine();

  async execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    // Read source files from workspace artifacts/src/
    const generatedFilesRaw = handoff?.stateOfWorld['generatedFiles'] ?? '';
    const generatedFiles = generatedFilesRaw
      ? generatedFilesRaw.split(',').filter(Boolean)
      : [];

    const testCommand = handoff?.stateOfWorld['testCommand'] ?? 'bun test';
    const branchName = handoff?.stateOfWorld['branchName'] ?? `story/${story.id}`;
    const commitSha = handoff?.stateOfWorld['commitSha'] ?? '';
    const reworkCount = parseInt(handoff?.stateOfWorld['reworkCount'] ?? '0', 10);

    // Read source file contents for QA inspection
    const sourceFileContents: string[] = [];
    if (this.currentWorkspace) {
      for (const filePath of generatedFiles) {
        try {
          const content = this.workspaceManager.readFile(
            this.currentWorkspace,
            filePath
          );
          sourceFileContents.push(`--- ${filePath} ---\n${content}`);
        } catch {
          sourceFileContents.push(`--- ${filePath} --- [FILE NOT FOUND]`);
        }
      }
    }

    const acceptanceCriteria = story.acceptanceCriteria.join('\n');
    const filesSection =
      sourceFileContents.length > 0
        ? sourceFileContents.join('\n\n')
        : 'No source files available.';

    const sandboxSection = this.formatSandboxResults(handoff);

    const userMessage = `Review the following implementation for QA:

Story: ${story.title}
Description: ${story.description}
Branch: ${branchName}
Test Command: ${testCommand}

Acceptance Criteria:
${acceptanceCriteria}

Source Files:
${filesSection}
${sandboxSection}
Verify each AC, check for bugs, write edge-case tests, and produce a QA verdict.
Return JSON with passedAC, failedAC, bugs, verdict (PASS/FAIL/BLOCKED), additionalTests, and report.`;

    const rawResponse = await this.callClaude({
      systemPrompt: QA_SYSTEM_PROMPT,
      userMessage,
    });

    // Parse JSON — strip fences if present
    let parsed: Partial<QAVerdict>;
    try {
      const cleaned = rawResponse
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      parsed = JSON.parse(cleaned) as Partial<QAVerdict>;
    } catch {
      throw new Error(
        `QAEngineerAgent: Claude returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (!parsed.verdict || !['PASS', 'FAIL', 'BLOCKED'].includes(parsed.verdict)) {
      throw new Error(
        `QAEngineerAgent: verdict must be PASS, FAIL, or BLOCKED — got: ${String(parsed.verdict)}`
      );
    }

    const verdict = parsed.verdict as 'PASS' | 'FAIL' | 'BLOCKED';
    const passedAC = parsed.passedAC ?? [];
    const failedAC = parsed.failedAC ?? [];
    const bugs = parsed.bugs ?? [];
    const additionalTests = parsed.additionalTests ?? [];
    const report = parsed.report ?? `# QA Report\n\nVerdict: ${verdict}`;

    // Write QA report to workspace
    const qaArtifacts: string[] = [];
    if (this.currentWorkspace) {
      this.workspaceManager.writeFile(
        this.currentWorkspace,
        'artifacts/qa-report.md',
        report
      );
      qaArtifacts.push('artifacts/qa-report.md');

      // Write additional test files
      for (const test of additionalTests) {
        const relPath = `artifacts/src/__tests__/qa-${test.path}`;
        this.workspaceManager.writeFile(this.currentWorkspace, relPath, test.content);
        qaArtifacts.push(relPath);
      }

      this.logActivity(
        `QA verdict: ${verdict} | Passed AC: ${passedAC.length} | Failed AC: ${failedAC.length} | Bugs: ${bugs.length}`
      );
    }

    // ── PASS ──────────────────────────────────────────────────────────────────
    if (verdict === 'PASS') {
      const doneStory = this.stateMachine.transition(story, StoryState.DONE);

      if (this.currentWorkspace) {
        this.workspaceManager.writeFile(
          this.currentWorkspace,
          'story.json',
          JSON.stringify(doneStory, null, 2)
        );
      }

      return this.buildHandoff(
        doneStory,
        AgentPersona.ORCHESTRATOR,
        {
          verdict: 'PASS',
          branchName,
          commitSha,
          passedAC: passedAC.join('|'),
          bugs: JSON.stringify(bugs),
          qaReportPath: 'artifacts/qa-report.md',
          reworkCount: String(reworkCount),
        },
        'Story is DONE — open pull request',
        qaArtifacts
      );
    }

    // ── BLOCKED ───────────────────────────────────────────────────────────────
    if (verdict === 'BLOCKED') {
      // Story stays in IN_REVIEW — escalate to orchestrator
      if (this.currentWorkspace) {
        this.workspaceManager.writeFile(
          this.currentWorkspace,
          'story.json',
          JSON.stringify(story, null, 2)
        );
      }

      return this.buildHandoff(
        story,
        AgentPersona.ORCHESTRATOR,
        {
          verdict: 'BLOCKED',
          branchName,
          failedAC: failedAC.join('|'),
          bugs: JSON.stringify(bugs),
          qaReportPath: 'artifacts/qa-report.md',
          reworkCount: String(reworkCount),
        },
        'Story is BLOCKED — manual intervention required',
        qaArtifacts
      );
    }

    // ── FAIL ──────────────────────────────────────────────────────────────────
    const newReworkCount = reworkCount + 1;

    if (newReworkCount > MAX_REWORK_CYCLES) {
      // Exceeded max rework cycles — escalate as BLOCKED
      this.logActivity(
        `Max rework cycles (${MAX_REWORK_CYCLES}) exceeded — escalating as BLOCKED`
      );

      if (this.currentWorkspace) {
        this.workspaceManager.writeFile(
          this.currentWorkspace,
          'story.json',
          JSON.stringify(story, null, 2)
        );
      }

      return this.buildHandoff(
        story,
        AgentPersona.ORCHESTRATOR,
        {
          verdict: 'BLOCKED',
          branchName,
          failedAC: failedAC.join('|'),
          bugs: JSON.stringify(bugs),
          qaReportPath: 'artifacts/qa-report.md',
          reworkCount: String(newReworkCount),
          reason: `Exceeded maximum rework cycles (${MAX_REWORK_CYCLES})`,
        },
        'Story exceeded max rework cycles — manual intervention required',
        qaArtifacts
      );
    }

    // Send back to developer for rework
    const inProgressStory = this.stateMachine.transition(story, StoryState.IN_PROGRESS);

    if (this.currentWorkspace) {
      this.workspaceManager.writeFile(
        this.currentWorkspace,
        'story.json',
        JSON.stringify(inProgressStory, null, 2)
      );
    }

    this.logActivity(`FAIL — sending back to Developer for rework (cycle ${newReworkCount}/${MAX_REWORK_CYCLES})`);

    return this.buildHandoff(
      inProgressStory,
      AgentPersona.DEVELOPER,
      {
        verdict: 'FAIL',
        branchName,
        failedAC: failedAC.join('|'),
        bugs: JSON.stringify(bugs),
        qaReportPath: 'artifacts/qa-report.md',
        reworkCount: String(newReworkCount),
      },
      `Fix failing acceptance criteria and bugs — rework cycle ${newReworkCount}`,
      qaArtifacts
    );
  }

  // ── Sandbox Result Formatting ───────────────────────────────────────────────

  private formatSandboxResults(handoff: HandoffDocument | null): string {
    if (!handoff) return '';

    const parts: string[] = [];
    const steps = ['Install', 'Build', 'Test'] as const;
    const keys = ['sandboxInstallResult', 'sandboxBuildResult', 'sandboxTestResult'] as const;

    for (let i = 0; i < keys.length; i++) {
      const raw = handoff.stateOfWorld[keys[i]!];
      if (!raw) continue;

      try {
        const result = JSON.parse(raw) as SandboxResult;
        const status = result.exitCode === 0 ? '✅ PASSED' : '❌ FAILED';
        parts.push(`${steps[i]} (${status}, exit=${result.exitCode}, ${result.durationMs}ms)`);
        if (result.stdout) parts.push(`  stdout: ${result.stdout.slice(0, 2000)}`);
        if (result.stderr) parts.push(`  stderr: ${result.stderr.slice(0, 2000)}`);
        if (result.resourceLimitViolation) {
          parts.push(`  ⚠ Resource limit: ${result.resourceLimitViolation.description}`);
        }
      } catch {
        parts.push(`${steps[i]}: [unparseable result]`);
      }
    }

    if (parts.length === 0) return '';
    return `\nSandbox Execution Results:\n${parts.join('\n')}\n`;
  }
}
