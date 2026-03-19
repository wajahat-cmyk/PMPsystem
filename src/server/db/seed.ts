import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log("Seeding database...");

  // --- Brands ---
  const [decolure, sleephoria, sleepSanctuary] = await db
    .insert(schema.brands)
    .values([
      { name: "DECOLURE" },
      { name: "SLEEPHORIA" },
      { name: "SLEEP SANCTUARY" },
    ])
    .returning();

  console.log(
    `Inserted 3 brands: ${decolure.name}, ${sleephoria.name}, ${sleepSanctuary.name}`
  );

  // --- Marketplaces ---
  await db.insert(schema.marketplaces).values([
    { id: "ATVPDKIKX0DER", name: "United States", currency: "USD" },
  ]);

  console.log("Inserted 1 marketplace: US (ATVPDKIKX0DER)");

  // --- Products ---
  const productData = [
    {
      brandId: decolure.id,
      parentAsin: "B08KQKPKWC",
      name: "Bamboo Sheets",
      productLine: "bamboo_sheets",
      basePrice: "75.99",
      currentStage: "growth" as const,
    },
    {
      brandId: decolure.id,
      parentAsin: "B0D952H31F",
      name: "Bamboo Sheets 6PCS",
      productLine: "bamboo_sheets",
      basePrice: "89.99",
      currentStage: "growth" as const,
    },
    {
      brandId: decolure.id,
      parentAsin: "B0CRVZ1TTS",
      name: "Satin Sheets",
      productLine: "satin_sheets_decolure",
      basePrice: "29.95",
      currentStage: "maintenance" as const,
    },
    {
      brandId: decolure.id,
      parentAsin: "B0CRF7S2TH",
      name: "Satin Sheets 6 Pcs",
      productLine: "satin_sheets_decolure",
      basePrice: "29.95",
      currentStage: "maintenance" as const,
    },
    {
      brandId: decolure.id,
      parentAsin: "B0DZ17NCJ4",
      name: "Satin Fitted Sheet",
      productLine: "satin_sheets_decolure",
      basePrice: "17.95",
      currentStage: "launch" as const,
    },
    {
      brandId: decolure.id,
      parentAsin: "B0DQQQWYPT",
      name: "Silk Pillow Case",
      productLine: "silk_pillowcase",
      basePrice: "44.95",
      currentStage: "launch" as const,
    },
    {
      brandId: sleephoria.id,
      parentAsin: "B0FTSWF3M7",
      name: "Cooling Sheets",
      productLine: "cooling_sheets",
      basePrice: "64.99",
      currentStage: "launch" as const,
    },
    {
      brandId: sleephoria.id,
      parentAsin: "B0FTSVDG77",
      name: "Cooling Pillowcase",
      productLine: "cooling_pillowcase",
      basePrice: "17.99",
      currentStage: "launch" as const,
    },
    {
      brandId: sleephoria.id,
      parentAsin: "B0FTG1NNKG",
      name: "Cooling Comforter",
      productLine: "cooling_comforter",
      basePrice: "69.99",
      currentStage: "launch" as const,
    },
    {
      brandId: sleepSanctuary.id,
      parentAsin: "B0F2G983W3",
      name: "Satin 4PCs",
      productLine: "satin_sheets_sleep_sanctuary",
      basePrice: "35.95",
      currentStage: "launch" as const,
    },
    {
      brandId: sleepSanctuary.id,
      parentAsin: "B0F55Y1P53",
      name: "Bamboo 6PCS",
      productLine: "bamboo_sheets_sleep_sanctuary",
      basePrice: "69.99",
      currentStage: "launch" as const,
    },
    {
      brandId: decolure.id,
      parentAsin: "B0FGZGFRL2",
      name: "Hanging Closet",
      productLine: "hanging_closet",
      basePrice: "41.95",
      currentStage: "launch" as const,
    },
  ];

  const insertedProducts = await db
    .insert(schema.products)
    .values(productData)
    .returning();

  console.log(`Inserted ${insertedProducts.length} products`);

  // --- Sync Config (default entries) ---
  await db.insert(schema.syncConfig).values([
    {
      syncType: "ppc_search_term",
      frequencyMinutes: 360, // 6 hours
      isEnabled: true,
      config: { reportType: "search_term", lookbackDays: 3 },
    },
    {
      syncType: "ppc_campaign",
      frequencyMinutes: 360,
      isEnabled: true,
      config: { reportType: "campaign", lookbackDays: 3 },
    },
    {
      syncType: "business_report",
      frequencyMinutes: 720, // 12 hours
      isEnabled: true,
      config: { lookbackDays: 2 },
    },
    {
      syncType: "sqp",
      frequencyMinutes: 1440, // 24 hours (weekly data, daily check)
      isEnabled: true,
      config: { lookbackWeeks: 1 },
    },
  ]);

  console.log("Inserted 4 sync_config entries");

  console.log("Seed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
