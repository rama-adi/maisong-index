import { Hono as hono } from 'hono';
import { Effect, ManagedRuntime, Layer } from 'effect';
import { Queue } from 'bullmq';
import { QueueService, QueueServiceLive } from '@/services/queue';
import { createHonoAdapter } from '@queuedash/api';
import { LogQueue } from '@/queues/log.queue';
import { renderToString } from 'react-dom/server';
import React from 'react';

const connection = { host: "127.0.0.1", port: 6379 } as const;
const bullQueue = new Queue("app", { connection });

const Runtime = ManagedRuntime.make(Layer.mergeAll(
    Layer.succeed(QueueService, QueueServiceLive(bullQueue))
));

const app = new hono();

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <title>Queue Dashboard</title>
        <link
          href="https://cdn.jsdelivr.net/npm/tailwindcss@2/dist/tailwind.min.css"
          rel="stylesheet"
        />
      </head>
      <body className="p-4">{children}</body>
    </html>
  );
}

app.get('/dashboard', async (c) => {
  const counts = await bullQueue.getJobCounts(
    'active',
    'completed',
    'failed'
  );
  const jobs = await bullQueue.getJobs(
    ['active', 'waiting', 'failed', 'completed'],
    0,
    20,
    false
  );

  const body = renderToString(
    <Layout>
      <h1 className="text-2xl font-bold mb-4">Jobs</h1>
      <p className="mb-2">Running: {counts.active} | Done: {counts.completed} | Failed: {counts.failed}</p>
      <table className="table-auto w-full border">
        <thead>
          <tr className="bg-gray-200">
            <th className="px-2">ID</th>
            <th className="px-2">Name</th>
            <th className="px-2">Label</th>
            <th className="px-2">Tags</th>
            <th className="px-2">State</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-t">
              <td className="px-2">
                <a className="text-blue-600" href={`/dashboard/${j.id}`}>{j.id}</a>
              </td>
              <td className="px-2">{j.name}</td>
              <td className="px-2">{(j.data as any).__label}</td>
              <td className="px-2">{Array.isArray((j.data as any).__tags) ? (j.data as any).__tags.join(', ') : ''}</td>
              <td className="px-2">{j.finishedOn ? 'completed' : j.failedReason ? 'failed' : j.processedOn ? 'active' : 'waiting'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
  return c.html(body);
});

app.get('/dashboard/:id', async (c) => {
  const id = c.req.param('id');
  const job = await bullQueue.getJob(id);
  if (!job) return c.notFound();
  const body = renderToString(
    <Layout>
      <h1 className="text-2xl font-bold mb-4">Job {id}</h1>
      <pre>{JSON.stringify(job.toJSON(), null, 2)}</pre>
    </Layout>
  );
  return c.html(body);
});

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