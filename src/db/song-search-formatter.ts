import type { Song } from "@/contracts/arcade-song-info";
import type { SearchResult, SongSearchError } from "@/contracts/song-search-repository";
import { DataTransformationError } from "@/contracts/song-search-repository";
import { Effect } from "effect";

/**
 * Modular formatter for organizing songs into SearchResult groups
 */

export interface SongGroup {
    primary: Song;
    utages: Song[];
}

export interface FormatterConfig {
    limit?: number;
    groupByBaseTitle?: boolean;
    prioritizeRegularSongs?: boolean;
}

/**
 * Groups songs by their base title, handling utage variants appropriately
 */
export const groupSongsByTitle = (
    songs: Song[],
    config: FormatterConfig = {}
): Effect.Effect<SearchResult[], SongSearchError, never> => Effect.gen(function* () {
    const {
        limit = 50,
        groupByBaseTitle = true,
        prioritizeRegularSongs = true
    } = config;

    if (!Array.isArray(songs)) {
        return yield* Effect.fail(new DataTransformationError({
            operation: "groupSongsByTitle",
            message: "Songs must be an array",
            cause: { provided: typeof songs }
        }));
    }

    yield* Effect.log(`Grouping ${songs.length} songs with config: ${JSON.stringify(config)}`);

    try {
        const songGroups = new Map<string, SongGroup>();

        for (const song of songs) {
            if (!song.songId || !song.title) {
                yield* Effect.log(`Skipping invalid song: ${JSON.stringify({ songId: song.songId, title: song.title })}`);
                continue;
            }

            // Determine the grouping key
            const groupKey = groupByBaseTitle
                ? extractBaseTitle(song.title)
                : song.songId;

            const isUtage = song.category === '宴会場';
            const existingGroup = songGroups.get(groupKey);

            if (isUtage) {
                // Handle utage song
                if (existingGroup) {
                    existingGroup.utages.push(song);
                } else {
                    // Create new group with utage as both primary and variant
                    songGroups.set(groupKey, {
                        primary: song,
                        utages: [song]
                    });
                }
            } else {
                // Handle regular song
                if (existingGroup) {
                    // Replace primary if it was a utage and we prioritize regular songs
                    if (prioritizeRegularSongs && existingGroup.primary.category === '宴会場') {
                        existingGroup.primary = song;
                    }
                } else {
                    // Create new group with regular song as primary
                    songGroups.set(groupKey, {
                        primary: song,
                        utages: []
                    });
                }
            }
        }

        // Convert groups to search results and apply limit
        const results: SearchResult[] = Array.from(songGroups.values())
            .slice(0, limit);

        yield* Effect.log(`Created ${results.length} song groups from ${songs.length} songs`);

        return results;
    } catch (cause) {
        return yield* Effect.fail(new DataTransformationError({
            operation: "groupSongsByTitle",
            message: "Failed to group songs",
            cause
        }));
    }
});

/**
 * Extracts base title by removing utage markers
 */
export const extractBaseTitle = (title: string): string => {
    if (!title || typeof title !== 'string') {
        return title || '';
    }

    // Remove utage markers from the title
    let baseTitle = title;

    if (title.includes('[宴]')) {
        baseTitle = title.replace('[宴]', '').trim();
    } else if (title.includes('(宴)')) {
        baseTitle = title.replace('(宴)', '').trim();
    }

    return baseTitle;
};

/**
 * Validates and normalizes formatter configuration
 */
export const validateFormatterConfig = (
    config: unknown
): Effect.Effect<FormatterConfig, SongSearchError, never> => Effect.gen(function* () {
    if (!config || typeof config !== 'object') {
        return {};
    }

    const typedConfig = config as Partial<FormatterConfig>;
    const validated: FormatterConfig = {};

    // Validate limit
    if (typedConfig.limit !== undefined) {
        if (typeof typedConfig.limit !== 'number' || typedConfig.limit < 0) {
            return yield* Effect.fail(new DataTransformationError({
                operation: "validateFormatterConfig",
                message: "Limit must be a non-negative number",
                cause: { provided: typedConfig.limit }
            }));
        }
        validated.limit = Math.floor(typedConfig.limit);
    }

    // Validate boolean flags
    if (typedConfig.groupByBaseTitle !== undefined) {
        validated.groupByBaseTitle = Boolean(typedConfig.groupByBaseTitle);
    }

    if (typedConfig.prioritizeRegularSongs !== undefined) {
        validated.prioritizeRegularSongs = Boolean(typedConfig.prioritizeRegularSongs);
    }

    return validated;
});
