import { describe, expect, it } from 'bun:test';
import {
  StorageMkdirOptionsSchema,
  StorageRmOptionsSchema,
  StorageStatSchema,
  type StorageAdapter,
} from './storage-adapter';

describe('storage-adapter schemas', () => {
  it('parses mkdir options', () => {
    expect(StorageMkdirOptionsSchema.parse({ recursive: true })).toEqual({ recursive: true });
    expect(StorageMkdirOptionsSchema.parse({})).toEqual({});
  });

  it('parses rm options', () => {
    expect(StorageRmOptionsSchema.parse({ recursive: false })).toEqual({ recursive: false });
    expect(StorageRmOptionsSchema.parse({})).toEqual({});
  });

  it('parses stat payload', () => {
    const parsed = StorageStatSchema.parse({
      isFile: true,
      isDirectory: false,
      size: 128,
      mtimeMs: 1700000000000,
    });
    expect(parsed.isFile).toBe(true);
    expect(parsed.isDirectory).toBe(false);
    expect(parsed.size).toBe(128);
  });
});

describe('StorageAdapter contract', () => {
  it('accepts a complete adapter implementation', () => {
    const adapter: StorageAdapter = {
      readFile(_path: string): string {
        return 'ok';
      },
      readBytes(_path: string): Uint8Array {
        return new Uint8Array();
      },
      writeFile(_path: string, _content: string): void {
        return;
      },
      writeBytes(_path: string, _content: Uint8Array): void {
        return;
      },
      exists(_path: string): boolean {
        return true;
      },
      mkdir(_path: string): void {
        return;
      },
      readDir(_path: string): string[] {
        return ['a'];
      },
      readDirEntries(_path: string) {
        return [];
      },
      rm(_path: string): void {
        return;
      },
      stat(_path: string) {
        return { isFile: true, isDirectory: false, size: 1, mtimeMs: Date.now() };
      },
      glob(_pattern: string, _cwd: string): string[] {
        return [];
      },
    };

    expect(adapter.readFile('/x')).toBe('ok');
    expect(adapter.exists('/x')).toBe(true);
    expect(adapter.readDir('/x')).toEqual(['a']);
  });
});
