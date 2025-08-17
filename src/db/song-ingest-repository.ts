import { SongIngestRepository, IngestError } from "@/contracts/song-ingest-repository";
import { Layer, Effect } from "effect";
import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./schemas/musics";
import type { ArcadeSongInfo, Song } from "@/contracts/arcade-song-info";

// --- Helper Functions for Utage Processing ---
function normalizeTitle(title: string, songId: string): { baseTitle: string; normalizedTitle: string } {
  // Remove utage prefixes/suffixes from title and songId
  let baseTitle = title;
  
  // Handle common utage patterns
  if (songId.includes('[宴]')) {
    baseTitle = songId.replace('[宴]', '').trim();
  } else if (songId.includes('(宴)')) {
    baseTitle = songId.replace('(宴)', '').trim();
  }
  
  // Further normalization for search (remove special characters, convert to lowercase, etc.)
  const normalizedTitle = baseTitle
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
    
  return { baseTitle, normalizedTitle };
}

function isUtage(categoryId: string): boolean {
  return categoryId === '宴会場';
}

export const SongIngestRepositoryLive = Layer.succeed(SongIngestRepository, {
    ingestSongJacket: (data) => Effect.gen(function* () {
        yield* Effect.log(`Ingesting ${data.length} song jackets...`);

        yield* Effect.tryPromise({
            try: async () => {
                await db.transaction(async (tx) => {
                    for (const jacket of data) {
                        await tx.insert(schema.musicJacket)
                            .values({
                                songTitle: jacket.title,
                                imageURL: jacket.image_url
                            })
                            .onDuplicateKeyUpdate({
                                set: {
                                    imageURL: jacket.image_url
                                }
                            });
                    }
                });

                await db.transaction(async (tx) => {
                    for (const jacket of data) {
                        await tx.update(schema.songs)
                            .set({
                                r2ImageUrl: `https://otogesong-blob.onebyteworks.my.id/maimai/${jacket.image_url}`
                            })
                            .where(eq(schema.songs.title, jacket.title));
                    }
                });
            },
            catch: (error) => new IngestError({ 
                message: `Failed to ingest song jackets: ${error instanceof Error ? error.message : String(error)}` 
            })
        });

        yield* Effect.log("✅ Song jackets ingested successfully!");
    }),
    ingestData: (data) => Effect.gen(function* () {
        yield* Effect.log(`Found ${data.songs.length} songs. Beginning database transaction...`);

        yield* Effect.tryPromise({
            try: async () => {
                // Use a Transaction for Performance and Safety
                await db.transaction(async (tx) => {
                    console.log("Populating lookup tables...");

                    // Clear all existing utage relationships for re-computation
                    console.log("Clearing old utage relationships for re-computation...");
                    await tx.delete(schema.utageRelationships);

                    // Populate Lookup Tables (Categories, Versions, Types, Difficulties)
                    // Use onDuplicateKeyUpdate for MySQL
                    if (data.categories.length > 0) {
                        for (const c of data.categories) {
                            await tx.insert(schema.categories)
                                .values({ id: c.category })
                                .onDuplicateKeyUpdate({ set: { id: c.category } });
                        }
                    }

                    if (data.versions.length > 0) {
                        for (const v of data.versions) {
                            await tx.insert(schema.versions)
                                .values({ id: v.version, abbr: v.abbr })
                                .onDuplicateKeyUpdate({ set: { abbr: v.abbr } });
                        }
                    }

                    if (data.types.length > 0) {
                        for (const t of data.types) {
                            await tx.insert(schema.types)
                                .values({ 
                                    id: t.type, 
                                    name: t.name, 
                                    abbr: t.abbr, 
                                    iconUrl: t.iconUrl, 
                                    iconHeight: t.iconHeight 
                                })
                                .onDuplicateKeyUpdate({ 
                                    set: { 
                                        name: t.name,
                                        abbr: t.abbr,
                                        iconUrl: t.iconUrl,
                                        iconHeight: t.iconHeight
                                    } 
                                });
                        }
                    }

                    if (data.difficulties.length > 0) {
                        for (const d of data.difficulties) {
                            await tx.insert(schema.difficulties)
                                .values({ 
                                    id: d.difficulty, 
                                    name: d.name, 
                                    color: d.color 
                                })
                                .onDuplicateKeyUpdate({ 
                                    set: { 
                                        name: d.name,
                                        color: d.color
                                    } 
                                });
                        }
                    }

                    if (data.regions.length > 0) {
                        for (const r of data.regions) {
                            await tx.insert(schema.regions)
                                .values({ 
                                    id: r.region, 
                                    name: r.name 
                                })
                                .onDuplicateKeyUpdate({ 
                                    set: { 
                                        name: r.name
                                    } 
                                });
                        }
                    }
                    console.log("Lookup tables populated.");

                    console.log("Processing and upserting songs with utage analysis...");
                    
                    // Process and Insert Songs with Utage-specific fields
                    const songRelationships: Array<{
                        primarySongId: string;
                        utageSongId: string;
                        relationshipType: 'same_title' | 'title_variant' | 'id_contains';
                    }> = [];

                    for (const song of data.songs) {
                        const { baseTitle, normalizedTitle } = normalizeTitle(song.title, song.songId);
                        const utageFlag = isUtage(song.category);

                        // Insert/Update the main song record
                        const songData = {
                            id: song.songId,
                            internalProcessId: 0,
                            title: song.title,
                            artist: song.artist,
                            imageName: song.imageName,
                            releaseDate: song.releaseDate,
                            isNew: song.isNew,
                            isLocked: song.isLocked,
                            bpm: song.bpm?.toString(),
                            comment: song.comment,
                            categoryId: song.category,
                            versionId: song.version,
                            isUtage: utageFlag,
                            baseTitle: baseTitle,
                            normalizedTitle: normalizedTitle,
                        };

                        await tx.insert(schema.songs).values(songData)
                            .onDuplicateKeyUpdate({
                                set: {
                                    r2ImageUrl: `https://otogesong-blob.onebyteworks.my.id/404-v1.png`,
                                    title: songData.title,
                                    artist: songData.artist,
                                    imageName: songData.imageName,
                                    releaseDate: songData.releaseDate,
                                    isNew: songData.isNew,
                                    isLocked: songData.isLocked,
                                    bpm: songData.bpm,
                                    comment: songData.comment,
                                    categoryId: songData.categoryId,
                                    versionId: songData.versionId,
                                    isUtage: songData.isUtage,
                                    baseTitle: songData.baseTitle,
                                    normalizedTitle: songData.normalizedTitle
                                }
                            });

                        // Clear existing sheets and region overrides to handle updates
                        const existingSheets = await tx.select({ id: schema.sheets.id })
                            .from(schema.sheets)
                            .where(eq(schema.sheets.songId, song.songId));
                        
                        if (existingSheets.length > 0) {
                            const sheetIds = existingSheets.map(s => s.id);
                            if (sheetIds.length > 0) {
                                await tx.delete(schema.regionOverrides)
                                    .where(inArray(schema.regionOverrides.sheetId, sheetIds));
                            }
                            await tx.delete(schema.sheets)
                                .where(eq(schema.sheets.songId, song.songId));
                        }

                        // Insert sheets for the song
                        if (song.sheets && song.sheets.length > 0) {
                            for (const sheet of song.sheets) {
                                const sheetInsert = await tx.insert(schema.sheets).values({
                                    songId: song.songId,
                                    typeId: sheet.type,
                                    difficultyId: sheet.difficulty,
                                    level: sheet.level,
                                    levelValue: sheet.levelValue.toString(),
                                    internalLevel: sheet.internalLevel,
                                    internalLevelValue: sheet.internalLevelValue.toString(),
                                    noteDesigner: sheet.noteDesigner,
                                    isSpecial: sheet.isSpecial,
                                    version: sheet.version,
                                    // Flatten note counts
                                    notesTap: sheet.noteCounts.tap,
                                    notesHold: sheet.noteCounts.hold,
                                    notesSlide: sheet.noteCounts.slide,
                                    notesTouch: sheet.noteCounts.touch,
                                    notesBreak: sheet.noteCounts.break,
                                    notesTotal: sheet.noteCounts.total,
                                    // Flatten region availability
                                    regionJp: sheet.regions.jp,
                                    regionIntl: sheet.regions.intl,
                                    regionCn: sheet.regions.cn,
                                });

                                // Get the inserted sheet ID from the result
                                const sheetId = (sheetInsert as any).insertId;

                                // Handle region overrides
                                if (sheetId && sheet.regionOverrides.intl) {
                                    await tx.insert(schema.regionOverrides).values({
                                        sheetId: Number(sheetId),
                                        region: 'intl',
                                        versionId: sheet.regionOverrides.intl.version,
                                        level: sheet.regionOverrides.intl.level,
                                        levelValue: sheet.regionOverrides.intl.levelValue?.toString()
                                    }).onDuplicateKeyUpdate({
                                        set: {
                                            versionId: sheet.regionOverrides.intl.version,
                                            level: sheet.regionOverrides.intl.level,
                                            levelValue: sheet.regionOverrides.intl.levelValue?.toString()
                                        }
                                    });
                                }
                            }
                        }
                    }

                    console.log("Computing utage relationships...");
                    
                    // Compute utage relationships
                    // Group songs by base title for relationship analysis
                    const songsByBaseTitle = new Map<string, Song[]>();
                    data.songs.forEach(song => {
                        const { baseTitle } = normalizeTitle(song.title, song.songId);
                        if (!songsByBaseTitle.has(baseTitle)) {
                            songsByBaseTitle.set(baseTitle, []);
                        }
                        songsByBaseTitle.get(baseTitle)!.push(song);
                    });

                    // Find relationships between regular and utage songs
                    songsByBaseTitle.forEach((songs, baseTitle) => {
                        const regularSongs = songs.filter(s => !isUtage(s.category));
                        const utageSongs = songs.filter(s => isUtage(s.category));

                        // Create relationships between regular songs and their utage variants
                        regularSongs.forEach(regularSong => {
                            utageSongs.forEach(utageSong => {
                                let relationshipType: 'same_title' | 'title_variant' | 'id_contains';
                                
                                if (regularSong.title === utageSong.title) {
                                    relationshipType = 'same_title';
                                } else if (utageSong.songId.includes(regularSong.title) || utageSong.songId.includes(regularSong.songId)) {
                                    relationshipType = 'id_contains';
                                } else {
                                    relationshipType = 'title_variant';
                                }

                                songRelationships.push({
                                    primarySongId: regularSong.songId,
                                    utageSongId: utageSong.songId,
                                    relationshipType: relationshipType
                                });
                            });
                        });
                    });

                    // Insert utage relationships
                    if (songRelationships.length > 0) {
                        console.log(`Inserting ${songRelationships.length} utage relationships...`);
                        await tx.insert(schema.utageRelationships)
                            .values(songRelationships);
                    }

                    console.log("All songs, sheets, and utage relationships have been processed.");
                }); // End of transaction
            },
            catch: (error) => new IngestError({ 
                message: `Database transaction failed: ${error instanceof Error ? error.message : String(error)}` 
            })
        });

        yield* Effect.log("✅ Ingestion complete! Database is now populated with utage relationship optimization.");
    })
})