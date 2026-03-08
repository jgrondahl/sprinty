import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { TelemetryRetentionManager } from './telemetry-retention';

const gunzip = promisify(zlib.gunzip);

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-retention-'));
  tempDirs.push(dir);
  return dir;
}

function writeSprintFile(dir: string, index: number, content?: string): string {
  const filePath = path.join(dir, `sprint-s1-${index}.json`);
  fs.writeFileSync(filePath, content ?? JSON.stringify({ index }), 'utf-8');
  const mtime = new Date(Date.now() + index * 1000);
  fs.utimesSync(filePath, mtime, mtime);
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('TelemetryRetentionManager.enforce', () => {
  it('deletes oldest files beyond maxSprints', async () => {
    const dir = createTempDir();
    for (let i = 0; i < 6; i++) {
      writeSprintFile(dir, i);
    }

    const manager = new TelemetryRetentionManager({ maxSprints: 3, archiveExpired: false });
    await manager.enforce(dir);

    const remaining = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
    expect(remaining).toEqual([
      'sprint-s1-3.json',
      'sprint-s1-4.json',
      'sprint-s1-5.json',
    ]);
  });

  it('keeps files within limit', async () => {
    const dir = createTempDir();
    for (let i = 0; i < 3; i++) {
      writeSprintFile(dir, i);
    }

    const manager = new TelemetryRetentionManager({ maxSprints: 5, archiveExpired: false });
    await manager.enforce(dir);

    const remaining = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
    expect(remaining).toHaveLength(3);
  });

  it('archives when archiveExpired=true', async () => {
    const dir = createTempDir();
    for (let i = 0; i < 4; i++) {
      writeSprintFile(dir, i);
    }

    const manager = new TelemetryRetentionManager({ maxSprints: 2, archiveExpired: true });
    await manager.enforce(dir);

    const jsonFiles = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
    const archives = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl.gz')).sort();

    expect(jsonFiles).toEqual(['sprint-s1-2.json', 'sprint-s1-3.json']);
    expect(archives).toEqual(['sprint-s1-0.jsonl.gz', 'sprint-s1-1.jsonl.gz']);
  });
});

describe('TelemetryRetentionManager.archive', () => {
  it('produces valid gzip', async () => {
    const dir = createTempDir();
    const source = writeSprintFile(dir, 0, JSON.stringify({ sprintId: 's1', ok: true }));

    const manager = new TelemetryRetentionManager({ maxSprints: 5, archiveExpired: true });
    const archivePath = await manager.archive(source, dir);

    expect(fs.existsSync(archivePath)).toBe(true);
    const gz = fs.readFileSync(archivePath);
    const decompressed = (await gunzip(gz)).toString('utf-8');
    expect(decompressed).toBe(JSON.stringify({ sprintId: 's1', ok: true }));
  });
});
