import { z } from 'zod';

export const StorageMkdirOptionsSchema = z.object({
  recursive: z.boolean().optional(),
});

export const StorageRmOptionsSchema = z.object({
  recursive: z.boolean().optional(),
});

export const StorageStatSchema = z.object({
  isFile: z.boolean(),
  isDirectory: z.boolean(),
  size: z.number().nonnegative(),
  mtimeMs: z.number().nonnegative(),
});

export const StorageDirEntrySchema = z.object({
  name: z.string().min(1),
  isDirectory: z.boolean(),
});

export type StorageMkdirOptions = z.infer<typeof StorageMkdirOptionsSchema>;
export type StorageRmOptions = z.infer<typeof StorageRmOptionsSchema>;
export type StorageStat = z.infer<typeof StorageStatSchema>;
export type StorageDirEntry = z.infer<typeof StorageDirEntrySchema>;

export interface StorageAdapter {
  readFile(path: string): string;
  readBytes(path: string): Uint8Array;
  writeFile(path: string, content: string): void;
  writeBytes(path: string, content: Uint8Array): void;
  exists(path: string): boolean;
  mkdir(path: string, options?: StorageMkdirOptions): void;
  readDir(path: string): string[];
  readDirEntries(path: string): StorageDirEntry[];
  rm(path: string, options?: StorageRmOptions): void;
  stat(path: string): StorageStat;
  glob(pattern: string, cwd: string): string[];
}
