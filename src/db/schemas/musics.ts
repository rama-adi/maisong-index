import { mysqlTable, varchar, int, decimal, index, uniqueIndex, boolean } from 'drizzle-orm/mysql-core';
import { relations } from 'drizzle-orm';

// -- LOOKUP TABLES --
export const categories = mysqlTable('categories', {
    id: varchar('id', { length: 255 }).primaryKey(),
});

export const versions = mysqlTable('versions', {
    id: varchar('id', { length: 255 }).primaryKey(),
    abbr: varchar('abbr', { length: 255 }),
});

export const types = mysqlTable('types', {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 255 }),
    abbr: varchar('abbr', { length: 255 }),
    iconUrl: varchar('icon_url', { length: 500 }),
    iconHeight: int('icon_height'),
});

export const difficulties = mysqlTable('difficulties', {
    id: varchar('id', { length: 255 }).primaryKey(),
    name: varchar('name', { length: 255 }),
    color: varchar('color', { length: 255 }),
});

export const musicJacket = mysqlTable('music_jackets', {
    id: int().autoincrement().primaryKey(),
    songTitle: varchar('song_title', { length: 500 }),
    imageURL: varchar('image_url', {length: 500})
})

export const regions = mysqlTable('regions', {
    id: varchar('id', { length: 255 }).primaryKey(), // Corresponds to region
    name: varchar('name', { length: 255 }).notNull(),
});

// -- MAIN DATA TABLES --
export const songs = mysqlTable('songs', {
    id: varchar('id', { length: 255 }).primaryKey(), // Corresponds to songId
    internalProcessId: int('internal_process_id').default(0),
    title: varchar('title', { length: 500 }).notNull(),
    artist: varchar('artist', { length: 500 }).notNull(),
    imageName: varchar('image_name', { length: 255 }).notNull(),
    r2ImageUrl: varchar('r2_image_url', { length: 255 }),
    releaseDate: varchar('release_date', { length: 255 }).notNull(),
    isNew: boolean('is_new').notNull(),
    isLocked: boolean('is_locked').notNull(),
    bpm: decimal('bpm', { precision: 8, scale: 3 }),
    comment: varchar('comment', { length: 1000 }),
    categoryId: varchar('category_id', { length: 255 }).notNull().references(() => categories.id),
    versionId: varchar('version_id', { length: 255 }).notNull().references(() => versions.id),
    // Utage-specific computed fields
    isUtage: boolean('is_utage').notNull(), // true if category is '宴会場'
    baseTitle: varchar('base_title', { length: 500 }).notNull(), // cleaned title for matching (removes [宴], (宴) prefixes)
    normalizedTitle: varchar('normalized_title', { length: 500 }).notNull(), // further normalized for search
}, (table) => [
    // Indexes for utage song queries
    index('internal_process_id_idx').on(table.internalProcessId),
    index('songs_category_idx').on(table.categoryId),
    index('songs_is_utage_idx').on(table.isUtage),
    index('songs_title_idx').on(table.title),
    index('songs_base_title_idx').on(table.baseTitle),
    index('songs_normalized_title_idx').on(table.normalizedTitle),
    // Compound index for finding utage variants
    index('songs_base_title_utage_idx').on(table.baseTitle, table.isUtage),
    // Note: Removed comment and release_date indexes due to MySQL 3072-byte key length limit
    // The comment field (varchar 1000) with utf8mb4 encoding can be up to 4000 bytes, exceeding the limit
    // If needed for queries, consider adding a shorter hash-based index or use application-level deduplication
]);

export const sheets = mysqlTable('sheets', {
    id: int('id').primaryKey().autoincrement(),
    songId: varchar('song_id', { length: 255 }).notNull().references(() => songs.id),
    typeId: varchar('type_id', { length: 255 }).notNull().references(() => types.id),
    difficultyId: varchar('difficulty_id', { length: 255 }).notNull().references(() => difficulties.id),
    level: varchar('level', { length: 255 }).notNull(),
    levelValue: decimal('level_value', { precision: 8, scale: 3 }).notNull(),
    internalLevel: varchar('internal_level', { length: 255 }),
    internalLevelValue: decimal('internal_level_value', { precision: 8, scale: 3 }).notNull(),
    noteDesigner: varchar('note_designer', { length: 255 }),
    isSpecial: boolean('is_special').notNull(),
    version: varchar('version', { length: 255 }),
    // Note Counts
    notesTap: int('notes_tap'),
    notesHold: int('notes_hold'),
    notesSlide: int('notes_slide'),
    notesTouch: int('notes_touch'),
    notesBreak: int('notes_break'),
    notesTotal: int('notes_total'),
    // Region Availability
    regionJp: boolean('region_jp').notNull(),
    regionIntl: boolean('region_intl').notNull(),
    regionCn: boolean('region_cn').notNull(),
}, (table) => [
    // Index for finding sheets by song
    index('sheets_song_idx').on(table.songId),
    // Compound index for song + difficulty queries
    index('sheets_song_difficulty_idx').on(table.songId, table.difficultyId),
]);

export const regionOverrides = mysqlTable('region_overrides', {
    id: int('id').primaryKey().autoincrement(),
    sheetId: int('sheet_id').notNull().references(() => sheets.id),
    region: varchar('region', { length: 255 }).notNull(), // 'intl'
    versionId: varchar('version_id', { length: 255 }).references(() => versions.id),
    level: varchar('level', { length: 255 }),
    levelValue: decimal('level_value', { precision: 8, scale: 3 }),
});

// -- UTAGE RELATIONSHIPS TABLE --
// This table pre-computes the relationships between regular songs and their utage variants
export const utageRelationships = mysqlTable('utage_relationships', {
    id: int('id').primaryKey().autoincrement(),
    primarySongId: varchar('primary_song_id', { length: 255 }).notNull().references(() => songs.id),
    utageSongId: varchar('utage_song_id', { length: 255 }).notNull().references(() => songs.id),
    relationshipType: varchar('relationship_type', { length: 255 }).notNull(), // 'same_title', 'title_variant', 'id_contains'
}, (table) => [
    // Indexes for efficient utage relationship queries
    index('utage_primary_idx').on(table.primarySongId),
    index('utage_utage_idx').on(table.utageSongId),
    uniqueIndex('utage_unique_pair_idx').on(table.primarySongId, table.utageSongId),
]);

// -- RELATIONS --

export const songRelations = relations(songs, ({ one, many }) => ({
    category: one(categories, {
        fields: [songs.categoryId],
        references: [categories.id],
    }),
    version: one(versions, {
        fields: [songs.versionId],
        references: [versions.id],
    }),
    sheets: many(sheets),
    // Utage relationships - songs that have this song as their primary
    utageVariants: many(utageRelationships),
    // Relationships where this song is the utage variant
    regularVersions: many(utageRelationships),
}));

export const sheetRelations = relations(sheets, ({ one, many }) => ({
    song: one(songs, {
        fields: [sheets.songId],
        references: [songs.id],
    }),
    type: one(types, {
        fields: [sheets.typeId],
        references: [types.id],
    }),
    difficulty: one(difficulties, {
        fields: [sheets.difficultyId],
        references: [difficulties.id],
    }),
    regionOverrides: many(regionOverrides),
}));

export const regionOverrideRelations = relations(regionOverrides, ({ one }) => ({
    sheet: one(sheets, {
        fields: [regionOverrides.sheetId],
        references: [sheets.id],
    }),
    version: one(versions, {
        fields: [regionOverrides.versionId],
        references: [versions.id],
    })
}));

export const regionRelations = relations(regions, ({ one }) => ({
    // Relations can be added here if needed
}));

export const utageRelationshipRelations = relations(utageRelationships, ({ one }) => ({
    primarySong: one(songs, {
        fields: [utageRelationships.primarySongId],
        references: [songs.id],
    }),
    utageSong: one(songs, {
        fields: [utageRelationships.utageSongId],
        references: [songs.id],
    }),
}));