import { Worker, Job, DelayedError, Queue } from "bullmq";
import { loadQueues } from "@/services/queue-registry";
import { BaseQueue, type QueueConstructor } from "@/queues/base-queue";
import { Effect, Data, pipe, ManagedRuntime, Logger } from "effect";
import { addQueueMetadata, hasMiddleware, type QueueMiddleware } from "@/queues/middleware/base";
import { WithoutOverlapping } from "@/queues/middleware/without-overlapping";
import { LockService } from "@/services/lock";
// Note: direct Redis usage is not required here; the LockService is provided via Effect Layer
import { LiveRuntimeContainer } from "./container";
import type { Layer } from "effect";

// Extract the type from LiveRuntimeContainer
type LiveRuntimeContainerType = Layer.Layer.Success<typeof LiveRuntimeContainer>;

// --- Custom Error Types ---
class UnhandledJobError extends Data.TaggedError("UnhandledJobError")<{ jobName: string }> { }
class JobValidationError extends Data.TaggedError("JobValidationError")<{ jobName: string; cause: unknown }> { }
class JobExecutionError extends Data.TaggedError("JobExecutionError")<{ jobName: string; cause: unknown }> { }
class MiddlewareError extends Data.TaggedError("MiddlewareError")<{ jobName: string; middleware: string; cause: unknown }> { }
class JobReleased extends Data.TaggedError("JobReleased")<{ jobName: string; delay: number }> { }
class JobDiscarded extends Data.TaggedError("JobDiscarded")<{ jobName: string; cause: string }> { }

/**
 * Runs the middleware chain for a job sequentially, short-circuiting on first failure.
 */
function runMiddleware(job: Job, middleware: QueueMiddleware[]): Effect.Effect<void, MiddlewareError | JobReleased | JobDiscarded, LockService> {
  return Effect.gen(function* () {
    for (const mw of middleware) {
      const result = yield* pipe(
        mw.handle(job),
        Effect.mapError((cause) => new MiddlewareError({ jobName: job.name, middleware: mw.key, cause }))
      );

      if (typeof result === "number") {
        return yield* Effect.fail(new JobReleased({ jobName: job.name, delay: result }));
      }
      if (result === false) {
        return yield* Effect.fail(new JobDiscarded({ jobName: job.name, cause: `Middleware ${mw.key} returned false` }));
      }
      // result === true -> continue
    }
  }).pipe(Effect.asVoid);
}

/**
 * Creates a per-job logger that writes all Effect logs into the job's metadata as string lines.
 */
function createJobMetadataLogger(job: Job) {
  // Using loose typing for compatibility with Effect logger options shape
  const toStringSafe = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (value == null) return "";
    try {
      return typeof value === "object" ? JSON.stringify(value) : String(value);
    } catch {
      return String(value);
    }
  };

  return Logger.make((options: any) => {
    try {
      const parts: string[] = [];
      const msgs: unknown[] = Array.isArray(options?.message)
        ? options.message
        : options?.message != null
          ? [options.message]
          : [];
      for (const m of msgs) parts.push(toStringSafe(m));
      const line = parts.join(" ").trim();
      if (line.length > 0) {
        addQueueMetadata(job, "log", [line]);
      }
    } catch {
      // Never let the logger break job execution
    }
  });
}

/**
 * Helper function to release WithoutOverlapping lock if present
 */
function releaseWithoutOverlappingLock(job: Job, middleware: QueueMiddleware[]): Effect.Effect<void, Error, LockService> {
  const withoutOverlapping = middleware.find((m) => m instanceof WithoutOverlapping) as WithoutOverlapping | undefined;
  if (withoutOverlapping) {
    return Effect.gen(function* () {
      yield* withoutOverlapping.release(job);
      console.log(`[Worker] Released job lock for ${job.name}#${job.id} due to failure.`);
      addQueueMetadata(job, "log", [`Released job lock for ${job.name}#${job.id} due to failure.`]);
    });
  }
  return Effect.void;
}

/**
 * Helper function to release WithoutOverlapping lock from job metadata (for use outside Effect context)
 */
async function releaseWithoutOverlappingLockFromMetadata(job: Job, runtime: ManagedRuntime.ManagedRuntime<LiveRuntimeContainerType, unknown>) {
  const hasWO = hasMiddleware(job, (key) => key.startsWith('without-overlapping'));
  if (hasWO) {
    try {
      // Create a temporary WithoutOverlapping instance to release the lock
      // Use job name as keySuffix since we just need to call release
      const withoutOverlapping = new WithoutOverlapping(job.name);
      await runtime.runPromise(withoutOverlapping.release(job));
      console.log(`[Worker] Released job lock for ${job.name}#${job.id} due to failure (from metadata).`);
      addQueueMetadata(job, "log", [`Released job lock for ${job.name}#${job.id} due to failure (from metadata).`] );
    } catch (error) {
      console.error(`[Worker] Failed to release lock for ${job.name}#${job.id}:`, error);
      addQueueMetadata(job, "log", [`Failed to release lock for ${job.name}#${job.id}: ${String(error)}`]);
    }
  }
}

/**
 * Creates an Effect-based job processor.
 */
function makeJobProcessor(registry: Record<string, QueueConstructor<any>>) {
  return (job: Job) =>
    Effect.gen(function* () {
      // Mark job as working when processing starts
      addQueueMetadata(job, "progress", "working");

      const QueueClass = registry[job.name];

      if (!QueueClass) {
        return yield* Effect.fail(new UnhandledJobError({ jobName: job.name }))
      }

      const data = yield* Effect.try({
        try: () => QueueClass.validate(job.data.__data),
        catch: (cause) => new JobValidationError({ jobName: job.name, cause }),
      });

      const middleware = QueueClass.middleware(data);

      // Store middleware info in job metadata for error handling
      addQueueMetadata(job, "middleware", middleware.map(m => m.key));

      yield* runMiddleware(job, middleware);

      const result = QueueClass.handle(data);

      // Handle different return types: Effect, Promise, or synchronous
      if (Effect.isEffect(result)) {
        // If it's an Effect, run it directly with proper error handling and provide LockService context
        yield* result.pipe(
          Effect.mapError((cause) => new JobExecutionError({ jobName: job.name, cause })),
          Effect.catchAll((error) => 
            Effect.gen(function* () {
              yield* releaseWithoutOverlappingLock(job, middleware);
              return yield* Effect.fail(error);
            })
          )
        );
      } else if (result instanceof Promise) {
        // If it's a Promise, wrap it with Effect.tryPromise
        yield* Effect.tryPromise({
          try: () => result,
          catch: (cause) => new JobExecutionError({ jobName: job.name, cause }),
        }).pipe(
          Effect.catchAll((error) => 
            Effect.gen(function* () {
              yield* releaseWithoutOverlappingLock(job, middleware);
              return yield* Effect.fail(error);
            })
          )
        );
      } else if (result !== undefined) {
        // If it's a synchronous result, wrap it with Effect.try
        yield* Effect.try({
          try: () => result,
          catch: (cause) => new JobExecutionError({ jobName: job.name, cause }),
        }).pipe(
          Effect.catchAll((error) => 
            Effect.gen(function* () {
              yield* releaseWithoutOverlappingLock(job, middleware);
              return yield* Effect.fail(error);
            })
          )
        );
      }

      // Mark job as finished when processing completes successfully
      addQueueMetadata(job, "progress", "finished");

      // Release the lock if WithoutOverlapping middleware was used
      const withoutOverlapping = middleware.find((m) => m instanceof WithoutOverlapping) as WithoutOverlapping | undefined;
      if (withoutOverlapping) {
        yield* withoutOverlapping.release(job);
        console.log(`[Worker] Released job lock for ${job.name}#${job.id} because it has finished processing.`);
        addQueueMetadata(job, "log", [`Released job lock for ${job.name}#${job.id} because it has finished processing.`]);
      }

    });
}

// --- Main Application Bootstrap ---
const main = async () => {
  const registry = await loadQueues();

  // Configurable connection and worker settings via env
  const queueName = process.env.QUEUE_NAME ?? "app";
  const redisHost = process.env.REDIS_HOST ?? "127.0.0.1";
  const redisPort = Number(process.env.REDIS_PORT ?? 6379);
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 10);
  const lockDuration = Number(process.env.WORKER_LOCK_DURATION_MS ?? 30000);
  const stalledInterval = Number(process.env.WORKER_STALLED_INTERVAL_MS ?? 30000);
  const maxStalledCount = Number(process.env.WORKER_MAX_STALLED ?? 2);

  const connection = { host: redisHost, port: redisPort } as const;

  // Create a runtime that provides the application's dependencies
  const Runtime = ManagedRuntime.make(LiveRuntimeContainer);

  // For testing, you could use the in-memory lock service:
  // const AppLayer = MemoryLockLive;

  const processJob = makeJobProcessor(registry);

  const worker = new Worker(
    queueName,
    async (job: Job, token?: string) => {
      const jobLogger = createJobMetadataLogger(job);
      const effect = pipe(
        processJob(job),
        // Attach per-job logger that mirrors all Effect logs into job metadata
        Effect.provide(Logger.replace(Logger.stringLogger, Logger.zip(Logger.stringLogger, jobLogger))),
        Effect.catchAll((error) => {
          if (error instanceof JobReleased) {
            console.warn(`[Worker] Releasing job ${error.jobName} for ${error.delay}s`);
            addQueueMetadata(job, "log", [`Releasing job ${error.jobName} for ${error.delay}s`] );
            return Effect.fail(error);
          }
          if (error instanceof JobDiscarded) {
            // Mark job as skipped when discarded by middleware
            addQueueMetadata(job, "progress", "skipped");
            if (!error.cause.includes("without-overlapping")) {
              console.log(`[Worker] Skipping job ${error.jobName}: ${error.cause}`);
              addQueueMetadata(job, "log", [`Skipping job ${error.jobName}: ${error.cause}`]);
            }
            return Effect.flatMap(LockService, () => Effect.void);
          }
          // Mark job as failed for all other errors
          addQueueMetadata(job, "progress", "failed");
          console.error("Job failed", error);
           addQueueMetadata(job, "log", [
             `Job failed: ${error instanceof Error ? error.message : String(error)}`
           ]);
          return Effect.fail(error);
        })
      );

      try {
        await Runtime.runPromise(effect as Effect.Effect<void | undefined, Error, LiveRuntimeContainerType>);
      } catch (error) {
        if (error instanceof JobReleased) {
          await job.moveToDelayed(Date.now() + error.delay * 1000, token);
          throw new DelayedError();
        }
        
        // Release WithoutOverlapping lock if present when job fails
        await releaseWithoutOverlappingLockFromMetadata(job, Runtime);
        
        // Mark job as failed if it wasn't already marked by Effect.catchAll
        // Check if progress metadata is already set to avoid overwriting skipped status
        const currentProgress = job.data.__metadata?.progress;
        if (!currentProgress) {
          addQueueMetadata(job, "progress", "failed");
        }
        addQueueMetadata(job, "log", [
          `BullMQ error caught: ${error instanceof Error ? error.message : String(error)}`
        ]);
        // For all other errors, let BullMQ handle the failure.
        throw error;
      }
    },
    {
      connection,
      concurrency,
      lockDuration,
      stalledInterval,
      maxStalledCount,
    }
  );

  // Queue instance for administrative operations in event handlers
  const adminQueue = new Queue(queueName, { connection });

  worker.on("failed", async (job, err) => {
    console.error(`[BullMQ] Job ${job?.name}#${job?.id} failed: ${err.message}`);
    if (job) {
      addQueueMetadata(job, "log", [`Job ${job.name}#${job.id} failed: ${err.message}`]);
    }
    
    if (job) {
      // Release WithoutOverlapping lock if present when job fails
      await releaseWithoutOverlappingLockFromMetadata(job, Runtime);
      
      // Ensure failed jobs are marked with failed progress
      addQueueMetadata(job, "progress", "failed");
    }
  });

  worker.on("stalled", async (jobId) => {
    try {
      const job = await adminQueue.getJob(jobId);
      if (!job) return;
      console.warn(`[BullMQ] Job ${job.name}#${job.id} stalled; attempting lock cleanup`);
      addQueueMetadata(job, "log", [
        `Job ${job.name}#${job.id} stalled; attempting lock cleanup`
      ]);
      await releaseWithoutOverlappingLockFromMetadata(job, Runtime);
    } catch (error) {
      console.error(`[BullMQ] Error handling stalled job ${jobId}:`, error);
    }
  });

  worker.on("error", (err) => {
    console.error(`[BullMQ] Worker error:`, err);
  });

  worker.on("ready", () => {
    console.log(`[Worker] Ready. Connected to ${redisHost}:${redisPort}.`);
  });

  worker.on("closed", () => {
    console.log(`[Worker] Closed.`);
  });

  worker.on("drained", () => {
    console.log(`[Worker] Queue drained.`);
  });

  console.log(`[Worker] Listening for jobs on '${queueName}' with concurrency ${concurrency}...`);

  const shutdown = async (signal: string) => {
    try {
      console.log(`[Worker] Received ${signal}. Shutting down...`);
      await worker.close();
      await adminQueue.close();
      process.exit(0);
    } catch (error) {
      console.error(`[Worker] Error during shutdown:`, error);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
};

main().catch((err) => {
  console.error("Failed to start worker:", err);
  process.exit(1);
});