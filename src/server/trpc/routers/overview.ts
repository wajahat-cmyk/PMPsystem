import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { sql, eq, gte, and, desc } from "drizzle-orm";
import { keywordDailyMetrics } from "@/server/db/schema/keyword-metrics";
import { products } from "@/server/db/schema/products";
import { brands } from "@/server/db/schema/brands";

export const overviewRouter = router({
  getMetricCards: protectedProcedure
    .input(
      z
        .object({
          days: z.number().default(7),
          productId: z.number().optional(),
          marketplaceId: z.string().default("ATVPDKIKX0DER"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const marketplaceId = input?.marketplaceId ?? "ATVPDKIKX0DER";

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0]!;

      const conditions = [
        gte(keywordDailyMetrics.date, startDateStr),
        eq(keywordDailyMetrics.marketplaceId, marketplaceId),
      ];

      if (input?.productId) {
        conditions.push(eq(keywordDailyMetrics.productId, input.productId));
      }

      const result = await ctx.db
        .select({
          totalSpend: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)), 0)`,
          totalSales: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)), 0)`,
          totalOrders: sql<number>`COALESCE(SUM(${keywordDailyMetrics.orders}), 0)`,
          totalUnits: sql<number>`COALESCE(SUM(${keywordDailyMetrics.units}), 0)`,
          ppcImpressions: sql<number>`COALESCE(SUM(${keywordDailyMetrics.impressions}), 0)`,
          ppcClicks: sql<number>`COALESCE(SUM(${keywordDailyMetrics.clicks}), 0)`,
          wastedSpend: sql<number>`COALESCE(SUM(CASE WHEN ${keywordDailyMetrics.orders} = 0 THEN CAST(${keywordDailyMetrics.spend} AS NUMERIC) ELSE 0 END), 0)`,
        })
        .from(keywordDailyMetrics)
        .where(and(...conditions));

      const row = result[0];
      if (!row) {
        return {
          totalSales: 0,
          totalSpend: 0,
          acos: 0,
          tacos: 0,
          ppcSales: 0,
          totalOrders: 0,
          avgAov: 0,
          ppcImpressions: 0,
          ppcClicks: 0,
          ppcCtr: 0,
          organicOrderPct: 0,
          ppcOrderPct: 0,
          wasPct: 0,
          dailySalesVelocity: 0,
        };
      }

      const totalSales = Number(row.totalSales);
      const totalSpend = Number(row.totalSpend);
      const totalOrders = Number(row.totalOrders);
      const ppcImpressions = Number(row.ppcImpressions);
      const ppcClicks = Number(row.ppcClicks);
      const wastedSpend = Number(row.wastedSpend);

      // PPC sales = total sales from keyword_daily_metrics (all PPC)
      const ppcSales = totalSales;
      const acosVal = ppcSales > 0 ? (totalSpend / ppcSales) * 100 : 0;
      // TACOS uses total sales (organic + PPC), but we only have PPC here
      // In a full implementation, totalSales would include organic from productDailyMetrics
      const tacosVal = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0;
      const avgAov = totalOrders > 0 ? totalSales / totalOrders : 0;
      const ppcCtr = ppcImpressions > 0 ? (ppcClicks / ppcImpressions) * 100 : 0;
      const wasPctVal = totalSpend > 0 ? (wastedSpend / totalSpend) * 100 : 0;
      const dailySalesVelocity = days > 0 ? totalSales / days : 0;

      // For organic vs PPC order split, we'd need productDailyMetrics
      // Using PPC-only data: ppcOrderPct = 100%, organicOrderPct = 0%
      // These will be more accurate when productDailyMetrics is populated
      const ppcOrderPct = 100;
      const organicOrderPct = 0;

      return {
        totalSales,
        totalSpend,
        acos: Math.round(acosVal * 100) / 100,
        tacos: Math.round(tacosVal * 100) / 100,
        ppcSales,
        totalOrders,
        avgAov: Math.round(avgAov * 100) / 100,
        ppcImpressions,
        ppcClicks,
        ppcCtr: Math.round(ppcCtr * 100) / 100,
        organicOrderPct,
        ppcOrderPct,
        wasPct: Math.round(wasPctVal * 100) / 100,
        dailySalesVelocity: Math.round(dailySalesVelocity * 100) / 100,
      };
    }),

  getProductBreakdown: protectedProcedure
    .input(
      z
        .object({
          days: z.number().default(7),
          marketplaceId: z.string().default("ATVPDKIKX0DER"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const marketplaceId = input?.marketplaceId ?? "ATVPDKIKX0DER";

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0]!;

      const rows = await ctx.db
        .select({
          productId: keywordDailyMetrics.productId,
          productName: products.name,
          parentAsin: products.parentAsin,
          brandName: brands.name,
          currentStage: products.currentStage,
          basePrice: products.basePrice,
          totalSales: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)), 0)`,
          totalSpend: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)), 0)`,
          totalOrders: sql<number>`COALESCE(SUM(${keywordDailyMetrics.orders}), 0)`,
          totalImpressions: sql<number>`COALESCE(SUM(${keywordDailyMetrics.impressions}), 0)`,
          totalClicks: sql<number>`COALESCE(SUM(${keywordDailyMetrics.clicks}), 0)`,
          wastedSpend: sql<number>`COALESCE(SUM(CASE WHEN ${keywordDailyMetrics.orders} = 0 THEN CAST(${keywordDailyMetrics.spend} AS NUMERIC) ELSE 0 END), 0)`,
        })
        .from(keywordDailyMetrics)
        .innerJoin(products, eq(keywordDailyMetrics.productId, products.id))
        .innerJoin(brands, eq(products.brandId, brands.id))
        .where(
          and(
            gte(keywordDailyMetrics.date, startDateStr),
            eq(keywordDailyMetrics.marketplaceId, marketplaceId)
          )
        )
        .groupBy(
          keywordDailyMetrics.productId,
          products.name,
          products.parentAsin,
          brands.name,
          products.currentStage,
          products.basePrice
        )
        .orderBy(desc(sql`SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC))`));

      return rows.map((row) => {
        const sales = Number(row.totalSales);
        const spend = Number(row.totalSpend);
        const orders = Number(row.totalOrders);
        const clicks = Number(row.totalClicks);
        const wasted = Number(row.wastedSpend);

        const acosVal = sales > 0 ? (spend / sales) * 100 : 0;
        const tacosVal = sales > 0 ? (spend / sales) * 100 : 0;
        const velocity = days > 0 ? sales / days : 0;
        const organicPct = 0; // Needs productDailyMetrics for accurate value

        return {
          productId: row.productId,
          productName: row.productName,
          parentAsin: row.parentAsin,
          brandName: row.brandName,
          currentStage: row.currentStage ?? "launch",
          basePrice: row.basePrice ? Number(row.basePrice) : null,
          sales,
          spend,
          orders,
          acos: Math.round(acosVal * 100) / 100,
          tacos: Math.round(tacosVal * 100) / 100,
          organicPct,
          velocity: Math.round(velocity * 100) / 100,
        };
      });
    }),

  getSalesTrend: protectedProcedure
    .input(
      z
        .object({
          days: z.number().default(30),
          marketplaceId: z.string().default("ATVPDKIKX0DER"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const marketplaceId = input?.marketplaceId ?? "ATVPDKIKX0DER";

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0]!;

      const rows = await ctx.db
        .select({
          date: keywordDailyMetrics.date,
          totalSales: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)), 0)`,
          spend: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)), 0)`,
          orders: sql<number>`COALESCE(SUM(${keywordDailyMetrics.orders}), 0)`,
          impressions: sql<number>`COALESCE(SUM(${keywordDailyMetrics.impressions}), 0)`,
          clicks: sql<number>`COALESCE(SUM(${keywordDailyMetrics.clicks}), 0)`,
        })
        .from(keywordDailyMetrics)
        .where(
          and(
            gte(keywordDailyMetrics.date, startDateStr),
            eq(keywordDailyMetrics.marketplaceId, marketplaceId)
          )
        )
        .groupBy(keywordDailyMetrics.date)
        .orderBy(keywordDailyMetrics.date);

      return rows.map((row) => {
        const totalSales = Number(row.totalSales);
        const spend = Number(row.spend);
        const ppcSales = totalSales;
        const organicSales = 0; // Needs productDailyMetrics for accurate value
        const acosVal = ppcSales > 0 ? (spend / ppcSales) * 100 : 0;
        const tacosVal = totalSales > 0 ? (spend / totalSales) * 100 : 0;

        return {
          date: row.date,
          totalSales,
          ppcSales,
          organicSales,
          spend,
          orders: Number(row.orders),
          acos: Math.round(acosVal * 100) / 100,
          tacos: Math.round(tacosVal * 100) / 100,
        };
      });
    }),
});
