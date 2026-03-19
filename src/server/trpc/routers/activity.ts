import { router, protectedProcedure } from "../trpc";
import { z } from "zod";

export const activityRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(50).default(20),
          type: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      // TODO: return activity log entries
      return {
        items: [] as Array<{
          id: string;
          type: string;
          message: string;
          metadata: Record<string, unknown>;
          createdAt: string;
        }>,
        total: 0,
      };
    }),
});
