import { describe, expect, it } from 'bun:test';
import { RetrospectivePage } from './RetrospectivePage';

describe('RetrospectivePage', () => {
  it('exports a renderable component', () => {
    expect(typeof RetrospectivePage).toBe('function');
  });
});
