import { Hono as hono } from 'hono';
import { Effect, ManagedRuntime, Layer } from 'effect';
import { Queue } from 'bullmq';
import { QueueService, QueueServiceLive } from '@/services/queue';
import { createHonoAdapter } from '@queuedash/api';
import { LogQueue } from '@/queues/log.queue';

const connection = { host: "127.0.0.1", port: 6379 } as const;
const bullQueue = new Queue("app", { connection });

const Runtime = ManagedRuntime.make(Layer.mergeAll(
    Layer.succeed(QueueService, QueueServiceLive(bullQueue))
));

const app = new hono();

app.route(
    "/queuedash",
    createHonoAdapter({
        baseUrl: "/queuedash",
        ctx: {
            queues: [
                {
                    queue: bullQueue,
                    displayName: "Reports",
                    type: "bull" as const,
                },
            ],
        },
    })
);

app.get('/work', (c) =>
    Runtime.runPromise(Effect.gen(function* (_) {
        const queueService = yield* _(QueueService);

        // Submit first job
        console.log("Submitting first job...");
        yield* _(
            queueService.enqueue(
                new LogQueue({
                    id: 1,
                    message: "First job - should run"
                })
            )
        );


        for (let i = 2; i <= 6; i++) {
            yield* _(
                queueService.enqueue(
                    new LogQueue({
                        id: 1,
                        message: `Job ${i} - should be discarded`
                    })
                )
            );
        }



        yield* _(
            queueService.enqueue(
                new LogQueue({
                    id: 2,
                    message: "Final job - should run"
                })
            )
        );

        return c.text("Sus")
    }))
);


app.get('/', (c) =>
    Runtime.runPromise(
        Effect.gen(function* () {
            // Here you can use effect as you are used to
            yield* Effect.log('Handling /');

            return c.text('Hello, world');
        })
    )
);


export default app