import {
  pgTable,
  serial,
  varchar,
  integer,
  bigint,
  numeric,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const accountWeeklyMetrics = pgTable(
  "account_weekly_metrics",
  {
    id: serial("id").primaryKey(),
    weekNumber: integer("week_number").notNull(),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    marketplaceId: varchar("marketplace_id", { length: 20 }).notNull(),

    totalSales: numeric("total_sales", { precision: 14, scale: 2 }),
    amazonWithdraw: numeric("amazon_withdraw", { precision: 14, scale: 2 }), // total_sales * 0.20
    totalOrders: integer("total_orders"),
    avgAov: numeric("avg_aov", { precision: 10, scale: 2 }),
    ppcImpressions: bigint("ppc_impressions", { mode: "number" }),
    ppcClicks: integer("ppc_clicks"),
    ppcCtr: numeric("ppc_ctr", { precision: 8, scale: 6 }),
    ppcCpc: numeric("ppc_cpc", { precision: 8, scale: 4 }),
    ppcCvr: numeric("ppc_cvr", { precision: 8, scale: 6 }),
    ppcSpend: numeric("ppc_spend", { precision: 12, scale: 2 }),
    spendWithSales: numeric("spend_with_sales", { precision: 12, scale: 2 }),
    spendWithoutSales: numeric("spend_without_sales", {
      precision: 12,
      scale: 2,
    }),
    ppcSales: numeric("ppc_sales", { precision: 12, scale: 2 }),
    organicOrders: integer("organic_orders"),
    ppcOrders: integer("ppc_orders"),
    organicOrderPct: numeric("organic_order_pct", { precision: 8, scale: 6 }),
    ppcOrderPct: numeric("ppc_order_pct", { precision: 8, scale: 6 }),
    wasPct: numeric("was_pct", { precision: 8, scale: 6 }),
    acos: numeric("acos", { precision: 8, scale: 6 }),
    realAcos: numeric("real_acos", { precision: 8, scale: 6 }),
    tacos: numeric("tacos", { precision: 8, scale: 6 }),
    realTacos: numeric("real_tacos", { precision: 8, scale: 6 }),
  },
  (table) => [
    uniqueIndex("idx_account_weekly_unique").on(
      table.weekNumber,
      table.marketplaceId
    ),
  ]
);
