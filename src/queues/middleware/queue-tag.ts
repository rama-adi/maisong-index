import { Job } from "bullmq";
import { Effect } from "effect";
import type { QueueMiddleware, MiddlewareResult } from "./base";

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
      const tags = Array.isArray(this.tags) ? this.tags : [this.tags];
      data.__tags = Array.isArray(data.__tags) ? data.__tags : [];
      for (const t of tags) {
        if (!data.__tags.includes(t)) {
          data.__tags.push(t);
        }
      }
      return true;
    })
  }
}
