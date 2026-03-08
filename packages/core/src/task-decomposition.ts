import * as os from 'os';
import { z } from 'zod';
import { type ArchitecturePlan, type ModuleDefinition } from './architecture-plan';
import type { ValidationResult } from './plan-validation';
import type { Story } from './types';

export const TaskInputSchema = z.object({
  fromTaskId: z.string().min(1),
  artifact: z.string().min(1),
});

export type TaskInput = z.infer<typeof TaskInputSchema>;

export const ImplementationTaskSchema = z.object({
  taskId: z.string().min(1),
  storyIds: z.array(z.string().min(1)).min(1),
  module: z.string().min(1),
  type: z.enum(['create', 'extend', 'integrate', 'test', 'configure']),
  description: z.string(),
  targetFiles: z.array(z.string().min(1)),
  ownedFiles: z.array(z.string().min(1)),
  dependencies: z.array(z.string().min(1)),
  inputs: z.array(TaskInputSchema),
  expectedOutputs: z.array(z.string().min(1)),
  acceptanceCriteria: z.array(z.string()),
});

export type ImplementationTask = z.infer<typeof ImplementationTaskSchema>;

export const IntegrationTaskSchema = z.object({
  taskId: z.string().min(1),
  type: z.enum(['bootstrap', 'routing', 'di-container', 'migration', 'config']),
  description: z.string().min(1),
  targetFiles: z.array(z.string().min(1)),
  dependsOnTasks: z.array(z.string().min(1)),
});

export type IntegrationTask = z.infer<typeof IntegrationTaskSchema>;

export const TaskGroupSchema = z.object({
  groupId: z.number().int().positive(),
  taskIds: z.array(z.string().min(1)),
  dependsOn: z.array(z.number().int()),
});

export type TaskGroup = z.infer<typeof TaskGroupSchema>;

export const TaskScheduleSchema = z.object({
  groups: z.array(TaskGroupSchema),
});

export type TaskSchedule = z.infer<typeof TaskScheduleSchema>;

export const IntegrationPhaseSchema = z.object({
  phaseId: z.string().min(1),
  tasks: z.array(IntegrationTaskSchema),
  dependsOnTaskGroups: z.array(z.number().int()),
  bootValidationCommand: z.string().min(1).optional(),
});

export type IntegrationPhase = z.infer<typeof IntegrationPhaseSchema>;

export const SprintTaskPlanSchema = z.object({
  sprintId: z.string().min(1),
  planId: z.string().min(1),
  parentGlobalPlanId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  tasks: z.array(ImplementationTaskSchema),
  schedule: TaskScheduleSchema,
  integrationTasks: z.array(IntegrationTaskSchema),
  integrationPhase: IntegrationPhaseSchema.optional(),
});

export type SprintTaskPlan = z.infer<typeof SprintTaskPlanSchema>;

export const DecompositionGuardrailsSchema = z.object({
  maxTasksPerStory: z.number().int().positive().default(5),
  maxTasksPerSprint: z.number().int().positive().default(50),
  maxParallelTasks: z.number().int().positive().default(Math.max(1, os.cpus().length)),
  maxRevisionsPerSprint: z.number().int().positive().default(1),
  maxRevisionsPerStory: z.number().int().positive().default(1),
});

export type DecompositionGuardrails = z.infer<typeof DecompositionGuardrailsSchema>;

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

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const normalizeSprintId = (plan: ArchitecturePlan): string => {
  if (plan.sprintId) {
    return plan.sprintId;
  }
  if (plan.scopeKey.startsWith('sprint:')) {
    return plan.scopeKey.slice('sprint:'.length);
  }
  return plan.scopeKey;
};

const parentGlobalPlanIdFor = (plan: ArchitecturePlan): string => {
  if (plan.level === 'global') {
    return plan.planId;
  }
  return plan.parentPlanId ?? plan.planId;
};

const collectAcceptanceCriteria = (story: Story, moduleName: string, interfaceName: string): string[] => {
  const moduleToken = moduleName.toLowerCase();
  const interfaceToken = interfaceName.toLowerCase();
  return story.acceptanceCriteria.filter((criterion) => {
    const source = criterion.toLowerCase();
    return source.includes(moduleToken) || source.includes(interfaceToken);
  });
};

const hasFileOverlap = (left: string[], right: string[]): boolean => {
  const leftSet = new Set(left);
  for (const file of right) {
    if (leftSet.has(file)) {
      return true;
    }
  }
  return false;
};

const shouldMergeTasks = (left: ImplementationTask, right: ImplementationTask): boolean => {
  if (left.module !== right.module) {
    return false;
  }
  if (hasFileOverlap(left.targetFiles, right.targetFiles)) {
    return true;
  }
  return left.dependencies.includes(right.taskId) || right.dependencies.includes(left.taskId);
};

const mergeTwoTasks = (left: ImplementationTask, right: ImplementationTask): ImplementationTask => {
  const mergedDependencies = uniqueSorted(
    [...left.dependencies, ...right.dependencies].filter(
      (taskId) => taskId !== left.taskId && taskId !== right.taskId
    )
  );
  return {
    taskId: left.taskId,
    storyIds: uniqueSorted([...left.storyIds, ...right.storyIds]),
    module: left.module,
    type: left.type,
    description: left.description || right.description,
    targetFiles: uniqueSorted([...left.targetFiles, ...right.targetFiles]),
    ownedFiles: uniqueSorted([...left.ownedFiles, ...right.ownedFiles]),
    dependencies: mergedDependencies,
    inputs: [...left.inputs, ...right.inputs].sort((a, b) => {
      const byTask = a.fromTaskId.localeCompare(b.fromTaskId);
      if (byTask !== 0) {
        return byTask;
      }
      return a.artifact.localeCompare(b.artifact);
    }),
    expectedOutputs: uniqueSorted([...left.expectedOutputs, ...right.expectedOutputs]),
    acceptanceCriteria: uniqueSorted([...left.acceptanceCriteria, ...right.acceptanceCriteria]),
  };
};

const enforceStoryTaskLimit = (
  storyId: string,
  tasks: ImplementationTask[],
  limit: number
): ImplementationTask[] => {
  let storyTasks = tasks.filter((task) => task.storyIds.includes(storyId));
  let mergedTasks = [...tasks];

  while (storyTasks.length > limit) {
    const sorted = [...storyTasks].sort((a, b) => a.taskId.localeCompare(b.taskId));
    let merged = false;

    for (let i = 0; i < sorted.length && !merged; i += 1) {
      const left = sorted[i];
      if (!left) {
        continue;
      }
      for (let j = i + 1; j < sorted.length; j += 1) {
        const right = sorted[j];
        if (!right || !shouldMergeTasks(left, right)) {
          continue;
        }

        const replacement = mergeTwoTasks(left, right);
        mergedTasks = mergedTasks
          .filter((task) => task.taskId !== left.taskId && task.taskId !== right.taskId)
          .map((task) => ({
            ...task,
            dependencies: uniqueSorted(
              task.dependencies.map((dependency) => {
                if (dependency === left.taskId || dependency === right.taskId) {
                  return replacement.taskId;
                }
                return dependency;
              })
            ).filter((dependency) => dependency !== task.taskId),
            inputs: task.inputs
              .map((input) => ({
                ...input,
                fromTaskId:
                  input.fromTaskId === left.taskId || input.fromTaskId === right.taskId
                    ? replacement.taskId
                    : input.fromTaskId,
              }))
              .sort((a, b) => {
                const byTask = a.fromTaskId.localeCompare(b.fromTaskId);
                if (byTask !== 0) {
                  return byTask;
                }
                return a.artifact.localeCompare(b.artifact);
              }),
          }));

        mergedTasks.push(replacement);
        merged = true;
        break;
      }
    }

    if (!merged) {
      throw new Error(
        `Story '${storyId}' exceeds maxTasksPerStory (${limit}) and cannot be safely merged. Human review required.`
      );
    }

    storyTasks = mergedTasks.filter((task) => task.storyIds.includes(storyId));
  }

  return mergedTasks.sort((a, b) => a.taskId.localeCompare(b.taskId));
};

export class TaskDecomposer {
  private readonly guardrails: DecompositionGuardrails;

  constructor(guardrails?: Partial<DecompositionGuardrails>) {
    this.guardrails = DecompositionGuardrailsSchema.parse(guardrails ?? {});
  }

  decompose(plan: ArchitecturePlan, stories: Story[]): SprintTaskPlan {
    const moduleByName = new Map<string, ModuleDefinition>(plan.modules.map((module) => [module.name, module]));
    const storyById = new Map<string, Story>(stories.map((story) => [story.id, story]));

    const taskDrafts: ImplementationTask[] = [];
    let counter = 1;

    const sortedMappings = [...plan.storyModuleMapping].sort((a, b) => a.storyId.localeCompare(b.storyId));

    for (const mapping of sortedMappings) {
      const story = storyById.get(mapping.storyId);
      if (!story) {
        continue;
      }

      for (const moduleName of mapping.modules) {
        const module = moduleByName.get(moduleName);
        if (!module) {
          continue;
        }

        const sortedInterfaces = [...module.exposedInterfaces].sort((a, b) => a.localeCompare(b));
        for (const interfaceName of sortedInterfaces) {
          const interfaceSlug = slugify(interfaceName);
          const taskId = slugify(`task-${module.name}-${interfaceName}-${counter}`);
          counter += 1;
          const targetFile = `${module.directory}/${interfaceSlug}.ts`;

          taskDrafts.push({
            taskId,
            storyIds: [story.id],
            module: module.name,
            type: 'create',
            description: '',
            targetFiles: [targetFile],
            ownedFiles: [targetFile],
            dependencies: [],
            inputs: [],
            expectedOutputs: [targetFile],
            acceptanceCriteria: collectAcceptanceCriteria(story, module.name, interfaceName),
          });
        }
      }
    }

    const taskIdsByStoryModule = new Map<string, string[]>();
    for (const task of taskDrafts) {
      for (const storyId of task.storyIds) {
        const key = `${storyId}::${task.module}`;
        const existing = taskIdsByStoryModule.get(key) ?? [];
        existing.push(task.taskId);
        taskIdsByStoryModule.set(key, existing);
      }
    }

    let tasks: ImplementationTask[] = taskDrafts
      .map((task) => {
        const storyId = task.storyIds[0];
        const module = moduleByName.get(task.module);
        if (!storyId || !module) {
          return task;
        }

        const dependencyTaskIds = uniqueSorted(
          module.dependencies.flatMap((dependencyModuleName) => {
            const sameStory = taskIdsByStoryModule.get(`${storyId}::${dependencyModuleName}`) ?? [];
            if (sameStory.length > 0) {
              return sameStory;
            }
            return [...taskIdsByStoryModule.entries()]
              .filter(([key]) => key.endsWith(`::${dependencyModuleName}`))
              .flatMap(([, ids]) => ids);
          })
        );

        const inputArtifacts = dependencyTaskIds.map((dependencyTaskId) => {
          const dependencyTask = taskDrafts.find((candidate) => candidate.taskId === dependencyTaskId);
          const artifact = dependencyTask?.expectedOutputs[0] ?? `${dependencyTaskId}:output`;
          return {
            fromTaskId: dependencyTaskId,
            artifact,
          };
        });

        return {
          ...task,
          dependencies: dependencyTaskIds,
          inputs: inputArtifacts,
        };
      })
      .sort((a, b) => a.taskId.localeCompare(b.taskId));

    for (const storyId of [...new Set(tasks.flatMap((task) => task.storyIds))].sort((a, b) => a.localeCompare(b))) {
      tasks = enforceStoryTaskLimit(storyId, tasks, this.guardrails.maxTasksPerStory);
    }

    if (tasks.length > this.guardrails.maxTasksPerSprint) {
      throw new Error(
        `Sprint exceeds maxTasksPerSprint (${this.guardrails.maxTasksPerSprint}): produced ${tasks.length} tasks. Human review required.`
      );
    }

    const scheduleGroups = plan.executionOrder
      .map((executionGroup) => {
        const taskIds = tasks
          .filter((task) => task.storyIds.some((storyId) => executionGroup.storyIds.includes(storyId)))
          .map((task) => task.taskId)
          .sort((a, b) => a.localeCompare(b));

        return {
          groupId: executionGroup.groupId,
          taskIds,
          dependsOn: [...executionGroup.dependsOn].sort((a, b) => a - b),
        };
      })
      .sort((a, b) => a.groupId - b.groupId);

    for (const group of scheduleGroups) {
      const collisionResult = validateNoFileCollisions(group, tasks);
      if (!collisionResult.valid) {
        throw new Error(`File collision detected in task group ${group.groupId}: ${collisionResult.errors.join(' ')}`);
      }
    }

    const integrationTasks = plan.modules
      .filter((module) => module.dependencies.length > 0)
      .map((module) => {
        const moduleTaskIds = tasks
          .filter((task) => task.module === module.name)
          .map((task) => task.taskId)
          .sort((a, b) => a.localeCompare(b));

        return {
          taskId: `integration-${slugify(module.name)}-routing`,
          type: 'routing' as const,
          description: `Integrate routing and wiring for module '${module.name}'.`,
          targetFiles: [`${module.directory}/integration-routing.ts`],
          dependsOnTasks: moduleTaskIds,
        };
      })
      .sort((a, b) => a.taskId.localeCompare(b.taskId));

    const sprintId = normalizeSprintId(plan);
    const sprintTaskPlan: SprintTaskPlan = {
      sprintId,
      planId: plan.planId,
      parentGlobalPlanId: parentGlobalPlanIdFor(plan),
      schemaVersion: 1,
      tasks,
      schedule: {
        groups: scheduleGroups,
      },
      integrationTasks,
      integrationPhase: {
        phaseId: `integration-${sprintId}`,
        tasks: integrationTasks,
        dependsOnTaskGroups: scheduleGroups.map((group) => group.groupId).sort((a, b) => a - b),
      },
    };

    return SprintTaskPlanSchema.parse(sprintTaskPlan);
  }
}

export function validateNoFileCollisions(
  group: TaskGroup,
  tasks: ImplementationTask[]
): ValidationResult {
  const result = emptyValidationResult();
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));
  const ownerByFile = new Map<string, string>();

  const groupTaskIds = [...group.taskIds].sort((a, b) => a.localeCompare(b));
  for (const taskId of groupTaskIds) {
    const task = tasksById.get(taskId);
    if (!task) {
      continue;
    }
    for (const file of task.ownedFiles) {
      const previousOwner = ownerByFile.get(file);
      if (previousOwner && previousOwner !== task.taskId) {
        result.errors.push(
          `Task group ${group.groupId} has owned file collision on '${file}' between tasks '${previousOwner}' and '${task.taskId}'.`
        );
      } else {
        ownerByFile.set(file, task.taskId);
      }
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

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

export function validateTaskDependencies(plan: SprintTaskPlan): ValidationResult {
  const result = emptyValidationResult();
  const taskIds = new Set(plan.tasks.map((task) => task.taskId));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const task of plan.tasks) {
    adjacency.set(task.taskId, []);
    indegree.set(task.taskId, 0);
  }

  for (const task of plan.tasks) {
    for (const dependency of task.dependencies) {
      if (!taskIds.has(dependency)) {
        result.errors.push(
          `Task '${task.taskId}' depends on unknown taskId '${dependency}'.`
        );
        continue;
      }

      const edges = adjacency.get(task.taskId);
      if (!edges) {
        continue;
      }

      edges.push(dependency);
      indegree.set(dependency, (indegree.get(dependency) ?? 0) + 1);
    }
  }

  const queue = [...taskIds]
    .filter((taskId) => (indegree.get(taskId) ?? 0) === 0)
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

  if (processedCount < taskIds.size) {
    const cyclicNodes = new Set(
      [...indegree.entries()]
        .filter(([, degree]) => degree > 0)
        .map(([taskId]) => taskId)
        .sort((a, b) => a.localeCompare(b))
    );
    const cyclePath = findCyclePath(adjacency, cyclicNodes);
    if (cyclePath && cyclePath.length > 1) {
      result.errors.push(`Cycle detected in task dependencies: ${cyclePath.join(' → ')}`);
    } else {
      result.errors.push('Cycle detected in task dependencies.');
    }
  }

  result.valid = result.errors.length === 0;
  return result;
}

export function validateDecomposition(plan: SprintTaskPlan): ValidationResult {
  const collisionResults = plan.schedule.groups.map((group) => validateNoFileCollisions(group, plan.tasks));
  const dependencyResult = validateTaskDependencies(plan);
  return mergeValidationResults([...collisionResults, dependencyResult]);
}
