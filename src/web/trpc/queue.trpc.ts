import { Effect, Schema } from "effect";
import { router, publicProcedure } from "./trpc";
import { QueueJobData, QueueService } from "@/services/queue";
import { TRPCError } from "@trpc/server";
import { LogQueue } from "@/queues/log.queue";

// @trpc-no-export
export const queueRouter = router({
    list: publicProcedure
        .input(Schema.standardSchemaV1(Schema.Struct({
            start: Schema.optional(Schema.Number),
            end: Schema.optional(Schema.Number),
            ascending: Schema.optional(Schema.Boolean)
        })))
        .output(Schema.standardSchemaV1(Schema.Array(QueueJobData)))
        .query(async ({ ctx, input }) => {
            if (ctx.cookies.get("TOKEN") !== process.env.DASHBOARD_TOKEN) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'You are not authorized to view the queues.',
                });
            }

            const program = Effect.gen(function* () {
                const queue = yield* QueueService
                return yield* queue.getJobs({
                    start: input.start ?? 0,
                    end: input.end ?? 100,
                    ascending: input.ascending ?? true
                })
            })

            return await ctx.effectRuntime.runPromise(program);
        }),
    viewLog: publicProcedure
        .input(Schema.standardSchemaV1(Schema.Struct({
            id: Schema.String
        })))
        .output(Schema.standardSchemaV1(Schema.Array(Schema.String)))
        .query(async ({ ctx, input }) => {
            if (ctx.cookies.get("TOKEN") !== process.env.DASHBOARD_TOKEN) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'You are not authorized to view the queues.',
                });
            }

            const program = Effect.gen(function* () {
                const queue = yield* QueueService;
                return yield* queue.viewLog(input.id);
            });

            return await ctx.effectRuntime.runPromise(program);
        }),
    test: publicProcedure
        .input(Schema.standardSchemaV1(Schema.Struct({})))
        .mutation(async ({ ctx, input }) => {
            if (ctx.cookies.get("TOKEN") !== process.env.DASHBOARD_TOKEN) {
                throw new TRPCError({
                    code: 'UNAUTHORIZED',
                    message: 'You are not authorized to view the queues.',
                });
            }
            const program = Effect.gen(function* () {
                const queue = yield* QueueService

                for (let i = 2; i <= 6; i++) {
                    yield* queue.enqueue(
                        new LogQueue({
                            id: i,
                            message: `Testing Job ${i}`
                        })

                    );
                }
            });

            return await ctx.effectRuntime.runPromise(program);
        })

});