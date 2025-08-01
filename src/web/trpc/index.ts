import { router } from '@/web/trpc/trpc';
import { queueRouter } from './queue.trpc';

/** /TRPC */
export const appRouter = router({
    queues: queueRouter,
});
export type AppRouter = typeof appRouter;
/** /TRPC */