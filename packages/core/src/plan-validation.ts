import {
  PlanDigestSchema,
  PlanQualityScoreSchema,
  type ArchitectureConstraint,
  type ArchitecturePlan,
  type ModuleDefinition,
  type PlanDigest,
  type PlanQualityScore,
} from './architecture-plan';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Deterministic Plan Validation ───────────────────────────────────────────

const emptyValidationResult = (): ValidationResult => ({
  valid: true,
  errors: [],
  warnings: [],
});

const mergeValidationResults = (results: ValidationResult[]): ValidationResult => {
  const errors = results.flatMap((result) => result.errors);
  const warnings = results.flatMap((result) => result.warnings);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};

const findCyclePath = (
  adjacency: Map<string, string[]>,
  candidateNodes: Set<string>
): string[] | null => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const pathStack: string[] = [];

  const dfs = (node: string): string[] | null => {
    visiting.add(node);
    pathStack.push(node);

    const neighbors = [...(adjacency.get(node) ?? [])].sort((a, b) => a.localeCompare(b));
    for (const neighbor of neighbors) {
      if (!candidateNodes.has(neighbor)) {
        continue;
      }

      if (visiting.has(neighbor)) {
        const cycleStartIndex = pathStack.indexOf(neighbor);
        if (cycleStartIndex >= 0) {
          const cyclePath = pathStack.slice(cycleStartIndex);
          cyclePath.push(neighbor);
          return cyclePath;
        }
      }

      if (!visited.has(neighbor)) {
        const nested = dfs(neighbor);
        if (nested) {
          return nested;
        }
      }
    }

    visiting.delete(node);
    visited.add(node);
    pathStack.pop();
    return null;
  };

  const sortedCandidates = [...candidateNodes].sort((a, b) => a.localeCompare(b));
  for (const node of sortedCandidates) {
    if (visited.has(node)) {
      continue;
    }
    const cycle = dfs(node);
    if (cycle) {
      return cycle;
    }
  }

  return null;
};

export function checkAcyclicDependencies(modules: ModuleDefinition[]): ValidationResult {
  const result = emptyValidationResult();
  if (modules.length === 0) {
    return result;
  }

  const moduleNames = new Set(modules.map((module) => module.name));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const module of modules) {
    adjacency.set(module.name, []);
    indegree.set(module.name, 0);
  }

  for (const module of modules) {
    for (const dependency of module.dependencies) {
      if (!moduleNames.has(dependency)) {
        result.errors.push(
          `Unknown dependency '${dependency}' referenced by module '${module.name}'.`
        );
        continue;
      }
      const edges = adjacency.get(module.name);
      if (!edges) {
        continue;
      }
      edges.push(dependency);
      indegree.set(dependency, (indegree.get(dependency) ?? 0) + 1);
    }
  }

  const queue = [...modules.map((module) => module.name)]
    .filter((name) => (indegree.get(name) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));

  let processedCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    processedCount += 1;
    const neighbors = [...(adjacency.get(current) ?? [])].sort((a, b) => a.localeCompare(b));
    for (const neighbor of neighbors) {
      const nextInDegree = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, nextInDegree);
      if (nextInDegree === 0) {
        queue.push(neighbor);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  if (processedCount < modules.length) {
    const cyclicNodes = new Set(
      [...indegree.entries()]
        .filter(([, degree]) => degree > 0)
        .map(([name]) => name)
        .sort((a, b) => a.localeCompare(b))
    );
    const cyclePath = findCyclePath(adjacency, cyclicNodes);
    if (cyclePath && cyclePath.length > 1) {
      result.errors.push(`Cycle detected: ${cyclePath.join(' → ')}`);
    } else {
      result.errors.push('Cycle detected in module dependencies.');
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

export function checkStoryCoverage(plan: ArchitecturePlan): ValidationResult {
  const result = emptyValidationResult();
  const mappedStories = new Set<string>();
  for (const module of plan.modules) {
    for (const storyId of module.owningStories) {
      mappedStories.add(storyId);
    }
  }

  for (const storyMapping of plan.storyModuleMapping) {
    if (!mappedStories.has(storyMapping.storyId)) {
      result.errors.push(
        `Story '${storyMapping.storyId}' is present in storyModuleMapping but not owned by any module.`
      );
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

export function checkModuleCoverage(plan: ArchitecturePlan): ValidationResult {
  const result = emptyValidationResult();
  for (const module of plan.modules) {
    if (module.owningStories.length === 0) {
      result.errors.push(`Module '${module.name}' has no owning stories.`);
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

export function checkInterfaceOwnership(plan: ArchitecturePlan): ValidationResult {
  const result = emptyValidationResult();
  const ownership = new Map<string, string[]>();

  for (const module of plan.modules) {
    for (const iface of module.exposedInterfaces) {
      const modulesForInterface = ownership.get(iface) ?? [];
      modulesForInterface.push(module.name);
      ownership.set(iface, modulesForInterface);
    }
  }

  for (const [iface, owners] of [...ownership.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (owners.length > 1) {
      result.errors.push(
        `Interface '${iface}' is exposed by multiple modules: ${owners.sort((a, b) => a.localeCompare(b)).join(', ')}.`
      );
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

export function validatePlan(plan: ArchitecturePlan): ValidationResult {
  return mergeValidationResults([
    checkAcyclicDependencies(plan.modules),
    checkStoryCoverage(plan),
    checkModuleCoverage(plan),
    checkInterfaceOwnership(plan),
  ]);
}

// ─── Plan Quality Score Computation ──────────────────────────────────────────

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'for',
  'is',
  'with',
  'that',
  'this',
  'it',
  'as',
  'on',
  'by',
  'at',
  'be',
  'from',
]);

const toWordSet = (value: string): Set<string> => {
  const normalized = value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const words = normalized
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
  return new Set(words);
};

const overlapRatio = (left: Set<string>, right: Set<string>): number => {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const word of left) {
    if (right.has(word)) {
      intersection += 1;
    }
  }
  return intersection / Math.min(left.size, right.size);
};

const includesTokenCaseInsensitive = (haystack: string, token: string): boolean =>
  haystack.toLowerCase().includes(token.toLowerCase());

const constraintMentionsAnyModule = (
  constraint: ArchitectureConstraint,
  moduleNames: string[]
): boolean => {
  const source = `${constraint.rule} ${constraint.description}`.toLowerCase();
  return moduleNames.some((moduleName) => source.includes(moduleName.toLowerCase()));
};

export function scorePlan(plan: ArchitecturePlan): PlanQualityScore {
  const findings: string[] = [];

  let overlapPairCount = 0;
  for (let i = 0; i < plan.modules.length; i += 1) {
    for (let j = i + 1; j < plan.modules.length; j += 1) {
      const left = plan.modules[i];
      const right = plan.modules[j];
      if (!left || !right) {
        continue;
      }
      const leftWords = toWordSet(left.responsibility);
      const rightWords = toWordSet(right.responsibility);
      const ratio = overlapRatio(leftWords, rightWords);
      if (ratio > 0.5) {
        overlapPairCount += 1;
        findings.push(
          `High responsibility overlap between modules '${left.name}' and '${right.name}': ${ratio.toFixed(2)}`
        );
      }
    }
  }
  const cohesion = Math.max(0, 100 - overlapPairCount * 15);

  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const module of plan.modules) {
    fanIn.set(module.name, 0);
    fanOut.set(module.name, module.dependencies.length);
  }
  const knownModules = new Set(plan.modules.map((module) => module.name));
  for (const module of plan.modules) {
    for (const dependency of module.dependencies) {
      if (!knownModules.has(dependency)) {
        continue;
      }
      fanIn.set(dependency, (fanIn.get(dependency) ?? 0) + 1);
    }
  }

  let dependencyPenalty = 0;
  for (const module of plan.modules) {
    const out = fanOut.get(module.name) ?? 0;
    const incoming = fanIn.get(module.name) ?? 0;
    if (out > 5) {
      dependencyPenalty += 10;
      findings.push(`Module '${module.name}' has fan-out of ${out} (threshold: 5).`);
    }
    if (incoming > 8) {
      dependencyPenalty += 5;
      findings.push(`Module '${module.name}' has fan-in of ${incoming} (threshold: 8).`);
    }
  }

  const acyclicResult = checkAcyclicDependencies(plan.modules);
  let dependencySanity = Math.max(0, 100 - dependencyPenalty);
  if (!acyclicResult.valid) {
    dependencySanity = 0;
    findings.push(...acyclicResult.errors);
  }

  const searchableText = [
    ...plan.constraints.map((constraint) => `${constraint.rule} ${constraint.description}`),
    ...plan.decisions.map(
      (decision) =>
        `${decision.title} ${decision.context} ${decision.decision} ${decision.consequences}`
    ),
  ].join(' ');

  let stackPenalty = 0;
  if (!includesTokenCaseInsensitive(searchableText, plan.techStack.language)) {
    stackPenalty += 20;
    findings.push(
      `Tech stack language token '${plan.techStack.language}' is missing from constraints/decisions.`
    );
  }
  if (!includesTokenCaseInsensitive(searchableText, plan.techStack.framework)) {
    stackPenalty += 15;
    findings.push(
      `Tech stack framework token '${plan.techStack.framework}' is missing from constraints/decisions.`
    );
  }
  if (!includesTokenCaseInsensitive(searchableText, plan.techStack.testFramework)) {
    stackPenalty += 10;
    findings.push(
      `Tech stack test framework token '${plan.techStack.testFramework}' is missing from constraints/decisions.`
    );
  }
  const stackConsistency = Math.max(0, 100 - stackPenalty);

  const overall = Math.round(0.4 * cohesion + 0.35 * dependencySanity + 0.25 * stackConsistency);
  const status: PlanQualityScore['status'] =
    overall >= 75 ? 'pass' : overall >= 60 ? 'review' : 'fail';

  return PlanQualityScoreSchema.parse({
    cohesion,
    dependencySanity,
    stackConsistency,
    overall,
    status,
    findings,
  });
}

// ─── Plan Digest Generation ──────────────────────────────────────────────────

const buildDigest = (
  plan: ArchitecturePlan,
  taskId: string,
  moduleName: string,
  includedModules: string[],
  constraints: ArchitectureConstraint[],
  maxChars: number,
  truncated: boolean
): PlanDigest => {
  const moduleLookup = new Map(plan.modules.map((module) => [module.name, module]));
  const exposedInterfaces = includedModules
    .map((name) => moduleLookup.get(name))
    .filter((module): module is ModuleDefinition => Boolean(module))
    .filter((module) => module.exposedInterfaces.length > 0)
    .map((module) => ({ module: module.name, names: [...module.exposedInterfaces] }))
    .sort((a, b) => a.module.localeCompare(b.module));

  return {
    digestId: `digest-${plan.planId}-${taskId}`,
    sourcePlanId: plan.planId,
    level: plan.level,
    taskId,
    module: moduleName,
    includedModules: [...includedModules].sort((a, b) => a.localeCompare(b)),
    constraints: [...constraints].sort((a, b) => a.id.localeCompare(b.id)),
    exposedInterfaces,
    maxChars,
    truncated,
  };
};

const serializedLength = (digest: PlanDigest): number => JSON.stringify(digest, null, 2).length;

export function generateDigest(
  plan: ArchitecturePlan,
  taskId: string,
  moduleName: string,
  maxChars = 24000
): PlanDigest {
  const normalizedMaxChars = Math.max(1, Math.floor(maxChars));
  const moduleLookup = new Map(plan.modules.map((module) => [module.name, module]));
  const taskModule = moduleLookup.get(moduleName);
  if (!taskModule) {
    throw new Error(`Task module not found in plan: ${moduleName}`);
  }

  const dependencyModules = taskModule.dependencies.filter((name) => moduleLookup.has(name));
  const includedModules = [...new Set([taskModule.name, ...dependencyModules])].sort((a, b) =>
    a.localeCompare(b)
  );

  const relevantConstraints = plan.constraints
    .filter(
      (constraint) =>
        constraint.type === 'technology' || constraintMentionsAnyModule(constraint, includedModules)
    )
    .sort((a, b) => a.id.localeCompare(b.id));

  let digest = buildDigest(
    plan,
    taskId,
    moduleName,
    includedModules,
    relevantConstraints,
    normalizedMaxChars,
    false
  );

  if (serializedLength(digest) <= normalizedMaxChars) {
    return PlanDigestSchema.parse(digest);
  }

  const taskModuleName = taskModule.name.toLowerCase();
  const dependencyModuleNames = dependencyModules.map((name) => name.toLowerCase());

  const mentionsTask = (constraint: ArchitectureConstraint): boolean =>
    constraintMentionsAnyModule(constraint, [taskModuleName]);
  const mentionsDependency = (constraint: ArchitectureConstraint): boolean =>
    constraintMentionsAnyModule(constraint, dependencyModuleNames);

  const tier1 = relevantConstraints.filter((constraint) => mentionsTask(constraint));
  const tier2 = relevantConstraints.filter(
    (constraint) => !mentionsTask(constraint) && constraint.type === 'technology'
  );
  const tier3 = relevantConstraints.filter(
    (constraint) =>
      !mentionsTask(constraint) && constraint.type !== 'technology' && mentionsDependency(constraint)
  );
  const tier4 = relevantConstraints.filter(
    (constraint) =>
      !mentionsTask(constraint) && constraint.type !== 'technology' && !mentionsDependency(constraint)
  );

  let selected = [...tier1].sort((a, b) => a.id.localeCompare(b.id));
  let current = buildDigest(
    plan,
    taskId,
    moduleName,
    includedModules,
    selected,
    normalizedMaxChars,
    true
  );

  const tryAddFromTier = (tier: ArchitectureConstraint[]): void => {
    for (const constraint of tier.sort((a, b) => a.id.localeCompare(b.id))) {
      const candidate = [...selected, constraint].sort((a, b) => a.id.localeCompare(b.id));
      const candidateDigest = buildDigest(
        plan,
        taskId,
        moduleName,
        includedModules,
        candidate,
        normalizedMaxChars,
        true
      );
      if (serializedLength(candidateDigest) <= normalizedMaxChars) {
        selected = candidate;
        current = candidateDigest;
      }
    }
  };

  tryAddFromTier(tier2);
  tryAddFromTier(tier3);
  tryAddFromTier(tier4);

  if (serializedLength(current) > normalizedMaxChars) {
    const fittingTaskConstraints: ArchitectureConstraint[] = [];
    for (const constraint of tier1.sort((a, b) => a.id.localeCompare(b.id))) {
      const candidate = [...fittingTaskConstraints, constraint];
      const candidateDigest = buildDigest(
        plan,
        taskId,
        moduleName,
        includedModules,
        candidate,
        normalizedMaxChars,
        true
      );
      if (serializedLength(candidateDigest) <= normalizedMaxChars) {
        fittingTaskConstraints.push(constraint);
      }
    }
    current = buildDigest(
      plan,
      taskId,
      moduleName,
      includedModules,
      fittingTaskConstraints,
      normalizedMaxChars,
      true
    );
  }

  return PlanDigestSchema.parse(current);
}
