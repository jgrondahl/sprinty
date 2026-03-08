import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ArchitecturePlan } from './architecture-plan';
import {
  ServiceCountGuard,
  AutoApproveServiceGate,
  AutoRejectServiceGate,
  extractServiceNames,
} from './service-guard';
import { WorkspaceManager } from './workspace';
import { ServiceGuardrailsSchema } from './types';

const makePlan = (modules: { directory: string }[]): ArchitecturePlan => ({
  planId: 'plan-svc-001',
  schemaVersion: 1,
  projectId: 'proj-001',
  level: 'sprint',
  scopeKey: 'sprint:sprint-001',
  sprintId: 'sprint-001',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  revisionNumber: 0,
  techStack: {
    language: 'TypeScript',
    runtime: 'Node.js 20',
    framework: 'express',
    testFramework: 'bun:test',
    buildTool: 'tsc',
    rationale: 'test',
  },
  modules: modules.map((m, i) => ({
    name: `mod-${i}`,
    description: 'test',
    responsibility: 'test',
    directory: m.directory,
    exposedInterfaces: [],
    dependencies: [],
    owningStories: [],
  })),
  storyModuleMapping: [],
  executionOrder: [],
  decisions: [],
  constraints: [],
});

describe('extractServiceNames', () => {
  test('returns unique top-level directory segments', () => {
    const plan = makePlan([
      { directory: 'api/routes' },
      { directory: 'api/services' },
      { directory: 'web/components' },
      { directory: 'worker' },
    ]);
    const names = extractServiceNames(plan);
    expect(names.sort()).toEqual(['api', 'web', 'worker']);
  });

  test('returns empty array for empty modules', () => {
    const plan = makePlan([]);
    expect(extractServiceNames(plan)).toEqual([]);
  });

  test('normalizes backslashes to forward slashes', () => {
    const plan = makePlan([{ directory: 'api\\routes' }]);
    expect(extractServiceNames(plan)).toEqual(['api']);
  });

  test('treats single-segment directory as service name', () => {
    const plan = makePlan([{ directory: 'monolith' }]);
    expect(extractServiceNames(plan)).toEqual(['monolith']);
  });
});

describe('ServiceCountGuard', () => {
  test('returns true when service count is within limit', async () => {
    const plan = makePlan([
      { directory: 'api/src' },
      { directory: 'web/src' },
    ]);
    const guardrails = ServiceGuardrailsSchema.parse({ maxServicesPerProject: 4 });
    const guard = new ServiceCountGuard(guardrails, new AutoRejectServiceGate());

    const result = await guard.enforce(plan, 'proj-001');
    expect(result).toBe(true);
  });

  test('returns false when limit exceeded and gate rejects', async () => {
    const plan = makePlan([
      { directory: 'api/src' },
      { directory: 'web/src' },
      { directory: 'worker/src' },
      { directory: 'admin/src' },
      { directory: 'analytics/src' },
    ]);
    const guardrails = ServiceGuardrailsSchema.parse({ maxServicesPerProject: 4 });
    const guard = new ServiceCountGuard(guardrails, new AutoRejectServiceGate());

    const result = await guard.enforce(plan, 'proj-001');
    expect(result).toBe(false);
  });

  test('returns true when limit exceeded and gate approves', async () => {
    const plan = makePlan([
      { directory: 'api/src' },
      { directory: 'web/src' },
      { directory: 'worker/src' },
      { directory: 'admin/src' },
      { directory: 'analytics/src' },
    ]);
    const guardrails = ServiceGuardrailsSchema.parse({ maxServicesPerProject: 4 });
    const guard = new ServiceCountGuard(guardrails, new AutoApproveServiceGate());

    const result = await guard.enforce(plan, 'proj-001');
    expect(result).toBe(true);
  });

  test('returns false without calling gate when requireHumanApproval is false', async () => {
    const plan = makePlan([
      { directory: 'api/src' },
      { directory: 'web/src' },
      { directory: 'worker/src' },
      { directory: 'admin/src' },
      { directory: 'analytics/src' },
    ]);
    let gateCalled = false;
    const guardrails = ServiceGuardrailsSchema.parse({
      maxServicesPerProject: 4,
      requireHumanApproval: false,
    });
    const guard = new ServiceCountGuard(guardrails, {
      requestServiceApproval: async () => {
        gateCalled = true;
        return true;
      },
    });

    const result = await guard.enforce(plan, 'proj-001');
    expect(result).toBe(false);
    expect(gateCalled).toBe(false);
  });

  test('passes project id and service list to gate', async () => {
    const plan = makePlan([
      { directory: 'api/src' },
      { directory: 'web/src' },
      { directory: 'worker/src' },
      { directory: 'admin/src' },
      { directory: 'analytics/src' },
    ]);
    let capturedRequest: Parameters<typeof AutoApproveServiceGate.prototype.requestServiceApproval>[0] | null = null;
    const guardrails = ServiceGuardrailsSchema.parse({ maxServicesPerProject: 4 });
    const guard = new ServiceCountGuard(guardrails, {
      requestServiceApproval: async (req) => {
        capturedRequest = req;
        return true;
      },
    });

    await guard.enforce(plan, 'my-project');
    expect(capturedRequest!.projectId).toBe('my-project');
    expect(capturedRequest!.limit).toBe(4);
    expect(capturedRequest!.proposedServices.sort()).toEqual(
      ['admin', 'analytics', 'api', 'web', 'worker']
    );
  });
});

describe('ServiceGuardrailsSchema defaults', () => {
  test('defaults maxServicesPerProject to 4', () => {
    const result = ServiceGuardrailsSchema.parse({});
    expect(result.maxServicesPerProject).toBe(4);
  });

  test('defaults requireHumanApproval to true', () => {
    const result = ServiceGuardrailsSchema.parse({});
    expect(result.requireHumanApproval).toBe(true);
  });
});

describe('WorkspaceManager service workspace', () => {
  let tmpDir: string;
  let mgr: WorkspaceManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'splinty-svc-'));
    mgr = new WorkspaceManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('createServiceWorkspace creates expected directory structure', () => {
    mgr.createServiceWorkspace('proj-1', 'api');
    const base = path.join(tmpDir, 'proj-1', 'services', 'api');
    expect(fs.existsSync(path.join(base, 'handoffs'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'artifacts'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'src'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'agent.log'))).toBe(true);
    expect(fs.existsSync(path.join(base, 'errors.log'))).toBe(true);
  });

  test('createServiceWorkspace returns WorkspaceState with storyId prefixed service:', () => {
    const ws = mgr.createServiceWorkspace('proj-1', 'worker');
    expect(ws.storyId).toBe('service:worker');
    expect(ws.projectId).toBe('proj-1');
  });

  test('listServiceNames returns all created service names', () => {
    mgr.createServiceWorkspace('proj-1', 'api');
    mgr.createServiceWorkspace('proj-1', 'web');
    mgr.createServiceWorkspace('proj-1', 'worker');
    expect(mgr.listServiceNames('proj-1').sort()).toEqual(['api', 'web', 'worker']);
  });

  test('listServiceNames returns empty array when no services exist', () => {
    expect(mgr.listServiceNames('proj-1')).toEqual([]);
  });

  test('getServiceWorkspacePath returns correct path', () => {
    const expected = path.join(tmpDir, 'proj-1', 'services', 'api');
    expect(mgr.getServiceWorkspacePath('proj-1', 'api')).toBe(expected);
  });

  test('writeFile works inside service workspace', () => {
    const ws = mgr.createServiceWorkspace('proj-1', 'api');
    mgr.writeFile(ws, 'src/index.ts', 'export const x = 1;');
    const content = mgr.readFile(ws, 'src/index.ts');
    expect(content).toBe('export const x = 1;');
  });
});
