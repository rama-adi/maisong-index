# Constantan

Constantan is an experimental fullstack framework built on top of the [Bun](https://bun.sh) runtime. It focuses on job processing and provides a small web dashboard for inspection. The project demonstrates how to combine **Effect** for functional programming, **BullMQ** for queues, **tRPC** for type-safe APIs and **React** for the UI.

## Features

- **Bun-native**: Written in TypeScript and runs directly with `bun`.
- **BullMQ queues**: Define jobs using `BaseQueue` and process them with a dedicated worker.
- **Effect runtime**: Provides typed, composable effects and dependency injection via layers.
- **tRPC API**: Exposes queue data through type-safe endpoints.
- **Dashboard**: Simple React interface secured by a token to view enqueued jobs.

## Getting Started

### Prerequisites

- Install [Bun](https://bun.sh/docs/installation) (version 1.0 or later).
- A running Redis instance for BullMQ.

### Installation

```bash
bun install
```

### Environment

Set the following environment variables as needed:

- `DASHBOARD_TOKEN` (required): Secret used to protect the dashboard. The server sets/reads a `TOKEN` cookie for access.
- `REDIS_HOST` (default `127.0.0.1`): Redis host for BullMQ and locks.
- `REDIS_PORT` (default `6379`): Redis port.
- `QUEUE_NAME` (default `app`): BullMQ queue name used by both server and worker.
- `WORKER_CONCURRENCY` (default `10`): Number of concurrent jobs the worker processes.
- `WORKER_LOCK_DURATION_MS` (default `30000`): BullMQ lock duration.
- `WORKER_STALLED_INTERVAL_MS` (default `30000`): Interval to check stalled jobs.
- `WORKER_MAX_STALLED` (default `2`): Max times a job is marked stalled before failing.
- `BUN_PUBLIC_APP_NAME` (optional): Display name used in the dashboard UI.

### Running the Development Server

```bash
bun run index.ts
# or with hot reload
bun --hot index.ts
```

This starts the HTTP server, exposes `/trpc` endpoints and serves the dashboard at `/dashboard`.

### Starting the Worker

```bash
bun run worker.ts
```

The worker pulls jobs from the `app` queue (configurable via `QUEUE_NAME`) and executes them using the Effect-based processor.

## Project Layout

```
index.ts      # HTTP server entry with tRPC routes and dashboard
worker.ts     # Queue worker implementation
src/
  queues/     # Queue definitions and middleware
  services/   # Shared services (locks, queue service, etc.)
  utils/      # Utility helpers
  web/        # Dashboard and tRPC router
bunfig.toml   # Bun server configuration
```

### tRPC
tRPC is preinstalled for you. It's already used in the dashboard for the queue display. If you would like to use the tRPC types on
other client such as React Native, you can do so without creating a monorepo! Simply run:
```sh
bun run trpc-codegen
```

and tRPC types is exported for your react query (or vanilla client) to use:
```ts
import { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { API } from "./dist/api"; // path to the generated api.d.ts

export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<API>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

export const trpc = createTRPCOptionsProxy<API>({
  client: trpcClient,
  queryClient,
});

// use as normal:
// const trpc = useTRPC();
// const queryClient = useQueryClient();

// Create QueryOptions which can be passed to query hooks
// const myQueryOptions = trpc.queues.list.queryOptions({ start: 0, end: 100, ascending: true })
// const myQuery = useQuery(myQueryOptions)
```
...or vanilla:
```ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { API } from "./dist/api"; // path to the generated api.d.ts

const client = createTRPCClient<API>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

// use as normal:
const jobs = await client.queues.list.query({ start: 0, end: 100, ascending: true });
```

_if you need to update it just rerun the script and copy and paste the generated `api.d.ts` file. This is under the assumption that you or your team are the one consuming it and you're ABSOLUTELY sure that this workflow is fine for you (it is for me)._ 

### Example Queue

`LogQueue` demonstrates how to implement a queue with middleware:

```ts
export class LogQueue extends QueueTag("sendLog")<typeof LogSchema> {
  static override readonly schema = LogSchema;
  static override middleware(data: S.Schema.Type<typeof LogSchema>) {
    return [new QueueLabel("Logs"), new TagMiddleware(`id:${data.id}`)];
  }
  static override handle(data: S.Schema.Type<typeof LogSchema>) {
    return Effect.logInfo(`Message: ${data.message}`);
  }
}
```

Jobs can then be enqueued via the `QueueService` from anywhere in the application.

## Status

Constantan is a proof of concept and not ready for production use. Feel free to explore, modify and extend it for your own experiments.

