import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Every successful (or attempted) metadata extraction handled by VidFetch.
 * Powers the "activité récente" panel and the global platform statistics.
 */
export const fetches = pgTable(
  "fetches",
  {
    id: serial("id").primaryKey(),
    url: text("url").notNull(),
    platform: varchar("platform", { length: 32 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 191 }),
    title: text("title"),
    thumbnail: text("thumbnail"),
    durationSeconds: integer("duration_seconds"),
    formatCount: integer("format_count").default(0).notNull(),
    engine: varchar("engine", { length: 64 }),
    status: varchar("status", { length: 16 }).default("success").notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("fetches_platform_idx").on(table.platform),
    index("fetches_created_at_idx").on(table.createdAt),
  ],
);

/**
 * One row per started download. The row is mutated while the media stream is
 * piped to the browser so the dashboard can expose live transfer statistics.
 */
export const downloads = pgTable(
  "downloads",
  {
    id: serial("id").primaryKey(),
    fetchId: integer("fetch_id"),
    platform: varchar("platform", { length: 32 }).notNull(),
    platformVideoId: varchar("platform_video_id", { length: 191 }),
    title: text("title"),
    formatId: varchar("format_id", { length: 64 }).notNull(),
    mediaType: varchar("media_type", { length: 16 }).notNull(),
    qualityLabel: varchar("quality_label", { length: 64 }),
    container: varchar("container", { length: 16 }),
    filename: text("filename").notNull(),
    bytesStreamed: bigint("bytes_streamed", { mode: "number" })
      .default(0)
      .notNull(),
    status: varchar("status", { length: 16 }).default("streaming").notNull(),
    errorMessage: text("error_message"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("downloads_platform_idx").on(table.platform),
    index("downloads_created_at_idx").on(table.createdAt),
  ],
);

export type FetchRow = typeof fetches.$inferSelect;
export type NewFetchRow = typeof fetches.$inferInsert;
export type DownloadRow = typeof downloads.$inferSelect;
export type NewDownloadRow = typeof downloads.$inferInsert;
