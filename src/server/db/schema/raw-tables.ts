import {
  pgTable,
  serial,
  varchar,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const rawSpCampaignReport = pgTable(
  "raw_sp_campaign_report",
  {
    id: serial("id").primaryKey(),
    reportDate: timestamp("report_date", { withTimezone: true }).notNull(),
    marketplaceId: varchar("marketplace_id", { length: 20 }).notNull(),
    reportType: varchar("report_type", { length: 50 }).notNull(), // 'search_term', 'campaign', 'targeting', 'purchased_product'
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_raw_sp_report_date").on(table.reportDate, table.marketplaceId),
    index("idx_raw_sp_report_type").on(table.reportType),
  ]
);

export const rawBusinessReport = pgTable(
  "raw_business_report",
  {
    id: serial("id").primaryKey(),
    reportDate: timestamp("report_date", { withTimezone: true }).notNull(),
    marketplaceId: varchar("marketplace_id", { length: 20 }).notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_raw_biz_report_date").on(table.reportDate, table.marketplaceId),
  ]
);
