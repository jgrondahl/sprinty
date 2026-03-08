import { z } from 'zod';

export const RETRIEVAL_FAILURE_THRESHOLD_DEFAULT = 0.15;

export const RetrievalAttemptSchema = z.object({
  storyId: z.string(),
  projectId: z.string(),
  requestedFiles: z.array(z.string()),
  retrievedFiles: z.array(z.string()),
  timestamp: z.string().datetime(),
});
export type RetrievalAttempt = z.infer<typeof RetrievalAttemptSchema>;

export const EscalationRecommendationSchema = z.object({
  projectId: z.string(),
  failureRate: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  totalAttempts: z.number().int().min(0),
  missedFileFrequency: z.array(z.object({ file: z.string(), count: z.number().int().min(1) })),
  message: z.string(),
});
export type EscalationRecommendation = z.infer<typeof EscalationRecommendationSchema>;

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

  detectContextGap(
    projectId: string,
    threshold: number = RETRIEVAL_FAILURE_THRESHOLD_DEFAULT
  ): EscalationRecommendation | null {
    const projectAttempts = this.attempts.filter((a) => a.projectId === projectId);
    const totalAttempts = projectAttempts.length;

    if (totalAttempts === 0) {
      return null;
    }

    let failedAttempts = 0;
    const missedFileCount = new Map<string, number>();

    for (const attempt of projectAttempts) {
      const retrievedSet = new Set(attempt.retrievedFiles);
      const missed = attempt.requestedFiles.filter((f) => !retrievedSet.has(f));
      if (missed.length > 0) {
        failedAttempts++;
        for (const file of missed) {
          missedFileCount.set(file, (missedFileCount.get(file) ?? 0) + 1);
        }
      }
    }

    const failureRate = failedAttempts / totalAttempts;

    if (failureRate <= threshold) {
      return null;
    }

    const missedFileFrequency = [...missedFileCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([file, count]) => ({ file, count }));

    const topMissed = missedFileFrequency
      .slice(0, 3)
      .map(({ file, count }) => `${file} (${count}x)`)
      .join(', ');

    const pct = Math.round(failureRate * 100);
    const thresholdPct = Math.round(threshold * 100);

    const message =
      `\u26a0 Retrieval failure rate: ${pct}% (threshold: ${thresholdPct}%)\n` +
      `  - ${failedAttempts}/${totalAttempts} retrieval attempts failed to locate needed files\n` +
      (topMissed ? `  - Most missed: ${topMissed}\n` : '') +
      `\n  Recommendation: Enable hybrid retrieval with semantic embeddings.\n` +
      `  Run: splinty config set retrieval.mode hybrid`;

    return EscalationRecommendationSchema.parse({
      projectId,
      failureRate,
      threshold,
      totalAttempts,
      missedFileFrequency,
      message,
    });
  }

  clear(): void {
    this.attempts.length = 0;
  }
}
