import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileConnector, ParseError } from './file';
import { StoryState, StorySource } from '@splinty/core';

let tmpDir: string;
let connector: FileConnector;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-file-'));
  connector = new FileConnector();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function write(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

describe('FileConnector — Markdown', () => {
  it('parses a story with title and description', () => {
    const p = write(
      'login.md',
      `## Story: User Login\nUsers need to be able to log in securely.\n`
    );
    const stories = connector.parse(p);
    expect(stories.length).toBe(1);
    expect(stories[0]!.title).toBe('User Login');
    expect(stories[0]!.state).toBe(StoryState.RAW);
    expect(stories[0]!.source).toBe(StorySource.FILE);
  });

  it('parses acceptance criteria from ## heading', () => {
    const md = `## Story: Login\n### Acceptance Criteria\n- Given I am on the login page, When I submit valid credentials, Then I am logged in\n`;
    const p = write('ac.md', md);
    const stories = connector.parse(p);
    expect(stories[0]!.acceptanceCriteria.length).toBeGreaterThanOrEqual(1);
    expect(stories[0]!.acceptanceCriteria[0]).toContain('Given');
  });

  it('parses multiple story sections', () => {
    const md = `## Story: Login\nLogin description.\n## Story: Logout\nLogout description.\n`;
    const p = write('multi.md', md);
    const stories = connector.parse(p);
    expect(stories.length).toBe(2);
    expect(stories[0]!.title).toBe('Login');
    expect(stories[1]!.title).toBe('Logout');
  });

  it('throws ParseError when no story sections found', () => {
    const p = write('empty.md', '# Just a heading\nSome random text.\n');
    expect(() => connector.parse(p)).toThrow(ParseError);
  });

  it('assigns sourceId as 12-char hex string', () => {
    const p = write('sid.md', `## Story: Test Story\nDescription.\n`);
    const stories = connector.parse(p);
    expect(stories[0]!.sourceId).toMatch(/^[0-9a-f]{12}$/);
  });

  it('parses Depends On metadata from markdown', () => {
    const p = write(
      'depends-on.md',
      `## Story: Auth\nDepends On: story-001, story-002\n### Acceptance Criteria\n- can login\n`
    );

    const stories = connector.parse(p);
    expect(stories.length).toBe(1);
    expect(stories[0]!.dependsOn).toEqual(['story-001', 'story-002']);
  });

  it('defaults dependsOn to empty array when missing in markdown', () => {
    const p = write('depends-on-default.md', `## Story: Auth\nDescription\n`);

    const stories = connector.parse(p);
    expect(stories.length).toBe(1);
    expect(stories[0]!.dependsOn).toEqual([]);
  });
});

// ─── JSON ─────────────────────────────────────────────────────────────────────

describe('FileConnector — JSON', () => {
  it('parses a valid JSON story array', () => {
    const story = {
      id: 'story-001',
      title: 'Build login',
      description: 'Users log in',
      acceptanceCriteria: ['Given...'],
      state: 'RAW',
      source: 'FILE',
      workspacePath: '',
      domain: 'auth',
      tags: ['security'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const p = write('stories.json', JSON.stringify([story]));
    const stories = connector.parse(p);
    expect(stories.length).toBe(1);
    expect(stories[0]!.title).toBe('Build login');
    expect(stories[0]!.source).toBe(StorySource.FILE);
  });

  it('parses a single story object (not array)', () => {
    const story = {
      id: 's1',
      title: 'Single story',
      description: 'Just one',
      acceptanceCriteria: [],
      state: 'RAW',
      source: 'FILE',
      workspacePath: '',
      domain: 'general',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const p = write('single.json', JSON.stringify(story));
    const stories = connector.parse(p);
    expect(stories.length).toBe(1);
  });

  it('throws ParseError on malformed JSON', () => {
    const p = write('bad.json', '{not: valid json}');
    expect(() => connector.parse(p)).toThrow(ParseError);
    try {
      connector.parse(p);
    } catch (err) {
      expect(err instanceof ParseError).toBe(true);
      expect((err as ParseError).message).toContain('bad.json');
    }
  });

  it('throws ParseError when required field missing', () => {
    const p = write('missing.json', JSON.stringify([{ title: 'No ID' }]));
    expect(() => connector.parse(p)).toThrow(ParseError);
  });
});

// ─── YAML ─────────────────────────────────────────────────────────────────────

describe('FileConnector — YAML', () => {
  it('parses a valid YAML story', () => {
    const content = `
- id: story-yaml-001
  title: YAML Story
  description: A story from YAML
  acceptanceCriteria:
    - Given something, When I act, Then it works
  state: RAW
  source: FILE
  workspacePath: ""
  domain: general
  tags: []
  createdAt: "${new Date().toISOString()}"
  updatedAt: "${new Date().toISOString()}"
`;
    const p = write('stories.yaml', content);
    const stories = connector.parse(p);
    expect(stories.length).toBe(1);
    expect(stories[0]!.title).toBe('YAML Story');
    expect(stories[0]!.source).toBe(StorySource.FILE);
  });

  it('also parses .yml extension', () => {
    const content = `
- id: y1
  title: YML Story
  description: YML ext
  acceptanceCriteria: []
  state: RAW
  source: FILE
  workspacePath: ""
  domain: general
  tags: []
  createdAt: "${new Date().toISOString()}"
  updatedAt: "${new Date().toISOString()}"
`;
    const p = write('stories.yml', content);
    const stories = connector.parse(p);
    expect(stories[0]!.title).toBe('YML Story');
  });

  it('throws ParseError on malformed YAML', () => {
    const p = write('bad.yaml', '{ invalid: yaml: [unclosed');
    expect(() => connector.parse(p)).toThrow(ParseError);
  });
});

// ─── setSource ────────────────────────────────────────────────────────────────

describe('FileConnector — setSource', () => {
  it('stamps source as FILE and generates deterministic sourceId', () => {
    const now = new Date().toISOString();
    const story = {
      id: 'x',
      title: 'Hello World',
      description: 'desc',
      acceptanceCriteria: [],
      state: StoryState.RAW,
      source: StorySource.FILE,
      workspacePath: '',
      domain: 'general',
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    const stamped1 = connector.setSource(story);
    const stamped2 = connector.setSource(story);
    expect(stamped1.source).toBe(StorySource.FILE);
    expect(stamped1.sourceId).toBe(stamped2.sourceId); // deterministic
    expect(stamped1.sourceId).toMatch(/^[0-9a-f]{12}$/);
  });
});

// ─── Unsupported extension ────────────────────────────────────────────────────

describe('FileConnector — unsupported extension', () => {
  it('throws ParseError for .docx', () => {
    const p = write('doc.docx', 'binary stuff');
    expect(() => connector.parse(p)).toThrow(ParseError);
  });
});

// ─── File not found ───────────────────────────────────────────────────────────

describe('FileConnector — file not found', () => {
  it('throws ParseError when file does not exist', () => {
    expect(() => connector.parse('/nonexistent/path/story.md')).toThrow(ParseError);
  });
});
