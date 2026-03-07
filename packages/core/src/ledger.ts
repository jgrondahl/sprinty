import * as fs from 'fs';
import * as path from 'path';
import { type Story, type StoryState, type AgentPersona } from './types';

// ─── LedgerManager ────────────────────────────────────────────────────────────

const HEADER = `# Splinty — Sprint Ledger\n\n## Stories\n| ID | Title | State | Agent | Updated |\n|----|-------|-------|-------|---------|\n`;

export class LedgerManager {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.env['SPLINTY_WORKSPACE_DIR'] ?? '.splinty';
  }

  private getLedgerPath(projectId: string): string {
    return path.join(this.baseDir, projectId, 'AGENTS.md');
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Creates AGENTS.md for a project with a header and empty table.
   */
  init(projectId: string): void {
    const projectDir = path.join(this.baseDir, projectId);
    fs.mkdirSync(projectDir, { recursive: true });

    const ledgerPath = this.getLedgerPath(projectId);
    const timestamp = new Date().toISOString();
    const content = `# Splinty — Sprint Ledger\n_Last updated: ${timestamp}_\n\n## Stories\n| ID | Title | State | Agent | Updated |\n|----|-------|-------|-------|---------|\n`;
    fs.writeFileSync(ledgerPath, content, 'utf-8');
  }

  // ── Read ────────────────────────────────────────────────────────────────────

  /**
   * Returns the raw AGENTS.md content as a string.
   */
  getSnapshot(projectId: string): string {
    const ledgerPath = this.getLedgerPath(projectId);
    if (!fs.existsSync(ledgerPath)) {
      throw new Error(`Ledger not found for project: ${projectId}`);
    }
    return fs.readFileSync(ledgerPath, 'utf-8');
  }

  /**
   * Parses AGENTS.md and returns the stories table as an array of partial Story
   * objects (id, title, state, and updatedAt).
   */
  load(projectId: string): Array<Pick<Story, 'id' | 'title' | 'state' | 'updatedAt'>> {
    const content = this.getSnapshot(projectId);
    const rows: Array<Pick<Story, 'id' | 'title' | 'state' | 'updatedAt'>> = [];

    for (const line of content.split('\n')) {
      // Match data rows: | id | title | state | agent | updated |
      const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
      if (!match) continue;

      const [, id, title, state, , updated] = match;
      // Skip header / separator rows
      if (id.trim() === 'ID' || id.trim().startsWith('-')) continue;

      rows.push({
        id: id.trim(),
        title: title.trim(),
        state: state.trim() as StoryState,
        updatedAt: updated.trim(),
      });
    }
    return rows;
  }

  // ── Write ───────────────────────────────────────────────────────────────────

  /**
   * Adds or updates the row for `story` in AGENTS.md. Idempotent on story ID.
   */
  upsertStory(projectId: string, story: Story): void {
    this._upsertRow(
      projectId,
      story.id,
      story.title,
      story.state,
      story.state as unknown as AgentPersona, // responsible agent resolved externally
      new Date().toISOString().slice(0, 10)
    );
  }

  /**
   * Updates only the state and agent columns for an existing story.
   */
  updateState(projectId: string, storyId: string, newState: StoryState, agent: AgentPersona): void {
    this._upsertRow(
      projectId,
      storyId,
      undefined,
      newState,
      agent,
      new Date().toISOString().slice(0, 10)
    );
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _upsertRow(
    projectId: string,
    id: string,
    title: string | undefined,
    state: StoryState,
    agent: AgentPersona | StoryState,
    updated: string
  ): void {
    const ledgerPath = this.getLedgerPath(projectId);
    if (!fs.existsSync(ledgerPath)) {
      throw new Error(`Ledger not found for project: ${projectId}. Call init() first.`);
    }

    const content = fs.readFileSync(ledgerPath, 'utf-8');
    const lines = content.split('\n');

    // Find existing row for this story ID
    const existingIdx = lines.findIndex((line) => {
      const m = line.match(/^\|\s*([^|]+?)\s*\|/);
      return m && m[1].trim() === id;
    });

    const resolvedTitle = title ?? (existingIdx >= 0 ? this._extractCell(lines[existingIdx], 2) : id);
    const newRow = `| ${id} | ${resolvedTitle} | ${state} | ${agent} | ${updated} |`;

    if (existingIdx >= 0) {
      lines[existingIdx] = newRow;
    } else {
      // Insert before last empty lines or at end of table
      const separatorIdx = lines.findIndex((l) => l.match(/^\|[-| ]+\|$/));
      const insertAt = separatorIdx >= 0 ? separatorIdx + 1 : lines.length;
      lines.splice(insertAt, 0, newRow);
    }

    // Update the _Last updated_ line
    const updatedContent = lines
      .join('\n')
      .replace(/_Last updated: .*_/, `_Last updated: ${new Date().toISOString()}_`);

    fs.writeFileSync(ledgerPath, updatedContent, 'utf-8');
  }

  private _extractCell(row: string, cellIndex: number): string {
    const cells = row.split('|').map((c) => c.trim());
    // cells[0] is empty (before first |), cells[1] is col 1, etc.
    return cells[cellIndex] ?? '';
  }
}
