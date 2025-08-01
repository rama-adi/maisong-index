import { Queue } from "bullmq";
import { BaseQueue } from "@/queues/base-queue.js";
import { Context, Effect, Schema } from "effect";

export const QueueJobData = Schema.Struct({
    id: Schema.String,
    data: Schema.Unknown,
    metadata: Schema.Record({
        key: Schema.String,
        value: Schema.Array(Schema.String)
    })
})

export const QueueJobResult = Schema.Array(QueueJobData)

export interface QueueService {
    enqueue: (job: InstanceType<typeof BaseQueue<any>>) => Effect.Effect<void, Error>;
    getJobs: (options: {
        start: number,
        end: number,
        ascending: boolean,
    }) => Effect.Effect<Schema.Schema.Type<typeof QueueJobResult>, Error>;
}

export const QueueService = Context.GenericTag<QueueService>("QueueService");

export function QueueServiceLive(bullQueue: Queue): QueueService {
    return {
        getJobs: (options) =>
            Effect.gen(function* () {
                const jobs = yield* Effect.tryPromise(() =>
                    bullQueue.getJobs(
                        ['active', 'waiting', 'failed', 'completed'],
                        options.start,
                        options.end,
                        options.ascending
                    )
                ).pipe(
                    Effect.mapError((err) =>
                        new Error(`Failed to get jobs: ${String(err)}`)
                    )
                );

                const result: Schema.Schema.Type<typeof QueueJobData>[] = [];

                const seenJobs = new Set<string>();

                for (const job of jobs) {
                    // Use job ID for deduplication
                    if (seenJobs.has(job.id!)) {
                        continue;
                    }
                    seenJobs.add(job.id!);

                    const queueJobData: Schema.Schema.Type<typeof QueueJobData> = {
                        id: job.id!,
                        data: job.data.__data,
                        metadata: job.data.__metadata
                    };

                    result.push(queueJobData);
                }

                return result;
            }),
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
                    bullQueue.add(jobClass.name, {
                        __data: job.data,
                        __metadata: {
                            name: jobClass.name
                        }
                    })
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
