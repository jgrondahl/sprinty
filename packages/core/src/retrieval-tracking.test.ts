import { describe, it, expect } from 'bun:test';
import { RetrievalTracker, type RetrievalAttempt, RETRIEVAL_FAILURE_THRESHOLD_DEFAULT } from './retrieval-tracking';

const makeAttempt = (overrides: Partial<RetrievalAttempt> = {}): RetrievalAttempt => ({
  storyId: 'story-1',
  projectId: 'proj-1',
  requestedFiles: ['src/a.ts', 'src/b.ts'],
  retrievedFiles: ['src/a.ts'],
  timestamp: new Date().toISOString(),
  ...overrides,
});

describe('RetrievalTracker.record()', () => {
  it('records a valid attempt', () => {
    const tracker = new RetrievalTracker();
    tracker.record(makeAttempt());
    expect(tracker.getAttempts()).toHaveLength(1);
  });

  it('throws on invalid attempt', () => {
    const tracker = new RetrievalTracker();

    expect(() => {
      tracker.record({
        storyId: 'story-1',
        projectId: 'proj-1',
        requestedFiles: ['src/a.ts'],
        retrievedFiles: ['src/a.ts'],
      } as unknown as RetrievalAttempt);
    }).toThrow();
  });
});

describe('RetrievalTracker.getAttempts()', () => {
  it('returns all attempts when no filter is provided', () => {
    const tracker = new RetrievalTracker();
    tracker.record(makeAttempt({ storyId: 'story-1' }));
    tracker.record(makeAttempt({ storyId: 'story-2', projectId: 'proj-2' }));

    expect(tracker.getAttempts()).toHaveLength(2);
  });

  it('filters attempts by storyId', () => {
    const tracker = new RetrievalTracker();
    tracker.record(makeAttempt({ storyId: 'story-1' }));
    tracker.record(makeAttempt({ storyId: 'story-2', projectId: 'proj-2' }));

    const attempts = tracker.getAttempts('story-1');
    expect(attempts).toHaveLength(1);
    expect(attempts[0].storyId).toBe('story-1');
  });
});

describe('RetrievalTracker.computeMetrics()', () => {
  it('returns retrievalRate 1.0 and empty missedFiles for zero attempts', () => {
    const tracker = new RetrievalTracker();

    const metrics = tracker.computeMetrics('story-1', 'proj-1');
    expect(metrics.totalAttempts).toBe(0);
    expect(metrics.totalRequested).toBe(0);
    expect(metrics.totalRetrieved).toBe(0);
    expect(metrics.retrievalRate).toBe(1);
    expect(metrics.missedFiles).toEqual([]);
  });

  it('computes correct retrievalRate and missedFiles for partial retrieval', () => {
    const tracker = new RetrievalTracker();
    tracker.record(
      makeAttempt({
        storyId: 'story-partial',
        projectId: 'proj-1',
        requestedFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        retrievedFiles: ['src/a.ts'],
      })
    );
    tracker.record(
      makeAttempt({
        storyId: 'story-partial',
        projectId: 'proj-1',
        requestedFiles: ['src/c.ts'],
        retrievedFiles: [],
      })
    );

    const metrics = tracker.computeMetrics('story-partial', 'proj-1');
    expect(metrics.totalAttempts).toBe(2);
    expect(metrics.totalRequested).toBe(4);
    expect(metrics.totalRetrieved).toBe(1);
    expect(metrics.retrievalRate).toBe(0.25);
    expect(new Set(metrics.missedFiles)).toEqual(new Set(['src/b.ts', 'src/c.ts']));
  });

  it('computes full retrieval with rate 1.0 and no missed files', () => {
    const tracker = new RetrievalTracker();
    tracker.record(
      makeAttempt({
        storyId: 'story-full',
        projectId: 'proj-2',
        requestedFiles: ['src/a.ts', 'src/b.ts'],
        retrievedFiles: ['src/a.ts', 'src/b.ts'],
      })
    );

    const metrics = tracker.computeMetrics('story-full', 'proj-2');
    expect(metrics.totalRequested).toBe(2);
    expect(metrics.totalRetrieved).toBe(2);
    expect(metrics.retrievalRate).toBe(1);
    expect(metrics.missedFiles).toEqual([]);
  });
});

describe('RetrievalTracker.computeMissedFiles()', () => {
  it('returns requested files that were never retrieved across story attempts', () => {
    const tracker = new RetrievalTracker();
    tracker.record(
      makeAttempt({
        storyId: 'story-missed',
        projectId: 'proj-1',
        requestedFiles: ['src/a.ts', 'src/b.ts'],
        retrievedFiles: ['src/a.ts'],
      })
    );
    tracker.record(
      makeAttempt({
        storyId: 'story-missed',
        projectId: 'proj-2',
        requestedFiles: ['src/b.ts', 'src/c.ts'],
        retrievedFiles: ['src/c.ts'],
      })
    );
    tracker.record(
      makeAttempt({
        storyId: 'story-other',
        projectId: 'proj-1',
        requestedFiles: ['src/ignored.ts'],
        retrievedFiles: [],
      })
    );

    expect(tracker.computeMissedFiles('story-missed')).toEqual(['src/b.ts']);
  });
});

describe('RetrievalTracker.clear()', () => {
  it('empties attempts', () => {
    const tracker = new RetrievalTracker();
    tracker.record(makeAttempt());
    expect(tracker.getAttempts()).toHaveLength(1);

    tracker.clear();
    expect(tracker.getAttempts()).toHaveLength(0);
  });
});

describe('RetrievalTracker.detectContextGap()', () => {
  it('returns null when there are no attempts for the project', () => {
    const tracker = new RetrievalTracker();
    expect(tracker.detectContextGap('proj-empty')).toBeNull();
  });

  it('returns null when failure rate is below threshold', () => {
    const tracker = new RetrievalTracker();
    for (let i = 0; i < 9; i++) {
      tracker.record(makeAttempt({ projectId: 'proj-ok', requestedFiles: [`ok-${i}.ts`], retrievedFiles: [`ok-${i}.ts`] }));
    }
    tracker.record(makeAttempt({ projectId: 'proj-ok', requestedFiles: ['missing.ts'], retrievedFiles: [] }));

    const result = tracker.detectContextGap('proj-ok');
    expect(result).toBeNull();
  });

  it('returns escalation recommendation when failure rate exceeds threshold', () => {
    const tracker = new RetrievalTracker();
    for (let i = 0; i < 7; i++) {
      tracker.record(makeAttempt({
        storyId: `story-${i}`,
        projectId: 'proj-bad',
        requestedFiles: ['src/utils/validation.ts'],
        retrievedFiles: [],
      }));
    }
    for (let i = 7; i < 10; i++) {
      tracker.record(makeAttempt({
        storyId: `story-${i}`,
        projectId: 'proj-bad',
        requestedFiles: ['src/main.ts'],
        retrievedFiles: ['src/main.ts'],
      }));
    }

    const result = tracker.detectContextGap('proj-bad');
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('proj-bad');
    expect(result!.failureRate).toBeCloseTo(0.7);
    expect(result!.threshold).toBe(RETRIEVAL_FAILURE_THRESHOLD_DEFAULT);
    expect(result!.totalAttempts).toBe(10);
    expect(result!.message).toContain('Retrieval failure rate');
    expect(result!.message).toContain('Recommendation: Enable hybrid retrieval');
    expect(result!.missedFileFrequency.length).toBeGreaterThan(0);
    expect(result!.missedFileFrequency[0]!.file).toBe('src/utils/validation.ts');
  });

  it('respects a custom threshold', () => {
    const tracker = new RetrievalTracker();
    tracker.record(makeAttempt({ projectId: 'proj-custom', requestedFiles: ['a.ts'], retrievedFiles: [] }));
    tracker.record(makeAttempt({ projectId: 'proj-custom', requestedFiles: ['b.ts'], retrievedFiles: ['b.ts'] }));
    tracker.record(makeAttempt({ projectId: 'proj-custom', requestedFiles: ['c.ts'], retrievedFiles: ['c.ts'] }));
    tracker.record(makeAttempt({ projectId: 'proj-custom', requestedFiles: ['d.ts'], retrievedFiles: ['d.ts'] }));
    tracker.record(makeAttempt({ projectId: 'proj-custom', requestedFiles: ['e.ts'], retrievedFiles: ['e.ts'] }));

    expect(tracker.detectContextGap('proj-custom', 0.30)).toBeNull();
    expect(tracker.detectContextGap('proj-custom', 0.10)).not.toBeNull();
  });

  it('sorts missedFileFrequency by descending count', () => {
    const tracker = new RetrievalTracker();
    tracker.record(makeAttempt({ projectId: 'proj-sort', requestedFiles: ['rare.ts'], retrievedFiles: [] }));
    tracker.record(makeAttempt({ projectId: 'proj-sort', requestedFiles: ['common.ts'], retrievedFiles: [] }));
    tracker.record(makeAttempt({ projectId: 'proj-sort', requestedFiles: ['common.ts'], retrievedFiles: [] }));
    tracker.record(makeAttempt({ projectId: 'proj-sort', requestedFiles: ['common.ts'], retrievedFiles: [] }));
    tracker.record(makeAttempt({ projectId: 'proj-sort', requestedFiles: ['medium.ts'], retrievedFiles: [] }));
    tracker.record(makeAttempt({ projectId: 'proj-sort', requestedFiles: ['medium.ts'], retrievedFiles: [] }));

    const result = tracker.detectContextGap('proj-sort', 0.0);
    expect(result).not.toBeNull();
    const files = result!.missedFileFrequency.map((f) => f.file);
    expect(files[0]).toBe('common.ts');
    expect(files[1]).toBe('medium.ts');
    expect(files[2]).toBe('rare.ts');
  });

  it('ignores attempts from other projects when computing escalation', () => {
    const tracker = new RetrievalTracker();
    for (let i = 0; i < 10; i++) {
      tracker.record(makeAttempt({ projectId: 'proj-other', requestedFiles: ['x.ts'], retrievedFiles: [] }));
    }
    tracker.record(makeAttempt({ projectId: 'proj-target', requestedFiles: ['y.ts'], retrievedFiles: ['y.ts'] }));

    expect(tracker.detectContextGap('proj-target')).toBeNull();
  });
});
