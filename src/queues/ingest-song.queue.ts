import { QueueTag } from "@/queues/base-queue";
import * as S from "effect/Schema";
import { Effect } from "effect";
import type { QueueMiddleware } from "./middleware/base";
import { WithoutOverlapping } from "./middleware/without-overlapping";
import { QueueLabel } from "./middleware/queue-label";
import { HttpClient } from "@effect/platform"
import { SongIngestRepository } from "@/contracts/song-ingest-repository";
import type { ArcadeSongInfo, MaimaiJsonSongInfo } from "@/contracts/arcade-song-info";

export const IngestSongQueueSchema = S.Struct({
    id: S.optional(S.String.pipe(S.nonEmptyString()))
});

export class IngestSongQueue extends QueueTag("IngestSongQueue")<typeof IngestSongQueueSchema> {
    static override readonly schema = IngestSongQueueSchema;

    static override middleware(data: S.Schema.Type<typeof IngestSongQueueSchema>): QueueMiddleware[] {
        return [
            new QueueLabel("Logs"),
            new WithoutOverlapping(`ingest-song`)
        ];
    }

    static override handle(data: S.Schema.Type<typeof IngestSongQueueSchema>) {
        return Effect.gen(function* () {
           const ingestRepo = yield* SongIngestRepository;
           const httpClient = yield* HttpClient.HttpClient;


           yield* Effect.log("Getting data from arcade-song");
           const result = yield* httpClient.get("https://dp4p6x0xfi5o9.cloudfront.net/maimai/data.json");
           const arcadeSongData = JSON.parse(yield* result.text) as ArcadeSongInfo;

           yield* Effect.log("Ingesting data...");
           yield* ingestRepo.ingestData(arcadeSongData);

           yield* Effect.log("Getting data for jacket");
           const jacketResult = yield* httpClient.get("https://maimai.sega.jp/data/maimai_songs.json");
           const jacketData = JSON.parse(yield* jacketResult.text) as MaimaiJsonSongInfo[];

           yield* Effect.log("Ingesting jacket data...");
           yield* ingestRepo.ingestSongJacket(jacketData);
        });
    }
}
