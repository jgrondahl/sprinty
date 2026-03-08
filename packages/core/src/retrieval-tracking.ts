import { z } from 'zod';

export const RetrievalAttemptSchema = z.object({
  storyId: z.string(),
  projectId: z.string(),
  requestedFiles: z.array(z.string()),
  retrievedFiles: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type RetrievalAttempt = z.infer<typeof RetrievalAttemptSchema>;

export const RetrievalMetricsSchema = z.object({
  storyId: z.string(),
  projectId: z.string(),
  totalAttempts: z.number().int().min(0),
  totalRequested: z.number().int().min(0),
  totalRetrieved: z.number().int().min(0),
  retrievalRate: z.number().min(0).max(1),
  missedFiles: z.array(z.string()),
});
export type RetrievalMetrics = z.infer<typeof RetrievalMetricsSchema>;

export class RetrievalTracker {
  private readonly attempts: RetrievalAttempt[] = [];

  record(attempt: RetrievalAttempt): void {
    const validated = RetrievalAttemptSchema.parse(attempt);
    this.attempts.push(validated);
  }

  getAttempts(storyId?: string): RetrievalAttempt[] {
    if (!storyId) {
      return [...this.attempts];
    }

    return this.attempts.filter((attempt) => attempt.storyId === storyId);
  }

  computeMetrics(storyId: string, projectId: string): RetrievalMetrics {
    const filteredAttempts = this.attempts.filter((attempt) => {
      if (attempt.storyId !== storyId) {
        return false;
      }

      if (projectId === '') {
        return true;
      }

      return attempt.projectId === projectId;
    });

    const totalAttempts = filteredAttempts.length;
    const totalRequested = filteredAttempts.reduce(
      (sum, attempt) => sum + attempt.requestedFiles.length,
      0
    );
    const totalRetrieved = filteredAttempts.reduce(
      (sum, attempt) => sum + attempt.retrievedFiles.length,
      0
    );
    const retrievalRate = totalRequested === 0 ? 1 : Math.min(1, totalRetrieved / totalRequested);

    const requestedFileSet = new Set<string>();
    const retrievedFileSet = new Set<string>();

    for (const attempt of filteredAttempts) {
      for (const file of attempt.requestedFiles) {
        requestedFileSet.add(file);
      }
      for (const file of attempt.retrievedFiles) {
        retrievedFileSet.add(file);
      }
    }

    const missedFiles = [...requestedFileSet].filter((file) => !retrievedFileSet.has(file));

    return RetrievalMetricsSchema.parse({
      storyId,
      projectId,
      totalAttempts,
      totalRequested,
      totalRetrieved,
      retrievalRate,
      missedFiles,
    });
  }

  computeMissedFiles(storyId: string): string[] {
    return this.computeMetrics(storyId, '').missedFiles;
  }

  clear(): void {
    this.attempts.length = 0;
  }
}
