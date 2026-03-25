import { describe, expect, it } from 'bun:test';
import { StoryMetricsRepository } from './story-metrics.repo';

describe('StoryMetricsRepository API surface', () => {
  it('exposes save/findBySprint/findByStory methods', () => {
    const repo = new StoryMetricsRepository({} as never);
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.findBySprint).toBe('function');
    expect(typeof repo.findByStory).toBe('function');
  });
});
