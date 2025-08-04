import { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/web/trpc/index";
export const queryClient = new QueryClient();

const trpcClient = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
});