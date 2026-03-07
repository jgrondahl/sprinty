import * as fs from 'fs';
import * as path from 'path';
import {
  HandoffDocumentSchema,
  type HandoffDocument,
  type AgentPersona,
  type WorkspaceState,
} from './types';

// ─── Handoff Manager ──────────────────────────────────────────────────────────

/** Maximum characters for the summarize() output (≈500 tokens at ~4 chars/token) */
const MAX_SUMMARY_CHARS = 2000;

export class HandoffManager {
  /**
   * Creates a new HandoffDocument, validates it via Zod, and returns it.
   */
  create(
    fromAgent: AgentPersona,
    toAgent: AgentPersona,
    storyId: string,
    status: string,
    stateOfWorld: Record<string, string>,
    nextGoal: string,
    artifacts: string[] = []
  ): HandoffDocument {
    const doc: HandoffDocument = {
      fromAgent,
      toAgent,
      storyId,
      status,
      stateOfWorld,
      nextGoal,
      artifacts,
      timestamp: new Date().toISOString(),
    };
    // Validate schema — throws ZodError if invalid
    return HandoffDocumentSchema.parse(doc);
  }

  /**
   * Saves a HandoffDocument to the workspace's `handoffs/` subdirectory.
   * Filename: `{fromAgent}-to-{toAgent}-{timestamp}.json`
   */
  save(ws: WorkspaceState, handoff: HandoffDocument): void {
    // Validate before write
    HandoffDocumentSchema.parse(handoff);

    const safeTimestamp = handoff.timestamp.replace(/[:.]/g, '-');
    const filename = `${handoff.fromAgent}-to-${handoff.toAgent}-${safeTimestamp}.json`;
    const handoffsDir = path.join(ws.basePath, 'handoffs');
    fs.mkdirSync(handoffsDir, { recursive: true });

    const fullPath = path.join(handoffsDir, filename);
    fs.writeFileSync(fullPath, JSON.stringify(handoff, null, 2), 'utf-8');
  }

  /**
   * Loads the most recent HandoffDocument addressed TO the given agent.
   * Returns null if none found.
   */
  loadLatest(ws: WorkspaceState, toAgent: AgentPersona): HandoffDocument | null {
    const handoffsDir = path.join(ws.basePath, 'handoffs');
    if (!fs.existsSync(handoffsDir)) return null;

    const files = fs
      .readdirSync(handoffsDir)
      .filter((f) => f.includes(`-to-${toAgent}-`) && f.endsWith('.json'))
      .sort(); // ISO timestamp in filename → lexicographic sort = chronological

    if (files.length === 0) return null;

    const latest = files[files.length - 1];
    const raw = fs.readFileSync(path.join(handoffsDir, latest), 'utf-8');
    return HandoffDocumentSchema.parse(JSON.parse(raw));
  }

  /**
   * Loads ALL HandoffDocuments in the workspace's handoffs directory.
   * Returns them in chronological order.
   */
  loadAll(ws: WorkspaceState): HandoffDocument[] {
    const handoffsDir = path.join(ws.basePath, 'handoffs');
    if (!fs.existsSync(handoffsDir)) return [];

    const files = fs
      .readdirSync(handoffsDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    return files.map((f) => {
      const raw = fs.readFileSync(path.join(handoffsDir, f), 'utf-8');
      return HandoffDocumentSchema.parse(JSON.parse(raw));
    });
  }

  /**
   * Produces a compact string representation of a HandoffDocument suitable for
   * injection into an LLM prompt. Output is capped at MAX_SUMMARY_CHARS.
   */
  summarize(handoff: HandoffDocument): string {
    const stateEntries = Object.entries(handoff.stateOfWorld)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n');

    const artifactList =
      handoff.artifacts.length > 0
        ? `Artifacts: ${handoff.artifacts.join(', ')}`
        : 'Artifacts: none';

    const summary = [
      `Handoff from ${handoff.fromAgent} → ${handoff.toAgent}`,
      `Story: ${handoff.storyId}`,
      `Status: ${handoff.status}`,
      `State of World:\n${stateEntries}`,
      `Next Goal: ${handoff.nextGoal}`,
      artifactList,
      `Timestamp: ${handoff.timestamp}`,
    ].join('\n');

    if (summary.length <= MAX_SUMMARY_CHARS) return summary;

    // Truncate gracefully with a notice
    return summary.slice(0, MAX_SUMMARY_CHARS - 20) + '\n...[truncated]';
  }
}
