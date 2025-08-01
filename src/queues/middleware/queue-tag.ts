import { Job } from "bullmq";
import { Effect } from "effect";
import { type QueueMiddleware, type MiddlewareResult, addQueueMetadata } from "./base";

/**
 * Middleware that appends tags to the job data so that the dashboard can
 * display or filter by them.
 */
export class QueueTag implements QueueMiddleware {
  constructor(private readonly tags: string | string[]) {}

  get key(): string {
    const repr = Array.isArray(this.tags) ? this.tags.join(',') : this.tags;
    return `queue-tag:${repr}`;
  }

  handle(job: Job): Effect.Effect<MiddlewareResult, never> {
    return Effect.sync(() => {
      const data = job.data as any;
      addQueueMetadata(job, "tags", this.tags)
      return true;
    })
  }
}
