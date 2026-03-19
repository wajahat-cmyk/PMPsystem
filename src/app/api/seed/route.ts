import { NextResponse } from "next/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import { sql } from "drizzle-orm";

export async function POST() {
  try {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
    }

    const client = postgres(connectionString, { max: 1 });
    const db = drizzle(client, { schema });

    // Check if already seeded
    const existing = await db.select({ count: sql<number>`count(*)` }).from(schema.brands);
    if (Number(existing[0].count) > 0) {
      await client.end();
      return NextResponse.json({ message: "Database already seeded", brandsCount: Number(existing[0].count) });
    }

    // Seed brands
    const [decolure, sleephoria, sleepSanctuary] = await db
      .insert(schema.brands)
      .values([
        { name: "DECOLURE" },
        { name: "SLEEPHORIA" },
        { name: "SLEEP SANCTUARY" },
      ])
      .returning();

    // Seed marketplace
    await db.insert(schema.marketplaces).values([
      { id: "ATVPDKIKX0DER", name: "United States", currency: "USD" },
    ]);

    // Seed products
    const productData = [
      { brandId: decolure.id, parentAsin: "B08KQKPKWC", name: "Bamboo Sheets", productLine: "bamboo_sheets", basePrice: "75.99", currentStage: "growth" as const },
      { brandId: decolure.id, parentAsin: "B0D952H31F", name: "Bamboo Sheets 6PCS", productLine: "bamboo_sheets", basePrice: "89.99", currentStage: "growth" as const },
      { brandId: decolure.id, parentAsin: "B0CRVZ1TTS", name: "Satin Sheets", productLine: "satin_sheets_decolure", basePrice: "29.95", currentStage: "maintenance" as const },
      { brandId: decolure.id, parentAsin: "B0CRF7S2TH", name: "Satin Sheets 6 Pcs", productLine: "satin_sheets_decolure", basePrice: "29.95", currentStage: "maintenance" as const },
      { brandId: decolure.id, parentAsin: "B0DZ17NCJ4", name: "Satin Fitted Sheet", productLine: "satin_sheets_decolure", basePrice: "17.95", currentStage: "launch" as const },
      { brandId: decolure.id, parentAsin: "B0DQQQWYPT", name: "Silk Pillow Case", productLine: "silk_pillowcase", basePrice: "44.95", currentStage: "launch" as const },
      { brandId: sleephoria.id, parentAsin: "B0FTSWF3M7", name: "Cooling Sheets", productLine: "cooling_sheets", basePrice: "64.99", currentStage: "launch" as const },
      { brandId: sleephoria.id, parentAsin: "B0FTSVDG77", name: "Cooling Pillowcase", productLine: "cooling_pillowcase", basePrice: "17.99", currentStage: "launch" as const },
      { brandId: sleephoria.id, parentAsin: "B0FTG1NNKG", name: "Cooling Comforter", productLine: "cooling_comforter", basePrice: "69.99", currentStage: "launch" as const },
      { brandId: sleepSanctuary.id, parentAsin: "B0F2G983W3", name: "Satin 4PCs", productLine: "satin_sheets_sleep_sanctuary", basePrice: "35.95", currentStage: "launch" as const },
      { brandId: sleepSanctuary.id, parentAsin: "B0F55Y1P53", name: "Bamboo 6PCS", productLine: "bamboo_sheets_sleep_sanctuary", basePrice: "69.99", currentStage: "launch" as const },
      { brandId: decolure.id, parentAsin: "B0FGZGFRL2", name: "Hanging Closet", productLine: "hanging_closet", basePrice: "41.95", currentStage: "launch" as const },
    ];

    const insertedProducts = await db.insert(schema.products).values(productData).returning();

    // Seed sync config
    await db.insert(schema.syncConfig).values([
      { syncType: "ppc_search_term", frequencyMinutes: 360, isEnabled: true, config: { reportType: "search_term", lookbackDays: 3 } },
      { syncType: "ppc_campaign", frequencyMinutes: 360, isEnabled: true, config: { reportType: "campaign", lookbackDays: 3 } },
      { syncType: "business_report", frequencyMinutes: 720, isEnabled: true, config: { lookbackDays: 2 } },
      { syncType: "sqp", frequencyMinutes: 1440, isEnabled: true, config: { lookbackWeeks: 1 } },
    ]);

    await client.end();

    return NextResponse.json({
      success: true,
      brands: 3,
      products: insertedProducts.length,
      marketplace: 1,
      syncConfigs: 4,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
