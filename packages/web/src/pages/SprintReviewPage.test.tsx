import { describe, expect, it } from 'bun:test';
import { SprintReviewPage } from './SprintReviewPage';

describe('SprintReviewPage', () => {
  it('exports a renderable component', () => {
    expect(typeof SprintReviewPage).toBe('function');
  });
});
