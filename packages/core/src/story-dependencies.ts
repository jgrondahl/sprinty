import { type Story } from './types';

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

export function topologicalSortStories(stories: Story[]): Story[] {
  if (stories.length === 0) {
    return [];
  }

  const storyIds = new Set(stories.map((story) => story.id));
  const storyById = new Map(stories.map((story) => [story.id, story]));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const story of stories) {
    adjacency.set(story.id, []);
    indegree.set(story.id, 0);
  }

  for (const story of stories) {
    for (const dependency of story.dependsOn) {
      if (!storyIds.has(dependency)) {
        continue;
      }
      const dependents = adjacency.get(dependency);
      if (!dependents) {
        continue;
      }
      dependents.push(story.id);
      indegree.set(story.id, (indegree.get(story.id) ?? 0) + 1);
    }
  }

  const queue = [...stories.map((story) => story.id)]
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => a.localeCompare(b));

  const sortedStories: Story[] = [];
  let processedCount = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    processedCount += 1;
    const currentStory = storyById.get(current);
    if (currentStory) {
      sortedStories.push(currentStory);
    }

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

  if (processedCount < stories.length) {
    const cyclicNodes = new Set(
      [...indegree.entries()]
        .filter(([, degree]) => degree > 0)
        .map(([id]) => id)
        .sort((a, b) => a.localeCompare(b))
    );
    const cyclePath = findCyclePath(adjacency, cyclicNodes);
    if (cyclePath && cyclePath.length > 1) {
      throw new Error(`Cycle detected in story dependencies: ${cyclePath.join(' → ')}`);
    }
    throw new Error('Cycle detected in story dependencies.');
  }

  return sortedStories;
}

export function detectFileConflicts(
  stories: Story[],
  storyFiles: Map<string, string[]>
): Map<string, string[]> {
  const fileClaims = new Map<string, string[]>();

  for (const story of stories) {
    const files = storyFiles.get(story.id) ?? [];
    for (const filePath of files) {
      const existing = fileClaims.get(filePath) ?? [];
      existing.push(story.id);
      fileClaims.set(filePath, existing);
    }
  }

  const conflicts = new Map<string, string[]>();
  for (const [filePath, claimants] of fileClaims.entries()) {
    if (claimants.length > 1) {
      conflicts.set(filePath, claimants);
    }
  }

  return conflicts;
}
