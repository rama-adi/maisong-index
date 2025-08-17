import type { Song } from "@/contracts/arcade-song-info";
import {
    SongSearchRepository,
    type SearchResult,
    DatabaseConnectionError,
    SheetQueryError,
    SearchQueryError,
    DataTransformationError,
    SongNotFoundError,
    type SongSearchError
} from "@/contracts/song-search-repository";
import { Effect, Layer } from "effect";
import { eq, and, or, like, desc, asc, sql } from "drizzle-orm";
import { db } from "./db";
import * as musicSchema from "@/db/schemas/musics";

// Helper function to convert database song to formatted song
const dbSongToFormattedSong = (dbSong: typeof musicSchema.songs.$inferSelect, sheetFilters?: any[]): Effect.Effect<Song, SongSearchError, never> => Effect.gen(function* () {
    if (!dbSong?.id) {
        return yield* Effect.fail(new DataTransformationError({
            operation: "dbSongToFormattedSong",
            message: "Invalid song data: missing ID",
            cause: { dbSong }
        }));
    }

    // Fetch sheets for this song with proper error handling and optional filtering
    const baseSheetQuery = db
        .select()
        .from(musicSchema.sheets)
        .leftJoin(musicSchema.types, eq(musicSchema.sheets.typeId, musicSchema.types.id))
        .leftJoin(musicSchema.difficulties, eq(musicSchema.sheets.difficultyId, musicSchema.difficulties.id))
        .where(
            sheetFilters && sheetFilters.length > 0
                ? and(eq(musicSchema.sheets.songId, dbSong.id), ...sheetFilters)
                : eq(musicSchema.sheets.songId, dbSong.id)
        );

    const sheets = yield* Effect.tryPromise({
        try: () => baseSheetQuery,
        catch: (cause) => new SheetQueryError({
            songId: dbSong.id,
            message: "Failed to fetch song sheets from database",
            cause
        })
    });

    // Safely convert BPM to number
    let bpm: number | undefined = undefined;
    if (dbSong.bpm) {
        const bpmNumber = Number(dbSong.bpm);
        if (isNaN(bpmNumber)) {
            yield* Effect.log(`Warning: Invalid BPM value for song ${dbSong.id}: ${dbSong.bpm}`);
        } else {
            bpm = bpmNumber;
        }
    }

    // Transform sheets with error handling
    const transformedSheets = yield* Effect.try({
        try: () => sheets.map((sheet: any) => {
            // Normalize type names for compatibility with the UI
            let type = sheet.types?.name || sheet.sheets.typeId;
            if (type === 'DX（でらっくす）') type = 'dx';
            else if (type === 'STD（スタンダード）') type = 'std';
            else if (type === '宴（宴会場）') type = 'utage';

            // Normalize difficulty names
            let difficulty = (sheet.difficulties?.name || sheet.sheets.difficultyId).toLowerCase();
            if (difficulty === 're:master') difficulty = 'remaster';

            return {
                type,
                difficulty,
                level: sheet.sheets.level,
                levelValue: sheet.sheets.levelValue,
                internalLevel: sheet.sheets.internalLevel || undefined,
                internalLevelValue: sheet.sheets.internalLevelValue,
                noteDesigner: sheet.sheets.noteDesigner || undefined,
                noteCounts: {
                    tap: sheet.sheets.notesTap || 0,
                    hold: sheet.sheets.notesHold || 0,
                    slide: sheet.sheets.notesSlide || 0,
                    touch: sheet.sheets.notesTouch || 0,
                    break: sheet.sheets.notesBreak || 0,
                    total: sheet.sheets.notesTotal || 0
                },
                regions: {
                    jp: sheet.sheets.regionJp,
                    intl: sheet.sheets.regionIntl,
                    cn: sheet.sheets.regionCn
                },
                regionOverrides: {
                    intl: {}
                },
                isSpecial: sheet.sheets.isSpecial,
                version: sheet.sheets.version || undefined
            };
        }).filter((sheet: any) => sheet.level !== '*'),
        catch: (cause) => new DataTransformationError({
            operation: "transformSheets",
            songId: dbSong.id,
            message: "Failed to transform sheet data",
            cause
        })
    });

    return {
        internalProcessId: dbSong.internalProcessId || 0,
        songId: dbSong.id,
        category: dbSong.categoryId,
        title: dbSong.title,
        artist: dbSong.artist,
        bpm,
        imageName: dbSong.imageName,
        r2ImageUrl: dbSong.r2ImageUrl || undefined,
        version: dbSong.versionId,
        releaseDate: dbSong.releaseDate,
        isNew: dbSong.isNew,
        isLocked: dbSong.isLocked,
        comment: dbSong.comment || undefined,
        sheets: transformedSheets
    };
});

export const SongSearchRepositoryLive = Layer.succeed(SongSearchRepository, {
    dbSongToFormattedSong,

    searchByMeta: (meta) => Effect.gen(function* () {
        const {
            artist,
            minLevel,
            maxLevel,
            minLevelDisplay,
            maxLevelDisplay,
            minBpm,
            maxBpm,
            category,
            version,
            isNew,
            isLocked,
            isUtage,
            type,
            difficulty,
            noteDesigner,
            isSpecial,
            hasRegionJp,
            hasRegionIntl,
            hasRegionCn,
            limit = 50
        } = meta;

        yield* Effect.log(`Searching songs by meta filters: ${JSON.stringify(meta)}`);

        // Build song-level conditions
        const songConditions: any[] = [];

        if (artist !== null && artist !== undefined) {
            songConditions.push(like(musicSchema.songs.artist, `%${artist}%`));
        }

        if (minBpm !== null && minBpm !== undefined) {
            songConditions.push(sql`CAST(${musicSchema.songs.bpm} AS DECIMAL) >= ${minBpm}`);
        }

        if (maxBpm !== null && maxBpm !== undefined) {
            songConditions.push(sql`CAST(${musicSchema.songs.bpm} AS DECIMAL) <= ${maxBpm}`);
        }

        if (category !== null && category !== undefined) {
            songConditions.push(eq(musicSchema.songs.categoryId, category));
        }

        if (version !== null && version !== undefined) {
            songConditions.push(eq(musicSchema.songs.versionId, version));
        }

        if (isNew !== null && isNew !== undefined) {
            songConditions.push(eq(musicSchema.songs.isNew, isNew));
        }

        if (isLocked !== null && isLocked !== undefined) {
            songConditions.push(eq(musicSchema.songs.isLocked, isLocked));
        }

        if (isUtage !== null && isUtage !== undefined) {
            songConditions.push(eq(musicSchema.songs.isUtage, isUtage));
        }

        // Build sheet-level conditions for when we need to filter by sheet metadata
        const sheetConditions: any[] = [];
        const needSheetJoin = type !== null && type !== undefined ||
                             difficulty !== null && difficulty !== undefined ||
                             minLevel !== null && minLevel !== undefined ||
                             maxLevel !== null && maxLevel !== undefined ||
                             minLevelDisplay !== null && minLevelDisplay !== undefined ||
                             maxLevelDisplay !== null && maxLevelDisplay !== undefined ||
                             noteDesigner !== null && noteDesigner !== undefined ||
                             isSpecial !== null && isSpecial !== undefined ||
                             hasRegionJp !== null && hasRegionJp !== undefined ||
                             hasRegionIntl !== null && hasRegionIntl !== undefined ||
                             hasRegionCn !== null && hasRegionCn !== undefined;

        if (type !== null && type !== undefined) {
            sheetConditions.push(eq(musicSchema.sheets.typeId, type));
        }

        if (difficulty !== null && difficulty !== undefined) {
            sheetConditions.push(eq(musicSchema.sheets.difficultyId, difficulty));
        }

        // Helper function to generate level display range
        const generateLevelDisplayRange = (min: string, max: string): string[] => {
            const levels: string[] = [];
            const minNum = parseInt(min);
            const maxNum = parseInt(max.replace('+', ''));
            
            for (let i = minNum; i <= maxNum; i++) {
                levels.push(i.toString());
                levels.push(i.toString() + '+');
            }
            return levels;
        };

        // Handle level display range filters
        if (minLevelDisplay !== null && minLevelDisplay !== undefined && maxLevelDisplay !== null && maxLevelDisplay !== undefined) {
            const levelRange = generateLevelDisplayRange(minLevelDisplay, maxLevelDisplay);
            sheetConditions.push(sql`${musicSchema.sheets.level} IN (${levelRange.map(l => `'${l}'`).join(',')})`);
        } else if (minLevelDisplay !== null && minLevelDisplay !== undefined) {
            // Only min provided - search for that exact level (both regular and +)
            const baseLevel = minLevelDisplay.replace('+', '');
            sheetConditions.push(sql`${musicSchema.sheets.level} IN ('${baseLevel}', '${baseLevel}+')`);
        } else if (maxLevelDisplay !== null && maxLevelDisplay !== undefined) {
            // Only max provided - search for that exact level (both regular and +)
            const baseLevel = maxLevelDisplay.replace('+', '');
            sheetConditions.push(sql`${musicSchema.sheets.level} IN ('${baseLevel}', '${baseLevel}+')`);
        }

        if (noteDesigner !== null && noteDesigner !== undefined) {
            sheetConditions.push(like(musicSchema.sheets.noteDesigner, `%${noteDesigner}%`));
        }

        if (isSpecial !== null && isSpecial !== undefined) {
            sheetConditions.push(eq(musicSchema.sheets.isSpecial, isSpecial));
        }

        if (hasRegionJp !== null && hasRegionJp !== undefined) {
            sheetConditions.push(eq(musicSchema.sheets.regionJp, hasRegionJp));
        }

        if (hasRegionIntl !== null && hasRegionIntl !== undefined) {
            sheetConditions.push(eq(musicSchema.sheets.regionIntl, hasRegionIntl));
        }

        if (hasRegionCn !== null && hasRegionCn !== undefined) {
            sheetConditions.push(eq(musicSchema.sheets.regionCn, hasRegionCn));
        }

        // Handle internal level range filters (1.0 - 15.0)
        if (minLevel !== null && minLevel !== undefined && maxLevel !== null && maxLevel !== undefined) {
            // Both min and max provided - range search
            sheetConditions.push(sql`${musicSchema.sheets.internalLevelValue} >= ${minLevel} AND ${musicSchema.sheets.internalLevelValue} <= ${maxLevel}`);
        } else if (minLevel !== null && minLevel !== undefined) {
            // Only min provided - search for that exact level
            sheetConditions.push(sql`${musicSchema.sheets.internalLevelValue} = ${minLevel}`);
        } else if (maxLevel !== null && maxLevel !== undefined) {
            // Only max provided - search for that exact level
            sheetConditions.push(sql`${musicSchema.sheets.internalLevelValue} = ${maxLevel}`);
        }

        let matchingSongs;

        if (needSheetJoin) {
            // Query with sheet join when we have sheet-level filters
            matchingSongs = yield* Effect.tryPromise({
                try: () => db
                    .selectDistinct({ songs: musicSchema.songs })
                    .from(musicSchema.songs)
                    .innerJoin(musicSchema.sheets, eq(musicSchema.songs.id, musicSchema.sheets.songId))
                    .where(
                        and(
                            songConditions.length > 0 ? and(...songConditions) : undefined,
                            sheetConditions.length > 0 ? and(...sheetConditions) : undefined
                        )
                    )
                    .orderBy(asc(musicSchema.songs.title))
                    .limit(limit * 3), // Get more to account for grouping
                catch: (cause) => new SearchQueryError({
                    titles: ["meta search with sheets"],
                    message: "Failed to execute meta search query with sheet filters",
                    cause
                })
            });
        } else {
            // Simple song-only query when no sheet filters are needed
            matchingSongs = yield* Effect.tryPromise({
                try: () => db
                    .select()
                    .from(musicSchema.songs)
                    .where(songConditions.length > 0 ? and(...songConditions) : undefined)
                    .orderBy(asc(musicSchema.songs.title))
                    .limit(limit * 3), // Get more to account for grouping
                catch: (cause) => new SearchQueryError({
                    titles: ["meta search"],
                    message: "Failed to execute meta search query",
                    cause
                })
            });
        }

        // Extract songs from results (handle both query types)
        const songs = needSheetJoin 
            ? matchingSongs.map((result: any) => result.songs)
            : matchingSongs;

        yield* Effect.log(`Found ${songs.length} matching songs`);

        // Group songs same way as searchByTitle to handle utage relationships
        const regularSongs = songs.filter(song => !song.isUtage);
        const utageSongs = songs.filter(song => song.isUtage);

        const results: SearchResult[] = [];
        const processedSongs = new Set<string>();

        // Process regular songs as primary with their utage variants
        for (const regularSong of regularSongs.slice(0, limit)) {
            if (processedSongs.has(regularSong.id)) continue;

            // Get pre-computed utage variants for this regular song
            const utageVariants = yield* Effect.tryPromise({
                try: () => db
                    .select()
                    .from(musicSchema.songs)
                    .innerJoin(
                        musicSchema.utageRelationships,
                        eq(musicSchema.songs.id, musicSchema.utageRelationships.utageSongId)
                    )
                    .where(eq(musicSchema.utageRelationships.primarySongId, regularSong.id))
                    .orderBy(desc(musicSchema.songs.releaseDate)),
                catch: (cause) => new SearchQueryError({
                    titles: ["meta search"],
                    message: "Failed to fetch utage relationships",
                    cause
                })
            });

            // Deduplicate utage variants by comment (keeping newest)
            let deduplicatedUtages = utageVariants.reduce((acc, item) => {
                const utage = item.songs;
                const existing = acc.find(u => u.comment === utage.comment);
                if (!existing) {
                    acc.push(utage);
                } else if (new Date(utage.releaseDate) > new Date(existing.releaseDate)) {
                    const index = acc.indexOf(existing);
                    acc[index] = utage;
                }
                return acc;
            }, [] as typeof utageVariants[0]['songs'][]);

            // Filter out utages with "*" level before processing
            const filteredUtages: Song[] = [];
            for (const utage of deduplicatedUtages) {
                const utageSong = yield* dbSongToFormattedSong(utage, needSheetJoin ? sheetConditions : undefined);
                // Check if this utage has any valid (non-"*") sheets
                const hasValidSheets = utageSong.sheets.length > 0;
                if (hasValidSheets) {
                    filteredUtages.push(utageSong);
                }
            }

            results.push({
                primary: yield* dbSongToFormattedSong(regularSong, needSheetJoin ? sheetConditions : undefined),
                utages: filteredUtages
            });

            processedSongs.add(regularSong.id);
            deduplicatedUtages.forEach(utage => processedSongs.add(utage.id));
        }

        // Handle orphaned utage songs if no regular songs found and we found utage songs
        if (results.length === 0 && utageSongs.length > 0) {
            for (const utageSong of utageSongs.slice(0, limit)) {
                if (processedSongs.has(utageSong.id)) continue;

                results.push({
                    primary: yield* dbSongToFormattedSong(utageSong, needSheetJoin ? sheetConditions : undefined),
                    utages: []
                });
                processedSongs.add(utageSong.id);
            }
        }

        const finalResults = results.slice(0, limit);
        yield* Effect.log(`Returning ${finalResults.length} meta search results`);
        
        return finalResults;
    }),
    findSongByInternalId: (internalId: number): Effect.Effect<Song | null, SongSearchError, never> => Effect.gen(function* () {
        yield* Effect.log(`Finding song by internal ID: ${internalId}`);
        
        const dbSong = yield* Effect.tryPromise({
            try: () => db
                .select()
                .from(musicSchema.songs)
                .where(eq(musicSchema.songs.internalProcessId, internalId))
                .limit(1)
                .then(results => results[0] || null),
            catch: (cause) => new SearchQueryError({
                titles: [`internal_id:${internalId}`],
                message: "Failed to find song by internal ID",
                cause
            })
        });

        if (!dbSong) {
            return null;
        }

        return yield* dbSongToFormattedSong(dbSong);
    }),

    searchByTitle: (title: string, limit: number = 10): Effect.Effect<SearchResult[], SongSearchError, never> => Effect.gen(function* () {
        yield* Effect.log(`Searching songs by title: "${title}" with limit: ${limit}`);
        
        const normalizedSearch = title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();

        // 1. Search for songs using database indexes with proper ordering
        const matchingSongs = yield* Effect.tryPromise({
            try: () => db
                .select()
                .from(musicSchema.songs)
                .where(
                    or(
                        like(musicSchema.songs.title, `%${title}%`),
                        like(musicSchema.songs.baseTitle, `%${title}%`),
                        like(musicSchema.songs.normalizedTitle, `%${normalizedSearch}%`),
                        eq(musicSchema.songs.title, title), // Exact match
                        eq(musicSchema.songs.baseTitle, title),
                        // Additional flexible matching like the old script
                        like(musicSchema.songs.id, `%${title}%`), // songId contains title
                        like(musicSchema.songs.title, `%${normalizedSearch}%`)
                    )
                )
                .orderBy(
                    desc(sql`
                        CASE 
                          WHEN ${musicSchema.songs.title} = ${title} THEN 5
                          WHEN ${musicSchema.songs.baseTitle} = ${title} THEN 4
                          WHEN ${musicSchema.songs.title} LIKE ${title + '%'} THEN 3
                          WHEN ${musicSchema.songs.baseTitle} LIKE ${title + '%'} THEN 2
                          ELSE 1
                        END
                    `),
                    asc(musicSchema.songs.title)
                )
                .limit(limit * 3), // Get more results to account for grouping
            catch: (cause) => new SearchQueryError({
                titles: [title],
                message: "Failed to execute song search query",
                cause
            })
        });

        yield* Effect.log(`Found ${matchingSongs.length} matching songs`);

        // 2. Separate regular and utage songs
        const regularSongs = matchingSongs.filter(song => !song.isUtage);
        const utageSongs = matchingSongs.filter(song => song.isUtage);

        const results: SearchResult[] = [];
        const processedSongs = new Set<string>();

        // 3. Process regular songs as primary with their utage variants
        for (const regularSong of regularSongs.slice(0, limit)) {
            if (processedSongs.has(regularSong.id)) continue;

            // Get pre-computed utage variants for this regular song
            const utageVariants = yield* Effect.tryPromise({
                try: () => db
                    .select()
                    .from(musicSchema.songs)
                    .innerJoin(
                        musicSchema.utageRelationships,
                        eq(musicSchema.songs.id, musicSchema.utageRelationships.utageSongId)
                    )
                    .where(eq(musicSchema.utageRelationships.primarySongId, regularSong.id))
                    .orderBy(desc(musicSchema.songs.releaseDate)),
                catch: (cause) => new SearchQueryError({
                    titles: [title],
                    message: "Failed to fetch utage relationships",
                    cause
                })
            });

            // Deduplicate utage variants by comment (keeping newest)
            let deduplicatedUtages = utageVariants.reduce((acc, item) => {
                const utage = item.songs;
                const existing = acc.find(u => u.comment === utage.comment);
                if (!existing) {
                    acc.push(utage);
                } else if (new Date(utage.releaseDate) > new Date(existing.releaseDate)) {
                    const index = acc.indexOf(existing);
                    acc[index] = utage;
                }
                return acc;
            }, [] as typeof utageVariants[0]['songs'][]);

            // If no pre-computed relationships found, try flexible matching like old script
            if (deduplicatedUtages.length === 0) {
                const flexibleUtages = yield* Effect.tryPromise({
                    try: () => db
                        .select()
                        .from(musicSchema.songs)
                        .where(
                            and(
                                eq(musicSchema.songs.isUtage, true), // Is utage
                                or(
                                    eq(musicSchema.songs.title, regularSong.title), // Same title
                                    like(musicSchema.songs.id, `%${regularSong.title}%`), // songId contains title
                                    eq(musicSchema.songs.baseTitle, regularSong.baseTitle) // Same base title
                                )
                            )
                        )
                        .orderBy(desc(musicSchema.songs.releaseDate)),
                    catch: (cause) => new SearchQueryError({
                        titles: [title],
                        message: "Failed to fetch flexible utage matches",
                        cause
                    })
                });

                deduplicatedUtages = flexibleUtages.reduce((acc, utage) => {
                    const existing = acc.find(u => u.comment === utage.comment);
                    if (!existing) {
                        acc.push(utage);
                    } else if (new Date(utage.releaseDate) > new Date(existing.releaseDate)) {
                        const index = acc.indexOf(existing);
                        acc[index] = utage;
                    }
                    return acc;
                }, [] as typeof flexibleUtages);
            }

            // Filter out utages with "*" level before processing
            const filteredUtages: Song[] = [];
            for (const utage of deduplicatedUtages) {
                const utageSong = yield* dbSongToFormattedSong(utage);
                // Check if this utage has any valid (non-"*") sheets
                const hasValidSheets = utageSong.sheets.length > 0;
                if (hasValidSheets) {
                    filteredUtages.push(utageSong);
                }
            }

            results.push({
                primary: yield* dbSongToFormattedSong(regularSong),
                utages: filteredUtages
            });

            processedSongs.add(regularSong.id);
            deduplicatedUtages.forEach(utage => processedSongs.add(utage.id));
        }

        // 4. Handle orphaned utage songs if no regular songs found
        if (results.length === 0 && utageSongs.length > 0) {
            for (const utageSong of utageSongs.slice(0, limit)) {
                if (processedSongs.has(utageSong.id)) continue;

                // Try to find regular counterpart
                const regularCounterpart = yield* Effect.tryPromise({
                    try: () => db
                        .select()
                        .from(musicSchema.songs)
                        .innerJoin(
                            musicSchema.utageRelationships,
                            eq(musicSchema.songs.id, musicSchema.utageRelationships.primarySongId)
                        )
                        .where(eq(musicSchema.utageRelationships.utageSongId, utageSong.id))
                        .limit(1),
                    catch: (cause) => new SearchQueryError({
                        titles: [title],
                        message: "Failed to find regular counterpart for utage song",
                        cause
                    })
                });

                if (regularCounterpart.length > 0 && regularCounterpart[0]) {
                    const regular = regularCounterpart[0].songs;
                    if (!regular) continue;

                    // Get all utage variants for this regular song
                    const allUtageVariants = yield* Effect.tryPromise({
                        try: () => db
                            .select()
                            .from(musicSchema.songs)
                            .innerJoin(
                                musicSchema.utageRelationships,
                                eq(musicSchema.songs.id, musicSchema.utageRelationships.utageSongId)
                            )
                            .where(eq(musicSchema.utageRelationships.primarySongId, regular.id))
                            .orderBy(desc(musicSchema.songs.releaseDate)),
                        catch: (cause) => new SearchQueryError({
                            titles: [title],
                            message: "Failed to fetch all utage variants",
                            cause
                        })
                    });

                    // Deduplicate by comment
                    const deduplicatedUtages = allUtageVariants.reduce((acc, item) => {
                        const utage = item.songs;
                        const existing = acc.find(u => u.comment === utage.comment);
                        if (!existing) {
                            acc.push(utage);
                        } else if (new Date(utage.releaseDate) > new Date(existing.releaseDate)) {
                            const index = acc.indexOf(existing);
                            acc[index] = utage;
                        }
                        return acc;
                    }, [] as typeof allUtageVariants[0]['songs'][]);

                    // Filter out utages with "*" level before processing
                    const filteredUtages: Song[] = [];
                    for (const utage of deduplicatedUtages) {
                        const utageSong = yield* dbSongToFormattedSong(utage);
                        // Check if this utage has any valid (non-"*") sheets
                        const hasValidSheets = utageSong.sheets.length > 0;
                        if (hasValidSheets) {
                            filteredUtages.push(utageSong);
                        }
                    }

                    results.push({
                        primary: yield* dbSongToFormattedSong(regular),
                        utages: filteredUtages
                    });

                    processedSongs.add(regular.id);
                    deduplicatedUtages.forEach(utage => processedSongs.add(utage.id));
                } else {
                    // No regular counterpart found, use utage as primary
                    results.push({
                        primary: yield* dbSongToFormattedSong(utageSong),
                        utages: []
                    });
                    processedSongs.add(utageSong.id);
                }
            }
        }

        const finalResults = results.slice(0, limit);
        yield* Effect.log(`Returning ${finalResults.length} search results`);
        
        return finalResults;
    })
});