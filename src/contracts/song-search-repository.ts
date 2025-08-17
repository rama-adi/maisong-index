import type { Song } from "@/contracts/arcade-song-info"
import { Context, Data, Effect } from "effect"
import * as musicSchema from "@/db/schemas/musics"

export interface SearchResult {
    primary: Song;
    utages: Song[];
}

export interface SearchConfig {
    titles: string[];
    limit?: number;
}

/**
 * Rich error types for song search operations
 */

export class DatabaseConnectionError extends Data.TaggedError("DatabaseConnectionError")<{
    readonly operation: string;
    readonly message: string;
    readonly cause?: unknown;
}> { }

export class SongNotFoundError extends Data.TaggedError("SongNotFoundError")<{
    readonly songId: string;
    readonly operation: string;
}> { }

export class SheetQueryError extends Data.TaggedError("SheetQueryError")<{
    readonly songId: string;
    readonly message: string;
    readonly cause?: unknown;
}> { }

export class SearchQueryError extends Data.TaggedError("SearchQueryError")<{
    readonly titles: string[];
    readonly message: string;
    readonly cause?: unknown;
}> { }

export class DataTransformationError extends Data.TaggedError("DataTransformationError")<{
    readonly operation: string;
    readonly songId?: string;
    readonly message: string;
    readonly cause?: unknown;
}> { }

export class InvalidSearchConfigError extends Data.TaggedError("InvalidSearchConfigError")<{
    readonly reason: string;
    readonly providedConfig: unknown;
}> { }

/**
 * Union type of all possible song search errors
 */
export type SongSearchError =
    | DatabaseConnectionError
    | SongNotFoundError
    | SheetQueryError
    | SearchQueryError
    | DataTransformationError
    | InvalidSearchConfigError;

export class SongSearchRepository extends Context.Tag("SongSearchRepository")<
    SongSearchRepository,
    {
        dbSongToFormattedSong: (song: typeof musicSchema.songs.$inferSelect, sheetFilters?: any[]) => Effect.Effect<Song, SongSearchError, never>
        findSongByInternalId: (internalId: number) => Effect.Effect<Song | null, SongSearchError, never>
        searchByTitle: (title: string, limit?: number) => Effect.Effect<SearchResult[], SongSearchError, never>
        searchByMeta: (meta: {
            artist?: string | null,
            minLevel?: number | null,
            maxLevel?: number | null,
            minLevelDisplay?: string | null,
            maxLevelDisplay?: string | null,
            minBpm?: number | null,
            maxBpm?: number | null,
            category?: string | null,
            version?: string | null,
            isNew?: boolean | null,
            isLocked?: boolean | null,
            isUtage?: boolean | null,
            type?: string | null,
            difficulty?: string | null,
            noteDesigner?: string | null,
            isSpecial?: boolean | null,
            hasRegionJp?: boolean | null,
            hasRegionIntl?: boolean | null,
            hasRegionCn?: boolean | null,
            limit?: number
        }) => Effect.Effect<SearchResult[], SongSearchError, never>
    }
>() { }