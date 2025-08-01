import { Effect, pipe, Data } from "effect"

export class InvalidUrlError extends Data.TaggedError("InvalidUrlError")<{
  readonly baseUrl: string
  readonly cause: unknown
}> {}

export function buildURL(
  baseUrl: string,
  params: Record<string, string | string[] | undefined>
): Effect.Effect<URL, InvalidUrlError, never> {
  return pipe(
    Effect.try({
      try: () => new URL(baseUrl),
      catch: (cause) => new InvalidUrlError({ baseUrl, cause })
    }),
    Effect.map((url) => {
      // Filter out undefined values and apply parameters functionally
      Object.entries(params)
        .filter((entry): entry is [string, string | string[]] => entry[1] !== undefined)
        .forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(key, v))
          } else {
            url.searchParams.set(key, value)
          }
        })
      
      return url
    })
  )
}
