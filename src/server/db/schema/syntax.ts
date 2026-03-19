import {
  pgTable,
  serial,
  varchar,
  integer,
  boolean,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { roots } from "./roots";

export const syntaxGroups = pgTable("syntax_groups", {
  id: serial("id").primaryKey(),
  productLine: varchar("product_line", { length: 100 }).notNull(),
  rulePriority: integer("rule_priority").notNull(),
  classification: varchar("classification", { length: 50 }).notNull(),
  matchType: varchar("match_type", { length: 20 }).notNull(), // 'contains_any', 'contains_all', 'exact', 'regex'
  terms: text("terms").array().notNull(),
  isActive: boolean("is_active").default(true),
});

export const keywordSyntaxMap = pgTable(
  "keyword_syntax_map",
  {
    id: serial("id").primaryKey(),
    keywordText: text("keyword_text").notNull(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    syntaxGroupId: integer("syntax_group_id").references(
      () => syntaxGroups.id
    ),
    rootId: integer("root_id").references(() => roots.id),
    classification: varchar("classification", { length: 50 }).notNull(),
    classifiedAt: timestamp("classified_at", {
      withTimezone: true,
    }).defaultNow(),
    classificationMethod: varchar("classification_method", {
      length: 20,
    }).default("rule"), // 'rule', 'manual', 'ml'
  },
  (table) => [
    uniqueIndex("idx_keyword_syntax_unique").on(
      table.keywordText,
      table.productId
    ),
  ]
);
