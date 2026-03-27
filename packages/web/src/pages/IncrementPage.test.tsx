import { describe, expect, it } from 'bun:test';
import { IncrementPage } from './IncrementPage';

describe('IncrementPage', () => {
  it('exports a renderable component', () => {
    expect(typeof IncrementPage).toBe('function');
  });
});
