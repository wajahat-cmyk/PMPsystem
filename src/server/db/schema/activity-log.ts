import {
  pgTable,
  serial,
  varchar,
  integer,
  text,
  numeric,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { products } from "./products";
import { brands } from "./brands";

export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    actorType: varchar("actor_type", { length: 20 }).notNull(), // 'USER', 'SYSTEM', 'AGENT'
    actorId: varchar("actor_id", { length: 100 }),
    actorName: varchar("actor_name", { length: 200 }),
    eventCategory: varchar("event_category", { length: 50 }).notNull(), // 'ppc', 'listing', 'inventory', 'system'
    eventType: varchar("event_type", { length: 50 }).notNull(), // 'bid_change', 'budget_change', 'keyword_added', etc.
    eventAction: varchar("event_action", { length: 50 }).notNull(), // 'create', 'update', 'delete', 'approve', 'reject'
    entityType: varchar("entity_type", { length: 50 }).notNull(), // 'campaign', 'keyword', 'product', 'agent'
    entityId: varchar("entity_id", { length: 100 }),
    entityName: varchar("entity_name", { length: 500 }),
    productId: integer("product_id").references(() => products.id),
    brandId: integer("brand_id").references(() => brands.id),
    marketplaceId: varchar("marketplace_id", { length: 20 }),
    fieldChanged: varchar("field_changed", { length: 100 }),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changeDelta: numeric("change_delta", { precision: 12, scale: 4 }),
    source: varchar("source", { length: 50 }), // 'manual', 'agent', 'api', 'bulk_upload'
    notes: text("notes"),
  },
  (table) => [
    index("idx_activity_log_timestamp").on(table.timestamp),
    index("idx_activity_log_product").on(table.productId, table.timestamp),
    index("idx_activity_log_actor").on(table.actorType, table.timestamp),
    index("idx_activity_log_entity").on(table.entityType, table.entityId),
  ]
);
