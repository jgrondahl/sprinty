import { describe, expect, it } from 'bun:test';
import { StorySource, StoryState, type Story } from './types';
import { detectFileConflicts, topologicalSortStories } from './story-dependencies';

const now = '2026-01-01T00:00:00.000Z';

const makeStory = (id: string, dependsOn: string[] = []): Story => ({
  id,
  title: id,
  description: `${id} description`,
  acceptanceCriteria: [],
  state: StoryState.RAW,
  source: StorySource.FILE,
  workspacePath: '',
  domain: 'general',
  tags: [],
  dependsOn,
  createdAt: now,
  updatedAt: now,
});

describe('topologicalSortStories', () => {
  it('returns empty array for empty input', () => {
    expect(topologicalSortStories([])).toEqual([]);
  });

  it('returns single story with no dependencies', () => {
    const story = makeStory('story-a');
    expect(topologicalSortStories([story])).toEqual([story]);
  });

  it('orders dependency before dependent story', () => {
    const storyA = makeStory('story-a', ['story-b']);
    const storyB = makeStory('story-b');
    const sorted = topologicalSortStories([storyA, storyB]);
    expect(sorted.map((story) => story.id)).toEqual(['story-b', 'story-a']);
  });

  it('orders chained dependencies correctly', () => {
    const storyC = makeStory('story-c', ['story-b']);
    const storyB = makeStory('story-b', ['story-a']);
    const storyA = makeStory('story-a');
    const sorted = topologicalSortStories([storyC, storyB, storyA]);
    expect(sorted.map((story) => story.id)).toEqual(['story-a', 'story-b', 'story-c']);
  });

  it('throws when dependency cycle exists', () => {
    const storyA = makeStory('story-a', ['story-b']);
    const storyB = makeStory('story-b', ['story-a']);
    expect(() => topologicalSortStories([storyA, storyB])).toThrow(
      'Cycle detected in story dependencies:'
    );
  });

  it('ignores unknown dependencies', () => {
    const storyA = makeStory('story-a', ['story-missing']);
    const storyB = makeStory('story-b');
    expect(() => topologicalSortStories([storyA, storyB])).not.toThrow();
    const sorted = topologicalSortStories([storyA, storyB]);
    expect(sorted.map((story) => story.id)).toEqual(['story-a', 'story-b']);
  });
});

describe('detectFileConflicts', () => {
  it('returns empty map when no file conflicts exist', () => {
    const stories = [makeStory('story-a'), makeStory('story-b')];
    const storyFiles = new Map<string, string[]>([
      ['story-a', ['src/a.ts']],
      ['story-b', ['src/b.ts']],
    ]);

    const conflicts = detectFileConflicts(stories, storyFiles);
    expect(conflicts.size).toBe(0);
  });

  it('returns file conflict when multiple stories claim same file', () => {
    const stories = [makeStory('story-a'), makeStory('story-b')];
    const storyFiles = new Map<string, string[]>([
      ['story-a', ['src/shared.ts']],
      ['story-b', ['src/shared.ts']],
    ]);

    const conflicts = detectFileConflicts(stories, storyFiles);
    expect(conflicts.size).toBe(1);
    expect(conflicts.get('src/shared.ts')).toEqual(['story-a', 'story-b']);
  });

  it('does not include uniquely claimed files in result', () => {
    const stories = [makeStory('story-a'), makeStory('story-b'), makeStory('story-c')];
    const storyFiles = new Map<string, string[]>([
      ['story-a', ['src/only-a.ts', 'src/shared.ts']],
      ['story-b', ['src/shared.ts']],
      ['story-c', ['src/only-c.ts']],
    ]);

    const conflicts = detectFileConflicts(stories, storyFiles);
    expect(conflicts.get('src/shared.ts')).toEqual(['story-a', 'story-b']);
    expect(conflicts.has('src/only-a.ts')).toBe(false);
    expect(conflicts.has('src/only-c.ts')).toBe(false);
  });
});
