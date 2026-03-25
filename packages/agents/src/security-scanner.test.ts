import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanCodeForVulnerabilities } from './security-scanner';

describe('scanCodeForVulnerabilities', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects obvious secret pattern in temporary file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-sec-'));
    tempDirs.push(root);
    const filePath = path.join(root, 'sample.ts');
    await Bun.write(filePath, "const API_KEY = 'super-secret-token-value';\n");

    const report = await scanCodeForVulnerabilities(root);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.summary.critical).toBeGreaterThan(0);
    expect(report.findings.some((issue) => issue.category === 'Hardcoded secret')).toBe(true);
  });

  it('does not flag env var reference as hardcoded secret', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-sec-'));
    tempDirs.push(root);
    const filePath = path.join(root, 'safe.ts');
    await Bun.write(filePath, "const key = process.env.API_KEY;\n");

    const report = await scanCodeForVulnerabilities(root);
    const hardcoded = report.findings.filter((finding) => finding.category === 'Hardcoded secret');
    expect(hardcoded).toHaveLength(0);
  });
});
