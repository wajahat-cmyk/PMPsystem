import { router, protectedProcedure } from "../trpc";
import { z } from "zod";
import { sql, eq, gte, and, desc } from "drizzle-orm";
import { keywordDailyMetrics } from "@/server/db/schema/keyword-metrics";
import { productDailyMetrics } from "@/server/db/schema/product-metrics";
import { products } from "@/server/db/schema/products";
import { brands } from "@/server/db/schema/brands";

type GateStatus = "PASS" | "WARN" | "FAIL";
type Segment = "CRITICAL" | "OPTIMIZATION" | "SCALE";

interface ActionItem {
  priority: string;
  action: string;
  sopReference: string;
}

interface ProductActionPlan {
  productId: number;
  productName: string;
  parentAsin: string;
  brand: string;
  stage: string;
  segment: Segment;

  // Gates
  profitabilityGate: GateStatus;
  inventoryGate: GateStatus;

  // Metrics (7d)
  totalSales: number;
  totalSpend: number;
  acos: number;
  tacos: number;
  organicOrderPct: number;
  wasPct: number;
  breakevenAcos: number;

  // Reasons for classification
  reasons: string[];

  // Recommended actions
  actions: ActionItem[];
}

function evaluateProfitabilityGate(
  acos: number,
  breakevenAcos: number
): GateStatus {
  if (breakevenAcos <= 0) return "PASS";
  if (acos < breakevenAcos) return "PASS";
  if (acos < breakevenAcos + 5) return "WARN";
  return "FAIL";
}

function classifyProduct(
  tacos: number,
  acos: number,
  breakevenAcos: number,
  spend: number,
  organicOrderPct: number
): { segment: Segment; reasons: string[] } {
  const reasons: string[] = [];

  // Check CRITICAL conditions
  const isCritical =
    tacos > 25 ||
    (acos > breakevenAcos && spend > 50) ||
    organicOrderPct < 30;

  if (tacos > 25) reasons.push(`TACOS ${tacos.toFixed(1)}% exceeds 25% threshold`);
  if (acos > breakevenAcos && spend > 50)
    reasons.push(
      `ACOS ${acos.toFixed(1)}% above breakeven ${breakevenAcos.toFixed(1)}% with $${spend.toFixed(0)} spend`
    );
  if (organicOrderPct < 30)
    reasons.push(
      `Organic order share ${organicOrderPct.toFixed(1)}% below 30% minimum`
    );

  if (isCritical) {
    return { segment: "CRITICAL", reasons };
  }

  // Check SCALE conditions
  const isScale =
    tacos < 15 && acos < breakevenAcos && organicOrderPct > 40;

  if (isScale) {
    reasons.push(`TACOS ${tacos.toFixed(1)}% under 15%`);
    reasons.push(`ACOS ${acos.toFixed(1)}% below breakeven ${breakevenAcos.toFixed(1)}%`);
    reasons.push(`Strong organic share at ${organicOrderPct.toFixed(1)}%`);
    return { segment: "SCALE", reasons };
  }

  // OPTIMIZATION (everything else)
  if (tacos >= 15 && tacos <= 25)
    reasons.push(`TACOS ${tacos.toFixed(1)}% in optimization range (15-25%)`);
  if (acos >= breakevenAcos)
    reasons.push(
      `ACOS ${acos.toFixed(1)}% at or above breakeven ${breakevenAcos.toFixed(1)}%`
    );
  if (organicOrderPct >= 30 && organicOrderPct <= 40)
    reasons.push(
      `Organic share ${organicOrderPct.toFixed(1)}% needs improvement (30-40% range)`
    );

  if (reasons.length === 0) {
    reasons.push("Metrics within optimization range");
  }

  return { segment: "OPTIMIZATION", reasons };
}

function getActionsForSegment(segment: Segment): ActionItem[] {
  switch (segment) {
    case "CRITICAL":
      return [
        {
          priority: "P0",
          action: 'Reduce bids on WAS >50% keywords',
          sopReference: "SOP-BID-001",
        },
        {
          priority: "P0",
          action: 'Pause ACOS >100% campaigns',
          sopReference: "SOP-CAMP-002",
        },
        {
          priority: "P1",
          action: "Review listing CTR and conversion rate",
          sopReference: "SOP-LIST-001",
        },
        {
          priority: "P1",
          action: "Audit search term reports for irrelevant traffic",
          sopReference: "SOP-NEG-001",
        },
      ];
    case "OPTIMIZATION":
      return [
        {
          priority: "P1",
          action: "Optimize placement mix (TOS vs ROS)",
          sopReference: "SOP-PLACE-001",
        },
        {
          priority: "P1",
          action: 'Run negative mining on WAS >40% keywords',
          sopReference: "SOP-NEG-002",
        },
        {
          priority: "P2",
          action: "Check syntax gaps and missing match types",
          sopReference: "SOP-KW-001",
        },
        {
          priority: "P2",
          action: "Review bid modifiers by dayparting",
          sopReference: "SOP-BID-003",
        },
      ];
    case "SCALE":
      return [
        {
          priority: "P2",
          action: "Increase budget on profitable campaigns +20-30%",
          sopReference: "SOP-BUDGET-001",
        },
        {
          priority: "P2",
          action: "Expand match types on converting keywords",
          sopReference: "SOP-KW-002",
        },
        {
          priority: "P3",
          action: "Check inventory levels before scaling",
          sopReference: "SOP-INV-001",
        },
        {
          priority: "P3",
          action: "Test Sponsored Brands / Display ads",
          sopReference: "SOP-SB-001",
        },
      ];
  }
}

const SEGMENT_ORDER: Record<Segment, number> = {
  CRITICAL: 0,
  OPTIMIZATION: 1,
  SCALE: 2,
};

export const actionPlanRouter = router({
  getActionPlan: protectedProcedure
    .input(
      z
        .object({
          days: z.number().default(7),
          marketplaceId: z.string().default("ATVPDKIKX0DER"),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 7;
      const marketplaceId = input?.marketplaceId ?? "ATVPDKIKX0DER";

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split("T")[0]!;

      // Get PPC metrics per product from keyword_daily_metrics
      const ppcRows = await ctx.db
        .select({
          productId: keywordDailyMetrics.productId,
          productName: products.name,
          parentAsin: products.parentAsin,
          brandName: brands.name,
          currentStage: products.currentStage,
          basePrice: products.basePrice,
          cogs: products.cogs,
          breakevenAcos: products.breakevenAcos,
          ppcSales: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.sales} AS NUMERIC)), 0)`,
          ppcSpend: sql<number>`COALESCE(SUM(CAST(${keywordDailyMetrics.spend} AS NUMERIC)), 0)`,
          ppcOrders: sql<number>`COALESCE(SUM(${keywordDailyMetrics.orders}), 0)`,
          wastedSpend: sql<number>`COALESCE(SUM(CASE WHEN ${keywordDailyMetrics.orders} = 0 THEN CAST(${keywordDailyMetrics.spend} AS NUMERIC) ELSE 0 END), 0)`,
        })
        .from(keywordDailyMetrics)
        .innerJoin(products, eq(keywordDailyMetrics.productId, products.id))
        .innerJoin(brands, eq(products.brandId, brands.id))
        .where(
          and(
            gte(keywordDailyMetrics.date, startDateStr),
            eq(keywordDailyMetrics.marketplaceId, marketplaceId)
          )
        )
        .groupBy(
          keywordDailyMetrics.productId,
          products.name,
          products.parentAsin,
          brands.name,
          products.currentStage,
          products.basePrice,
          products.cogs,
          products.breakevenAcos
        );

      // Get total sales per product from product_daily_metrics (includes organic)
      const totalSalesRows = await ctx.db
        .select({
          productId: productDailyMetrics.productId,
          totalSales: sql<number>`COALESCE(SUM(CAST(${productDailyMetrics.totalSales} AS NUMERIC)), 0)`,
          totalOrders: sql<number>`COALESCE(SUM(${productDailyMetrics.totalOrders}), 0)`,
          organicOrders: sql<number>`COALESCE(SUM(${productDailyMetrics.organicOrders}), 0)`,
          ppcOrders: sql<number>`COALESCE(SUM(${productDailyMetrics.ppcOrders}), 0)`,
        })
        .from(productDailyMetrics)
        .where(
          and(
            gte(productDailyMetrics.date, startDateStr),
            eq(productDailyMetrics.marketplaceId, marketplaceId)
          )
        )
        .groupBy(productDailyMetrics.productId);

      const totalSalesMap = new Map(
        totalSalesRows.map((r) => [r.productId, r])
      );

      const actionPlans: ProductActionPlan[] = ppcRows.map((row) => {
        const ppcSales = Number(row.ppcSales);
        const ppcSpend = Number(row.ppcSpend);
        const ppcOrders = Number(row.ppcOrders);
        const wastedSpend = Number(row.wastedSpend);
        const beAcos = row.breakevenAcos ? Number(row.breakevenAcos) * 100 : 35; // default 35%

        // Get organic data from productDailyMetrics if available
        const prodMetrics = totalSalesMap.get(row.productId);
        const totalSales = prodMetrics
          ? Number(prodMetrics.totalSales)
          : ppcSales;
        const totalOrders = prodMetrics
          ? Number(prodMetrics.totalOrders)
          : ppcOrders;
        const organicOrders = prodMetrics
          ? Number(prodMetrics.organicOrders)
          : 0;

        // Calculate metrics
        const acosVal = ppcSales > 0 ? (ppcSpend / ppcSales) * 100 : 0;
        const tacosVal = totalSales > 0 ? (ppcSpend / totalSales) * 100 : 0;
        const organicOrderPct =
          totalOrders > 0 ? (organicOrders / totalOrders) * 100 : 0;
        const wasPct = ppcSpend > 0 ? (wastedSpend / ppcSpend) * 100 : 0;

        // Evaluate gates
        const profitabilityGate = evaluateProfitabilityGate(acosVal, beAcos);
        const inventoryGate: GateStatus = "PASS"; // MVP — real inventory in Phase 3

        // Classify
        const { segment, reasons } = classifyProduct(
          tacosVal,
          acosVal,
          beAcos,
          ppcSpend,
          organicOrderPct
        );

        // Get actions
        const actions = getActionsForSegment(segment);

        return {
          productId: row.productId,
          productName: row.productName,
          parentAsin: row.parentAsin,
          brand: row.brandName,
          stage: row.currentStage ?? "launch",
          segment,
          profitabilityGate,
          inventoryGate,
          totalSales: Math.round(totalSales * 100) / 100,
          totalSpend: Math.round(ppcSpend * 100) / 100,
          acos: Math.round(acosVal * 100) / 100,
          tacos: Math.round(tacosVal * 100) / 100,
          organicOrderPct: Math.round(organicOrderPct * 100) / 100,
          wasPct: Math.round(wasPct * 100) / 100,
          breakevenAcos: Math.round(beAcos * 100) / 100,
          reasons,
          actions,
        };
      });

      // Sort: CRITICAL first, then OPTIMIZATION, then SCALE
      actionPlans.sort((a, b) => {
        const segDiff = SEGMENT_ORDER[a.segment] - SEGMENT_ORDER[b.segment];
        if (segDiff !== 0) return segDiff;
        // Within same segment, sort by spend descending (highest spend first)
        return b.totalSpend - a.totalSpend;
      });

      return actionPlans;
    }),
});
