import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id")
    .notNull()
    .references(() => brands.id),
  parentAsin: varchar("parent_asin", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 500 }).notNull(),
  category: varchar("category", { length: 200 }),
  productLine: varchar("product_line", { length: 100 }),
  basePrice: numeric("base_price", { precision: 10, scale: 2 }),
  cogs: numeric("cogs", { precision: 10, scale: 2 }),
  targetAcos: numeric("target_acos", { precision: 6, scale: 4 }),
  targetTacos: numeric("target_tacos", { precision: 6, scale: 4 }),
  breakevenAcos: numeric("breakeven_acos", { precision: 6, scale: 4 }),
  currentStage: varchar("current_stage", { length: 20 }).default("launch"), // launch, growth, maintenance
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const variations = pgTable("variations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  childAsin: varchar("child_asin", { length: 20 }).notNull().unique(),
  sku: varchar("sku", { length: 100 }),
  variationAttributes: jsonb("variation_attributes"), // {size, color}
  price: numeric("price", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
});
