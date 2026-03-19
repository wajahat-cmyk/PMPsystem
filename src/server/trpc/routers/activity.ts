import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { db } from "@/server/db";
import { activityLog } from "@/server/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

export const activityRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(50),
          category: z
            .enum([
              "all",
              "ppc_change",
              "listing_change",
              "manual_input",
              "system_action",
            ])
            .default("all"),
          productId: z.number().optional(),
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 50;

      const conditions = [];

      // Category filter — map display categories to eventCategory values
      if (input?.category && input.category !== "all") {
        const categoryMap: Record<string, string> = {
          ppc_change: "ppc",
          listing_change: "listing",
          manual_input: "manual_input",
          system_action: "system",
        };
        const dbCategory = categoryMap[input.category] ?? input.category;
        conditions.push(eq(activityLog.eventCategory, dbCategory));
      }

      if (input?.productId) {
        conditions.push(eq(activityLog.productId, input.productId));
      }

      if (input?.dateFrom) {
        conditions.push(
          gte(activityLog.timestamp, new Date(input.dateFrom))
        );
      }

      if (input?.dateTo) {
        // End of day
        const endDate = new Date(input.dateTo);
        endDate.setHours(23, 59, 59, 999);
        conditions.push(lte(activityLog.timestamp, endDate));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      // Get total count
      const countResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(activityLog)
        .where(whereClause);

      const total = Number(countResult[0]?.count ?? 0);

      // Get paginated items
      const items = await db
        .select()
        .from(activityLog)
        .where(whereClause)
        .orderBy(desc(activityLog.timestamp))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        items: items.map((item) => ({
          id: item.id,
          timestamp: item.timestamp.toISOString(),
          actorType: item.actorType,
          actorId: item.actorId,
          actorName: item.actorName,
          eventCategory: item.eventCategory,
          eventType: item.eventType,
          eventAction: item.eventAction,
          entityType: item.entityType,
          entityId: item.entityId,
          entityName: item.entityName,
          productId: item.productId,
          brandId: item.brandId,
          marketplaceId: item.marketplaceId,
          fieldChanged: item.fieldChanged,
          oldValue: item.oldValue,
          newValue: item.newValue,
          changeDelta: item.changeDelta,
          source: item.source,
          notes: item.notes,
        })),
        total,
        page,
        pageSize,
      };
    }),
});
