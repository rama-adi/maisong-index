import { Job } from "bullmq";
import { Effect } from "effect";
import { LockService } from "@/services/lock";
import type { QueueMiddleware, MiddlewareResult } from "./base";

export class WithoutOverlapping implements QueueMiddleware {
  private _releaseAfter: number | false = false; // Default: discard overlapping jobs
  private _expireAfter: number = 60 * 60; // Default lock expiry of 1 hour
  private _isShared = false;

  constructor(private readonly keySuffix: string) {}

  /**
   * The number of seconds to wait before re-attempting the job.
   * By default, overlapping jobs are discarded. Use this method to delay them instead.
   */
  releaseAfter(seconds: number): this {
    this._releaseAfter = seconds;
    return this;
  }

  /**
   * Do not release the job back to the queue if it is overlapping.
   * This is the default behavior - overlapping jobs are discarded.
   */
  dontRelease(): this {
    this._releaseAfter = false;
    return this;
  }

  /**
   * The number of seconds after which the lock will expire.
   */
  expireAfter(seconds: number): this {
    this._expireAfter = seconds;
    return this;
  }

  /**
   * Allow the lock to be shared across different job classes.
   */
  shared(): this {
    this._isShared = true;
    return this;
  }

  get key(): string {
    // Prefix to make it easy to identify in logs and error messages
    const base = this._isShared ? this.keySuffix : `${this.keySuffix}`;
    return `without-overlapping:${base}`;
  }

  private getLockKey(job: Job): string {
    return this._isShared
      ? `lock:${this.keySuffix}`
      : `lock:${job.name}:${this.keySuffix}`;
  }

  handle(job: Job): Effect.Effect<MiddlewareResult, Error, LockService> {
    const lockKey = this.getLockKey(job);

    return Effect.flatMap(LockService, (lockService) =>
      lockService.acquire(lockKey, { expiry: this._expireAfter }).pipe(
        Effect.map((acquired) => {
          if (acquired) {
            return true; // Proceed
          }
          return this._releaseAfter; // Release with delay, or `false` to discard
        }),
        Effect.catchAll(() => Effect.succeed(this._releaseAfter))
      )
    );
  }

  release(job: Job): Effect.Effect<void, Error, LockService> {
    const lockKey = this.getLockKey(job);
    return Effect.flatMap(LockService, (lockService) =>
      lockService.release(lockKey).pipe(Effect.catchAll(() => Effect.void))
    );
  }
}
