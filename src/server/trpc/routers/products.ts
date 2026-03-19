import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { products, variations } from "@/server/db/schema/products";
import { brands } from "@/server/db/schema/brands";
import { eq, like, desc, asc, sql, count, and, or } from "drizzle-orm";

export const productsRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          page: z.number().min(1).default(1),
          pageSize: z.number().min(1).max(100).default(25),
          search: z.string().optional(),
          sortBy: z
            .enum(["name", "parentAsin", "basePrice", "cogs", "currentStage", "createdAt"])
            .optional(),
          sortDir: z.enum(["asc", "desc"]).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 25;
      const offset = (page - 1) * pageSize;

      const conditions = [eq(products.isActive, true)];

      if (input?.search) {
        const term = `%${input.search}%`;
        conditions.push(
          or(
            like(products.name, term),
            like(products.parentAsin, term)
          )!
        );
      }

      const where = and(...conditions);

      const sortColumn = (() => {
        switch (input?.sortBy) {
          case "name":
            return products.name;
          case "parentAsin":
            return products.parentAsin;
          case "basePrice":
            return products.basePrice;
          case "cogs":
            return products.cogs;
          case "currentStage":
            return products.currentStage;
          case "createdAt":
            return products.createdAt;
          default:
            return products.createdAt;
        }
      })();

      const orderBy =
        input?.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

      const [items, totalResult] = await Promise.all([
        ctx.db
          .select({
            id: products.id,
            brandId: products.brandId,
            brandName: brands.name,
            parentAsin: products.parentAsin,
            name: products.name,
            category: products.category,
            productLine: products.productLine,
            basePrice: products.basePrice,
            cogs: products.cogs,
            targetAcos: products.targetAcos,
            targetTacos: products.targetTacos,
            breakevenAcos: products.breakevenAcos,
            currentStage: products.currentStage,
            isActive: products.isActive,
            createdAt: products.createdAt,
            updatedAt: products.updatedAt,
          })
          .from(products)
          .leftJoin(brands, eq(products.brandId, brands.id))
          .where(where)
          .orderBy(orderBy)
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ total: count() })
          .from(products)
          .where(where),
      ]);

      return {
        items,
        total: totalResult[0]?.total ?? 0,
        page,
        pageSize,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [product] = await ctx.db
        .select({
          id: products.id,
          brandId: products.brandId,
          brandName: brands.name,
          parentAsin: products.parentAsin,
          name: products.name,
          category: products.category,
          productLine: products.productLine,
          basePrice: products.basePrice,
          cogs: products.cogs,
          targetAcos: products.targetAcos,
          targetTacos: products.targetTacos,
          breakevenAcos: products.breakevenAcos,
          currentStage: products.currentStage,
          isActive: products.isActive,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
        })
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.id))
        .where(eq(products.id, input.id))
        .limit(1);

      if (!product) return null;

      const productVariations = await ctx.db
        .select()
        .from(variations)
        .where(
          and(
            eq(variations.productId, input.id),
            eq(variations.isActive, true)
          )
        );

      return { ...product, variations: productVariations };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        parentAsin: z.string().min(1).max(20),
        brandId: z.number(),
        category: z.string().optional(),
        productLine: z.string().optional(),
        basePrice: z.string().optional(),
        cogs: z.string().optional(),
        targetAcos: z.string().optional(),
        targetTacos: z.string().optional(),
        breakevenAcos: z.string().optional(),
        currentStage: z.enum(["launch", "growth", "maintenance"]).default("launch"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.parentAsin, input.parentAsin))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("A product with this Parent ASIN already exists.");
      }

      const [created] = await ctx.db
        .insert(products)
        .values({
          name: input.name,
          parentAsin: input.parentAsin,
          brandId: input.brandId,
          category: input.category ?? null,
          productLine: input.productLine ?? null,
          basePrice: input.basePrice ?? null,
          cogs: input.cogs ?? null,
          targetAcos: input.targetAcos ?? null,
          targetTacos: input.targetTacos ?? null,
          breakevenAcos: input.breakevenAcos ?? null,
          currentStage: input.currentStage,
        })
        .returning();

      return created;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1),
        parentAsin: z.string().min(1).max(20),
        brandId: z.number(),
        category: z.string().optional(),
        productLine: z.string().optional(),
        basePrice: z.string().optional(),
        cogs: z.string().optional(),
        targetAcos: z.string().optional(),
        targetTacos: z.string().optional(),
        breakevenAcos: z.string().optional(),
        currentStage: z.enum(["launch", "growth", "maintenance"]).default("launch"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.parentAsin, input.parentAsin),
            sql`${products.id} != ${input.id}`
          )
        )
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Another product with this Parent ASIN already exists.");
      }

      const [updated] = await ctx.db
        .update(products)
        .set({
          name: input.name,
          parentAsin: input.parentAsin,
          brandId: input.brandId,
          category: input.category ?? null,
          productLine: input.productLine ?? null,
          basePrice: input.basePrice ?? null,
          cogs: input.cogs ?? null,
          targetAcos: input.targetAcos ?? null,
          targetTacos: input.targetTacos ?? null,
          breakevenAcos: input.breakevenAcos ?? null,
          currentStage: input.currentStage,
          updatedAt: new Date(),
        })
        .where(eq(products.id, input.id))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(products.id, input.id))
        .returning({ id: products.id });

      return deleted;
    }),

  addVariation: protectedProcedure
    .input(
      z.object({
        productId: z.number(),
        childAsin: z.string().min(1).max(20),
        sku: z.string().optional(),
        price: z.string().optional(),
        variationAttributes: z
          .object({
            size: z.string().optional(),
            color: z.string().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(variations)
        .values({
          productId: input.productId,
          childAsin: input.childAsin,
          sku: input.sku ?? null,
          price: input.price ?? null,
          variationAttributes: input.variationAttributes ?? null,
        })
        .returning();

      return created;
    }),

  removeVariation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.db
        .update(variations)
        .set({ isActive: false })
        .where(eq(variations.id, input.id))
        .returning({ id: variations.id });

      return removed;
    }),

  listBrands: protectedProcedure.query(async ({ ctx }) => {
    const allBrands = await ctx.db
      .select()
      .from(brands)
      .orderBy(asc(brands.name));

    return allBrands;
  }),
});
