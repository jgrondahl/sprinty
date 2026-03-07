import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HandoffManager } from './handoff';
import { WorkspaceManager } from './workspace';
import { AgentPersona, type WorkspaceState } from './types';

let tmpDir: string;
let wsMgr: WorkspaceManager;
let handoffMgr: HandoffManager;
let ws: WorkspaceState;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-handoff-'));
  wsMgr = new WorkspaceManager(tmpDir);
  handoffMgr = new HandoffManager();
  ws = wsMgr.createWorkspace('proj', 'story-001');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('HandoffManager.create()', () => {
  it('creates a valid handoff document', () => {
    const doc = handoffMgr.create(
      AgentPersona.ARCHITECT,
      AgentPersona.DEVELOPER,
      'story-001',
      'completed',
      { 'api-style': 'REST' },
      'Implement the REST endpoints'
    );
    expect(doc.fromAgent).toBe(AgentPersona.ARCHITECT);
    expect(doc.toAgent).toBe(AgentPersona.DEVELOPER);
    expect(doc.storyId).toBe('story-001');
    expect(doc.artifacts).toEqual([]);
  });

  it('includes provided artifacts', () => {
    const doc = handoffMgr.create(
      AgentPersona.ARCHITECT,
      AgentPersona.DEVELOPER,
      'story-001',
      'completed',
      {},
      'Build it',
      ['artifacts/spec.json', 'artifacts/diagram.png']
    );
    expect(doc.artifacts).toHaveLength(2);
  });

  it('sets a valid ISO timestamp', () => {
    const doc = handoffMgr.create(
      AgentPersona.PRODUCT_OWNER,
      AgentPersona.ARCHITECT,
      'story-001',
      'done',
      {},
      'Design the system'
    );
    expect(() => new Date(doc.timestamp)).not.toThrow();
    expect(new Date(doc.timestamp).getTime()).toBeGreaterThan(0);
  });
});

describe('HandoffManager.save() + loadLatest()', () => {
  it('round-trips a handoff document', () => {
    const doc = handoffMgr.create(
      AgentPersona.ARCHITECT,
      AgentPersona.DEVELOPER,
      'story-001',
      'completed',
      { 'tech-stack': 'TypeScript + Bun' },
      'Build REST API',
      ['artifacts/spec.json']
    );
    handoffMgr.save(ws, doc);

    const loaded = handoffMgr.loadLatest(ws, AgentPersona.DEVELOPER);
    expect(loaded).not.toBeNull();
    expect(loaded!.fromAgent).toBe(AgentPersona.ARCHITECT);
    expect(loaded!.stateOfWorld['tech-stack']).toBe('TypeScript + Bun');
    expect(loaded!.artifacts).toContain('artifacts/spec.json');
  });

  it('returns null when no handoff exists for agent', () => {
    const result = handoffMgr.loadLatest(ws, AgentPersona.QA_ENGINEER);
    expect(result).toBeNull();
  });

  it('returns most recent when multiple handoffs exist', async () => {
    const doc1 = handoffMgr.create(
      AgentPersona.ARCHITECT,
      AgentPersona.DEVELOPER,
      'story-001',
      'first',
      {},
      'Do first thing'
    );
    handoffMgr.save(ws, doc1);

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));

    const doc2 = handoffMgr.create(
      AgentPersona.QA_ENGINEER,
      AgentPersona.DEVELOPER,
      'story-001',
      'rework',
      {},
      'Fix the tests'
    );
    handoffMgr.save(ws, doc2);

    const latest = handoffMgr.loadLatest(ws, AgentPersona.DEVELOPER);
    expect(latest!.status).toBe('rework');
  });
});

describe('HandoffManager.loadAll()', () => {
  it('returns all saved handoffs in order', async () => {
    handoffMgr.save(
      ws,
      handoffMgr.create(AgentPersona.BUSINESS_OWNER, AgentPersona.PRODUCT_OWNER, 'story-001', 'done', {}, 'Write stories')
    );
    await new Promise((r) => setTimeout(r, 10));
    handoffMgr.save(
      ws,
      handoffMgr.create(AgentPersona.PRODUCT_OWNER, AgentPersona.ARCHITECT, 'story-001', 'done', {}, 'Design system')
    );

    const all = handoffMgr.loadAll(ws);
    expect(all).toHaveLength(2);
    expect(all[0].fromAgent).toBe(AgentPersona.BUSINESS_OWNER);
    expect(all[1].fromAgent).toBe(AgentPersona.PRODUCT_OWNER);
  });

  it('returns empty array when no handoffs exist', () => {
    const result = handoffMgr.loadAll(ws);
    expect(result).toEqual([]);
  });
});

describe('HandoffManager.summarize()', () => {
  it('produces a non-empty string', () => {
    const doc = handoffMgr.create(
      AgentPersona.ARCHITECT,
      AgentPersona.DEVELOPER,
      'story-001',
      'done',
      { 'key': 'value' },
      'Next goal here'
    );
    const summary = handoffMgr.summarize(doc);
    expect(summary.length).toBeGreaterThan(0);
  });

  it('includes key fields in summary', () => {
    const doc = handoffMgr.create(
      AgentPersona.ARCHITECT,
      AgentPersona.DEVELOPER,
      'story-001',
      'completed',
      { 'tech': 'TypeScript' },
      'Implement login endpoint'
    );
    const summary = handoffMgr.summarize(doc);
    expect(summary).toContain('ARCHITECT');
    expect(summary).toContain('DEVELOPER');
    expect(summary).toContain('story-001');
    expect(summary).toContain('Implement login endpoint');
  });

  it('stays within 2000 character limit', () => {
    // Large stateOfWorld to stress-test truncation
    const stateOfWorld: Record<string, string> = {};
    for (let i = 0; i < 20; i++) {
      stateOfWorld[`key-${i}`] = 'x'.repeat(100);
    }
    const doc = handoffMgr.create(
      AgentPersona.ARCHITECT,
      AgentPersona.DEVELOPER,
      'story-001',
      'done',
      stateOfWorld,
      'Do the thing'
    );
    const summary = handoffMgr.summarize(doc);
    expect(summary.length).toBeLessThanOrEqual(2000);
  });
});
