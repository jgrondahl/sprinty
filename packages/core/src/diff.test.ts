import { describe, it, expect } from 'bun:test';
import { DiffManager, type DiffResult } from './diff';

const manager = new DiffManager();

// ─── generateDiff ────────────────────────────────────────────────────────────

describe('DiffManager.generateDiff', () => {
  it('returns empty patch for identical files', () => {
    const result = manager.generateDiff('a.txt', 'line1\nline2', 'line1\nline2');
    expect(result.patch).toBe('');
    expect(result.hunks).toBe(0);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
  });

  it('handles a single line replacement', () => {
    const result = manager.generateDiff('a.txt', 'a\nb\nc', 'a\nB\nc');
    expect(result.patch).toContain('@@ -1,3 +1,3 @@');
    expect(result.patch).toContain('-b');
    expect(result.patch).toContain('+B');
    expect(result.hunks).toBe(1);
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
  });

  it('handles multi-line additions', () => {
    const result = manager.generateDiff('a.txt', 'a\nb', 'a\nnew1\nnew2\nb');
    expect(result.patch).toContain('+new1');
    expect(result.patch).toContain('+new2');
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(0);
  });

  it('handles multi-line deletions', () => {
    const result = manager.generateDiff('a.txt', 'a\nold1\nold2\nb', 'a\nb');
    expect(result.patch).toContain('-old1');
    expect(result.patch).toContain('-old2');
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(2);
  });

  it('handles mixed changes with multiple hunks', () => {
    const oldLines = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'].join('\n');
    const newLines = ['a1', 'A2', 'a3', 'a4', 'a5', 'a6', 'A7', 'a8'].join('\n');
    const result = manager.generateDiff('a.txt', oldLines, newLines, 0);
    expect(result.hunks).toBe(2);
    expect(result.patch).toContain('-a2');
    expect(result.patch).toContain('+A2');
    expect(result.patch).toContain('-a7');
    expect(result.patch).toContain('+A7');
  });

  it('handles file with no trailing newline', () => {
    const result = manager.generateDiff('a.txt', 'hello', 'hello\nworld');
    expect(result.patch).toContain('+world');
    expect(result.additions).toBe(1);
  });

  it('supports custom context lines', () => {
    const oldContent = ['a', 'b', 'c', 'd', 'e'].join('\n');
    const newContent = ['a', 'b', 'X', 'd', 'e'].join('\n');
    const defaultContext = manager.generateDiff('a.txt', oldContent, newContent);
    const zeroContext = manager.generateDiff('a.txt', oldContent, newContent, 0);
    const defaultBody = defaultContext.patch
      .split('\n')
      .filter((line) => !line.startsWith('--- ') && !line.startsWith('+++ '));
    const zeroBody = zeroContext.patch
      .split('\n')
      .filter((line) => !line.startsWith('--- ') && !line.startsWith('+++ '));

    expect(defaultBody.some((line) => line.startsWith(' '))).toBe(true);
    expect(zeroBody.some((line) => line.startsWith(' '))).toBe(false);
  });
});

// ─── applyPatch ───────────────────────────────────────────────────────────────

describe('DiffManager.applyPatch', () => {
  it('applies a simple patch successfully', () => {
    const oldContent = 'a\nb\nc';
    const newContent = 'a\nB\nc';
    const diff = manager.generateDiff('a.txt', oldContent, newContent);
    const result = manager.applyPatch(oldContent, diff.patch);
    expect(result.success).toBe(true);
    expect(result.failedHunks).toBe(0);
    expect(result.content).toBe(newContent);
  });

  it('applies multi-hunk patches', () => {
    const oldContent = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'].join('\n');
    const newContent = ['l1', 'L2', 'l3', 'l4', 'l5', 'l6', 'L7', 'l8'].join('\n');
    const diff = manager.generateDiff('a.txt', oldContent, newContent, 0);
    const result = manager.applyPatch(oldContent, diff.patch);
    expect(result.success).toBe(true);
    expect(result.content).toBe(newContent);
  });

  it('applies with context matching under shifted position', () => {
    const oldContent = ['preamble', 'a', 'b', 'c', 'tail'].join('\n');
    const targetBase = ['a', 'b', 'c', 'tail'].join('\n');
    const newBase = ['a', 'B', 'c', 'tail'].join('\n');
    const diff = manager.generateDiff('a.txt', targetBase, newBase);
    const result = manager.applyPatch(oldContent, diff.patch);
    expect(result.success).toBe(true);
    expect(result.content).toBe(['preamble', 'a', 'B', 'c', 'tail'].join('\n'));
  });

  it('reports failed hunk when context does not match', () => {
    const oldContent = 'a\nb\nc';
    const newContent = 'a\nB\nc';
    const diff = manager.generateDiff('a.txt', oldContent, newContent);
    const incompatibleOriginal = 'x\ny\nz';
    const result = manager.applyPatch(incompatibleOriginal, diff.patch);
    expect(result.success).toBe(false);
    expect(result.failedHunks).toBeGreaterThan(0);
    expect(result.content).toBe(incompatibleOriginal);
  });

  it('applies patch to empty file', () => {
    const diff = manager.generateDiff('a.txt', '', 'first\nsecond');
    const result = manager.applyPatch('', diff.patch);
    expect(result.success).toBe(true);
    expect(result.content).toBe('first\nsecond');
  });
});

// ─── round-trip + edge cases ─────────────────────────────────────────────────

describe('DiffManager round-trip and edge cases', () => {
  it('round-trips generated patch back to new content', () => {
    const oldContent = ['alpha', 'beta', 'gamma', 'delta'].join('\n');
    const newContent = ['alpha', 'BETA', 'gamma', 'delta', 'epsilon'].join('\n');
    const diff = manager.generateDiff('a.txt', oldContent, newContent);
    const result = manager.applyPatch(oldContent, diff.patch);
    expect(result.success).toBe(true);
    expect(result.content).toBe(newContent);
  });

  it('handles empty files', () => {
    const diff = manager.generateDiff('a.txt', '', '');
    const result = manager.applyPatch('', diff.patch);
    expect(diff.patch).toBe('');
    expect(result.content).toBe('');
  });

  it('handles single-line files', () => {
    const diff = manager.generateDiff('a.txt', 'a', 'b');
    const result = manager.applyPatch('a', diff.patch);
    expect(result.success).toBe(true);
    expect(result.content).toBe('b');
  });

  it('handles long files (100+ lines)', () => {
    const oldLines: string[] = [];
    const newLines: string[] = [];
    for (let i = 0; i < 140; i += 1) {
      oldLines.push(`line-${i}`);
      newLines.push(i === 70 ? 'line-70-updated' : `line-${i}`);
    }

    const oldContent = oldLines.join('\n');
    const newContent = newLines.join('\n');
    const diff = manager.generateDiff('long.txt', oldContent, newContent);
    const result = manager.applyPatch(oldContent, diff.patch);

    expect(result.success).toBe(true);
    expect(result.content).toBe(newContent);
    expect(diff.hunks).toBe(1);
  });
});

// ─── applyPatches ─────────────────────────────────────────────────────────────

describe('DiffManager.applyPatches', () => {
  it('applies multiple file patches with mixed success', () => {
    const files = new Map<string, string>([
      ['a.txt', 'a\nb\nc'],
      ['b.txt', 'x\ny\nz'],
    ]);

    const goodDiff = manager.generateDiff('a.txt', 'a\nb\nc', 'a\nB\nc');
    const badDiff = manager.generateDiff('b.txt', 'k\nl\nm', 'k\nL\nm');

    const results = manager.applyPatches(files, [goodDiff, badDiff]);
    const aResult = results.get('a.txt');
    const bResult = results.get('b.txt');

    expect(aResult?.success).toBe(true);
    expect(aResult?.content).toBe('a\nB\nc');
    expect(bResult?.success).toBe(false);
    expect(bResult?.content).toBe('x\ny\nz');
  });

  it('treats missing file content as empty string', () => {
    const files = new Map<string, string>();
    const diff: DiffResult = manager.generateDiff('new.txt', '', 'created');
    const results = manager.applyPatches(files, [diff]);
    const result = results.get('new.txt');
    expect(result?.success).toBe(true);
    expect(result?.content).toBe('created');
  });
});
