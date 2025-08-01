import { buildURL, InvalidUrlError } from "@/utils/build-url";
import dayjs, { Dayjs } from "dayjs";
import { Effect, Context, Layer, Data } from "effect"
import { Schema } from "effect"
import type { ParseError } from "effect/ParseResult";

class HttpError extends Data.TaggedError("HttpError")<{ message: string }> { }

type WeatherInterval = {
    start: Dayjs,
    end: Dayjs,
    dailyArray: number[],
    weeklySums: number[],
    weeklyRanges: number[],
    monthlyTotal: number[]
}

const OpenMeteoSeasonalData = Schema.Struct({
    latitude: Schema.Number,
    longitude: Schema.Number,
    generationtime_ms: Schema.Number,
    utc_offset_seconds: Schema.Number,
    timezone: Schema.String,
    timezone_abbreviation: Schema.String,
    elevation: Schema.Number,
    six_hourly_units: Schema.Struct({
        time: Schema.String,
        precipitation_member01: Schema.String,
        precipitation_member02: Schema.String,
        precipitation_member03: Schema.String,
        precipitation_member04: Schema.String,
        soil_moisture_10_to_40cm_member01: Schema.String,
        soil_moisture_10_to_40cm_member02: Schema.String,
        soil_moisture_10_to_40cm_member03: Schema.String,
        soil_moisture_10_to_40cm_member04: Schema.String,
    }),
    six_hourly: Schema.Struct({
        time: Schema.Array(Schema.String),
        precipitation_member01: Schema.Array(Schema.Number),
        precipitation_member02: Schema.Array(Schema.Number),
        precipitation_member03: Schema.Array(Schema.Number),
        precipitation_member04: Schema.Array(Schema.Number),
        soil_moisture_10_to_40cm_member01: Schema.Array(Schema.Number),
        soil_moisture_10_to_40cm_member02: Schema.Array(Schema.Number),
        soil_moisture_10_to_40cm_member03: Schema.Array(Schema.Number),
        soil_moisture_10_to_40cm_member04: Schema.Array(Schema.Number),
    }),
    daily_units: Schema.Struct({
        time: Schema.String,
        precipitation_sum_member01: Schema.String,
        precipitation_sum_member02: Schema.String,
        precipitation_sum_member03: Schema.String,
        precipitation_sum_member04: Schema.String,
    }),
    daily: Schema.Struct({
        time: Schema.Array(Schema.String),
        precipitation_sum_member01: Schema.Array(Schema.Number),
        precipitation_sum_member02: Schema.Array(Schema.Number),
        precipitation_sum_member03: Schema.Array(Schema.Number),
        precipitation_sum_member04: Schema.Array(Schema.Number),
    }),
})

class WeatherService extends Context.Tag("WeatherService")<
    WeatherService,
    {
        buildIntervals: () => Effect.Effect<WeatherInterval[], never>,
        getSeasonalData: (options: {
            latitude: number,
            longitude: number,
            startDate: Dayjs,
            endDate: Dayjs
        }) => Effect.Effect<Schema.Schema.Type<typeof OpenMeteoSeasonalData>, HttpError | ParseError | InvalidUrlError>,
    }
>() { }

export const WeatherServiceLive = Layer.succeed(WeatherService, {
    buildIntervals: () => Effect.gen(function* () {
        const currentMonthStart = dayjs().startOf('month');
        return Array.from({ length: 4 }, (_, monthOffset) => ({
            start: currentMonthStart.add(monthOffset, 'month'),
            end: currentMonthStart.add(monthOffset + 1, 'month'),
            dailyArray: [],
            weeklySums: [],
            weeklyRanges: [],
            monthlyTotal: [],
        }));
    }),

    getSeasonalData: (options: {
        latitude: number;
        longitude: number;
        startDate: Dayjs;
        endDate: Dayjs;
    }) => Effect.gen(function* () {

        const url = yield* buildURL("https://seasonal-api.open-meteo.com/v1/seasonal", {
            latitude: options.latitude.toString(),
            longitude: options.longitude.toString(),
            six_hourly: ["precipitation", "soil_moisture_10_to_40cm"],
            daily: "precipitation_sum",
            timezone: "Asia/Singapore",
            start_date: options.startDate.format("YYYY-MM-DD"),
            end_date: options.endDate.format("YYYY-MM-DD")
        });

        const seasonalData = yield* Effect.tryPromise({
            try: () =>
                fetch(url.toString()).then(
                    (res) => res.json()
                ),
            catch: (err) => new HttpError({
                message: String(err)
            })
        });

        return yield* Schema.decodeUnknown(OpenMeteoSeasonalData)(seasonalData)

    })
})