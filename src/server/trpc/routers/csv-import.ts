import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { db } from "@/server/db";
import { keywordDailyMetrics, productDailyMetrics, products } from "@/server/db/schema";
import { parsePpcReport, parseBusinessReport } from "@/server/services/csv-parser";
import { eq, and, sql } from "drizzle-orm";

export const csvImportRouter = router({
  /**
   * Import PPC Search Term / Keyword Report data from CSV.
   * Parses the CSV, maps rows to keyword_daily_metrics, and upserts.
   */
  importPpcData: protectedProcedure
    .input(
      z.object({
        csvContent: z.string(),
        productId: z.number(),
        marketplaceId: z.string().default("ATVPDKIKX0DER"),
      })
    )
    .mutation(async ({ input }) => {
      const { csvContent, productId, marketplaceId } = input;

      const parsed = parsePpcReport(csvContent);

      if (parsed.rows.length === 0) {
        return {
          success: false,
          imported: 0,
          errors: parsed.errors.length > 0 ? parsed.errors : [{ row: 0, message: "No valid rows found in CSV" }],
          totalRows: parsed.totalRows,
        };
      }

      let imported = 0;

      // Process in batches of 100 to avoid overly large queries
      const batchSize = 100;
      for (let i = 0; i < parsed.rows.length; i += batchSize) {
        const batch = parsed.rows.slice(i, i + batchSize);

        const values = batch.map((row) => ({
          date: row.date,
          marketplaceId,
          productId,
          campaignId: row.campaignId || "CSV_IMPORT",
          campaignName: row.campaignName || null,
          adGroupId: row.adGroupId || null,
          adGroupName: row.adGroupName || null,
          keywordText: row.keywordText,
          matchType: row.matchType,
          targetingType: row.targetingType,
          targetedAsin: row.targetedAsin,
          impressions: row.impressions,
          clicks: row.clicks,
          spend: row.spend,
          sales: row.sales,
          orders: row.orders,
          units: row.units,
          ctr: row.ctr,
          cvr: row.cvr,
          cpc: row.cpc,
          acos: row.acos,
          roas: row.roas,
        }));

        await db
          .insert(keywordDailyMetrics)
          .values(values)
          .onConflictDoUpdate({
            target: [
              keywordDailyMetrics.date,
              keywordDailyMetrics.campaignId,
              keywordDailyMetrics.adGroupId,
              keywordDailyMetrics.keywordText,
              keywordDailyMetrics.matchType,
              keywordDailyMetrics.targetedAsin,
            ],
            set: {
              impressions: sql`EXCLUDED.impressions`,
              clicks: sql`EXCLUDED.clicks`,
              spend: sql`EXCLUDED.spend`,
              sales: sql`EXCLUDED.sales`,
              orders: sql`EXCLUDED.orders`,
              units: sql`EXCLUDED.units`,
              ctr: sql`EXCLUDED.ctr`,
              cvr: sql`EXCLUDED.cvr`,
              cpc: sql`EXCLUDED.cpc`,
              acos: sql`EXCLUDED.acos`,
              roas: sql`EXCLUDED.roas`,
              campaignName: sql`EXCLUDED.campaign_name`,
              adGroupName: sql`EXCLUDED.ad_group_name`,
            },
          });

        imported += batch.length;
      }

      return {
        success: true,
        imported,
        errors: parsed.errors,
        totalRows: parsed.totalRows,
      };
    }),

  /**
   * Import Business Report data from CSV.
   * Parses the CSV, matches parentAsin to products, and upserts into product_daily_metrics.
   */
  importBusinessReport: protectedProcedure
    .input(
      z.object({
        csvContent: z.string(),
        marketplaceId: z.string().default("ATVPDKIKX0DER"),
      })
    )
    .mutation(async ({ input }) => {
      const { csvContent, marketplaceId } = input;

      const parsed = parseBusinessReport(csvContent);

      if (parsed.rows.length === 0) {
        return {
          success: false,
          imported: 0,
          skippedAsins: [] as string[],
          errors: parsed.errors.length > 0 ? parsed.errors : [{ row: 0, message: "No valid rows found in CSV" }],
          totalRows: parsed.totalRows,
        };
      }

      // Collect unique ASINs and look up product IDs
      const uniqueAsins = [...new Set(parsed.rows.map((r) => r.parentAsin))];
      const productRows = await db
        .select({ id: products.id, parentAsin: products.parentAsin })
        .from(products)
        .where(
          sql`${products.parentAsin} IN (${sql.join(
            uniqueAsins.map((a) => sql`${a}`),
            sql`, `
          )})`
        );

      const asinToProductId = new Map<string, number>();
      for (const p of productRows) {
        asinToProductId.set(p.parentAsin, p.id);
      }

      const skippedAsins = uniqueAsins.filter((a) => !asinToProductId.has(a));

      let imported = 0;
      const importErrors = [...parsed.errors];

      const batchSize = 100;
      // Filter to rows with known products
      const validRows = parsed.rows.filter((r) => asinToProductId.has(r.parentAsin));

      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize);

        const values = batch.map((row) => ({
          date: row.date,
          marketplaceId,
          productId: asinToProductId.get(row.parentAsin)!,
          parentAsin: row.parentAsin,
          sessions: row.sessions,
          pageViews: row.pageViews,
          unitsOrdered: row.unitsOrdered,
          totalSales: row.totalSales,
          totalOrders: row.totalOrders,
        }));

        await db
          .insert(productDailyMetrics)
          .values(values)
          .onConflictDoUpdate({
            target: [
              productDailyMetrics.date,
              productDailyMetrics.marketplaceId,
              productDailyMetrics.parentAsin,
            ],
            set: {
              sessions: sql`EXCLUDED.sessions`,
              pageViews: sql`EXCLUDED.page_views`,
              unitsOrdered: sql`EXCLUDED.units_ordered`,
              totalSales: sql`EXCLUDED.total_sales`,
              totalOrders: sql`EXCLUDED.total_orders`,
            },
          });

        imported += batch.length;
      }

      if (skippedAsins.length > 0) {
        importErrors.push({
          row: 0,
          message: `ASINs not found in products table (skipped): ${skippedAsins.join(", ")}`,
        });
      }

      return {
        success: true,
        imported,
        skippedAsins,
        errors: importErrors,
        totalRows: parsed.totalRows,
      };
    }),
});
