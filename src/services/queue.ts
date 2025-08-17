import { Queue, type JobsOptions } from "bullmq";
import { BaseQueue, type QueueConstructor } from "@/queues/base-queue.js";
import { Context, Effect, Schema } from "effect";

export const QueueJobData = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  progress: Schema.String,
  queue: Schema.String,
  label: Schema.optional(Schema.String),
  tags: Schema.optional(Schema.Array(Schema.String)),
  middleware: Schema.optional(Schema.Array(Schema.String)),
  data: Schema.Unknown,
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const QueueJobResult = Schema.Array(QueueJobData)

export interface QueueService {
    enqueue: (job: InstanceType<typeof BaseQueue<any>>) => Effect.Effect<void, Error>;
    getJobs: (options: {
        start: number,
        end: number,
        ascending: boolean,
    }) => Effect.Effect<Schema.Schema.Type<typeof QueueJobResult>, Error>;
    viewLog: (id: string) => Effect.Effect<string[], Error>;
}

export const QueueService = Context.GenericTag<QueueService>("QueueService");

export function QueueServiceNoop(): QueueService {
    return {
        getJobs: (options) => Effect.succeed([]),
        enqueue: (job) => Effect.void,
        viewLog: (id) => Effect.succeed([])
    };
}


export function QueueServiceLive(bullQueue: Queue): QueueService {
    return {
        getJobs: (options) =>
            Effect.gen(function* () {
                const jobs = yield* Effect.tryPromise(() =>
                  bullQueue.getJobs(
                    ["active", "waiting", "failed", "completed", "delayed", "paused"],
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
                  if (!job?.id) continue;
                  if (seenJobs.has(job.id)) continue;
                  seenJobs.add(job.id);

                  const meta = (job.data as any)?.__metadata ?? {};
                  const payload = (job.data as any)?.__data ?? job.data;

                  const queueJobData: Schema.Schema.Type<typeof QueueJobData> = {
                    id: job.id,
                    name: (job as any).name ?? meta.name ?? "Unknown",
                    progress: String(meta.progress ?? "unknown"),
                    queue: (job as any).queueName ?? bullQueue.name,
                    label: typeof meta.label === 'string' ? meta.label : undefined,
                    tags: Array.isArray(meta.tags) ? meta.tags.filter((t: any) => typeof t === 'string') : undefined,
                    middleware: Array.isArray(meta.middleware) ? meta.middleware.filter((t: any) => typeof t === 'string') : undefined,
                    data: payload,
                    metadata: meta,
                  };

                  result.push(queueJobData);
                }

                return result;
            }),
        viewLog: (id) =>
            Effect.gen(function* () {
                const job = yield* Effect.tryPromise(() => bullQueue.getJob(id)).pipe(
                    Effect.mapError((err) => new Error(`Failed to load job ${id}: ${String(err)}`))
                );

                if (!job) return [] as string[];

                // Read logs stored in job metadata
                const metaLogsRaw = (job.data as any)?.__metadata?.log;
                const metaLogs: string[] = Array.isArray(metaLogsRaw)
                    ? metaLogsRaw.filter((l: unknown) => typeof l === 'string')
                    : typeof metaLogsRaw === 'string'
                        ? [metaLogsRaw]
                        : [];

                // Also include BullMQ job logs if available
                const bullLogs = yield* Effect.tryPromise(async () => {
                    try {
                        const getLogs = (job as any)?.getLogs as ((start?: number, end?: number) => Promise<{ logs: string[] }>) | undefined;
                        if (!getLogs) return [] as string[];
                        const { logs } = await getLogs(0, 100);
                        return Array.isArray(logs) ? logs.filter((l: unknown) => typeof l === 'string') as string[] : [];
                    } catch {
                        return [] as string[];
                    }
                }).pipe(Effect.mapError(() => new Error('Failed to read BullMQ logs')));

                // Combine and deduplicate
                const combined = [...metaLogs, ...bullLogs];
                const seen = new Set<string>();
                const deduped: string[] = [];
                for (const line of combined) {
                    if (!seen.has(line)) {
                        seen.add(line);
                        deduped.push(line);
                    }
                }
                return deduped;
            }),
        enqueue: (job) =>
            Effect.gen(function* () {
                // Validate job data using the job's schema before enqueueing
                const jobClass = job.constructor as QueueConstructor<any>;

                // Validate the job data against its schema
                yield* Effect.log(`Validating job data for ${jobClass.name}: ${JSON.stringify(job.data)}`);
                
                yield* Effect.try(() => {
                    const result = jobClass.validate(job.data);
                    return result;
                }).pipe(
                    Effect.mapError((parseError) => {
                        const errorDetails = parseError instanceof Error ? parseError.message : String(parseError);
                        return new Error(`Job validation failed for ${jobClass.name}. Data: ${JSON.stringify(job.data)}. Error: ${errorDetails}`);
                    }),
                    Effect.tap((validatedData) => 
                        Effect.log(`Successfully validated data for ${jobClass.name}: ${JSON.stringify(validatedData)}`)
                    )
                );

                // Build robust default job options
                const serialize = (value: unknown) => {
                  try { return JSON.stringify(value); } catch { return String(value); }
                };
                const stableHash = (value: unknown) => {
                  // djb2 on JSON string for deterministic jobId
                  const input = serialize(value);
                  let hash = 5381;
                  for (let i = 0; i < input.length; i++) {
                    hash = ((hash << 5) + hash) + input.charCodeAt(i);
                    hash |= 0; // force 32-bit
                  }
                  return (hash >>> 0).toString(36);
                };

                const baseId = `${jobClass.name}:${stableHash(job.data)}`;

                const defaultOptions: JobsOptions = {
                  jobId: baseId,
                  attempts: 5,
                  backoff: {
                    type: "exponential",
                    delay: 2000,
                  },
                  removeOnComplete: { age: 24 * 60 * 60, count: 1000 }, // keep 1 day or 1k
                  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }, // keep 7 days or 5k
                };

                // Allow overriding via metadata on the job's data
                const providedMeta = (job as any)?.options as Partial<JobsOptions> | undefined;
                const options: JobsOptions = { ...defaultOptions, ...(providedMeta ?? {}) };

                // If validation passes, enqueue the job
                yield* Effect.tryPromise(() =>
                    bullQueue.add(
                      jobClass.name,
                      {
                        __data: job.data,
                        __metadata: {
                          name: jobClass.name,
                          log: []
                        }
                      },
                      options
                    )
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
