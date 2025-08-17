import { Context, Data, Effect } from "effect"
import type { ArcadeSongInfo, MaimaiJsonSongInfo } from "./arcade-song-info"

export class IngestError extends Data.TaggedError("IngestError")<{
    message: string
}> { }

export class SongIngestRepository extends Context.Tag("SongIngestRepository")<
    SongIngestRepository,
    {
        ingestSongJacket: (data: MaimaiJsonSongInfo[]) => Effect.Effect<void, IngestError>,
        ingestData: (data: ArcadeSongInfo) => Effect.Effect<void, IngestError>
    }
>() { }