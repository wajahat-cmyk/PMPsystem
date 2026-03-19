import { pgTable, varchar } from "drizzle-orm/pg-core";

export const marketplaces = pgTable("marketplaces", {
  id: varchar("id", { length: 20 }).primaryKey(), // 'ATVPDKIKX0DER' for US
  name: varchar("name", { length: 50 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
});
