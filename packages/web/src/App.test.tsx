import { describe, expect, it } from 'bun:test';
import App from './App';

describe('App', () => {
  it('exports a renderable component', () => {
    expect(typeof App).toBe('function');
  });
});
