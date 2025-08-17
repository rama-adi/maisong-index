import { songsRouter } from './songs.trpc';
import { apiRouter } from './trpc';

export const apiAppRouter = apiRouter({
    songs: songsRouter
});

export type ApiAppRouter = typeof apiAppRouter;