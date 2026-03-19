import {
  pgTable,
  serial,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const apiCredentials = pgTable("api_credentials", {
  id: serial("id").primaryKey(),
  credentialType: varchar("credential_type", { length: 50 }).notNull(), // 'amazon_ads', 'sp_api'
  marketplaceId: varchar("marketplace_id", { length: 20 }),
  profileId: varchar("profile_id", { length: 50 }),
  clientId: text("client_id"), // encrypted
  clientSecret: text("client_secret"), // encrypted
  refreshToken: text("refresh_token"), // encrypted
  accessToken: text("access_token"), // encrypted
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastTestStatus: varchar("last_test_status", { length: 20 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
