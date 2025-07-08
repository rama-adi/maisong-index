import { Job } from "bullmq";
import { Effect } from "effect";
import { LockService } from "@/services/lock";
import type { QueueMiddleware, MiddlewareResult } from "./base";

export class RateLimited implements QueueMiddleware {
  constructor(
    private readonly limit: number,
    private readonly window: number // in seconds
  ) {}

  get key(): string {
    return `rate-limited:${this.limit}:${this.window}`;
  }

  handle(job: Job): Effect.Effect<MiddlewareResult, Error, LockService> {
    const lockKey = `rate-limit:${job.name}:${this.key}`;

    return Effect.flatMap(LockService, (lockService) =>
      lockService.acquire(lockKey, { expiry: this.window, limit: this.limit }).pipe(
        Effect.map((acquired) => {
          if (acquired) {
            return true; // Proceed
          }
          return this.window; // Release for `window` seconds
        }),
        Effect.catchAll(() => Effect.succeed(this.window)) // On error, release job
      )
    );
  }
}