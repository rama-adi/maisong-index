import { Context, Data, Effect } from "effect"
import type { ArcadeSongInfo, MaimaiJsonSongInfo } from "./arcade-song-info"

export class FuzzySearchError extends Data.TaggedError("FuzzySearchError")<{
    message: string
    cause?: unknown
    errorType: "CONNECTION_ERROR" | "SEARCH_ERROR" | "VALIDATION_ERROR" | "TIMEOUT_ERROR" | "UNKNOWN_ERROR"
    searchQuery?: string
    timestamp: number
    retryable: boolean
}> { }

export class FuzzySearch extends Context.Tag("FuzzySearch")<
    FuzzySearch,
    {
        searchTitle: (title: string) => Effect.Effect<string[], FuzzySearchError, never>
    }
>() { }