import { router, protectedProcedure } from "../trpc";
import { z } from "zod";

export const overviewRouter = router({
  getMetricCards: protectedProcedure
    .input(z.object({ dateRange: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      // TODO: implement real metric aggregation from DB
      return {
        totalSales: 0,
        totalSpend: 0,
        acos: 0,
        tacos: 0,
        totalOrders: 0,
        avgAov: 0,
        ppcSales: 0,
        organicPct: 0,
        ppcOrderPct: 0,
        wasPct: 0,
        dailySalesVelocity: 0,
        impressions: 0,
      };
    }),

  getSalesChart: protectedProcedure
    .input(z.object({ dateRange: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      // TODO: return daily sales/spend time series
      return { data: [] as { date: string; sales: number; spend: number }[] };
    }),
});
