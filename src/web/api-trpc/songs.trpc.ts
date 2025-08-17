import { Effect, Schema } from "effect";
import { apiProcedure, apiRouter } from "./trpc";
import { FuzzySearch } from "@/contracts/fuzzy-search";
import { SongSearchRepository } from "@/contracts/song-search-repository";
import { TRPCError } from "@trpc/server";

export const songsRouter = apiRouter({
    findByTitle: apiProcedure
        .input(Schema.standardSchemaV1(Schema.Struct({
            title: Schema.String
        })))
        .query(async ({ ctx, input }) => {
            const program = Effect.gen(function* () {
                const fuzzySearch = yield* FuzzySearch;
                const songSearchRepo = yield* SongSearchRepository;
                const titles = yield* fuzzySearch.searchTitle(input.title);

                // Perform multiple searches for each title
                const searchResults = yield* Effect.forEach(titles, (title) => 
                    songSearchRepo.searchByTitle(title)
                );

                // Flatten and deduplicate results
                const allResults = searchResults.flat();
                const uniqueResults = allResults.reduce((acc, result) => {
                    const existingIndex = acc.findIndex(r => r.primary.songId === result.primary.songId);
                    if (existingIndex === -1) {
                        acc.push(result);
                    }
                    return acc;
                }, [] as typeof allResults);

                return uniqueResults;
            });

            try {
                return await ctx.effectRuntime.runPromise(program);
            } catch (error) {
    
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to search songs by title',
                    cause: error
                });
            }
        }),

    searchByMeta: apiProcedure
        .input(Schema.standardSchemaV1(Schema.Struct({
            artist: Schema.optional(Schema.NullOr(Schema.String)),
            minLevel: Schema.optional(Schema.NullOr(Schema.Number)),
            maxLevel: Schema.optional(Schema.NullOr(Schema.Number)),
            minLevelDisplay: Schema.optional(Schema.NullOr(Schema.String)),
            maxLevelDisplay: Schema.optional(Schema.NullOr(Schema.String)),
            minBpm: Schema.optional(Schema.NullOr(Schema.Number)),
            maxBpm: Schema.optional(Schema.NullOr(Schema.Number)),
            category: Schema.optional(Schema.NullOr(Schema.String)),
            version: Schema.optional(Schema.NullOr(Schema.String)),
            isNew: Schema.optional(Schema.NullOr(Schema.Boolean)),
            isLocked: Schema.optional(Schema.NullOr(Schema.Boolean)),
            isUtage: Schema.optional(Schema.NullOr(Schema.Boolean)),
            type: Schema.optional(Schema.NullOr(Schema.String)),
            difficulty: Schema.optional(Schema.NullOr(Schema.String)),
            noteDesigner: Schema.optional(Schema.NullOr(Schema.String)),
            isSpecial: Schema.optional(Schema.NullOr(Schema.Boolean)),
            hasRegionJp: Schema.optional(Schema.NullOr(Schema.Boolean)),
            hasRegionIntl: Schema.optional(Schema.NullOr(Schema.Boolean)),
            hasRegionCn: Schema.optional(Schema.NullOr(Schema.Boolean)),
            limit: Schema.optional(Schema.Number)
        })))
        .query(async ({ ctx, input }) => {
            const program = Effect.gen(function* () {
                const songSearchRepo = yield* SongSearchRepository;
                return yield* songSearchRepo.searchByMeta(input);
            });

            try {
                return await ctx.effectRuntime.runPromise(program);
            } catch (error) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to search songs by metadata',
                    cause: error
                });
            }
        }),

    findByInternalId: apiProcedure
        .input(Schema.standardSchemaV1(Schema.Struct({
            internalId: Schema.Number
        })))
        .query(async ({ ctx, input }) => {
            const program = Effect.gen(function* () {
                const songSearchRepo = yield* SongSearchRepository;
                return yield* songSearchRepo.findSongByInternalId(input.internalId);
            });

            try {
                return await ctx.effectRuntime.runPromise(program);
            } catch (error) {
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to find song by internal ID',
                    cause: error
                });
            }
        })
});