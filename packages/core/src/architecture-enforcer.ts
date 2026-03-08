import * as path from 'path';
import { z } from 'zod';
import type {
  ArchitectureConstraint,
  ArchitecturePlan,
  ModuleDefinition,
  TechStackDecision,
} from './architecture-plan';
import type { ImplementationTask } from './task-decomposition';

// ─── Enforcement Schemas ─────────────────────────────────────────────────────

export const ArchitectureViolationSchema = z.object({
  constraintId: z.string().min(1),
  severity: z.enum(['error', 'warning']),
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  description: z.string().min(1),
  suggestion: z.string().min(1),
});

export type ArchitectureViolation = z.infer<typeof ArchitectureViolationSchema>;

export const ComplianceMetricsSchema = z.object({
  totalConstraints: z.number().int().min(0),
  satisfied: z.number().int().min(0),
  violated: z.number().int().min(0),
  warnings: z.number().int().min(0),
});

export type ComplianceMetrics = z.infer<typeof ComplianceMetricsSchema>;

export const EnforcementReportSchema = z.object({
  taskId: z.string().min(1),
  planId: z.string().min(1),
  timestamp: z.string().datetime(),
  status: z.enum(['pass', 'fail', 'warn']),
  violations: z.array(ArchitectureViolationSchema),
  metrics: ComplianceMetricsSchema,
});

export type EnforcementReport = z.infer<typeof EnforcementReportSchema>;

export const ModuleLockSchema = z.object({
  module: z.string().min(1),
  ownerTaskId: z.string().min(1),
  groupId: z.number().int().positive(),
  acquiredAt: z.string().datetime(),
  releasedAt: z.string().datetime().optional(),
});

export type ModuleLock = z.infer<typeof ModuleLockSchema>;

// ─── Telemetry ────────────────────────────────────────────────────────────────

export interface EnforcementTelemetryEvent {
  type: 'enforcement-completed';
  taskId: string;
  planId: string;
  timestamp: string;
  status: EnforcementReport['status'];
  metrics: ComplianceMetrics;
  violationsByRule: Record<string, number>;
}

export type TelemetryHook = (event: EnforcementTelemetryEvent) => void;

// ─── Deterministic Rule Engine ────────────────────────────────────────────────

const FRAMEWORK_ALTERNATIVES: Record<string, string[]> = {
  express: ['fastify', 'koa', 'hapi', '@nestjs/core'],
  fastify: ['express', 'koa', 'hapi', '@nestjs/core'],
  koa: ['express', 'fastify', 'hapi', '@nestjs/core'],
  react: ['vue', 'svelte', 'angular', '@angular/core', 'solid-js', 'preact'],
  vue: ['react', 'svelte', 'angular', '@angular/core', 'solid-js', 'preact'],
  next: ['nuxt', 'remix', 'gatsby', 'astro'],
  vitest: ['jest', 'mocha', 'jasmine', 'ava', 'tap'],
  jest: ['vitest', 'mocha', 'jasmine', 'ava', 'tap'],
  'bun:test': ['jest', 'vitest', 'mocha', 'jasmine', 'ava', 'tap'],
  mocha: ['jest', 'vitest', 'jasmine', 'ava', 'tap'],
};

type PackageJsonLike = Record<string, unknown>;

interface RuleResult {
  rule: 'dependency-boundary' | 'required-export' | 'file-ownership' | 'technology-compliance';
  checksPerformed: number;
  violations: ArchitectureViolation[];
}

const normalizePath = (value: string): string =>
  value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/').replace(/\/$/, '');

const normalizeIdentifier = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const isRelativeImport = (importPath: string): boolean => importPath.startsWith('./') || importPath.startsWith('../');

const removeExtension = (value: string): string => value.replace(/\.[a-z0-9]+$/i, '');

const getModuleForFile = (filePath: string, modules: ModuleDefinition[]): ModuleDefinition | null => {
  const normalizedFile = normalizePath(filePath);
  const sortedModules = [...modules].sort((a, b) => b.directory.length - a.directory.length);
  for (const module of sortedModules) {
    const moduleDir = normalizePath(module.directory);
    if (normalizedFile === moduleDir || normalizedFile.startsWith(`${moduleDir}/`)) {
      return module;
    }
  }
  return null;
};

const findRelevantConstraintSeverity = (
  constraints: ArchitectureConstraint[],
  types: ArchitectureConstraint['type'][],
  requiredTokens: string[]
): 'error' | 'warning' => {
  const sortedConstraints = [...constraints].sort((a, b) => a.id.localeCompare(b.id));
  for (const constraint of sortedConstraints) {
    if (!types.includes(constraint.type)) {
      continue;
    }
    const source = `${constraint.rule} ${constraint.description}`.toLowerCase();
    if (requiredTokens.every((token) => source.includes(token.toLowerCase()))) {
      return constraint.severity;
    }
  }
  return 'error';
};

const collectImports = (fileContent: string): string[] => {
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\w*\s{},]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bexport\s+(?:type\s+)?(?:\*\s+from|\{[\s\S]*?\}\s+from)\s+['"]([^'"]+)['"]/g,
  ];

  const imports: string[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match = pattern.exec(fileContent);
    while (match) {
      const captured = match[1]?.trim();
      if (captured) {
        imports.push(captured);
      }
      match = pattern.exec(fileContent);
    }
  }

  return imports.sort((a, b) => a.localeCompare(b));
};

const resolveImportPath = (sourceFile: string, importPath: string): string => {
  const normalizedImport = normalizePath(importPath);
  if (isRelativeImport(normalizedImport)) {
    const sourceDir = normalizePath(path.posix.dirname(normalizePath(sourceFile)));
    return normalizePath(path.posix.normalize(path.posix.join(sourceDir, normalizedImport)));
  }
  return normalizedImport;
};

const isAllowedCrossModuleImport = (resolvedImportPath: string, targetModule: ModuleDefinition): boolean => {
  const targetDirectory = normalizePath(targetModule.directory);
  const normalizedImport = normalizePath(removeExtension(resolvedImportPath));

  if (normalizedImport === targetDirectory || normalizedImport === `${targetDirectory}/index`) {
    return true;
  }
  if (!normalizedImport.startsWith(`${targetDirectory}/`)) {
    return false;
  }

  const remaining = normalizedImport.slice(targetDirectory.length + 1);
  if (remaining.length === 0) {
    return true;
  }

  const importTokens = remaining.split('/').map((segment) => normalizeIdentifier(segment));
  const exposedTokens = targetModule.exposedInterfaces.map((name) => normalizeIdentifier(name));
  return importTokens.some((token) => exposedTokens.includes(token));
};

const collectExportedNames = (fileContent: string): Set<string> => {
  const names = new Set<string>();

  const declarationPattern =
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  declarationPattern.lastIndex = 0;
  let declarationMatch = declarationPattern.exec(fileContent);
  while (declarationMatch) {
    const name = declarationMatch[1]?.trim();
    if (name) {
      names.add(name);
    }
    declarationMatch = declarationPattern.exec(fileContent);
  }

  const braceExportsPattern = /\bexport\s+(?:type\s+)?\{([^}]+)\}(?:\s+from\s+['"][^'"]+['"])?/g;
  braceExportsPattern.lastIndex = 0;
  let braceMatch = braceExportsPattern.exec(fileContent);
  while (braceMatch) {
    const raw = braceMatch[1] ?? '';
    const entries = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    for (const entry of entries) {
      const normalized = entry.replace(/^type\s+/, '').trim();
      const [left, right] = normalized.split(/\s+as\s+/i).map((part) => part.trim());
      if (left) {
        names.add(left);
      }
      if (right) {
        names.add(right);
      }
    }
    braceMatch = braceExportsPattern.exec(fileContent);
  }

  const defaultPattern = /\bexport\s+default\s+([A-Za-z_$][\w$]*)/g;
  defaultPattern.lastIndex = 0;
  let defaultMatch = defaultPattern.exec(fileContent);
  while (defaultMatch) {
    const name = defaultMatch[1]?.trim();
    if (name) {
      names.add(name);
    }
    defaultMatch = defaultPattern.exec(fileContent);
  }

  return names;
};

const collectPackageNames = (packageJson?: PackageJsonLike): string[] => {
  if (!packageJson) {
    return [];
  }

  const dependencies = packageJson.dependencies;
  const devDependencies = packageJson.devDependencies;

  const depKeys =
    dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies)
      ? Object.keys(dependencies as Record<string, unknown>)
      : [];
  const devDepKeys =
    devDependencies && typeof devDependencies === 'object' && !Array.isArray(devDependencies)
      ? Object.keys(devDependencies as Record<string, unknown>)
      : [];

  return [...new Set([...depKeys, ...devDepKeys])].sort((a, b) => a.localeCompare(b));
};

const containsForbiddenCue = (text: string): boolean =>
  /(forbid|forbidden|avoid|ban|banned|must\s+not|do\s+not|disallow|prohibit|prohibited)/i.test(text);

const toRuleBucket = (constraintId: string): string => {
  if (constraintId.startsWith('dep-boundary-')) {
    return 'dependency-boundary';
  }
  if (constraintId.startsWith('required-export-')) {
    return 'required-export';
  }
  if (constraintId.startsWith('file-ownership-')) {
    return 'file-ownership';
  }
  if (constraintId.startsWith('tech-compliance-')) {
    return 'technology-compliance';
  }
  return 'unknown';
};

export class ArchitectureEnforcer {
  constructor(private readonly telemetryHook?: TelemetryHook) {}

  validate(
    fileContents: Map<string, string>,
    plan: ArchitecturePlan,
    task: ImplementationTask,
    packageJson?: PackageJsonLike
  ): EnforcementReport {
    const dependencyBoundary = this.checkDependencyBoundaries(fileContents, plan);
    const requiredExports = this.checkRequiredExports(fileContents, plan);
    const fileOwnership = this.checkFileOwnership(fileContents, task);
    const technologyCompliance = this.checkTechnologyCompliance(plan.techStack, plan.constraints, packageJson);

    const allViolations = [
      ...dependencyBoundary.violations,
      ...requiredExports.violations,
      ...fileOwnership.violations,
      ...technologyCompliance.violations,
    ].sort((a, b) => {
      const byConstraint = a.constraintId.localeCompare(b.constraintId);
      if (byConstraint !== 0) {
        return byConstraint;
      }
      const byFile = a.file.localeCompare(b.file);
      if (byFile !== 0) {
        return byFile;
      }
      const byLine = (a.line ?? 0) - (b.line ?? 0);
      if (byLine !== 0) {
        return byLine;
      }
      return a.description.localeCompare(b.description);
    });

    const violated = allViolations.filter((violation) => violation.severity === 'error').length;
    const warnings = allViolations.filter((violation) => violation.severity === 'warning').length;
    const totalConstraints =
      dependencyBoundary.checksPerformed +
      requiredExports.checksPerformed +
      fileOwnership.checksPerformed +
      technologyCompliance.checksPerformed;
    const satisfied = Math.max(0, totalConstraints - violated - warnings);

    const status: EnforcementReport['status'] =
      violated > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass';

    const report = EnforcementReportSchema.parse({
      taskId: task.taskId,
      planId: plan.planId,
      timestamp: new Date().toISOString(),
      status,
      violations: allViolations,
      metrics: ComplianceMetricsSchema.parse({
        totalConstraints,
        satisfied,
        violated,
        warnings,
      }),
    });

    if (this.telemetryHook) {
      const violationsByRule: Record<string, number> = {
        'dependency-boundary': 0,
        'required-export': 0,
        'file-ownership': 0,
        'technology-compliance': 0,
      };

      for (const violation of allViolations) {
        const rule = toRuleBucket(violation.constraintId);
        violationsByRule[rule] = (violationsByRule[rule] ?? 0) + 1;
      }

      const event: EnforcementTelemetryEvent = {
        type: 'enforcement-completed',
        taskId: task.taskId,
        planId: plan.planId,
        timestamp: report.timestamp,
        status: report.status,
        metrics: report.metrics,
        violationsByRule,
      };
      this.telemetryHook(event);
    }

    return report;
  }

  private checkDependencyBoundaries(fileContents: Map<string, string>, plan: ArchitecturePlan): RuleResult {
    const violations: ArchitectureViolation[] = [];
    let checksPerformed = 0;

    const entries = [...fileContents.entries()].sort(([left], [right]) => left.localeCompare(right));
    for (const [filePath, content] of entries) {
      const sourceModule = getModuleForFile(filePath, plan.modules);
      if (!sourceModule) {
        continue;
      }

      const imports = collectImports(content);
      checksPerformed += imports.length;
      for (const importPath of imports) {
        const resolvedImport = resolveImportPath(filePath, importPath);
        const targetModule = getModuleForFile(resolvedImport, plan.modules);
        if (!targetModule || targetModule.name === sourceModule.name) {
          continue;
        }

        if (isAllowedCrossModuleImport(resolvedImport, targetModule)) {
          continue;
        }

        const severity = findRelevantConstraintSeverity(
          plan.constraints,
          ['dependency', 'boundary'],
          [sourceModule.name, targetModule.name]
        );

        violations.push(
          ArchitectureViolationSchema.parse({
            constraintId: `dep-boundary-${sourceModule.name}-${targetModule.name}`,
            severity,
            file: normalizePath(filePath),
            description: `Module '${sourceModule.name}' imports internal path '${importPath}' from module '${targetModule.name}'.`,
            suggestion: `Import from '${targetModule.directory}' root or one of its exposed interfaces: ${targetModule.exposedInterfaces.join(', ') || '(none)'}.`,
          })
        );
      }
    }

    return {
      rule: 'dependency-boundary',
      checksPerformed,
      violations: z.array(ArchitectureViolationSchema).parse(violations),
    };
  }

  private checkRequiredExports(fileContents: Map<string, string>, plan: ArchitecturePlan): RuleResult {
    const violations: ArchitectureViolation[] = [];
    const moduleFiles = new Map<string, Array<{ file: string; content: string }>>();

    const entries = [...fileContents.entries()].sort(([left], [right]) => left.localeCompare(right));
    for (const [filePath, content] of entries) {
      const module = getModuleForFile(filePath, plan.modules);
      if (!module) {
        continue;
      }
      const existing = moduleFiles.get(module.name) ?? [];
      existing.push({ file: normalizePath(filePath), content });
      moduleFiles.set(module.name, existing);
    }

    let checksPerformed = 0;
    const sortedModules = [...plan.modules].sort((a, b) => a.name.localeCompare(b.name));
    for (const module of sortedModules) {
      const files = moduleFiles.get(module.name);
      if (!files || files.length === 0) {
        continue;
      }

      const exportedNames = new Set<string>();
      for (const file of files.sort((a, b) => a.file.localeCompare(b.file))) {
        const names = collectExportedNames(file.content);
        for (const name of names) {
          exportedNames.add(name);
        }
      }

      const interfaces = [...module.exposedInterfaces].sort((a, b) => a.localeCompare(b));
      for (const exposedInterface of interfaces) {
        checksPerformed += 1;
        if (exportedNames.has(exposedInterface)) {
          continue;
        }
        violations.push(
          ArchitectureViolationSchema.parse({
            constraintId: `required-export-${module.name}-${exposedInterface}`,
            severity: 'warning',
            file: normalizePath(module.directory),
            description: `Exposed interface '${exposedInterface}' is not exported by module '${module.name}'.`,
            suggestion: `Export '${exposedInterface}' from a file under '${module.directory}' or re-export it from the module's public entrypoint.`,
          })
        );
      }
    }

    return {
      rule: 'required-export',
      checksPerformed,
      violations: z.array(ArchitectureViolationSchema).parse(violations),
    };
  }

  private checkFileOwnership(fileContents: Map<string, string>, task: ImplementationTask): RuleResult {
    const violations: ArchitectureViolation[] = [];
    const ownedFiles = new Set(task.ownedFiles.map((file) => normalizePath(file)));

    const files = [...fileContents.keys()].map((file) => normalizePath(file)).sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      if (ownedFiles.has(file)) {
        continue;
      }
      violations.push(
        ArchitectureViolationSchema.parse({
          constraintId: `file-ownership-${task.taskId}`,
          severity: 'error',
          file,
          description: `Task '${task.taskId}' modified file '${file}' outside its ownership boundary.`,
          suggestion: `Restrict changes to ownedFiles for task '${task.taskId}' or update decomposition ownership before editing this file.`,
        })
      );
    }

    return {
      rule: 'file-ownership',
      checksPerformed: files.length,
      violations: z.array(ArchitectureViolationSchema).parse(violations),
    };
  }

  private checkTechnologyCompliance(
    techStack: TechStackDecision,
    constraints: ArchitectureConstraint[],
    packageJson?: PackageJsonLike
  ): RuleResult {
    const packageNames = collectPackageNames(packageJson);
    if (!packageJson) {
      return {
        rule: 'technology-compliance',
        checksPerformed: 0,
        violations: [],
      };
    }

    const violations: ArchitectureViolation[] = [];
    const packageSet = new Set(packageNames);
    const violationIndexByPackage = new Map<string, number>();

    const addViolation = (packageName: string, severity: 'error' | 'warning', description: string): void => {
      const existingIndex = violationIndexByPackage.get(packageName);
      if (existingIndex !== undefined) {
        const existing = violations[existingIndex];
        if (!existing) {
          return;
        }
        if (existing.severity === 'warning' && severity === 'error') {
          violations[existingIndex] = ArchitectureViolationSchema.parse({
            ...existing,
            severity,
            description,
          });
        }
        return;
      }

      const parsedViolation = ArchitectureViolationSchema.parse({
        constraintId: `tech-compliance-${packageName}`,
        severity,
        file: 'package.json',
        description,
        suggestion: `Remove '${packageName}' or align architecture plan tech stack/constraints before proceeding.`,
      });

      const nextIndex = violations.length;
      violations.push(parsedViolation);
      violationIndexByPackage.set(packageName, nextIndex);
    };

    const checkAlternatives = (key: string, label: string): void => {
      const selected = key.toLowerCase();
      const alternatives = FRAMEWORK_ALTERNATIVES[selected] ?? [];
      for (const alternative of alternatives.sort((a, b) => a.localeCompare(b))) {
        if (!packageSet.has(alternative)) {
          continue;
        }
        addViolation(
          alternative,
          'warning',
          `Tech stack ${label} is '${key}', but competing package '${alternative}' is present in dependencies.`
        );
      }
    };

    checkAlternatives(techStack.framework, 'framework');
    checkAlternatives(techStack.testFramework, 'test framework');

    const technologyConstraints = [...constraints]
      .filter((constraint) => constraint.type === 'technology')
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const constraint of technologyConstraints) {
      const source = `${constraint.rule} ${constraint.description}`;
      if (!containsForbiddenCue(source)) {
        continue;
      }
      const lowerSource = source.toLowerCase();
      for (const packageName of packageNames) {
        if (!lowerSource.includes(packageName.toLowerCase())) {
          continue;
        }
        addViolation(
          packageName,
          constraint.severity,
          `Technology constraint '${constraint.id}' is violated by forbidden package '${packageName}'.`
        );
      }
    }

    return {
      rule: 'technology-compliance',
      checksPerformed: packageNames.length,
      violations: z.array(ArchitectureViolationSchema).parse(violations),
    };
  }

}
