import { RedisLockLive, RedisTag } from "@/services/lock";
import { QueueService, QueueServiceLive } from "@/services/queue";
import { Queue } from "bullmq";
import { Layer } from "effect";
import { Redis } from "ioredis";

const connection = { host: "127.0.0.1", port: 6379 } as const;
const bullQueue = new Queue("app", { connection });
const redis = new Redis(connection);

// Use this for main and worker.
export const LiveRuntimeContainer = Layer.mergeAll(
    Layer.succeed(QueueService, QueueServiceLive(bullQueue)),
    Layer.provide(RedisLockLive, Layer.succeed(RedisTag, redis)),
)