import { ManagedRuntime } from 'effect';
import { serve } from 'bun';
import type { BunRequest } from "bun";
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/web/trpc';

import dashboardIndex from "@/web/dashboard/index.html";
import dashboardLogin from "@/web/dashboard/login.html";
import { LiveRuntimeContainer } from './container';

export const Runtime = ManagedRuntime.make(LiveRuntimeContainer);

// Workaround: https://github.com/oven-sh/bun/issues/17595
// this is safe as every API needs a valid session. Just a niceties so that if there's no valid
// session, a login page is shown instead of a brief flash.
const nonce = `/dynr_${crypto.randomUUID()}`;

const initTrpcFetch = async (req: BunRequest) => {
  return fetchRequestHandler({
    endpoint: '/trpc',
    req: req,
    router: appRouter,
    createContext: () => ({
      headers: req.headers,
      effectRuntime: Runtime,
      cookies: req.cookies
    }),
  });
}

const matchDashboard = async (request: BunRequest) => {
  const token = request.cookies.get('TOKEN');
  const validToken = process.env.DASHBOARD_TOKEN;

  if (!token || token !== validToken) {
    const data: Response = await fetch(`${server.url}${nonce}/dashboard-login`);
    return new Response(await data.text(), {
      headers: { "Content-Type": "text/html" }
    });
  }

  const data: Response = await fetch(`${server.url}${nonce}/dashboard`);
  return new Response(await data.text(), {
    headers: { "Content-Type": "text/html" }
  });
}

const server = serve({
  routes: {
    [`${nonce}/dashboard`]: dashboardIndex,
    [`${nonce}/dashboard-login`]: dashboardLogin,
    "/dashboard": {
      async GET(request: BunRequest): Promise<Response> {
        return matchDashboard(request);
      },
      async POST(request: BunRequest): Promise<Response> {
        const formData = await request.formData();
        const token = formData.get('token');
        const validToken = process.env.DASHBOARD_TOKEN;

        if (!token || token !== validToken) {
          return new Response('Invalid token', {
            status: 401,
            headers: { "Content-Type": "text/plain" }
          });
        }

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 1);

        return new Response('Login successful', {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "Set-Cookie": `TOKEN=${token}; Path=/; HttpOnly; Expires=${expiryDate.toUTCString()}`
          }
        });
      }
    },
    "/dashboard/*": {
      async GET(request: BunRequest): Promise<Response> {
        return matchDashboard(request);
      },
    },
    "/trpc/*": async req => {
      return initTrpcFetch(req);
    },
    "/trpc": async req => {
      return initTrpcFetch(req);
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);