import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import {
  AgentPersona,
  HandoffDocumentSchema,
  StorySchema,
  type WorkspaceState,
} from './types';
import { WorkspaceManager } from './workspace';

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

export const ResumePointSchema = z.object({
  storyId: z.string().min(1),
  projectId: z.string().min(1),
  lastCompletedAgent: z.nativeEnum(AgentPersona),
  handoffId: z.string().min(1),
  handoff: HandoffDocumentSchema,
  storySnapshot: StorySchema,
  timestamp: z.string().datetime(),
  pipelineStep: z.number().int().min(0),
  metadata: z.record(z.string(), z.string()).optional(),
});

// ─── TypeScript Types (inferred from Zod) ───────────────────────────────────

export type ResumePoint = z.infer<typeof ResumePointSchema>;

// ─── Resume Manager ──────────────────────────────────────────────────────────

const RESUME_FILE = 'resume-point.json';

export class ResumeManager {
  constructor(private readonly workspaceManager: WorkspaceManager) {}

  save(ws: WorkspaceState, point: ResumePoint): void {
    const validated = ResumePointSchema.parse(point);
    this.workspaceManager.writeFile(ws, RESUME_FILE, JSON.stringify(validated, null, 2));
  }

  load(ws: WorkspaceState): ResumePoint | null {
    try {
      const raw = this.workspaceManager.readFile(ws, RESUME_FILE);
      return ResumePointSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  clear(ws: WorkspaceState): void {
    const fullPath = path.join(ws.basePath, RESUME_FILE);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    delete ws.files[RESUME_FILE];
  }

  exists(ws: WorkspaceState): boolean {
    return fs.existsSync(path.join(ws.basePath, RESUME_FILE));
  }
}
