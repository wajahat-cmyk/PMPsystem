import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { products } from "./products";

export const comments = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    authorId: varchar("author_id", { length: 100 }),
    authorName: varchar("author_name", { length: 200 }),
    entityType: varchar("entity_type", { length: 50 }).notNull(), // 'product', 'keyword', 'campaign', 'syntax', 'root'
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    productId: integer("product_id").references(() => products.id),
    body: text("body").notNull(),
    parentCommentId: integer("parent_comment_id"),
    isPinned: boolean("is_pinned").default(false),
    isResolved: boolean("is_resolved").default(false),
    tags: text("tags").array(),
  },
  (table) => [
    index("idx_comments_entity").on(table.entityType, table.entityId),
    index("idx_comments_product").on(table.productId),
    index("idx_comments_parent").on(table.parentCommentId),
  ]
);
