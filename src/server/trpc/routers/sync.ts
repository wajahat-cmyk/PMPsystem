import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { syncConfig, syncLog, apiCallLog } from "@/server/db/schema";
import { eq, desc, gte, sql, count, avg } from "drizzle-orm";

export const syncRouter = router({
  getConfigs: protectedProcedure.query(async ({ ctx }) => {
    const configs = await ctx.db
      .select()
      .from(syncConfig)
      .orderBy(syncConfig.syncType);

    return configs;
  }),

  updateConfig: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        frequencyMinutes: z.number().min(1),
        isEnabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(syncConfig)
        .set({
          frequencyMinutes: input.frequencyMinutes,
          isEnabled: input.isEnabled,
        })
        .where(eq(syncConfig.id, input.id))
        .returning();

      return updated;
    }),

  triggerManualSync: protectedProcedure
    .input(
      z.object({
        syncType: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [logEntry] = await ctx.db
        .insert(syncLog)
        .values({
          syncType: input.syncType,
          startedAt: new Date(),
          status: "queued",
          recordsFetched: 0,
          recordsProcessed: 0,
          apiCallsMade: 0,
          retryCount: 0,
        })
        .returning();

      // Phase 2: enqueue BullMQ job here
      return logEntry;
    }),

  getSyncHistory: protectedProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.pageSize;

      const [items, totalResult] = await Promise.all([
        ctx.db
          .select()
          .from(syncLog)
          .orderBy(desc(syncLog.startedAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ total: count() }).from(syncLog),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
      };
    }),

  getApiHealth: protectedProcedure.query(async ({ ctx }) => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [stats] = await ctx.db
      .select({
        totalCalls: count(),
        avgResponseTime: avg(apiCallLog.responseTimeMs),
      })
      .from(apiCallLog)
      .where(gte(apiCallLog.calledAt, twentyFourHoursAgo));

    const [successStats] = await ctx.db
      .select({
        successCount: count(),
      })
      .from(apiCallLog)
      .where(
        sql`${apiCallLog.calledAt} >= ${twentyFourHoursAgo} AND ${apiCallLog.statusCode} >= 200 AND ${apiCallLog.statusCode} < 300`
      );

    const totalCalls = stats?.totalCalls ?? 0;
    const successCount = successStats?.successCount ?? 0;
    const errorCount = totalCalls - successCount;
    const successRate = totalCalls > 0 ? (successCount / totalCalls) * 100 : 0;
    const errorRate = totalCalls > 0 ? (errorCount / totalCalls) * 100 : 0;
    const avgResponseTime = stats?.avgResponseTime
      ? Math.round(Number(stats.avgResponseTime))
      : 0;

    const breakdown = await ctx.db
      .select({
        apiType: apiCallLog.apiType,
        totalCalls: count(),
      })
      .from(apiCallLog)
      .where(gte(apiCallLog.calledAt, twentyFourHoursAgo))
      .groupBy(apiCallLog.apiType);

    return {
      totalCalls,
      successCount,
      errorCount,
      successRate: Math.round(successRate * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      avgResponseTime,
      breakdown,
    };
  }),
});
