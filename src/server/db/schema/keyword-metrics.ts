import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  date,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { syntaxGroups } from "./syntax";
import { roots } from "./roots";

export const keywordDailyMetrics = pgTable(
  "keyword_daily_metrics",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    marketplaceId: varchar("marketplace_id", { length: 20 }).notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    campaignId: varchar("campaign_id", { length: 50 }).notNull(),
    campaignName: varchar("campaign_name", { length: 500 }),
    adGroupId: varchar("ad_group_id", { length: 50 }),
    adGroupName: varchar("ad_group_name", { length: 500 }),
    keywordText: text("keyword_text").notNull(),
    matchType: varchar("match_type", { length: 20 }).notNull(), // 'EXACT', 'PHRASE', 'BROAD'
    targetingType: varchar("targeting_type", { length: 20 }), // 'KEYWORD', 'PRODUCT', 'AUTO'
    targetedAsin: varchar("targeted_asin", { length: 20 }),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    spend: numeric("spend", { precision: 10, scale: 2 }).notNull().default("0"),
    sales: numeric("sales", { precision: 10, scale: 2 }).notNull().default("0"),
    orders: integer("orders").notNull().default(0),
    units: integer("units").notNull().default(0),
    purchasedAsin: varchar("purchased_asin", { length: 20 }),
    ctr: numeric("ctr", { precision: 8, scale: 4 }),
    cvr: numeric("cvr", { precision: 8, scale: 4 }),
    cpc: numeric("cpc", { precision: 8, scale: 4 }),
    acos: numeric("acos", { precision: 8, scale: 4 }),
    roas: numeric("roas", { precision: 8, scale: 4 }),
    syntaxGroupId: integer("syntax_group_id").references(
      () => syntaxGroups.id
    ),
    rootId: integer("root_id").references(() => roots.id),
    classification: varchar("classification", { length: 50 }),
  },
  (table) => [
    uniqueIndex("idx_kw_daily_unique").on(
      table.date,
      table.campaignId,
      table.adGroupId,
      table.keywordText,
      table.matchType,
      table.targetedAsin
    ),
    index("idx_kw_daily_date_product").on(table.date, table.productId),
    index("idx_kw_daily_syntax").on(table.syntaxGroupId),
    index("idx_kw_daily_root").on(table.rootId),
    index("idx_kw_daily_keyword").on(table.keywordText),
  ]
);
