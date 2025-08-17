import { FuzzySearch, FuzzySearchError } from "@/contracts/fuzzy-search";
import { Config, Effect, Layer, Redacted } from "effect";
import Typesense from "typesense";

export const typesenseConfig = Config.all({
    host: Config.string("TYPESENSE_HOST").pipe(
        Config.validate({
            message: "Typesense host cannot be empty",
            validation: (value) => value.length >= 1
        })
    ),
    port: Config.number("TYPESENSE_PORT").pipe(
        Config.withDefault(443)
    ),
    protocol: Config.string("TYPESENSE_PROTOCOL").pipe(
        Config.withDefault("https")
    ),
    apiKey: Config.redacted(Config.string("TYPESENSE_API_KEY").pipe(
        Config.validate({
            message: "Typesense API key cannot be empty",
            validation: (value) => value.length >= 1
        })
    )),
    connectionTimeoutSeconds: Config.number("TYPESENSE_CONNECTION_TIMEOUT").pipe(
        Config.withDefault(10)
    )
});

export const FuzzySearchLive = Layer.effect(
    FuzzySearch,
    Effect.gen(function* () {
        const config = yield* typesenseConfig;
        const client = new Typesense.Client({
            nodes: [
                {
                    host: config.host,
                    port: config.port,
                    protocol: config.protocol,
                },
            ],
            apiKey: Redacted.value(config.apiKey),
            connectionTimeoutSeconds: config.connectionTimeoutSeconds,
        });

        return {
            searchTitle: (title: string) => Effect.gen(function* () {
                // Validate input
                if (!title || title.trim().length === 0) {
                    yield* Effect.fail(new FuzzySearchError({
                        message: "Search title cannot be empty or whitespace only",
                        errorType: "VALIDATION_ERROR",
                        searchQuery: title,
                        timestamp: Date.now(),
                        retryable: false
                    }));
                }

                yield* Effect.log(`Searching for title: ${title}`);
                
                const results = yield* Effect.tryPromise({
                    try: () => client.collections("maimai-songs").documents().search({
                        q: title,
                        query_by: "manual_alias,generated_alias,romaji,normalized_title,title", 
                        query_by_weights: "5,4,3,4,2",
                        prefix: "true",
                        per_page: 5,
                        sort_by: "_text_match:desc",
                    }),
                    catch: (error) => {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        
                        // Categorize error types based on error content
                        let errorType: "CONNECTION_ERROR" | "SEARCH_ERROR" | "VALIDATION_ERROR" | "TIMEOUT_ERROR" | "UNKNOWN_ERROR";
                        let retryable = false;
                        
                        if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('timed out')) {
                            errorType = "TIMEOUT_ERROR";
                            retryable = true;
                        } else if (errorMessage.toLowerCase().includes('connection') || errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('econnrefused')) {
                            errorType = "CONNECTION_ERROR";
                            retryable = true;
                        } else if (errorMessage.toLowerCase().includes('query') || errorMessage.toLowerCase().includes('search') || errorMessage.toLowerCase().includes('400')) {
                            errorType = "SEARCH_ERROR";
                            retryable = false;
                        } else if (errorMessage.toLowerCase().includes('401') || errorMessage.toLowerCase().includes('403') || errorMessage.toLowerCase().includes('unauthorized')) {
                            errorType = "VALIDATION_ERROR";
                            retryable = false;
                        } else {
                            errorType = "UNKNOWN_ERROR";
                            retryable = true;
                        }
                        
                        return new FuzzySearchError({
                            message: `Failed to search for title "${title}": ${errorMessage}`,
                            cause: error,
                            errorType,
                            searchQuery: title,
                            timestamp: Date.now(),
                            retryable
                        });
                    }
                });
                
                // Get titles from Typesense results
                const titles = results.hits?.map((hit: any) => hit.document.title) || [];
                
                return titles.filter((title): title is string => typeof title === 'string');
            }).pipe(
                Effect.mapError((error) => 
                    error instanceof FuzzySearchError 
                        ? error 
                        : new FuzzySearchError({ 
                            message: `Unexpected error during search: ${error}`,
                            cause: error,
                            errorType: "UNKNOWN_ERROR",
                            timestamp: Date.now(),
                            retryable: true
                        })
                )
            )
        };
    })
);