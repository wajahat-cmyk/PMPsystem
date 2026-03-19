import { router, protectedProcedure } from "../trpc";
import { z } from "zod";

export const commentsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["product", "keyword", "campaign"]),
        entityId: z.string(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      // TODO: return comments for the entity
      return {
        items: [] as Array<{
          id: string;
          text: string;
          author: string;
          createdAt: string;
          updatedAt: string | null;
        }>,
        total: 0,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["product", "keyword", "campaign"]),
        entityId: z.string(),
        text: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // TODO: insert comment into DB
      return {
        id: "",
        text: input.text,
        author: ctx.user.username,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // TODO: delete comment
      return { success: true };
    }),
});
