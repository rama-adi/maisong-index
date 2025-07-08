import { Queue } from "bullmq";
import { BaseQueue } from "@/queues/base-queue.js";
import { Context, Effect, Schema } from "effect";

export interface QueueService {
  enqueue: (job: InstanceType<typeof BaseQueue<any>>) => Effect.Effect<void, Error>;
}

export const QueueService = Context.GenericTag<QueueService>("QueueService");

export function QueueServiceLive(bullQueue: Queue): QueueService {
    return {
        enqueue: (job) =>
            Effect.gen(function* () {
                // Validate job data using the job's schema before enqueueing
                const jobClass = job.constructor as typeof BaseQueue<any>;
                
                // Validate the job data against its schema
                yield* Effect.try(() => 
                    jobClass.validate(job.data)
                ).pipe(
                    Effect.mapError((parseError) => 
                        new Error(`Job validation failed for ${jobClass.name}: ${String(parseError)}`)
                    )
                );

                // If validation passes, enqueue the job
                yield* Effect.tryPromise(() => 
                    bullQueue.add(jobClass.name, job.data)
                ).pipe(
                    Effect.mapError((err) => 
                        new Error(`Failed to enqueue ${jobClass.name}: ${String(err)}`)
                    ),
                    Effect.tapError((err) =>
                        Effect.logError(err.message)
                    ),
                    Effect.asVoid
                );
            })
    };
}
