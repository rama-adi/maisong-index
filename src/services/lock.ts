import { Effect, Data, Context, Layer } from "effect";
import { Redis } from "ioredis";

// --- Custom Error Types ---
export class LockAcquisitionError extends Data.TaggedError("LockAcquisitionError")<{ key: string }> {}

// --- Lock Service Interface and Tag ---
export interface LockService {
  readonly acquire: (
    key: string,
    options: { expiry: number; limit?: number }
  ) => Effect.Effect<boolean, LockAcquisitionError>;
  readonly release: (key: string) => Effect.Effect<void, never>;
}

export const LockService = Context.GenericTag<LockService>("LockService");

// --- Redis Implementation ---

// We also create a Tag for the Redis client itself
export const RedisTag = Context.GenericTag<Redis>("Redis");

export const RedisLockLive = Layer.effect(
  LockService,
  Effect.map(RedisTag, (redis) => {
    return {
      acquire: (key, { expiry, limit = 1 }) =>
        Effect.tryPromise({
          try: async () => {
            if (limit === 1) {
              // Simple case: use atomic SET NX EX
              const result = await redis.set(key, "1", "EX", expiry, "NX");
              return result === "OK";
            } else {
              // Rate limiting case: use Lua script for atomicity
              const luaScript = `
                local key = KEYS[1]
                local limit = tonumber(ARGV[1])
                local expiry = tonumber(ARGV[2])
                
                local current = redis.call('GET', key)
                local count = current and tonumber(current) or 0
                
                if count >= limit then
                  return 0
                end
                
                local newCount = redis.call('INCR', key)
                if newCount == 1 then
                  redis.call('EXPIRE', key, expiry)
                end
                
                return 1
              `;
              
              const result = await redis.eval(luaScript, 1, key, limit.toString(), expiry.toString());
              return result === 1;
            }
          },
          catch: (error) => new LockAcquisitionError({ key }),
        }),
      release: (key) =>
        Effect.tryPromise({ 
          try: async () => redis.del(key), 
          catch: () => {} 
        }).pipe(
          Effect.catchAll(() => Effect.void),
          Effect.asVoid
        ),
    };
  })
);

// --- In-Memory Implementation (for testing) ---
export const MemoryLockLive = Layer.succeed(
  LockService,
  (() => {
    const locks = new Map<string, { count: number; expiry: number }>();
    return {
      acquire: (key, { expiry, limit = 1 }) =>
        Effect.sync(() => {
          const now = Date.now();
          const lock = locks.get(key);
          if (lock && now < lock.expiry) {
            if (lock.count >= limit) return false;
          } else {
            locks.delete(key);
          }
          const currentCount = lock ? lock.count : 0;
          locks.set(key, { count: currentCount + 1, expiry: now + expiry * 1000 });
          return true;
        }),
      release: (key) => Effect.sync(() => {
        locks.delete(key);
      }),
    };
  })()
);