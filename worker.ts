import { Worker, Job, DelayedError } from "bullmq";
import { loadQueues } from "@/services/queue-registry";
import { BaseQueue } from "@/queues/base-queue";
import { Effect, Layer, Data, pipe, ManagedRuntime } from "effect";
import type { QueueMiddleware } from "@/queues/middleware/base";
import { WithoutOverlapping } from "@/queues/middleware/without-overlapping";
import { RedisLockLive, LockService, RedisTag } from "@/services/lock";
import { Redis } from "ioredis";

// --- Custom Error Types ---
class UnhandledJobError extends Data.TaggedError("UnhandledJobError")<{ jobName: string }> { }
class JobValidationError extends Data.TaggedError("JobValidationError")<{ jobName: string; cause: unknown }> { }
class JobExecutionError extends Data.TaggedError("JobExecutionError")<{ jobName: string; cause: unknown }> { }
class MiddlewareError extends Data.TaggedError("MiddlewareError")<{ jobName: string; middleware: string; cause: unknown }> { }
class JobReleased extends Data.TaggedError("JobReleased")<{ jobName: string; delay: number }> { }
class JobDiscarded extends Data.TaggedError("JobDiscarded")<{ jobName: string; cause: string }> { }

/**
 * Runs the middleware chain for a job.
 */
function runMiddleware(job: Job, middleware: QueueMiddleware[]): Effect.Effect<void, MiddlewareError | JobReleased | JobDiscarded, LockService> {
  return Effect.all(
    middleware.map((mw) =>
      pipe(
        mw.handle(job),
        Effect.mapError((cause) => new MiddlewareError({ jobName: job.name, middleware: mw.key, cause })),
        Effect.flatMap((result): Effect.Effect<void, JobReleased | JobDiscarded, never> => {
          if (typeof result === "number") {
            return Effect.fail(new JobReleased({ jobName: job.name, delay: result }));
          }
          if (result === false) {
            return Effect.fail(new JobDiscarded({ jobName: job.name, cause: `Middleware ${mw.key} returned false` }));
          }
          return Effect.void;
        })
      )
    )
  ).pipe(Effect.asVoid);
}

/**
 * Creates an Effect-based job processor.
 */
function makeJobProcessor(registry: Record<string, typeof BaseQueue<any>>) {
  return (job: Job) =>
    Effect.gen(function* () {
      const QueueClass = registry[job.name];

      if (!QueueClass) {
        return yield* Effect.fail(new UnhandledJobError({ jobName: job.name }))
      }

      
      const data = yield* Effect.try({
        try: () => QueueClass.validate(job.data),
        catch: (cause) => new JobValidationError({ jobName: job.name, cause }),
      });

      const middleware = QueueClass.middleware(data);
      yield* runMiddleware(job, middleware);

      const result = QueueClass.handle(data);
      
      // Handle different return types: Effect, Promise, or synchronous
      if (Effect.isEffect(result)) {
        // If it's an Effect, run it directly with proper error handling and provide LockService context
        yield* result.pipe(
          Effect.mapError((cause) => new JobExecutionError({ jobName: job.name, cause }))
        );
      } else if (result instanceof Promise) {
        // If it's a Promise, wrap it with Effect.tryPromise
        yield* Effect.tryPromise({
          try: () => result,
          catch: (cause) => new JobExecutionError({ jobName: job.name, cause }),
        });
      } else if (result !== undefined) {
        // If it's a synchronous result, wrap it with Effect.try
        yield* Effect.try({
          try: () => result,
          catch: (cause) => new JobExecutionError({ jobName: job.name, cause }),
        });
      }

      // Release the lock if WithoutOverlapping middleware was used
      const withoutOverlapping = middleware.find((m) => m instanceof WithoutOverlapping) as WithoutOverlapping | undefined;
      if (withoutOverlapping) {
        yield* withoutOverlapping.release(job);
        console.log(`[Worker] Released job lock for ${job.name}#${job.id} because it has finished processing.`);
      }

    });
}

// --- Main Application Bootstrap ---
const main = async () => {
  const registry = await loadQueues();
  const connection = { host: "127.0.0.1", port: 6379 } as const;
  const redis = new Redis(connection);

  // --- Define the application's Layer ---
  // For production, use the Redis-backed lock service.
  const AppLayer = Layer.provide(RedisLockLive, Layer.succeed(RedisTag, redis));

  // Create a runtime that provides the application's dependencies
  const Runtime = ManagedRuntime.make(AppLayer);

  // For testing, you could use the in-memory lock service:
  // const AppLayer = MemoryLockLive;

  const processJob = makeJobProcessor(registry);

  const worker = new Worker(
    "app",
    async (job: Job, token?: string) => {
      const effect = pipe(
        processJob(job),
        Effect.catchAll((error) => {
          if (error instanceof JobReleased) {
            console.warn(`[Worker] Releasing job ${error.jobName} for ${error.delay}s`);
            return Effect.fail(error);
          }
          if (error instanceof JobDiscarded) {
            console.log(`[Worker] Skipping job ${error.jobName}: ${error.cause}`);
            return Effect.void;
          }
          console.error("Job failed", error);
          return Effect.fail(error);
        })
      );

      try {
        await Runtime.runPromise(effect);
      } catch (error) {
        if (error instanceof JobReleased) {
          await job.moveToDelayed(Date.now() + error.delay * 1000, token);
          throw new DelayedError();
        }
        // For all other errors, let BullMQ handle the failure.
        throw error;
      }
    },
    { connection, concurrency: 10 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[BullMQ] Job ${job?.name}#${job?.id} failed: ${err.message}`);
  });

  console.log("[Worker] Listening for jobs on 'myQueue'...");
};

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});