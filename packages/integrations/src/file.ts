import * as fs from 'fs';
import * as crypto from 'crypto';
import yaml from 'js-yaml';
import {
  StoryState,
  StorySource,
  StorySchema,
  type Story,
} from '@splinty/core';

// ─── Custom Errors ─────────────────────────────────────────────────────────────

export class ParseError extends Error {
  constructor(public readonly filePath: string, cause: unknown) {
    super(
      `ParseError: failed to parse '${filePath}': ${cause instanceof Error ? cause.message : String(cause)}`
    );
    this.name = 'ParseError';
  }
}

// ─── Internal Markdown Parsing ────────────────────────────────────────────────

interface RawMarkdownStory {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  dependsOn: string[];
}

/**
 * Parses a markdown file that may contain one or more story sections.
 *
 * Recognized format:
 *   ## Story: <title>   OR   ## <title>
 *   <description lines>
 *   ### Acceptance Criteria   (optional)
 *   - <criterion>
 */
function parseMarkdownStories(content: string): RawMarkdownStory[] {
  const stories: RawMarkdownStory[] = [];
  const lines = content.split('\n');
  let current: RawMarkdownStory | null = null;
  let inAC = false;

  for (const line of lines) {
    const storyHeading = line.match(/^##\s+(?:Story:\s+)?(.+)/i);
    const acHeading = line.match(/^###\s+(Acceptance Criteria|AC)/i);
    const dependsOnLine = line.match(/^Depends On:\s*(.+)/i);
    const bulletLine = line.match(/^[-*]\s+(.+)/);

    if (storyHeading) {
      if (current) stories.push(current);
      current = { title: storyHeading[1]!.trim(), description: '', acceptanceCriteria: [], dependsOn: [] };
      inAC = false;
    } else if (acHeading && current) {
      inAC = true;
    } else if (dependsOnLine && current && !inAC) {
      current.dependsOn = dependsOnLine[1]!
        .split(',')
        .map((storyId) => storyId.trim())
        .filter((storyId) => storyId.length > 0);
    } else if (bulletLine && current && inAC) {
      current.acceptanceCriteria.push(bulletLine[1]!.trim());
    } else if (current && !inAC && line.trim()) {
      current.description += (current.description ? ' ' : '') + line.trim();
    }
  }

  if (current) stories.push(current);
  return stories;
}

// ─── FileConnector ──────────────────────────────────────────────────────────

export class FileConnector {
  /**
   * Parse a .md, .json, or .yaml/.yml file into Story[].
   * All returned stories are in RAW state with source === FILE.
   * Throws ParseError on any invalid input.
   */
  parse(filePath: string): Story[] {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new ParseError(filePath, err);
    }

    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

    try {
      if (ext === 'md') {
        return this.parseMarkdown(filePath, content);
      } else if (ext === 'json') {
        return this.parseJSON(filePath, content);
      } else if (ext === 'yaml' || ext === 'yml') {
        return this.parseYAML(filePath, content);
      } else {
        throw new Error(`Unsupported file extension: .${ext}`);
      }
    } catch (err) {
      if (err instanceof ParseError) throw err;
      throw new ParseError(filePath, err);
    }
  }

  /**
   * Stamps a story with FILE source and a deterministic sourceId (hash of title).
   */
  setSource(story: Story): Story {
    const sourceId = crypto.createHash('sha256').update(story.title).digest('hex').slice(0, 12);
    return { ...story, source: StorySource.FILE, sourceId };
  }

  // ── Private parsers ──────────────────────────────────────────────────────

  private parseMarkdown(filePath: string, content: string): Story[] {
    const rawStories = parseMarkdownStories(content);
    if (rawStories.length === 0) {
      throw new ParseError(filePath, 'No story sections found. Use "## Story: <title>" headings.');
    }

    const now = new Date().toISOString();
    return rawStories.map((raw, i) =>
      this.setSource({
        id: `story-${String(i + 1).padStart(3, '0')}`,
        title: raw.title,
        description: raw.description || raw.title,
        acceptanceCriteria: raw.acceptanceCriteria,
        state: StoryState.RAW,
        source: StorySource.FILE,
        workspacePath: '',
        domain: 'general',
        tags: [],
        dependsOn: raw.dependsOn ?? [],
        createdAt: now,
        updatedAt: now,
      })
    );
  }

  private parseJSON(filePath: string, content: string): Story[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new ParseError(filePath, `Invalid JSON: ${(err as Error).message}`);
    }

    const raw = Array.isArray(parsed) ? parsed : [parsed];
    return raw.map((item, i) => this.validateAndStamp(filePath, item, i));
  }

  private parseYAML(filePath: string, content: string): Story[] {
    let parsed: unknown;
    try {
      parsed = yaml.load(content);
    } catch (err) {
      throw new ParseError(filePath, `Invalid YAML: ${(err as Error).message}`);
    }

    const raw = Array.isArray(parsed) ? parsed : [parsed];
    return raw.map((item, i) => this.validateAndStamp(filePath, item, i));
  }

  private validateAndStamp(filePath: string, item: unknown, index: number): Story {
    // Build a partial story with defaults for missing optional fields
    const now = new Date().toISOString();
    const withDefaults = {
      state: StoryState.RAW,
      source: StorySource.FILE,
      workspacePath: '',
      domain: 'general',
      tags: [],
      acceptanceCriteria: [],
      createdAt: now,
      updatedAt: now,
      ...(item as Record<string, unknown>),
    };

    const result = StorySchema.safeParse(withDefaults);
    if (!result.success) {
      throw new ParseError(
        filePath,
        `Story at index ${index} is invalid: ${result.error.message}`
      );
    }

    return this.setSource(result.data);
  }
}
