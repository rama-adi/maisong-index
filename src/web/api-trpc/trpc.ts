import { initTRPC } from '@trpc/server';
import type { Runtime } from '../../..';
import type { CookieMap } from 'bun';


/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
type Context = {
    headers: Headers,
    effectRuntime: typeof Runtime,
    cookies: CookieMap
};

const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const apiRouter = t.router;
export const apiProcedure = t.procedure;