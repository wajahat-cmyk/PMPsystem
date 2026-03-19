import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  date,
  text,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { products } from "./products";

export const productDailyMetrics = pgTable(
  "product_daily_metrics",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    marketplaceId: varchar("marketplace_id", { length: 20 }).notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    parentAsin: varchar("parent_asin", { length: 20 }).notNull(),
    // Traffic
    sessions: integer("sessions").default(0),
    pageViews: integer("page_views").default(0),
    // Sales
    unitsOrdered: integer("units_ordered").default(0),
    totalSales: numeric("total_sales", { precision: 10, scale: 2 }).default(
      "0"
    ),
    totalOrders: integer("total_orders").default(0),
    b2bSales: numeric("b2b_sales", { precision: 10, scale: 2 }).default("0"),
    // PPC (aggregated from keyword_daily_metrics)
    ppcImpressions: integer("ppc_impressions").default(0),
    ppcClicks: integer("ppc_clicks").default(0),
    ppcSpend: numeric("ppc_spend", { precision: 10, scale: 2 }).default("0"),
    ppcSales: numeric("ppc_sales", { precision: 10, scale: 2 }).default("0"),
    ppcOrders: integer("ppc_orders").default(0),
    // Organic (derived)
    organicOrders: integer("organic_orders").default(0),
    // Listing
    price: numeric("price", { precision: 10, scale: 2 }),
    bsrMain: integer("bsr_main"),
    bsrSub: integer("bsr_sub"),
    reviews: integer("reviews"),
    ratings: numeric("ratings", { precision: 3, scale: 2 }),
    // FBA
    fbaFees: numeric("fba_fees", { precision: 10, scale: 2 }),
  },
  (table) => [
    uniqueIndex("idx_prod_daily_unique").on(
      table.date,
      table.marketplaceId,
      table.parentAsin
    ),
    index("idx_prod_daily_date").on(table.date, table.productId),
  ]
);

export const productWeeklyMetrics = pgTable(
  "product_weekly_metrics",
  {
    id: serial("id").primaryKey(),
    weekNumber: integer("week_number").notNull(),
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    marketplaceId: varchar("marketplace_id", { length: 20 }).notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),

    // Product Info (cols 1-8)
    price: numeric("price", { precision: 10, scale: 2 }),
    reviews: integer("reviews"),
    ratings: numeric("ratings", { precision: 3, scale: 2 }),
    reviewRate: numeric("review_rate", { precision: 6, scale: 4 }),
    bsrMain: integer("bsr_main"),
    bsrSub: integer("bsr_sub"),

    // Traffic / Search (cols 9-11)
    sqpTotalSearchVolume: integer("sqp_total_search_volume"),
    totalSessions: integer("total_sessions"),
    costPerSession: numeric("cost_per_session", { precision: 8, scale: 4 }),

    // Sales (cols 12-21)
    unitsOrdered: integer("units_ordered"),
    totalSales: numeric("total_sales", { precision: 12, scale: 2 }),
    totalOrders: integer("total_orders"),
    b2bSales: numeric("b2b_sales", { precision: 12, scale: 2 }),
    b2bSalesPct: numeric("b2b_sales_pct", { precision: 6, scale: 4 }),
    fbaFees: numeric("fba_fees", { precision: 10, scale: 2 }),
    fbaFeesPct: numeric("fba_fees_pct", { precision: 6, scale: 4 }),
    dailySalesVelocity: numeric("daily_sales_velocity", {
      precision: 8,
      scale: 2,
    }),
    sessionClicksRatio: numeric("session_clicks_ratio", {
      precision: 8,
      scale: 4,
    }),
    targetDailySv: numeric("target_daily_sv", { precision: 8, scale: 2 }),

    // PPC Performance (cols 22-29)
    ppcImpressions: integer("ppc_impressions"),
    ppcClicks: integer("ppc_clicks"),
    ppcCtr: numeric("ppc_ctr", { precision: 8, scale: 6 }),
    sqpBrandCtr: numeric("sqp_brand_ctr", { precision: 8, scale: 6 }),
    sqpMarketCtr: numeric("sqp_market_ctr", { precision: 8, scale: 6 }),
    targetCtr: numeric("target_ctr", { precision: 8, scale: 6 }),
    ppcCpc: numeric("ppc_cpc", { precision: 8, scale: 4 }),
    ppcSpend: numeric("ppc_spend", { precision: 12, scale: 2 }),
    ppcSales: numeric("ppc_sales", { precision: 12, scale: 2 }),

    // Order Split (cols 30-33)
    organicOrders: integer("organic_orders"),
    ppcOrders: integer("ppc_orders"),
    organicOrderPct: numeric("organic_order_pct", { precision: 6, scale: 4 }),
    ppcOrderPct: numeric("ppc_order_pct", { precision: 6, scale: 4 }),

    // Conversion (cols 34-40)
    listingCvr: numeric("listing_cvr", { precision: 8, scale: 6 }),
    unitSessionPct: numeric("unit_session_pct", { precision: 8, scale: 6 }),
    ppcCvr: numeric("ppc_cvr", { precision: 8, scale: 6 }),
    breakevenCvr: numeric("breakeven_cvr", { precision: 8, scale: 6 }),
    sqpBrandCvr: numeric("sqp_brand_cvr", { precision: 8, scale: 6 }),
    sqpMarketCvr: numeric("sqp_market_cvr", { precision: 8, scale: 6 }),
    targetCvr: numeric("target_cvr", { precision: 8, scale: 6 }),

    // Ad Efficiency (cols 41-55)
    spendWithSales: numeric("spend_with_sales", { precision: 12, scale: 2 }),
    spendWithoutSales: numeric("spend_without_sales", {
      precision: 12,
      scale: 2,
    }),
    acos: numeric("acos", { precision: 8, scale: 6 }),
    breakevenAcos: numeric("breakeven_acos", { precision: 8, scale: 6 }),
    realAcos: numeric("real_acos", { precision: 8, scale: 6 }),
    tacos: numeric("tacos", { precision: 8, scale: 6 }),
    realTacos: numeric("real_tacos", { precision: 8, scale: 6 }),
    targetTacos: numeric("target_tacos", { precision: 8, scale: 6 }),
    wasPct: numeric("was_pct", { precision: 8, scale: 6 }),
    wasExact: numeric("was_exact", { precision: 8, scale: 6 }),
    wasPhrase: numeric("was_phrase", { precision: 8, scale: 6 }),
    wasBroad: numeric("was_broad", { precision: 8, scale: 6 }),
    was1click0order: numeric("was_1click_0order", { precision: 8, scale: 6 }),
    was1click1order: numeric("was_1click_1order", { precision: 8, scale: 6 }),

    // Profitability (cols 56-59)
    blendedCpa: numeric("blended_cpa", { precision: 8, scale: 4 }),
    unitProfit: numeric("unit_profit", { precision: 8, scale: 4 }),
    profitAfterCpa: numeric("profit_after_cpa", { precision: 8, scale: 4 }),
    cm3: numeric("cm3", { precision: 8, scale: 4 }),

    // Market Position (cols 60-64)
    sqpImpressionShare: numeric("sqp_impression_share", {
      precision: 8,
      scale: 6,
    }),
    sqpClickShare: numeric("sqp_click_share", { precision: 8, scale: 6 }),
    sqpMarketShare: numeric("sqp_market_share", { precision: 8, scale: 6 }),
    top412RankDominance: numeric("top_4_12_rank_dominance", {
      precision: 8,
      scale: 4,
    }),
    p1Dominance: numeric("p1_dominance", { precision: 8, scale: 4 }),

    // Action (cols 65-67)
    weeklyActionPlan: text("weekly_action_plan"),
    comment: text("comment"),
  },
  (table) => [
    uniqueIndex("idx_prod_weekly_unique").on(
      table.weekNumber,
      table.marketplaceId,
      table.productId
    ),
    index("idx_product_weekly").on(table.productId, table.weekNumber),
  ]
);
