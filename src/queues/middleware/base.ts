import { Job } from "bullmq";
import { Effect } from "effect";
import { LockService } from "@/services/lock";

/**
 * Defines the result of a middleware check.
 *  - `true`: The middleware check passed, and the next middleware (or job handler) can run.
 *  - `false`: The middleware check failed, and the job should be aborted and not retried.
 *  - `number`: The middleware check failed, but the job should be released back to the queue
 *              and retried after a delay (in seconds).
 */
export type MiddlewareResult = boolean | number;

/**
 * The interface for all queue middleware.
 */
export interface QueueMiddleware {
  /**
   * The middleware logic.
   * This method is called before the job handler is executed.
   */
  handle(job: Job): Effect.Effect<MiddlewareResult, Error, LockService>;

  /**
   * A unique key for the middleware.
   * This is used to identify the middleware in logs and other contexts.
   */
  get key(): string;
}


export type MetadataValue = string | string[] | number | boolean;

export function addQueueMetadata(job: Job, key: string, value: MetadataValue) {
  const data = job.data as any;
  
  // Create a copy of the current data to avoid modifying the original
  const updatedData = { ...data };
  
  updatedData.__metadata = updatedData.__metadata || {};
  
  if (Array.isArray(value)) {
    // Append mode with deduplication for arrays
    const existing = Array.isArray(updatedData.__metadata[key]) ? updatedData.__metadata[key] : [];
    const combined = [...existing, ...value];
    updatedData.__metadata[key] = [...new Set(combined)]; // Deduplicate
  } else {
    updatedData.__metadata[key] = value;
  }
  
  job.updateData(updatedData);
}

/**
 * Returns true if the job's stored middleware metadata contains at least one
 * middleware key that satisfies the predicate.
 */
export function hasMiddleware(job: Job, predicate: (key: string) => boolean): boolean {
  const keys: unknown = (job.data as any)?.__metadata?.middleware;
  if (!Array.isArray(keys)) return false;
  return keys.some((k) => typeof k === 'string' && predicate(k));
}