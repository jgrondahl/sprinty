import { describe, expect, it } from 'bun:test';
import { BacklogPage } from './BacklogPage';

describe('BacklogPage', () => {
  it('exports a renderable component', () => {
    expect(typeof BacklogPage).toBe('function');
  });
});
