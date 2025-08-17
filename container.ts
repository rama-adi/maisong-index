import { SongIngestRepositoryLive } from "@/db/song-ingest-repository";
import { RedisLockLive, RedisTag } from "@/services/lock";
import { QueueService, QueueServiceLive } from "@/services/queue";
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Queue } from "bullmq";
import { Layer } from "effect";
import { Redis } from "ioredis";

const queueName = process.env.QUEUE_NAME ?? "app";
const redisHost = process.env.REDIS_HOST ?? "127.0.0.1";
const redisPort = Number(process.env.REDIS_PORT ?? 6379);

const connection = { host: redisHost, port: redisPort } as const;
const bullQueue = new Queue(queueName, { connection });
const redis = new Redis(connection);

// Use this for main and worker.
export const LiveRuntimeContainer = Layer.mergeAll(
  SongIngestRepositoryLive,
  FetchHttpClient.layer,
  Layer.succeed(QueueService, QueueServiceLive(bullQueue)),
  Layer.provide(RedisLockLive, Layer.succeed(RedisTag, redis))
);