import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { db } from "@/server/db";
import {
  keywordDailyMetrics,
  keywordSyntaxMap,
  syntaxGroups,
  roots,
} from "@/server/db/schema";
import { eq, and, gte, sql, desc, asc, countDistinct } from "drizzle-orm";

function dateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0]!;
}

export const syntaxRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        productId: z.number().optional(),
        days: z.number().min(1).max(90).default(7),
        marketplaceId: z.string().optional(),
        classification: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateFrom = dateDaysAgo(input.days);

      const conditions = [
        gte(keywordDailyMetrics.date, dateFrom),
      ];

      if (input.productId) {
        conditions.push(eq(keywordDailyMetrics.productId, input.productId));
      }

      if (input.marketplaceId) {
        conditions.push(eq(keywordDailyMetrics.marketplaceId, input.marketplaceId));
      }

      if (input.classification && input.classification !== "all") {
        conditions.push(eq(keywordDailyMetrics.classification, input.classification));
      }

      const whereClause = and(...conditions);

      const rawRows = await db
        .select({
          syntaxGroupId: keywordDailyMetrics.syntaxGroupId,
          syntaxLabel: sql<string>`COALESCE(${syntaxGroups.productLine}, 'Unclassified')`.as("syntax_label"),
          rootTerm: sql<string>`COALESCE(${roots.rootTerm}, '')`.as("root_term"),
          classification: sql<string>`COALESCE(${keywordDailyMetrics.classification}, 'unclassified')`.as("classification"),
          impressions: sql<number>`SUM(${keywordDailyMetrics.impressions})`.as("impressions"),
          clicks: sql<number>`SUM(${keywordDailyMetrics.clicks})`.as("clicks"),
          spend: sql<number>`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`.as("spend"),
          sales: sql<number>`SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC))`.as("sales"),
          orders: sql<number>`SUM(${keywordDailyMetrics.orders})`.as("orders"),
          keywordCount: countDistinct(keywordDailyMetrics.keywordText).as("keyword_count"),
        })
        .from(keywordDailyMetrics)
        .leftJoin(syntaxGroups, eq(keywordDailyMetrics.syntaxGroupId, syntaxGroups.id))
        .leftJoin(roots, eq(keywordDailyMetrics.rootId, roots.id))
        .where(whereClause)
        .groupBy(
          keywordDailyMetrics.syntaxGroupId,
          syntaxGroups.productLine,
          roots.rootTerm,
          keywordDailyMetrics.classification
        )
        .orderBy(desc(sql`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`));

      const items = rawRows.map((row) => {
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        const spend = Number(row.spend) || 0;
        const sales = Number(row.sales) || 0;
        const orders = Number(row.orders) || 0;

        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cvr = clicks > 0 ? (orders / clicks) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const acos = sales > 0 ? (spend / sales) * 100 : 0;
        const wasPct = spend > 0
          ? 0 // WAS% requires wasted-ad-spend calculation at row level
          : 0;

        return {
          syntaxGroupId: row.syntaxGroupId,
          syntaxLabel: row.syntaxLabel,
          rootTerm: row.rootTerm,
          classification: row.classification,
          impressions,
          clicks,
          spend: Math.round(spend * 100) / 100,
          sales: Math.round(sales * 100) / 100,
          orders,
          ctr: Math.round(ctr * 100) / 100,
          cvr: Math.round(cvr * 100) / 100,
          cpc: Math.round(cpc * 100) / 100,
          acos: Math.round(acos * 100) / 100,
          wasPct: Math.round(wasPct * 100) / 100,
          keywordCount: Number(row.keywordCount) || 0,
        };
      });

      // Calculate WAS% properly: spend on keywords with zero sales / total spend
      // We do this with a separate query for accuracy
      const wasRows = await db
        .select({
          syntaxGroupId: keywordDailyMetrics.syntaxGroupId,
          wastedSpend: sql<number>`SUM(CASE WHEN CAST(${keywordDailyMetrics.sales} AS NUMERIC) = 0 THEN CAST(${keywordDailyMetrics.spend} AS NUMERIC) ELSE 0 END)`.as("wasted_spend"),
          totalSpend: sql<number>`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`.as("total_spend"),
        })
        .from(keywordDailyMetrics)
        .where(whereClause)
        .groupBy(keywordDailyMetrics.syntaxGroupId);

      const wasMap = new Map<number | null, number>();
      for (const w of wasRows) {
        const total = Number(w.totalSpend) || 0;
        const wasted = Number(w.wastedSpend) || 0;
        const pct = total > 0 ? (wasted / total) * 100 : 0;
        wasMap.set(w.syntaxGroupId, Math.round(pct * 100) / 100);
      }

      for (const item of items) {
        item.wasPct = wasMap.get(item.syntaxGroupId) ?? 0;
      }

      return { items };
    }),

  getKeywords: protectedProcedure
    .input(
      z.object({
        syntaxGroupId: z.number(),
        days: z.number().min(1).max(90).default(7),
        productId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const dateFrom = dateDaysAgo(input.days);

      const conditions = [
        gte(keywordDailyMetrics.date, dateFrom),
        eq(keywordDailyMetrics.syntaxGroupId, input.syntaxGroupId),
      ];

      if (input.productId) {
        conditions.push(eq(keywordDailyMetrics.productId, input.productId));
      }

      const whereClause = and(...conditions);

      const rawRows = await db
        .select({
          keywordText: keywordDailyMetrics.keywordText,
          matchType: keywordDailyMetrics.matchType,
          campaignCount: countDistinct(keywordDailyMetrics.campaignName).as("campaign_count"),
          impressions: sql<number>`SUM(${keywordDailyMetrics.impressions})`.as("impressions"),
          clicks: sql<number>`SUM(${keywordDailyMetrics.clicks})`.as("clicks"),
          spend: sql<number>`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`.as("spend"),
          sales: sql<number>`SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC))`.as("sales"),
          orders: sql<number>`SUM(${keywordDailyMetrics.orders})`.as("orders"),
        })
        .from(keywordDailyMetrics)
        .where(whereClause)
        .groupBy(keywordDailyMetrics.keywordText, keywordDailyMetrics.matchType)
        .orderBy(desc(sql`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`));

      const items = rawRows.map((row) => {
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        const spend = Number(row.spend) || 0;
        const sales = Number(row.sales) || 0;
        const orders = Number(row.orders) || 0;

        return {
          keywordText: row.keywordText,
          matchType: row.matchType,
          campaignCount: Number(row.campaignCount) || 0,
          impressions,
          clicks,
          spend: Math.round(spend * 100) / 100,
          sales: Math.round(sales * 100) / 100,
          orders,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
          cvr: clicks > 0 ? Math.round((orders / clicks) * 10000) / 100 : 0,
          acos: sales > 0 ? Math.round((spend / sales) * 10000) / 100 : 0,
        };
      });

      return { items };
    }),

  getCampaigns: protectedProcedure
    .input(
      z.object({
        keywordText: z.string(),
        productId: z.number().optional(),
        days: z.number().min(1).max(90).default(7),
      })
    )
    .query(async ({ input }) => {
      const dateFrom = dateDaysAgo(input.days);

      const conditions = [
        gte(keywordDailyMetrics.date, dateFrom),
        eq(keywordDailyMetrics.keywordText, input.keywordText),
      ];

      if (input.productId) {
        conditions.push(eq(keywordDailyMetrics.productId, input.productId));
      }

      const whereClause = and(...conditions);

      const rawRows = await db
        .select({
          campaignName: keywordDailyMetrics.campaignName,
          adGroupName: keywordDailyMetrics.adGroupName,
          matchType: keywordDailyMetrics.matchType,
          impressions: sql<number>`SUM(${keywordDailyMetrics.impressions})`.as("impressions"),
          clicks: sql<number>`SUM(${keywordDailyMetrics.clicks})`.as("clicks"),
          spend: sql<number>`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`.as("spend"),
          sales: sql<number>`SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC))`.as("sales"),
        })
        .from(keywordDailyMetrics)
        .where(whereClause)
        .groupBy(
          keywordDailyMetrics.campaignName,
          keywordDailyMetrics.adGroupName,
          keywordDailyMetrics.matchType
        )
        .orderBy(desc(sql`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`));

      const items = rawRows.map((row) => {
        const spend = Number(row.spend) || 0;
        const sales = Number(row.sales) || 0;

        return {
          campaignName: row.campaignName ?? "",
          adGroupName: row.adGroupName ?? "",
          matchType: row.matchType,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          spend: Math.round(spend * 100) / 100,
          sales: Math.round(sales * 100) / 100,
          acos: sales > 0 ? Math.round((spend / sales) * 10000) / 100 : 0,
        };
      });

      return { items };
    }),
});
