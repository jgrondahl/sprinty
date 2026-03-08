import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { pipeline as streamPipeline } from 'stream';

const pipeline = promisify(streamPipeline);

export interface RetentionConfig {
  maxSprints: number;
  archiveExpired: boolean;
  archiveDir?: string;
}

export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  maxSprints: 5,
  archiveExpired: false,
};

export class TelemetryRetentionManager {
  constructor(private readonly config: RetentionConfig = DEFAULT_RETENTION_CONFIG) {}

  async enforce(telemetryDir: string): Promise<void> {
    if (!fs.existsSync(telemetryDir)) {
      return;
    }

    const maxSprints = Math.max(0, this.config.maxSprints);
    const files = fs
      .readdirSync(telemetryDir)
      .filter((fileName) => fileName.startsWith('sprint-') && fileName.endsWith('.json'))
      .map((fileName) => {
        const filePath = path.join(telemetryDir, fileName);
        const stat = fs.statSync(filePath);
        return {
          filePath,
          mtimeMs: stat.mtimeMs,
        };
      })
      .sort((a, b) => a.mtimeMs - b.mtimeMs);

    if (files.length <= maxSprints) {
      return;
    }

    const expired = files.slice(0, files.length - maxSprints);
    for (const entry of expired) {
      if (this.config.archiveExpired) {
        await this.archive(entry.filePath, this.config.archiveDir ?? telemetryDir);
      }
      fs.rmSync(entry.filePath, { force: true });
    }
  }

  async archive(filePath: string, archiveDir: string): Promise<string> {
    fs.mkdirSync(archiveDir, { recursive: true });
    const archivePath = path.join(archiveDir, `${path.basename(filePath)}l.gz`);
    await pipeline(
      fs.createReadStream(filePath),
      zlib.createGzip(),
      fs.createWriteStream(archivePath)
    );
    return archivePath;
  }
}
