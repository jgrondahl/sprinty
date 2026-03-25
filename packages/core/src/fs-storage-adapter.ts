import * as fs from 'fs';
import * as path from 'path';
import {
  type StorageAdapter,
  type StorageDirEntry,
  type StorageMkdirOptions,
  type StorageRmOptions,
  type StorageStat,
} from './storage-adapter';

export class FilesystemStorageAdapter implements StorageAdapter {
  readFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
  }

  readBytes(filePath: string): Uint8Array {
    return fs.readFileSync(filePath);
  }

  writeFile(filePath: string, content: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  writeBytes(filePath: string, content: Uint8Array): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  exists(targetPath: string): boolean {
    return fs.existsSync(targetPath);
  }

  mkdir(dirPath: string, options?: StorageMkdirOptions): void {
    fs.mkdirSync(dirPath, options ?? { recursive: true });
  }

  readDir(dirPath: string): string[] {
    return fs.readdirSync(dirPath);
  }

  readDirEntries(dirPath: string): StorageDirEntry[] {
    return fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
    }));
  }

  rm(targetPath: string, options?: StorageRmOptions): void {
    fs.rmSync(targetPath, { recursive: options?.recursive ?? false, force: true });
  }

  stat(targetPath: string): StorageStat {
    const stat = fs.statSync(targetPath);
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  }

  glob(pattern: string, cwd: string): string[] {
    const segments = pattern.split('/').filter(Boolean);
    const results: string[] = [];

    const walk = (currentDir: string, segmentIndex: number): void => {
      if (segmentIndex >= segments.length) {
        results.push(currentDir);
        return;
      }

      const currentSegment = segments[segmentIndex];

      if (!currentSegment) {
        walk(currentDir, segmentIndex + 1);
        return;
      }

      if (currentSegment === '**') {
        walk(currentDir, segmentIndex + 1);
        for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            walk(path.join(currentDir, entry.name), segmentIndex);
          }
        }
        return;
      }

      const regex = new RegExp(`^${currentSegment.replace(/\*/g, '.*')}$`);
      for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
        if (!regex.test(entry.name)) {
          continue;
        }
        const nextPath = path.join(currentDir, entry.name);
        if (segmentIndex === segments.length - 1) {
          results.push(nextPath);
        } else if (entry.isDirectory()) {
          walk(nextPath, segmentIndex + 1);
        }
      }
    };

    if (fs.existsSync(cwd)) {
      walk(cwd, 0);
    }

    return results;
  }
}
