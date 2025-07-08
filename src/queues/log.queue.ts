import { QueueTag } from "@/queues/base-queue";
import * as S from "effect/Schema";
import { Effect } from "effect";
import type { QueueMiddleware } from "./middleware/base";
import { RateLimited } from "./middleware/rate-limited";
import { WithoutOverlapping } from "./middleware/without-overlapping";

export const LogSchema = S.Struct({
    id: S.Number,
    message: S.String
});

export class LogQueue extends QueueTag("sendLog")<typeof LogSchema> {
    static override readonly schema = LogSchema;

    static override middleware(data: S.Schema.Type<typeof LogSchema>): QueueMiddleware[] {
        return [
            new WithoutOverlapping(`log-${data.id}`)
        ];
    }

    static override handle(data: S.Schema.Type<typeof LogSchema>) {
        return Effect.gen(function* () {
            yield* Effect.logInfo(`Message: ${data.message}`);
            yield* Effect.sleep("10 seconds");
        });
    }
}
