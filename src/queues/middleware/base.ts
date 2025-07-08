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
