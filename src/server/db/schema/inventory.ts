import {
  pgTable,
  serial,
  varchar,
  integer,
  numeric,
  boolean,
  timestamp,
  text,
} from "drizzle-orm/pg-core";
import { products } from "./products";

export const skuInventory = pgTable("sku_inventory", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id),
  sku: varchar("sku", { length: 100 }).notNull(),
  asin: varchar("asin", { length: 20 }),
  market: varchar("market", { length: 10 }).default("US"),

  // Stock levels
  fbaAvailable: integer("fba_available").default(0),
  fbaTotal: integer("fba_total").default(0),
  awdInventory: integer("awd_inventory").default(0),
  totalStock: integer("total_stock").default(0),

  // Velocity
  avgDailyOrders: numeric("avg_daily_orders", { precision: 10, scale: 2 }),
  targetSalesVelocity: numeric("target_sales_velocity", {
    precision: 10,
    scale: 2,
  }),

  // Coverage
  daysOfStock: integer("days_of_stock"),
  reorderPointDays: integer("reorder_point_days"),
  reorderDate: timestamp("reorder_date", { withTimezone: true }),
  ossFbaDate: timestamp("oss_fba_date", { withTimezone: true }),

  // Status
  inventoryStatus: varchar("inventory_status", { length: 30 }).default(
    "in_stock"
  ), // in_stock, out_of_stock, soon_oos, lif_soon_oos
  currentlyTargeting: boolean("currently_targeting").default(false),
  campaignCount: integer("campaign_count").default(0),

  // PPC metrics (7d)
  spend7d: numeric("spend_7d", { precision: 12, scale: 2 }),
  sales7d: numeric("sales_7d", { precision: 12, scale: 2 }),
  acos7d: numeric("acos_7d", { precision: 8, scale: 4 }),

  comment: text("comment"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
