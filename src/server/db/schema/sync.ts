import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const syncConfig = pgTable("sync_config", {
  id: serial("id").primaryKey(),
  syncType: varchar("sync_type", { length: 50 }).notNull(), // 'ppc_search_term', 'business_report', 'sqp', etc.
  frequencyMinutes: integer("frequency_minutes").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncStatus: varchar("last_sync_status", { length: 20 }),
  nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
  isEnabled: boolean("is_enabled").default(true),
  config: jsonb("config"), // Additional config per sync type
});

export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  syncType: varchar("sync_type", { length: 50 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull(), // 'running', 'success', 'failed', 'partial'
  recordsFetched: integer("records_fetched").default(0),
  recordsProcessed: integer("records_processed").default(0),
  errorMessage: text("error_message"),
  apiCallsMade: integer("api_calls_made").default(0),
  retryCount: integer("retry_count").default(0),
});

export const apiCallLog = pgTable(
  "api_call_log",
  {
    id: serial("id").primaryKey(),
    calledAt: timestamp("called_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    apiType: varchar("api_type", { length: 50 }).notNull(), // 'ads_api', 'sp_api'
    endpoint: varchar("endpoint", { length: 500 }).notNull(),
    method: varchar("method", { length: 10 }).notNull(),
    statusCode: integer("status_code"),
    responseTimeMs: integer("response_time_ms"),
    errorType: varchar("error_type", { length: 100 }),
    errorMessage: text("error_message"),
    retryAttempt: integer("retry_attempt").default(0),
    marketplaceId: varchar("marketplace_id", { length: 20 }),
  },
  (table) => [
    index("idx_api_log_time").on(table.calledAt),
    index("idx_api_log_status").on(table.statusCode),
  ]
);
