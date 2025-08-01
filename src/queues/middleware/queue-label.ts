import { Job } from "bullmq";
import { Effect } from "effect";
import { type QueueMiddleware, type MiddlewareResult, addQueueMetadata } from "./base";

/**
 * Middleware that attaches a label to the job data. This label can later be
 * displayed by the dashboard.
 */
export class QueueLabel implements QueueMiddleware {
  constructor(private readonly label: string) {}

  get key(): string {
    return `queue-label:${this.label}`;
  }

  handle(job: Job): Effect.Effect<MiddlewareResult, never> {
    return Effect.sync(() => {
      addQueueMetadata(job, "label", this.label)
      return true
    })
  }
}

