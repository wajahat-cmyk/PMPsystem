/**
 * Weekly Aggregation Service
 *
 * Aggregates keyword_daily_metrics and product_daily_metrics into
 * product_weekly_metrics for the reporting layer.
 */

import { db } from "@/server/db";
import {
  keywordDailyMetrics,
  productDailyMetrics,
  productWeeklyMetrics,
} from "@/server/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/**
 * Get the ISO week number for a given date.
 */
function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Format a Date to YYYY-MM-DD string for drizzle date columns.
 */
function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * Safe division — returns null when denominator is zero.
 */
function safeDivide(
  numerator: number,
  denominator: number
): string | null {
  if (denominator === 0) return null;
  return (numerator / denominator).toFixed(6);
}

/**
 * Aggregate daily metrics for a single product into a weekly row.
 *
 * 1. Sums PPC metrics from keyword_daily_metrics for the date range
 * 2. Sums business metrics from product_daily_metrics for the date range
 * 3. Calculates derived KPIs
 * 4. Upserts the result into product_weekly_metrics
 */
export async function aggregateProductWeekly(
  productId: number,
  weekStart: Date,
  weekEnd: Date,
  marketplaceId: string
): Promise<void> {
  const weekStartStr = toDateString(weekStart);
  const weekEndStr = toDateString(weekEnd);
  const weekNumber = getWeekNumber(weekStart);

  // -----------------------------------------------------------------------
  // 1. Aggregate PPC metrics from keyword_daily_metrics
  // -----------------------------------------------------------------------
  const [ppcAgg] = await db
    .select({
      totalImpressions: sql<number>`COALESCE(SUM(${keywordDailyMetrics.impressions}), 0)`.as(
        "total_impressions"
      ),
      totalClicks: sql<number>`COALESCE(SUM(${keywordDailyMetrics.clicks}), 0)`.as(
        "total_clicks"
      ),
      totalSpend: sql<number>`COALESCE(SUM(${keywordDailyMetrics.spend}::numeric), 0)`.as(
        "total_spend"
      ),
      totalPpcSales: sql<number>`COALESCE(SUM(${keywordDailyMetrics.sales}::numeric), 0)`.as(
        "total_ppc_sales"
      ),
      totalPpcOrders: sql<number>`COALESCE(SUM(${keywordDailyMetrics.orders}), 0)`.as(
        "total_ppc_orders"
      ),
      totalPpcUnits: sql<number>`COALESCE(SUM(${keywordDailyMetrics.units}), 0)`.as(
        "total_ppc_units"
      ),
    })
    .from(keywordDailyMetrics)
    .where(
      and(
        eq(keywordDailyMetrics.productId, productId),
        eq(keywordDailyMetrics.marketplaceId, marketplaceId),
        gte(keywordDailyMetrics.date, weekStartStr),
        lte(keywordDailyMetrics.date, weekEndStr)
      )
    );

  // -----------------------------------------------------------------------
  // 2. Aggregate product daily metrics
  // -----------------------------------------------------------------------
  const [prodAgg] = await db
    .select({
      totalSessions: sql<number>`COALESCE(SUM(${productDailyMetrics.sessions}), 0)`.as(
        "total_sessions"
      ),
      totalPageViews: sql<number>`COALESCE(SUM(${productDailyMetrics.pageViews}), 0)`.as(
        "total_page_views"
      ),
      totalUnitsOrdered: sql<number>`COALESCE(SUM(${productDailyMetrics.unitsOrdered}), 0)`.as(
        "total_units_ordered"
      ),
      totalSales: sql<number>`COALESCE(SUM(${productDailyMetrics.totalSales}::numeric), 0)`.as(
        "total_sales"
      ),
      totalOrders: sql<number>`COALESCE(SUM(${productDailyMetrics.totalOrders}), 0)`.as(
        "total_orders"
      ),
      totalB2bSales: sql<number>`COALESCE(SUM(${productDailyMetrics.b2bSales}::numeric), 0)`.as(
        "total_b2b_sales"
      ),
      totalFbaFees: sql<number>`COALESCE(SUM(${productDailyMetrics.fbaFees}::numeric), 0)`.as(
        "total_fba_fees"
      ),
      avgPrice: sql<number>`AVG(${productDailyMetrics.price}::numeric)`.as("avg_price"),
      lastBsrMain: sql<number>`(ARRAY_AGG(${productDailyMetrics.bsrMain} ORDER BY ${productDailyMetrics.date} DESC))[1]`.as(
        "last_bsr_main"
      ),
      lastBsrSub: sql<number>`(ARRAY_AGG(${productDailyMetrics.bsrSub} ORDER BY ${productDailyMetrics.date} DESC))[1]`.as(
        "last_bsr_sub"
      ),
      lastReviews: sql<number>`(ARRAY_AGG(${productDailyMetrics.reviews} ORDER BY ${productDailyMetrics.date} DESC))[1]`.as(
        "last_reviews"
      ),
      lastRatings: sql<number>`(ARRAY_AGG(${productDailyMetrics.ratings}::numeric ORDER BY ${productDailyMetrics.date} DESC))[1]`.as(
        "last_ratings"
      ),
    })
    .from(productDailyMetrics)
    .where(
      and(
        eq(productDailyMetrics.productId, productId),
        eq(productDailyMetrics.marketplaceId, marketplaceId),
        gte(productDailyMetrics.date, weekStartStr),
        lte(productDailyMetrics.date, weekEndStr)
      )
    );

  // -----------------------------------------------------------------------
  // 3. Calculate WAS (Wasted Ad Spend) — spend on keywords with 0 sales
  // -----------------------------------------------------------------------
  const [wasAgg] = await db
    .select({
      wastedSpend: sql<number>`COALESCE(SUM(${keywordDailyMetrics.spend}::numeric), 0)`.as(
        "wasted_spend"
      ),
    })
    .from(keywordDailyMetrics)
    .where(
      and(
        eq(keywordDailyMetrics.productId, productId),
        eq(keywordDailyMetrics.marketplaceId, marketplaceId),
        gte(keywordDailyMetrics.date, weekStartStr),
        lte(keywordDailyMetrics.date, weekEndStr),
        sql`${keywordDailyMetrics.sales}::numeric = 0`,
        sql`${keywordDailyMetrics.clicks} > 0`
      )
    );

  // -----------------------------------------------------------------------
  // 4. Derive calculated metrics
  // -----------------------------------------------------------------------
  const ppcImpressions = Number(ppcAgg.totalImpressions);
  const ppcClicks = Number(ppcAgg.totalClicks);
  const ppcSpend = Number(ppcAgg.totalSpend);
  const ppcSales = Number(ppcAgg.totalPpcSales);
  const ppcOrders = Number(ppcAgg.totalPpcOrders);

  const totalSessions = Number(prodAgg.totalSessions);
  const totalUnitsOrdered = Number(prodAgg.totalUnitsOrdered);
  const totalSales = Number(prodAgg.totalSales);
  const totalOrders = Number(prodAgg.totalOrders);
  const b2bSales = Number(prodAgg.totalB2bSales);
  const fbaFees = Number(prodAgg.totalFbaFees);

  const spendWithoutSales = Number(wasAgg.wastedSpend);
  const spendWithSales = ppcSpend - spendWithoutSales;

  const organicOrders = Math.max(totalOrders - ppcOrders, 0);

  const ppcCtr = safeDivide(ppcClicks, ppcImpressions);
  const ppcCpc = safeDivide(ppcSpend, ppcClicks)?.slice(0, 8) ?? null; // precision 8,4
  const ppcCvr = safeDivide(ppcOrders, ppcClicks);
  const acos = safeDivide(ppcSpend, ppcSales);
  const tacos = safeDivide(ppcSpend, totalSales);
  const realAcos = totalSales > 0 ? safeDivide(ppcSpend, totalSales) : null;
  const organicOrderPct = safeDivide(organicOrders, totalOrders);
  const ppcOrderPct = safeDivide(ppcOrders, totalOrders);
  const wasPct = safeDivide(spendWithoutSales, ppcSpend);
  const dailySalesVelocity = (totalUnitsOrdered / 7).toFixed(2);
  const costPerSession =
    totalSessions > 0
      ? safeDivide(ppcSpend, totalSessions)?.slice(0, 8) ?? null
      : null;
  const listingCvr = safeDivide(totalOrders, totalSessions);
  const unitSessionPct = safeDivide(totalUnitsOrdered, totalSessions);
  const b2bSalesPct = safeDivide(b2bSales, totalSales);
  const fbaFeesPct = safeDivide(fbaFees, totalSales);
  const sessionClicksRatio =
    ppcClicks > 0
      ? safeDivide(totalSessions, ppcClicks)?.slice(0, 8) ?? null
      : null;

  const blendedCpa =
    totalOrders > 0
      ? (ppcSpend / totalOrders).toFixed(4)
      : null;

  // -----------------------------------------------------------------------
  // 5. Upsert into product_weekly_metrics
  // -----------------------------------------------------------------------
  await db
    .insert(productWeeklyMetrics)
    .values({
      weekNumber,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      marketplaceId,
      productId,

      // Product Info
      price: prodAgg.avgPrice != null ? String(Number(prodAgg.avgPrice).toFixed(2)) : null,
      reviews: prodAgg.lastReviews != null ? Number(prodAgg.lastReviews) : null,
      ratings: prodAgg.lastRatings != null ? String(Number(prodAgg.lastRatings).toFixed(2)) : null,
      bsrMain: prodAgg.lastBsrMain != null ? Number(prodAgg.lastBsrMain) : null,
      bsrSub: prodAgg.lastBsrSub != null ? Number(prodAgg.lastBsrSub) : null,

      // Traffic
      totalSessions,
      costPerSession,

      // Sales
      unitsOrdered: totalUnitsOrdered,
      totalSales: totalSales.toFixed(2),
      totalOrders,
      b2bSales: b2bSales.toFixed(2),
      b2bSalesPct,
      fbaFees: fbaFees.toFixed(2),
      fbaFeesPct,
      dailySalesVelocity,
      sessionClicksRatio,

      // PPC Performance
      ppcImpressions,
      ppcClicks,
      ppcCtr,
      ppcCpc,
      ppcSpend: ppcSpend.toFixed(2),
      ppcSales: ppcSales.toFixed(2),

      // Order Split
      organicOrders,
      ppcOrders,
      organicOrderPct,
      ppcOrderPct,

      // Conversion
      listingCvr,
      unitSessionPct,
      ppcCvr,

      // Ad Efficiency
      spendWithSales: spendWithSales.toFixed(2),
      spendWithoutSales: spendWithoutSales.toFixed(2),
      acos,
      realAcos,
      tacos,
      wasPct,

      // Profitability
      blendedCpa,
    })
    .onConflictDoUpdate({
      target: [
        productWeeklyMetrics.weekNumber,
        productWeeklyMetrics.marketplaceId,
        productWeeklyMetrics.productId,
      ],
      set: {
        weekStart: sql`EXCLUDED.week_start`,
        weekEnd: sql`EXCLUDED.week_end`,
        price: sql`EXCLUDED.price`,
        reviews: sql`EXCLUDED.reviews`,
        ratings: sql`EXCLUDED.ratings`,
        bsrMain: sql`EXCLUDED.bsr_main`,
        bsrSub: sql`EXCLUDED.bsr_sub`,
        totalSessions: sql`EXCLUDED.total_sessions`,
        costPerSession: sql`EXCLUDED.cost_per_session`,
        unitsOrdered: sql`EXCLUDED.units_ordered`,
        totalSales: sql`EXCLUDED.total_sales`,
        totalOrders: sql`EXCLUDED.total_orders`,
        b2bSales: sql`EXCLUDED.b2b_sales`,
        b2bSalesPct: sql`EXCLUDED.b2b_sales_pct`,
        fbaFees: sql`EXCLUDED.fba_fees`,
        fbaFeesPct: sql`EXCLUDED.fba_fees_pct`,
        dailySalesVelocity: sql`EXCLUDED.daily_sales_velocity`,
        sessionClicksRatio: sql`EXCLUDED.session_clicks_ratio`,
        ppcImpressions: sql`EXCLUDED.ppc_impressions`,
        ppcClicks: sql`EXCLUDED.ppc_clicks`,
        ppcCtr: sql`EXCLUDED.ppc_ctr`,
        ppcCpc: sql`EXCLUDED.ppc_cpc`,
        ppcSpend: sql`EXCLUDED.ppc_spend`,
        ppcSales: sql`EXCLUDED.ppc_sales`,
        organicOrders: sql`EXCLUDED.organic_orders`,
        ppcOrders: sql`EXCLUDED.ppc_orders`,
        organicOrderPct: sql`EXCLUDED.organic_order_pct`,
        ppcOrderPct: sql`EXCLUDED.ppc_order_pct`,
        listingCvr: sql`EXCLUDED.listing_cvr`,
        unitSessionPct: sql`EXCLUDED.unit_session_pct`,
        ppcCvr: sql`EXCLUDED.ppc_cvr`,
        spendWithSales: sql`EXCLUDED.spend_with_sales`,
        spendWithoutSales: sql`EXCLUDED.spend_without_sales`,
        acos: sql`EXCLUDED.acos`,
        realAcos: sql`EXCLUDED.real_acos`,
        tacos: sql`EXCLUDED.tacos`,
        wasPct: sql`EXCLUDED.was_pct`,
        blendedCpa: sql`EXCLUDED.blended_cpa`,
      },
    });
}
