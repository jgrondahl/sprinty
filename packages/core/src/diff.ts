// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiffResult {
  filePath: string;
  patch: string;
  hunks: number;
  additions: number;
  deletions: number;
}

export interface PatchResult {
  success: boolean;
  content: string;
  failedHunks: number;
}

type DiffOp = {
  type: 'equal' | 'add' | 'del';
  line: string;
};

type ParsedHunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
};

// ─── DiffManager ─────────────────────────────────────────────────────────────

export class DiffManager {
  generateDiff(
    filePath: string,
    oldContent: string,
    newContent: string,
    contextLines = 3
  ): DiffResult {
    const oldLines = this.toLines(oldContent);
    const newLines = this.toLines(newContent);
    const ops = this.buildOps(oldLines, newLines);

    let additions = 0;
    let deletions = 0;
    for (const op of ops) {
      if (op.type === 'add') additions += 1;
      if (op.type === 'del') deletions += 1;
    }

    const hunks = this.buildHunks(ops, Math.max(0, contextLines));
    if (hunks.length === 0) {
      return {
        filePath,
        patch: '',
        hunks: 0,
        additions,
        deletions,
      };
    }

    const oldBefore: number[] = [];
    const newBefore: number[] = [];
    let oldCursor = 1;
    let newCursor = 1;
    for (let i = 0; i < ops.length; i += 1) {
      oldBefore[i] = oldCursor;
      newBefore[i] = newCursor;
      const op = ops[i];
      if (op.type === 'equal' || op.type === 'del') oldCursor += 1;
      if (op.type === 'equal' || op.type === 'add') newCursor += 1;
    }

    const patchLines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];
    for (const hunk of hunks) {
      const oldStart = oldBefore[hunk.start] ?? 1;
      const newStart = newBefore[hunk.start] ?? 1;
      let oldCount = 0;
      let newCount = 0;

      for (let i = hunk.start; i <= hunk.end; i += 1) {
        const op = ops[i];
        if (op.type !== 'add') oldCount += 1;
        if (op.type !== 'del') newCount += 1;
      }

      patchLines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
      for (let i = hunk.start; i <= hunk.end; i += 1) {
        const op = ops[i];
        if (op.type === 'equal') patchLines.push(` ${op.line}`);
        if (op.type === 'del') patchLines.push(`-${op.line}`);
        if (op.type === 'add') patchLines.push(`+${op.line}`);
      }
    }

    return {
      filePath,
      patch: patchLines.join('\n'),
      hunks: hunks.length,
      additions,
      deletions,
    };
  }

  applyPatch(originalContent: string, patch: string): PatchResult {
    if (patch.trim() === '') {
      return {
        success: true,
        content: originalContent,
        failedHunks: 0,
      };
    }

    const hunks = this.parseUnifiedDiff(patch);
    if (hunks.length === 0) {
      return {
        success: true,
        content: originalContent,
        failedHunks: 0,
      };
    }

    const lines = this.toLines(originalContent);
    let failedHunks = 0;
    let lineDelta = 0;

    for (const hunk of hunks) {
      const expectedStart = hunk.oldStart - 1 + lineDelta;
      const matchStart = this.findHunkStart(lines, hunk, expectedStart, 3);
      if (matchStart < 0) {
        failedHunks += 1;
        continue;
      }

      const working = lines.slice();
      let pointer = matchStart;
      let valid = true;

      for (const line of hunk.lines) {
        const marker = line[0];
        const value = line.slice(1);

        if (marker === ' ') {
          if (working[pointer] !== value) {
            valid = false;
            break;
          }
          pointer += 1;
        } else if (marker === '-') {
          if (working[pointer] !== value) {
            valid = false;
            break;
          }
          working.splice(pointer, 1);
        } else if (marker === '+') {
          working.splice(pointer, 0, value);
          pointer += 1;
        }
      }

      if (!valid) {
        failedHunks += 1;
        continue;
      }

      lines.splice(0, lines.length, ...working);

      lineDelta += hunk.newCount - hunk.oldCount;
    }

    return {
      success: failedHunks === 0,
      content: lines.join('\n'),
      failedHunks,
    };
  }

  applyPatches(files: Map<string, string>, diffs: DiffResult[]): Map<string, PatchResult> {
    const results = new Map<string, PatchResult>();
    for (const diff of diffs) {
      const original = files.get(diff.filePath) ?? '';
      results.set(diff.filePath, this.applyPatch(original, diff.patch));
    }
    return results;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private toLines(content: string): string[] {
    if (content === '') return [];
    return content.split('\n');
  }

  private buildOps(oldLines: string[], newLines: string[]): DiffOp[] {
    const n = oldLines.length;
    const m = newLines.length;
    const lcs: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        if (oldLines[i] === newLines[j]) {
          lcs[i][j] = lcs[i + 1][j + 1] + 1;
        } else {
          lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1]);
        }
      }
    }

    const ops: DiffOp[] = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
      if (oldLines[i] === newLines[j]) {
        ops.push({ type: 'equal', line: oldLines[i] });
        i += 1;
        j += 1;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        ops.push({ type: 'del', line: oldLines[i] });
        i += 1;
      } else {
        ops.push({ type: 'add', line: newLines[j] });
        j += 1;
      }
    }

    while (i < n) {
      ops.push({ type: 'del', line: oldLines[i] });
      i += 1;
    }
    while (j < m) {
      ops.push({ type: 'add', line: newLines[j] });
      j += 1;
    }

    return ops;
  }

  private buildHunks(ops: DiffOp[], contextLines: number): Array<{ start: number; end: number }> {
    const hunks: Array<{ start: number; end: number }> = [];

    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'equal') {
        i += 1;
        continue;
      }

      let groupStart = i;
      let groupEnd = i;
      while (groupEnd + 1 < ops.length && ops[groupEnd + 1].type !== 'equal') {
        groupEnd += 1;
      }

      let start = Math.max(0, groupStart - contextLines);
      let end = Math.min(ops.length - 1, groupEnd + contextLines);

      const prev = hunks[hunks.length - 1];
      if (prev && start <= prev.end) {
        prev.end = Math.max(prev.end, end);
      } else {
        hunks.push({ start, end });
      }

      i = groupEnd + 1;
    }

    return hunks;
  }

  private parseUnifiedDiff(patch: string): ParsedHunk[] {
    const lines = patch.split('\n');
    const hunks: ParsedHunk[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.startsWith('@@ ')) {
        i += 1;
        continue;
      }

      const header = this.parseHunkHeader(line);
      if (!header) {
        i += 1;
        continue;
      }

      i += 1;
      const hunkLines: string[] = [];
      while (i < lines.length) {
        const bodyLine = lines[i];
        if (bodyLine.startsWith('@@ ')) break;
        if (bodyLine.startsWith('--- ') || bodyLine.startsWith('+++ ')) {
          i += 1;
          continue;
        }

        const marker = bodyLine[0];
        if (marker === ' ' || marker === '+' || marker === '-') {
          hunkLines.push(bodyLine);
        }
        i += 1;
      }

      hunks.push({
        oldStart: header.oldStart,
        oldCount: header.oldCount,
        newStart: header.newStart,
        newCount: header.newCount,
        lines: hunkLines,
      });
    }

    return hunks;
  }

  private parseHunkHeader(line: string):
    | { oldStart: number; oldCount: number; newStart: number; newCount: number }
    | undefined {
    if (!line.startsWith('@@ -')) return undefined;

    const plusSep = line.indexOf(' +', 4);
    if (plusSep < 0) return undefined;

    const endSep = line.indexOf(' @@', plusSep + 2);
    if (endSep < 0) return undefined;

    const oldPart = line.slice(4, plusSep);
    const newPart = line.slice(plusSep + 2, endSep);
    const oldRange = this.parseRange(oldPart);
    const newRange = this.parseRange(newPart);

    if (!oldRange || !newRange) return undefined;

    return {
      oldStart: oldRange.start,
      oldCount: oldRange.count,
      newStart: newRange.start,
      newCount: newRange.count,
    };
  }

  private parseRange(part: string): { start: number; count: number } | undefined {
    const comma = part.indexOf(',');
    const startText = comma >= 0 ? part.slice(0, comma) : part;
    const countText = comma >= 0 ? part.slice(comma + 1) : '1';
    const start = Number(startText);
    const count = Number(countText);
    if (!Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 0) {
      return undefined;
    }
    return { start, count };
  }

  private findHunkStart(lines: string[], hunk: ParsedHunk, expectedStart: number, fuzz: number): number {
    const target = this.getTargetLines(hunk);
    if (target.length === 0) {
      if (expectedStart < 0) return 0;
      if (expectedStart > lines.length) return lines.length;
      return expectedStart;
    }

    const maxStart = lines.length - target.length;
    if (maxStart < 0) return -1;

    const startMin = Math.max(0, expectedStart - fuzz);
    const startMax = Math.min(maxStart, expectedStart + fuzz);

    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let start = startMin; start <= startMax; start += 1) {
      if (!this.matchesAt(lines, target, start)) continue;
      const distance = Math.abs(start - expectedStart);
      if (distance < bestDistance) {
        best = start;
        bestDistance = distance;
      }
    }

    return best;
  }

  private getTargetLines(hunk: ParsedHunk): string[] {
    const target: string[] = [];
    for (const line of hunk.lines) {
      const marker = line[0];
      if (marker === ' ' || marker === '-') {
        target.push(line.slice(1));
      }
    }
    return target;
  }

  private matchesAt(lines: string[], target: string[], start: number): boolean {
    for (let i = 0; i < target.length; i += 1) {
      if (lines[start + i] !== target[i]) return false;
    }
    return true;
  }
}
