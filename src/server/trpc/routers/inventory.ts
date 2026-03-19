import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { sql, eq } from "drizzle-orm";
import { skuInventory } from "@/server/db/schema/inventory";
import { products } from "@/server/db/schema/products";

export const inventoryRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          market: z.string().default("US"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const market = input?.market ?? "US";

      const rows = await ctx.db
        .select({
          id: skuInventory.id,
          productId: skuInventory.productId,
          sku: skuInventory.sku,
          asin: skuInventory.asin,
          market: skuInventory.market,
          fbaAvailable: skuInventory.fbaAvailable,
          fbaTotal: skuInventory.fbaTotal,
          awdInventory: skuInventory.awdInventory,
          totalStock: skuInventory.totalStock,
          avgDailyOrders: skuInventory.avgDailyOrders,
          targetSalesVelocity: skuInventory.targetSalesVelocity,
          daysOfStock: skuInventory.daysOfStock,
          reorderPointDays: skuInventory.reorderPointDays,
          reorderDate: skuInventory.reorderDate,
          ossFbaDate: skuInventory.ossFbaDate,
          inventoryStatus: skuInventory.inventoryStatus,
          currentlyTargeting: skuInventory.currentlyTargeting,
          campaignCount: skuInventory.campaignCount,
          spend7d: skuInventory.spend7d,
          sales7d: skuInventory.sales7d,
          acos7d: skuInventory.acos7d,
          comment: skuInventory.comment,
          updatedAt: skuInventory.updatedAt,
          productName: products.name,
          parentAsin: products.parentAsin,
        })
        .from(skuInventory)
        .leftJoin(products, eq(skuInventory.productId, products.id))
        .where(eq(skuInventory.market, market))
        .orderBy(skuInventory.daysOfStock);

      return rows.map((row) => ({
        ...row,
        avgDailyOrders: row.avgDailyOrders ? Number(row.avgDailyOrders) : null,
        targetSalesVelocity: row.targetSalesVelocity
          ? Number(row.targetSalesVelocity)
          : null,
        spend7d: row.spend7d ? Number(row.spend7d) : null,
        sales7d: row.sales7d ? Number(row.sales7d) : null,
        acos7d: row.acos7d ? Number(row.acos7d) : null,
      }));
    }),

  getStats: protectedProcedure
    .input(
      z
        .object({
          market: z.string().default("US"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const market = input?.market ?? "US";

      const result = await ctx.db
        .select({
          totalSkus: sql<number>`COUNT(*)`,
          inStock: sql<number>`COUNT(*) FILTER (WHERE ${skuInventory.inventoryStatus} = 'in_stock')`,
          outOfStock: sql<number>`COUNT(*) FILTER (WHERE ${skuInventory.inventoryStatus} = 'out_of_stock')`,
          soonOos: sql<number>`COUNT(*) FILTER (WHERE ${skuInventory.inventoryStatus} IN ('soon_oos', 'lif_soon_oos'))`,
          avgDaysOfStock: sql<number>`COALESCE(AVG(${skuInventory.daysOfStock}), 0)`,
          skusUnder30d: sql<number>`COUNT(*) FILTER (WHERE ${skuInventory.daysOfStock} < 30 AND ${skuInventory.daysOfStock} IS NOT NULL)`,
          skusUnder60d: sql<number>`COUNT(*) FILTER (WHERE ${skuInventory.daysOfStock} < 60 AND ${skuInventory.daysOfStock} >= 30)`,
        })
        .from(skuInventory)
        .where(eq(skuInventory.market, market));

      const row = result[0];
      if (!row) {
        return {
          totalSkus: 0,
          inStock: 0,
          outOfStock: 0,
          soonOos: 0,
          avgDaysOfStock: 0,
          skusUnder30d: 0,
          skusUnder60d: 0,
        };
      }

      return {
        totalSkus: Number(row.totalSkus),
        inStock: Number(row.inStock),
        outOfStock: Number(row.outOfStock),
        soonOos: Number(row.soonOos),
        avgDaysOfStock: Math.round(Number(row.avgDaysOfStock)),
        skusUnder30d: Number(row.skusUnder30d),
        skusUnder60d: Number(row.skusUnder60d),
      };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        fbaAvailable: z.number().optional(),
        fbaTotal: z.number().optional(),
        awdInventory: z.number().optional(),
        totalStock: z.number().optional(),
        avgDailyOrders: z.number().optional(),
        targetSalesVelocity: z.number().optional(),
        daysOfStock: z.number().optional(),
        reorderPointDays: z.number().optional(),
        reorderDate: z.string().optional(),
        ossFbaDate: z.string().optional(),
        inventoryStatus: z
          .enum(["in_stock", "out_of_stock", "soon_oos", "lif_soon_oos"])
          .optional(),
        currentlyTargeting: z.boolean().optional(),
        campaignCount: z.number().optional(),
        spend7d: z.number().optional(),
        sales7d: z.number().optional(),
        acos7d: z.number().optional(),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, reorderDate, ossFbaDate, ...rest } = input;

      const updateData: Record<string, unknown> = { ...rest };

      if (reorderDate !== undefined) {
        updateData.reorderDate = new Date(reorderDate);
      }
      if (ossFbaDate !== undefined) {
        updateData.ossFbaDate = new Date(ossFbaDate);
      }
      updateData.updatedAt = new Date();

      // Filter out undefined values
      const filtered = Object.fromEntries(
        Object.entries(updateData).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(filtered).length === 0) {
        return { success: false, message: "No fields to update" };
      }

      await ctx.db
        .update(skuInventory)
        .set(filtered)
        .where(eq(skuInventory.id, id));

      return { success: true };
    }),

  importCsv: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            sku: z.string(),
            asin: z.string().optional(),
            productId: z.number().optional(),
            market: z.string().default("US"),
            fbaAvailable: z.number().default(0),
            fbaTotal: z.number().default(0),
            awdInventory: z.number().default(0),
            totalStock: z.number().default(0),
            avgDailyOrders: z.number().optional(),
            targetSalesVelocity: z.number().optional(),
            daysOfStock: z.number().optional(),
            reorderPointDays: z.number().optional(),
            inventoryStatus: z.string().default("in_stock"),
            currentlyTargeting: z.boolean().default(false),
            campaignCount: z.number().default(0),
            comment: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let inserted = 0;
      let updated = 0;

      for (const row of input.rows) {
        // Check if SKU already exists
        const existing = await ctx.db
          .select({ id: skuInventory.id })
          .from(skuInventory)
          .where(eq(skuInventory.sku, row.sku))
          .limit(1);

        if (existing.length > 0) {
          // Update existing
          await ctx.db
            .update(skuInventory)
            .set({
              asin: row.asin,
              productId: row.productId,
              market: row.market,
              fbaAvailable: row.fbaAvailable,
              fbaTotal: row.fbaTotal,
              awdInventory: row.awdInventory,
              totalStock: row.totalStock,
              avgDailyOrders: row.avgDailyOrders?.toString(),
              targetSalesVelocity: row.targetSalesVelocity?.toString(),
              daysOfStock: row.daysOfStock,
              reorderPointDays: row.reorderPointDays,
              inventoryStatus: row.inventoryStatus,
              currentlyTargeting: row.currentlyTargeting,
              campaignCount: row.campaignCount,
              comment: row.comment,
              updatedAt: new Date(),
            })
            .where(eq(skuInventory.id, existing[0]!.id));
          updated++;
        } else {
          // Insert new
          await ctx.db.insert(skuInventory).values({
            sku: row.sku,
            asin: row.asin,
            productId: row.productId,
            market: row.market,
            fbaAvailable: row.fbaAvailable,
            fbaTotal: row.fbaTotal,
            awdInventory: row.awdInventory,
            totalStock: row.totalStock,
            avgDailyOrders: row.avgDailyOrders?.toString(),
            targetSalesVelocity: row.targetSalesVelocity?.toString(),
            daysOfStock: row.daysOfStock,
            reorderPointDays: row.reorderPointDays,
            inventoryStatus: row.inventoryStatus,
            currentlyTargeting: row.currentlyTargeting,
            campaignCount: row.campaignCount,
            comment: row.comment,
          });
          inserted++;
        }
      }

      return { inserted, updated, total: input.rows.length };
    }),
});
