import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// LEADS TABLE
export const leads = pgTable("leads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  address: varchar("address", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  zipCode: varchar("zip_code", { length: 10 }).notNull(),
  ownerName: varchar("owner_name", { length: 255 }).notNull(),
  ownerPhone: varchar("owner_phone", { length: 20 }),
  ownerEmail: varchar("owner_email", { length: 255 }),
  estimatedValue: decimal("estimated_value", { precision: 12, scale: 2 }),
  relasScore: integer("relas_score"),
  motivation: varchar("motivation", { length: 50 }),
  status: varchar("status", { length: 50 }).default("new"),
  notes: text("notes"),
  source: varchar("source", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Lead = typeof leads.$inferSelect;
export type InsertLead = z.infer<typeof insertLeadSchema>;

// PROPERTIES TABLE
export const properties = pgTable("properties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  address: varchar("address", { length: 255 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  zipCode: varchar("zip_code", { length: 10 }).notNull(),
  beds: integer("beds"),
  baths: integer("baths"),
  sqft: integer("sqft"),
  price: decimal("price", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("active"),
  apn: varchar("apn", { length: 100 }),
  yearBuilt: integer("year_built"),
  lotSize: varchar("lot_size", { length: 50 }),
  occupancy: varchar("occupancy", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;

// CONTACTS TABLE
export const contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  type: varchar("type", { length: 50 }),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

// CONTRACTS TABLE
export const contracts = pgTable("contracts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  buyerId: integer("buyer_id"),
  sellerId: integer("seller_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  signDate: timestamp("sign_date"),
  closeDate: timestamp("close_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Contract = typeof contracts.$inferSelect;
export type InsertContract = z.infer<typeof insertContractSchema>;

// CONTRACT TEMPLATES TABLE
export const contractTemplates = pgTable("contract_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  content: text("content").notNull(),
  mergeFields: text("merge_fields").array(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;

// CONTRACT DOCUMENTS TABLE
export const contractDocuments = pgTable("contract_documents", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  templateId: integer("template_id"),
  propertyId: integer("property_id"),
  title: varchar("title", { length: 255 }).notNull(),
  documentType: varchar("document_type", { length: 50 }).default("contract"),
  status: varchar("status", { length: 50 }).default("draft"),
  content: text("content").notNull(),
  mergeData: text("merge_data"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  version: integer("version").default(1),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContractDocumentSchema = createInsertSchema(contractDocuments).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type ContractDocument = typeof contractDocuments.$inferSelect;
export type InsertContractDocument = z.infer<typeof insertContractDocumentSchema>;

// DOCUMENT VERSIONS TABLE
export const documentVersions = pgTable("document_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  documentId: integer("document_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  changes: text("changes"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({ id: true, createdAt: true } as any);
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;

// LETTERS OF INTENT (LOI) TABLE
export const lois = pgTable("lois", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  buyerName: varchar("buyer_name", { length: 255 }).notNull(),
  sellerName: varchar("seller_name", { length: 255 }).notNull(),
  offerAmount: decimal("offer_amount", { precision: 12, scale: 2 }).notNull(),
  earnestMoney: decimal("earnest_money", { precision: 12, scale: 2 }),
  closingDate: timestamp("closing_date"),
  contingencies: text("contingencies").array(),
  specialTerms: text("special_terms"),
  status: varchar("status", { length: 50 }).default("draft"),
  sentDate: timestamp("sent_date"),
  responseDate: timestamp("response_date"),
  content: text("content"),
  pdfUrl: varchar("pdf_url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertLoiSchema = createInsertSchema(lois).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Loi = typeof lois.$inferSelect;
export type InsertLoi = z.infer<typeof insertLoiSchema>;
