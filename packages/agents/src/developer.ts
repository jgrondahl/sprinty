import * as path from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';
import {
  AgentPersona,
  DiffManager,
  StoryState,
  type DiffResult,
  type HandoffDocument,
  type Story,
  type SandboxEnvironment,
  type SandboxConfig,
  type SandboxResult,
} from '@splinty/core';
import { StoryStateMachine } from '@splinty/core';
import { BaseAgent } from './base-agent';

const DEVELOPER_SYSTEM_PROMPT = `You are a Senior Full-Stack Developer on a SCRUM team. Your principles:
- Write idiomatic, clean, production-quality code
- Every module must have corresponding unit tests (target 80%+ coverage)
- Follow the architecture decisions in the provided ADR exactly
- Output only the code files specified in the ADR — no gold-plating
- Use the language and framework specified in the tech stack, not your preference

You will receive an ADR and a user story. Generate source files for implementation.

Respond ONLY with a valid JSON object:
{
  "files": [
    { "path": "string — relative path from src/ (e.g. 'auth/service.ts')", "content": "string — full file content" }
  ],
  "testCommand": "string — command to run tests (e.g. 'bun test' or 'pytest')",
  "summary": "string — brief implementation summary"
}`;

const FIX_SYSTEM_PROMPT = `You are a Senior Full-Stack Developer fixing compilation or test failures.
You will receive: the current source files, the error output, and the failing command.

Analyze the error carefully. Fix ONLY the issues causing the failure — do not refactor unrelated code.

Respond ONLY with a valid JSON object:
{
  "files": [
    { "path": "string — relative path from src/ (e.g. 'auth/service.ts')", "content": "string — full file content" }
  ],
  "summary": "string — brief description of what was fixed"
}`;

const MAX_FIX_ATTEMPTS = 3;

// Injected git factory type — allows tests to inject mock git
export type GitFactory = (repoPath: string) => SimpleGit;
const defaultGitFactory: GitFactory = (repoPath: string) => simpleGit(repoPath);

// ─── Sandbox Stack Detection ─────────────────────────────────────────────────

interface SandboxStepResult {
  install: SandboxResult | null;
  build: SandboxResult | null;
  test: SandboxResult | null;
}

function detectStack(techStack: string): { install: string; build: string; test: string } {
  const lower = techStack.toLowerCase();
  if (lower.includes('python') || lower.includes('pip') || lower.includes('pytest')) {
    return { install: 'pip install -r requirements.txt', build: 'python -m py_compile *.py || true', test: 'pytest' };
  }
  // Default: Node/TypeScript
  return { install: 'npm install', build: 'npm run build', test: 'npm test' };
}

export class DeveloperAgent extends BaseAgent {
  private stateMachine = new StoryStateMachine();
  private diffManager = new DiffManager();
  private gitFactory: GitFactory;
  private sandbox: SandboxEnvironment | null = null;
  private sandboxConfig: SandboxConfig | null = null;

  constructor(
    ...args: ConstructorParameters<typeof BaseAgent>
  ) {
    super(...args);
    this.gitFactory = defaultGitFactory;
  }

  /** Inject a mock git factory in tests */
  setGitFactory(factory: GitFactory): void {
    this.gitFactory = factory;
  }

  /** Inject a sandbox environment for compile→test→fix loop */
  setSandbox(sandbox: SandboxEnvironment, config?: SandboxConfig): void {
    this.sandbox = sandbox;
    this.sandboxConfig = config ?? null;
  }

  async execute(
    handoff: HandoffDocument | null,
    story: Story
  ): Promise<HandoffDocument> {
    // Transition: IN_PROGRESS → IN_REVIEW
    const inReviewStory = this.stateMachine.transition(story, StoryState.IN_REVIEW);

    // Read architecture artifacts from workspace
    let adrContent = '';
    let diagramContent = '';
    if (this.currentWorkspace) {
      try {
        adrContent = this.workspaceManager.readFile(this.currentWorkspace, 'artifacts/architecture.md');
      } catch {
        // ADR may not exist if Architect skipped (e.g. in tests)
        adrContent = handoff?.stateOfWorld['architecturePath']
          ? `Architecture at: ${handoff.stateOfWorld['architecturePath']}`
          : 'No ADR available — implement based on story requirements.';
      }
      try {
        diagramContent = this.workspaceManager.readFile(this.currentWorkspace, 'artifacts/diagram.mmd');
      } catch {
        diagramContent = '';
      }
    }

    const techStack = handoff?.stateOfWorld['techStack'] ?? 'TypeScript';
    const acceptanceCriteria = story.acceptanceCriteria.join('\n');

    const userMessage = `Implement the following user story based on the architecture:

Story: ${story.title}
Description: ${story.description}
Tech Stack: ${techStack}

Acceptance Criteria:
${acceptanceCriteria}

Architecture Decision Record:
${adrContent}

${diagramContent ? `System Diagram:\n${diagramContent}` : ''}

Generate source files and unit tests that implement the AC. Return JSON with files array, testCommand, and summary.`;

    const rawResponse = await this.callClaude({
      systemPrompt: DEVELOPER_SYSTEM_PROMPT,
      userMessage,
    });

    // Parse JSON — strip fences if present
    let parsed: {
      files?: Array<{ path: string; content: string }>;
      testCommand?: string;
      summary?: string;
    };

    try {
      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned) as typeof parsed;
    } catch {
      throw new Error(
        `DeveloperAgent: Claude returned non-JSON response: ${rawResponse.slice(0, 200)}`
      );
    }

    if (!parsed.files || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      throw new Error('DeveloperAgent: Claude response must include at least one file');
    }

    // Write generated files to workspace artifacts/src/
    const generatedFiles: string[] = [];
    const fileDiffs: DiffResult[] = [];
    const isRework = handoff?.stateOfWorld['verdict'] === 'FAIL';

    if (this.currentWorkspace) {
      const oldFileContents = new Map<string, string>();

      if (isRework) {
        for (const file of parsed.files) {
          const relPath = `artifacts/src/${file.path}`;
          try {
            const oldContent = this.workspaceManager.readFile(this.currentWorkspace, relPath);
            oldFileContents.set(file.path, oldContent);
          } catch {
          }
        }
      }

      let appliedByDiff = 0;
      let fallbackToFull = 0;
      let newFiles = 0;

      for (const file of parsed.files) {
        const relPath = `artifacts/src/${file.path}`;
        const oldContent = oldFileContents.get(file.path);

        if (isRework && oldContent !== undefined) {
          const diff = this.diffManager.generateDiff(file.path, oldContent, file.content);
          if (diff.hunks > 0) {
            fileDiffs.push(diff);
            const patchResult = this.diffManager.applyPatch(oldContent, diff.patch);
            if (patchResult.success) {
              this.workspaceManager.writeFile(this.currentWorkspace, relPath, patchResult.content);
              appliedByDiff += 1;
            } else {
              this.workspaceManager.writeFile(this.currentWorkspace, relPath, file.content);
              fallbackToFull += 1;
            }
          } else {
            this.workspaceManager.writeFile(this.currentWorkspace, relPath, file.content);
          }
        } else {
          if (isRework) {
            newFiles += 1;
          }
          this.workspaceManager.writeFile(this.currentWorkspace, relPath, file.content);
        }

        generatedFiles.push(relPath);
      }

      if (isRework) {
        this.logActivity(
          `Rework with diffs: ${appliedByDiff} file(s) patched, ${fallbackToFull} fallback full regeneration, ${newFiles} new file(s)`
        );
      }

      this.logActivity(`Generated ${generatedFiles.length} source file(s): ${generatedFiles.join(', ')}`);
    }

    // ── Sandbox: compile→test→fix loop ────────────────────────────────────────
    let sandboxResults: SandboxStepResult = { install: null, build: null, test: null };
    let fixAttempts = 0;
    let currentFiles = parsed.files;
    const resourceViolationCounts = new Map<string, number>();

    if (this.sandbox && currentFiles.length > 0) {
      sandboxResults = await this.runSandbox(currentFiles, techStack);
      let failingStep = this.findFailingStep(sandboxResults);

      while (failingStep && fixAttempts < MAX_FIX_ATTEMPTS) {
        fixAttempts++;
        this.logActivity(`Fix attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS} — ${failingStep.command} failed (exit=${failingStep.exitCode})`);

        if (failingStep.resourceLimitViolation) {
          const limitKey = failingStep.resourceLimitViolation.limit;
          resourceViolationCounts.set(limitKey, (resourceViolationCounts.get(limitKey) ?? 0) + 1);
        }

        const fixedFiles = await this.requestFix(currentFiles, failingStep, techStack);
        if (!fixedFiles) {
          this.logActivity(`Fix attempt ${fixAttempts}: LLM returned no usable fix — stopping`);
          break;
        }

        currentFiles = fixedFiles;
        if (this.currentWorkspace) {
          for (const file of currentFiles) {
            const relPath = `artifacts/src/${file.path}`;
            this.workspaceManager.writeFile(this.currentWorkspace, relPath, file.content);
          }
        }

        sandboxResults = await this.runSandbox(currentFiles, techStack);
        failingStep = this.findFailingStep(sandboxResults);
      }

      if (failingStep) {
        this.logActivity(`Compile→test→fix loop exhausted after ${fixAttempts} fix attempt(s) — passing failures to QA`);
      } else if (fixAttempts > 0) {
        this.logActivity(`Fix loop succeeded after ${fixAttempts} attempt(s)`);
      }
    }

    // Same resource limit violated 2+ retries → sandbox-constraint revision trigger
    const constraintRevisions: string[] = [];
    for (const [limit, count] of resourceViolationCounts) {
      if (count >= 2) {
        constraintRevisions.push(limit);
      }
    }

    // Git operations: create branch and commit
    const branchName = `story/${story.id}`;
    let commitSha = '';

    if (this.currentWorkspace) {
      const repoPath = this.currentWorkspace.basePath;
      const git = this.gitFactory(repoPath);

      try {
        // Init repo if needed, then create branch and commit
        await git.init();
        await git.checkoutLocalBranch(branchName);

        // Stage all generated files
        await git.add('.');

        const commitMessage = `feat(${story.id}): ${story.title}`;
        const commitResult = await git.commit(commitMessage);
        commitSha = commitResult.commit ?? '';

        this.logActivity(`Git commit on branch ${branchName}: ${commitSha}`);
      } catch (err) {
        // Non-fatal: log git errors but continue (git may not be available in all envs)
        this.logActivity(`Git operation warning: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Save updated story
    if (this.currentWorkspace) {
      this.workspaceManager.writeFile(
        this.currentWorkspace,
        'story.json',
        JSON.stringify(inReviewStory, null, 2)
      );
    }

    return this.buildHandoff(
      inReviewStory,
      AgentPersona.QA_ENGINEER,
      {
        branchName,
        commitSha,
        generatedFiles: generatedFiles.join(','),
        ...(fileDiffs.length > 0 ? { fileDiffs: JSON.stringify(fileDiffs) } : {}),
        testCommand: parsed.testCommand ?? 'bun test',
        summary: parsed.summary ?? '',
        ...this.serializeSandboxResults(sandboxResults),
        ...(fixAttempts > 0 ? { fixAttempts: String(fixAttempts) } : {}),
        ...(constraintRevisions.length > 0
          ? { sandboxConstraintRevision: constraintRevisions.join(',') }
          : {}),
      },
      'Run tests, verify acceptance criteria, and produce QA verdict',
      generatedFiles
    );
  }

  // ── Sandbox Helpers ─────────────────────────────────────────────────────────

  private async runSandbox(
    files: Array<{ path: string; content: string }>,
    techStack: string,
  ): Promise<SandboxStepResult> {
    const sandbox = this.sandbox!;
    const result: SandboxStepResult = { install: null, build: null, test: null };

    try {
      if (this.sandboxConfig) {
        await sandbox.init(this.sandboxConfig);
      }

      for (const file of files) {
        await sandbox.writeFile(file.path, file.content);
      }

      const cmds = detectStack(techStack);

      result.install = await sandbox.execute(cmds.install);
      this.logActivity(`Sandbox install: exit=${result.install.exitCode}`);

      if (result.install.exitCode === 0) {
        result.build = await sandbox.execute(cmds.build);
        this.logActivity(`Sandbox build: exit=${result.build.exitCode}`);
      }

      if (result.build && result.build.exitCode === 0) {
        result.test = await sandbox.execute(cmds.test);
        this.logActivity(`Sandbox test: exit=${result.test.exitCode}`);
      }
    } catch (err) {
      this.logActivity(`Sandbox error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      try {
        await sandbox.cleanup();
      } catch {
        // cleanup errors are non-fatal
      }
    }

    return result;
  }

  private serializeSandboxResults(results: SandboxStepResult): Record<string, string> {
    const out: Record<string, string> = {};
    if (results.install) out['sandboxInstallResult'] = JSON.stringify(results.install);
    if (results.build) out['sandboxBuildResult'] = JSON.stringify(results.build);
    if (results.test) out['sandboxTestResult'] = JSON.stringify(results.test);
    return out;
  }

  private findFailingStep(results: SandboxStepResult): SandboxResult | null {
    if (results.install && results.install.exitCode !== 0) return results.install;
    if (results.build && results.build.exitCode !== 0) return results.build;
    if (results.test && results.test.exitCode !== 0) return results.test;
    return null;
  }

  private async requestFix(
    currentFiles: Array<{ path: string; content: string }>,
    failingResult: SandboxResult,
    techStack: string,
  ): Promise<Array<{ path: string; content: string }> | null> {
    const filesListing = currentFiles
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join('\n\n');

    const errorOutput = [
      failingResult.stderr ? `stderr:\n${failingResult.stderr}` : '',
      failingResult.stdout ? `stdout:\n${failingResult.stdout}` : '',
    ].filter(Boolean).join('\n\n');

    const userMessage = `The following ${techStack} code failed during "${failingResult.command}" (exit code ${failingResult.exitCode}).

Error output:
${errorOutput}

Current source files:
${filesListing}

Fix the code so "${failingResult.command}" succeeds. Return JSON with the corrected files array and a summary.`;

    try {
      const rawResponse = await this.callClaude({
        systemPrompt: FIX_SYSTEM_PROMPT,
        userMessage,
      });

      const cleaned = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as {
        files?: Array<{ path: string; content: string }>;
        summary?: string;
      };

      if (!parsed.files || !Array.isArray(parsed.files) || parsed.files.length === 0) {
        return null;
      }

      if (parsed.summary) {
        this.logActivity(`Fix: ${parsed.summary}`);
      }

      return parsed.files;
    } catch (err) {
      this.logActivity(`Fix LLM call failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
