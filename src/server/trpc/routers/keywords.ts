import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { db } from "@/server/db";
import { keywordDailyMetrics } from "@/server/db/schema";
import { eq, and, gte, lte, like, desc, asc, sql, or } from "drizzle-orm";

export const keywordsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
          sortBy: z
            .enum([
              "keywordText",
              "matchType",
              "campaignName",
              "impressions",
              "clicks",
              "ctr",
              "cpc",
              "spend",
              "sales",
              "orders",
              "units",
              "cvr",
              "acos",
              "roas",
              "wasPct",
            ])
            .default("spend"),
          sortDir: z.enum(["asc", "desc"]).default("desc"),
          productId: z.number().optional(),
          matchTypes: z.array(z.string()).optional(),
          minSpend: z.number().optional(),
          maxSpend: z.number().optional(),
          minAcos: z.number().optional(),
          maxAcos: z.number().optional(),
          search: z.string().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 25;
      const sortBy = input?.sortBy ?? "spend";
      const sortDir = input?.sortDir ?? "desc";

      // Build WHERE conditions
      const conditions = [];

      if (input?.productId) {
        conditions.push(eq(keywordDailyMetrics.productId, input.productId));
      }

      if (input?.matchTypes && input.matchTypes.length > 0) {
        conditions.push(
          or(
            ...input.matchTypes.map((mt) =>
              eq(keywordDailyMetrics.matchType, mt)
            )
          )!
        );
      }

      if (input?.search) {
        conditions.push(
          like(keywordDailyMetrics.keywordText, `%${input.search}%`)
        );
      }

      if (input?.dateFrom) {
        conditions.push(gte(keywordDailyMetrics.date, input.dateFrom));
      }

      if (input?.dateTo) {
        conditions.push(lte(keywordDailyMetrics.date, input.dateTo));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Aggregated SELECT fields
      const selectFields = {
        keywordText: keywordDailyMetrics.keywordText,
        matchType: keywordDailyMetrics.matchType,
        campaignName: keywordDailyMetrics.campaignName,
        adGroupName: keywordDailyMetrics.adGroupName,
        impressions: sql<number>`SUM(${keywordDailyMetrics.impressions})`.as(
          "impressions"
        ),
        clicks: sql<number>`SUM(${keywordDailyMetrics.clicks})`.as("clicks"),
        spend: sql<number>`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`.as(
          "spend"
        ),
        sales: sql<number>`SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC))`.as(
          "sales"
        ),
        orders: sql<number>`SUM(${keywordDailyMetrics.orders})`.as("orders"),
        units: sql<number>`SUM(${keywordDailyMetrics.units})`.as("units"),
      };

      // Build ORDER BY based on sortBy
      const sortColumn = (() => {
        switch (sortBy) {
          case "keywordText":
            return keywordDailyMetrics.keywordText;
          case "matchType":
            return keywordDailyMetrics.matchType;
          case "campaignName":
            return keywordDailyMetrics.campaignName;
          case "impressions":
            return sql`SUM(${keywordDailyMetrics.impressions})`;
          case "clicks":
            return sql`SUM(${keywordDailyMetrics.clicks})`;
          case "spend":
            return sql`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`;
          case "sales":
            return sql`SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC))`;
          case "orders":
            return sql`SUM(${keywordDailyMetrics.orders})`;
          case "units":
            return sql`SUM(${keywordDailyMetrics.units})`;
          case "ctr":
            return sql`CASE WHEN SUM(${keywordDailyMetrics.impressions}) = 0 THEN 0 ELSE SUM(${keywordDailyMetrics.clicks})::numeric / SUM(${keywordDailyMetrics.impressions}) END`;
          case "cpc":
            return sql`CASE WHEN SUM(${keywordDailyMetrics.clicks}) = 0 THEN 0 ELSE SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) / SUM(${keywordDailyMetrics.clicks}) END`;
          case "cvr":
            return sql`CASE WHEN SUM(${keywordDailyMetrics.clicks}) = 0 THEN 0 ELSE SUM(${keywordDailyMetrics.orders})::numeric / SUM(${keywordDailyMetrics.clicks}) END`;
          case "acos":
            return sql`CASE WHEN SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)) = 0 THEN 0 ELSE SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) / SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)) END`;
          case "roas":
            return sql`CASE WHEN SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) = 0 THEN 0 ELSE SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)) / SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) END`;
          case "wasPct":
            return sql`CASE WHEN SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) = 0 THEN 0 ELSE SUM(CASE WHEN CAST(${keywordDailyMetrics.sales} AS NUMERIC) = 0 THEN CAST(${keywordDailyMetrics.spend} AS NUMERIC) ELSE 0 END) / SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) END`;
          default:
            return sql`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`;
        }
      })();

      const orderByClause =
        sortDir === "desc" ? desc(sortColumn) : asc(sortColumn);

      // HAVING conditions for aggregated filters
      const havingConditions = [];

      if (input?.minSpend !== undefined) {
        havingConditions.push(
          sql`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) >= ${input.minSpend}`
        );
      }

      if (input?.maxSpend !== undefined) {
        havingConditions.push(
          sql`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) <= ${input.maxSpend}`
        );
      }

      if (input?.minAcos !== undefined) {
        havingConditions.push(
          sql`CASE WHEN SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)) = 0 THEN 999 ELSE SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) / SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)) * 100 END >= ${input.minAcos}`
        );
      }

      if (input?.maxAcos !== undefined) {
        havingConditions.push(
          sql`CASE WHEN SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)) = 0 THEN 999 ELSE SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)) / SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)) * 100 END <= ${input.maxAcos}`
        );
      }

      const havingClause =
        havingConditions.length > 0
          ? sql.join(havingConditions, sql` AND `)
          : undefined;

      // Count total rows
      const countQuery = db
        .select({
          cnt: sql<number>`1`,
        })
        .from(keywordDailyMetrics)
        .where(whereClause)
        .groupBy(
          keywordDailyMetrics.keywordText,
          keywordDailyMetrics.matchType,
          keywordDailyMetrics.campaignName
        );

      // We wrap it to get the count of groups
      const countResult = await db.execute(
        sql`SELECT COUNT(*) as total FROM (${countQuery}) AS sub`
      );
      const total = Number(countResult[0]?.total ?? 0);

      // Fetch paginated items
      let query = db
        .select(selectFields)
        .from(keywordDailyMetrics)
        .where(whereClause)
        .groupBy(
          keywordDailyMetrics.keywordText,
          keywordDailyMetrics.matchType,
          keywordDailyMetrics.campaignName,
          keywordDailyMetrics.adGroupName
        )
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      if (havingClause) {
        query = query.having(havingClause) as typeof query;
      }

      const rawItems = await query;

      // Compute derived metrics
      const items = rawItems.map((row) => {
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        const spend = Number(row.spend) || 0;
        const sales = Number(row.sales) || 0;
        const orders = Number(row.orders) || 0;
        const units = Number(row.units) || 0;

        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const cvr = clicks > 0 ? (orders / clicks) * 100 : 0;
        const acos = sales > 0 ? (spend / sales) * 100 : 0;
        const roas = spend > 0 ? sales / spend : 0;

        return {
          keywordText: row.keywordText,
          matchType: row.matchType,
          campaignName: row.campaignName ?? "",
          adGroupName: row.adGroupName ?? "",
          impressions,
          clicks,
          ctr: Math.round(ctr * 100) / 100,
          cpc: Math.round(cpc * 100) / 100,
          spend: Math.round(spend * 100) / 100,
          sales: Math.round(sales * 100) / 100,
          orders,
          units,
          cvr: Math.round(cvr * 100) / 100,
          acos: Math.round(acos * 100) / 100,
          roas: Math.round(roas * 100) / 100,
        };
      });

      return {
        items,
        total,
        page,
        pageSize,
      };
    }),

  getDetail: protectedProcedure
    .input(
      z.object({
        keywordText: z.string(),
        matchType: z.string(),
        productId: z.number().optional(),
        days: z.number().default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [
        eq(keywordDailyMetrics.keywordText, input.keywordText),
        eq(keywordDailyMetrics.matchType, input.matchType),
      ];

      if (input.productId) {
        conditions.push(eq(keywordDailyMetrics.productId, input.productId));
      }

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - input.days);
      conditions.push(
        gte(
          keywordDailyMetrics.date,
          dateFrom.toISOString().split("T")[0]!
        )
      );

      const dailyData = await db
        .select({
          date: keywordDailyMetrics.date,
          impressions: sql<number>`SUM(${keywordDailyMetrics.impressions})`,
          clicks: sql<number>`SUM(${keywordDailyMetrics.clicks})`,
          spend: sql<number>`SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC))`,
          sales: sql<number>`SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC))`,
          orders: sql<number>`SUM(${keywordDailyMetrics.orders})`,
          units: sql<number>`SUM(${keywordDailyMetrics.units})`,
        })
        .from(keywordDailyMetrics)
        .where(and(...conditions))
        .groupBy(keywordDailyMetrics.date)
        .orderBy(asc(keywordDailyMetrics.date));

      const daily = dailyData.map((row) => {
        const impressions = Number(row.impressions) || 0;
        const clicks = Number(row.clicks) || 0;
        const spend = Number(row.spend) || 0;
        const sales = Number(row.sales) || 0;
        const orders = Number(row.orders) || 0;

        return {
          date: row.date,
          impressions,
          clicks,
          spend: Math.round(spend * 100) / 100,
          sales: Math.round(sales * 100) / 100,
          orders,
          units: Number(row.units) || 0,
          ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
          cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
          acos: sales > 0 ? Math.round((spend / sales) * 10000) / 100 : 0,
        };
      });

      return {
        keywordText: input.keywordText,
        matchType: input.matchType,
        daily,
      };
    }),
});
