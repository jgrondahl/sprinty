import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LedgerManager } from './ledger';
import { StoryState, StorySource, AgentPersona, type Story } from './types';

let tmpDir: string;
let ledger: LedgerManager;

const now = new Date().toISOString();

function makeStory(id: string, state: StoryState = StoryState.RAW): Story {
  return {
    id,
    title: `Story ${id}`,
    description: 'A test story',
    acceptanceCriteria: [],
    dependsOn: [],
    state,
    source: StorySource.FILE,
    workspacePath: `.splinty/proj/stories/${id}`,
    domain: 'general',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-ledger-'));
  ledger = new LedgerManager(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('LedgerManager.init()', () => {
  it('creates AGENTS.md file', () => {
    ledger.init('proj-1');
    const ledgerPath = path.join(tmpDir, 'proj-1', 'AGENTS.md');
    expect(fs.existsSync(ledgerPath)).toBe(true);
  });

  it('file contains expected header content', () => {
    ledger.init('proj-1');
    const content = ledger.getSnapshot('proj-1');
    expect(content).toContain('Splinty — Sprint Ledger');
    expect(content).toContain('## Stories');
    expect(content).toContain('| ID | Title | State | Agent | Updated |');
  });
});

describe('LedgerManager.upsertStory()', () => {
  it('adds a new story to the ledger', () => {
    ledger.init('proj-1');
    ledger.upsertStory('proj-1', makeStory('story-001'));
    const content = ledger.getSnapshot('proj-1');
    expect(content).toContain('story-001');
    expect(content).toContain('Story story-001');
    expect(content).toContain('RAW');
  });

  it('upserts multiple stories without duplication', () => {
    ledger.init('proj-1');
    ledger.upsertStory('proj-1', makeStory('story-001'));
    ledger.upsertStory('proj-1', makeStory('story-002'));
    ledger.upsertStory('proj-1', makeStory('story-001', StoryState.EPIC)); // update

    const rows = ledger.load('proj-1');
    // story-001 should appear only once
    const story001Rows = rows.filter((r) => r.id === 'story-001');
    expect(story001Rows).toHaveLength(1);
    expect(story001Rows[0].state).toBe(StoryState.EPIC);
  });

  it('loads all 3 stories after 3 upserts', () => {
    ledger.init('proj-1');
    ledger.upsertStory('proj-1', makeStory('s1'));
    ledger.upsertStory('proj-1', makeStory('s2'));
    ledger.upsertStory('proj-1', makeStory('s3'));

    const rows = ledger.load('proj-1');
    expect(rows).toHaveLength(3);
  });
});

describe('LedgerManager.updateState()', () => {
  it('updates state of an existing story', () => {
    ledger.init('proj-1');
    ledger.upsertStory('proj-1', makeStory('story-001'));
    ledger.updateState('proj-1', 'story-001', StoryState.IN_PROGRESS, AgentPersona.DEVELOPER);

    const rows = ledger.load('proj-1');
    const row = rows.find((r) => r.id === 'story-001');
    expect(row).toBeDefined();
    expect(row!.state).toBe(StoryState.IN_PROGRESS);
  });
});

describe('LedgerManager.load()', () => {
  it('returns empty array on empty ledger', () => {
    ledger.init('proj-1');
    const rows = ledger.load('proj-1');
    expect(rows).toEqual([]);
  });

  it('simulates restart: new LedgerManager instance reads same data', () => {
    ledger.init('proj-1');
    ledger.upsertStory('proj-1', makeStory('story-A', StoryState.IN_PROGRESS));
    ledger.upsertStory('proj-1', makeStory('story-B', StoryState.DONE));
    ledger.upsertStory('proj-1', makeStory('story-C', StoryState.MERGED));

    // Simulate restart — create fresh instance pointing to same dir
    const newLedger = new LedgerManager(tmpDir);
    const rows = newLedger.load('proj-1');

    expect(rows).toHaveLength(3);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain('story-A');
    expect(ids).toContain('story-B');
    expect(ids).toContain('story-C');
  });
});

describe('LedgerManager.getSnapshot()', () => {
  it('throws if ledger not initialized', () => {
    expect(() => ledger.getSnapshot('ghost-project')).toThrow();
  });
});
