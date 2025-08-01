import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "../trpc";
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createTRPCClient, httpBatchLink } from "@trpc/client";
export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
});