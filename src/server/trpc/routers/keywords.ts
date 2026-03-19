import { router, protectedProcedure } from "../trpc";
import { z } from "zod";

export const keywordsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          asin: z.string().optional(),
          campaignId: z.string().optional(),
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
          search: z.string().optional(),
          sortBy: z.string().optional(),
          sortDir: z.enum(["asc", "desc"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // TODO: query keywords from DB
      return {
        items: [] as Array<{
          id: string;
          keyword: string;
          matchType: string;
          impressions: number;
          clicks: number;
          spend: number;
          sales: number;
          acos: number;
          ctr: number;
          cvr: number;
        }>,
        total: 0,
        page: input?.page ?? 1,
        pageSize: input?.pageSize ?? 25,
      };
    }),

  getPerformance: protectedProcedure
    .input(
      z.object({
        keywordId: z.string(),
        dateRange: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // TODO: return keyword performance over time
      return {
        data: [] as Array<{
          date: string;
          impressions: number;
          clicks: number;
          spend: number;
          sales: number;
        }>,
      };
    }),
});
