/**
 * Drizzle table definitions owned by the investor-portal workstream.
 *
 * NOTE: these are defined here (not in server/shared-schema.ts) on purpose:
 * the disposition/e-sign workstreams are editing the shared schema on their
 * own branches. The table names match the physical tables created by
 * migrations/0080_investor_portal_p2.sql.
 */
import { pgTable, serial, integer, varchar, text, numeric, timestamp, jsonb } from "drizzle-orm/pg-core";

/** buyer_profiles + Phase-2 buy-box wizard columns (migration 0080). */
export const investorBuyerProfiles = pgTable("buyer_profiles", {
  id: integer("id").primaryKey(),
  userId: integer("user_id").notNull(),
  targetStates: text("target_states").array(),
  targetZips: text("target_zips").array(),
  strategies: text("strategies").array(),
  minSpread: numeric("min_spread", { precision: 12, scale: 2 }),
  minYield: numeric("min_yield", { precision: 8, scale: 4 }),
  propertyTypes: text("property_types").array(),
  priceMin: numeric("price_min", { precision: 12, scale: 2 }),
  priceMax: numeric("price_max", { precision: 12, scale: 2 }),
  minBeds: integer("min_beds"),
  maxBeds: integer("max_beds"),
  notifyPrefs: jsonb("notify_prefs"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InvestorBuyerProfile = typeof investorBuyerProfiles.$inferSelect;

/** Swipe interactions: interested / pass per investor x deal. */
export const investorDealInteractions = pgTable("investor_deal_interactions", {
  id: serial("id").primaryKey(),
  investorUserId: integer("investor_user_id").notNull(),
  propertyId: integer("property_id").notNull(),
  action: varchar("action", { length: 16 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type InvestorDealInteraction = typeof investorDealInteractions.$inferSelect;

/** Investor offers, each convertible to an LOI (loi_id). */
export const investorOffers = pgTable("investor_offers", {
  id: serial("id").primaryKey(),
  investorUserId: integer("investor_user_id").notNull(),
  buyerId: integer("buyer_id"),
  propertyId: integer("property_id").notNull(),
  offerAmount: numeric("offer_amount", { precision: 12, scale: 2 }).notNull(),
  earnestMoney: numeric("earnest_money", { precision: 12, scale: 2 }),
  closingTimelineDays: integer("closing_timeline_days"),
  contingencies: text("contingencies").array(),
  specialTerms: text("special_terms"),
  status: varchar("status", { length: 32 }).notNull().default("submitted"),
  loiId: integer("loi_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type InvestorOffer = typeof investorOffers.$inferSelect;

/** Proof-of-funds documents (server-side only). */
export const investorPofDocuments = pgTable("investor_pof_documents", {
  id: serial("id").primaryKey(),
  investorUserId: integer("investor_user_id").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256"),
  // NOTE: `data` (bytea) is intentionally omitted from this drizzle def —
  // POF bytes are written/read via raw SQL only, never exposed through the ORM.
  createdAt: timestamp("created_at").defaultNow(),
});

export type InvestorPofDocument = typeof investorPofDocuments.$inferSelect;
