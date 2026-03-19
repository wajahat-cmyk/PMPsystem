import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./products";

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull().unique(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const productPortfolios = pgTable(
  "product_portfolios",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    portfolioId: integer("portfolio_id")
      .notNull()
      .references(() => portfolios.id),
  },
  (table) => [
    uniqueIndex("product_portfolio_unique").on(
      table.productId,
      table.portfolioId
    ),
  ]
);
