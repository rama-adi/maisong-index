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

Set `DASHBOARD_TOKEN` to a secret value. It is used to protect the dashboard.

### Running the Development Server

```bash
bun run index.tsx
```

This starts the HTTP server, exposes `/trpc` endpoints and serves the dashboard at `/dashboard`.

### Starting the Worker

```bash
bun run worker.ts
```

The worker pulls jobs from the `app` queue and executes them using the Effect-based processor.

## Project Layout

```
index.tsx     # HTTP server entry with tRPC routes and dashboard
worker.ts     # Queue worker implementation
src/
  queues/     # Queue definitions and middleware
  services/   # Shared services (locks, queue service, etc.)
  utils/      # Utility helpers
  web/        # Dashboard and tRPC router
bunfig.toml   # Bun server configuration
```

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

