// server/index-prod.ts
import fs from "node:fs";
import path from "node:path";
import "dotenv/config";
import express2 from "express";

// server/app.ts
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";

// server/routes.ts
import { createServer } from "http";
import bcrypt from "bcryptjs";

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
var { Pool } = pg;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
}
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 1e4,
  connectionTimeoutMillis: 5e3
});
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});
pool.connect().then((client2) => {
  console.log("Database connected successfully");
  client2.release();
}).catch((err) => {
  console.error("Database connection failed during startup:", err);
});
var db = drizzle(pool);

// server/storage.ts
import { desc } from "drizzle-orm";

// server/shared-schema.ts
import { pgTable, text, varchar, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var leads = pgTable("leads", {
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
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertLeadSchema = createInsertSchema(leads).omit({ id: true, createdAt: true, updatedAt: true });
var properties = pgTable("properties", {
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
  images: text("images").array(),
  arv: decimal("arv", { precision: 12, scale: 2 }),
  repairCost: decimal("repair_cost", { precision: 12, scale: 2 }),
  assignedTo: integer("assigned_to"),
  sourceLeadId: integer("source_lead_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertPropertySchema = createInsertSchema(properties).omit({ id: true, createdAt: true, updatedAt: true });
var contacts = pgTable("contacts", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  type: varchar("type", { length: 50 }),
  company: varchar("company", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
var contracts = pgTable("contracts", {
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
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
var contractTemplates = pgTable("contract_templates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  content: text("content").notNull(),
  mergeFields: text("merge_fields").array(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({ id: true, createdAt: true, updatedAt: true });
var contractDocuments = pgTable("contract_documents", {
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
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertContractDocumentSchema = createInsertSchema(contractDocuments).omit({ id: true, createdAt: true, updatedAt: true });
var documentVersions = pgTable("document_versions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  documentId: integer("document_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  content: text("content").notNull(),
  changes: text("changes"),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({ id: true, createdAt: true });
var lois = pgTable("lois", {
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
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertLoiSchema = createInsertSchema(lois).omit({ id: true, createdAt: true, updatedAt: true });
var users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  companyName: varchar("company_name", { length: 255 }),
  licenseNumber: varchar("license_number", { length: 100 }),
  role: varchar("role", { length: 50 }).default("user"),
  isSuperAdmin: boolean("is_super_admin").default(false),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  profilePicture: text("profile_picture"),
  showBannerQuotes: boolean("show_banner_quotes").default(true),
  customBannerImages: text("custom_banner_images").array(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
var twoFactorAuth = pgTable("two_factor_auth", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().unique(),
  secret: varchar("secret", { length: 255 }).notNull(),
  isEnabled: boolean("is_enabled").default(false),
  method: varchar("method", { length: 50 }).default("totp"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  emailBackup: varchar("email_backup", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTwoFactorAuthSchema = createInsertSchema(twoFactorAuth).omit({ id: true, createdAt: true, updatedAt: true });
var backupCodes = pgTable("backup_codes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  isUsed: boolean("is_used").default(false),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertBackupCodeSchema = createInsertSchema(backupCodes).omit({ id: true, createdAt: true });
var teams = pgTable("teams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: integer("owner_id").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true });
var teamMembers = pgTable("team_members", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 50 }).default("member"),
  permissions: text("permissions").array(),
  invitedBy: integer("invited_by"),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  status: varchar("status", { length: 50 }).default("active")
});
var insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, invitedAt: true });
var teamActivityLogs = pgTable("team_activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  userId: integer("user_id"),
  action: varchar("action", { length: 255 }).notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertTeamActivityLogSchema = createInsertSchema(teamActivityLogs).omit({ id: true, createdAt: true });
var notificationPreferences = pgTable("notification_preferences", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().unique(),
  emailEnabled: boolean("email_enabled").default(true),
  pushEnabled: boolean("push_enabled").default(true),
  inAppEnabled: boolean("in_app_enabled").default(true),
  newLeads: boolean("new_leads").default(true),
  dealUpdates: boolean("deal_updates").default(true),
  contractAlerts: boolean("contract_alerts").default(true),
  weeklySummary: boolean("weekly_summary").default(true),
  frequency: varchar("frequency", { length: 50 }).default("instant"),
  dndEnabled: boolean("dnd_enabled").default(false),
  dndStartTime: varchar("dnd_start_time", { length: 10 }),
  dndEndTime: varchar("dnd_end_time", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true });
var userGoals = pgTable("user_goals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  targetValue: integer("target_value").notNull(),
  currentValue: integer("current_value").default(0),
  unit: varchar("unit", { length: 50 }).default("deals"),
  period: varchar("period", { length: 50 }).default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  status: varchar("status", { length: 50 }).default("active"),
  milestones: text("milestones").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertUserGoalSchema = createInsertSchema(userGoals).omit({ id: true, createdAt: true, updatedAt: true });
var userNotifications = pgTable("user_notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).default("system"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  read: boolean("read").default(false),
  relatedId: integer("related_id"),
  relatedType: varchar("related_type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow()
});
var insertUserNotificationSchema = createInsertSchema(userNotifications).omit({ id: true, createdAt: true });
var offers = pgTable("offers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  userId: integer("user_id").notNull(),
  buyerName: varchar("buyer_name", { length: 255 }),
  sellerName: varchar("seller_name", { length: 255 }),
  offerAmount: decimal("offer_amount", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending"),
  sentDate: timestamp("sent_date"),
  responseDate: timestamp("response_date"),
  expirationDate: timestamp("expiration_date"),
  notes: text("notes"),
  documents: text("documents").array(),
  responseNotes: text("response_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true, updatedAt: true });
var timesheetEntries = pgTable("timesheet_entries", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  date: varchar("date", { length: 10 }).notNull(),
  employee: varchar("employee", { length: 255 }).notNull(),
  task: varchar("task", { length: 255 }).notNull(),
  startTime: varchar("start_time", { length: 10 }).notNull(),
  endTime: varchar("end_time", { length: 10 }).notNull(),
  hours: decimal("hours", { precision: 5, scale: 2 }).notNull(),
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }).default("50"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertTimesheetEntrySchema = createInsertSchema(timesheetEntries).omit({ id: true, createdAt: true, updatedAt: true });
var globalActivityLogs = pgTable("global_activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertGlobalActivityLogSchema = createInsertSchema(globalActivityLogs).omit({ id: true, createdAt: true });
var buyers = pgTable("buyers", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  preferredPropertyTypes: text("preferred_property_types").array(),
  preferredAreas: text("preferred_areas").array(),
  minBudget: decimal("min_budget", { precision: 12, scale: 2 }),
  maxBudget: decimal("max_budget", { precision: 12, scale: 2 }),
  dealsPerMonth: integer("deals_per_month"),
  proofOfFunds: boolean("proof_of_funds").default(false),
  proofOfFundsVerifiedAt: timestamp("proof_of_funds_verified_at"),
  proofOfFundsNotes: text("proof_of_funds_notes"),
  isVip: boolean("is_vip").default(false),
  status: varchar("status", { length: 50 }).default("active"),
  totalDeals: integer("total_deals").default(0),
  totalRevenue: decimal("total_revenue", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  tags: text("tags").array(),
  lastContactDate: timestamp("last_contact_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertBuyerSchema = createInsertSchema(buyers).omit({ id: true, createdAt: true, updatedAt: true });
var buyerCommunications = pgTable("buyer_communications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  buyerId: integer("buyer_id").notNull(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 255 }),
  content: text("content"),
  direction: varchar("direction", { length: 20 }).default("outbound"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertBuyerCommunicationSchema = createInsertSchema(buyerCommunications).omit({ id: true, createdAt: true });
var dealAssignments = pgTable("deal_assignments", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull(),
  buyerId: integer("buyer_id").notNull(),
  contractId: integer("contract_id"),
  assignmentFee: decimal("assignment_fee", { precision: 12, scale: 2 }),
  purchasePrice: decimal("purchase_price", { precision: 12, scale: 2 }),
  assignedPrice: decimal("assigned_price", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 50 }).default("pending"),
  closingDate: timestamp("closing_date"),
  titleCompany: varchar("title_company", { length: 255 }),
  earnestMoneyReceived: boolean("earnest_money_received").default(false),
  titleCleared: boolean("title_cleared").default(false),
  closingScheduled: boolean("closing_scheduled").default(false),
  documentsComplete: boolean("documents_complete").default(false),
  payoutReceived: boolean("payout_received").default(false),
  payoutAmount: decimal("payout_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});
var insertDealAssignmentSchema = createInsertSchema(dealAssignments).omit({ id: true, createdAt: true, updatedAt: true });

// server/storage.ts
import { eq, and } from "drizzle-orm";
var DatabaseStorage = class {
  // Leads
  async getLeads(limit, offset = 0) {
    let q = db.select().from(leads);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getLeadById(id) {
    const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return result[0];
  }
  async createLead(lead) {
    const result = await db.insert(leads).values(lead).returning();
    return result[0];
  }
  async updateLead(id, lead) {
    const result = await db.update(leads).set(lead).where(eq(leads.id, id)).returning();
    return result[0];
  }
  async deleteLead(id) {
    await db.delete(leads).where(eq(leads.id, id));
  }
  // Properties
  async getProperties(limit, offset = 0) {
    let q = db.select().from(properties);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getPropertyById(id) {
    const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
    return result[0];
  }
  async getPropertyBySourceLeadId(sourceLeadId) {
    const result = await db.select().from(properties).where(eq(properties.sourceLeadId, sourceLeadId)).limit(1);
    return result[0];
  }
  async createProperty(property) {
    const result = await db.insert(properties).values(property).returning();
    return result[0];
  }
  async updateProperty(id, property) {
    const result = await db.update(properties).set(property).where(eq(properties.id, id)).returning();
    return result[0];
  }
  async deleteProperty(id) {
    await db.delete(properties).where(eq(properties.id, id));
  }
  // Contacts
  async getContacts(limit, offset = 0) {
    let q = db.select().from(contacts);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContactById(id) {
    const result = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    return result[0];
  }
  async createContact(contact) {
    const result = await db.insert(contacts).values(contact).returning();
    return result[0];
  }
  async updateContact(id, contact) {
    const result = await db.update(contacts).set(contact).where(eq(contacts.id, id)).returning();
    return result[0];
  }
  async deleteContact(id) {
    await db.delete(contacts).where(eq(contacts.id, id));
  }
  // Contracts
  async getContracts(limit, offset = 0) {
    let q = db.select().from(contracts);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContractById(id) {
    const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    return result[0];
  }
  async createContract(contract) {
    const result = await db.insert(contracts).values(contract).returning();
    return result[0];
  }
  async updateContract(id, contract) {
    const result = await db.update(contracts).set(contract).where(eq(contracts.id, id)).returning();
    return result[0];
  }
  async deleteContract(id) {
    await db.delete(contracts).where(eq(contracts.id, id));
  }
  // Contract Templates
  async getContractTemplates(limit, offset = 0) {
    let q = db.select().from(contractTemplates);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContractTemplateById(id) {
    const result = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id)).limit(1);
    return result[0];
  }
  async createContractTemplate(template) {
    const result = await db.insert(contractTemplates).values(template).returning();
    return result[0];
  }
  async updateContractTemplate(id, template) {
    const result = await db.update(contractTemplates).set(template).where(eq(contractTemplates.id, id)).returning();
    return result[0];
  }
  async deleteContractTemplate(id) {
    await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
  }
  // Contract Documents
  async getContractDocuments(limit, offset = 0) {
    let q = db.select().from(contractDocuments);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getContractDocumentById(id) {
    const result = await db.select().from(contractDocuments).where(eq(contractDocuments.id, id)).limit(1);
    return result[0];
  }
  async createContractDocument(document) {
    const result = await db.insert(contractDocuments).values(document).returning();
    return result[0];
  }
  async updateContractDocument(id, document) {
    const result = await db.update(contractDocuments).set(document).where(eq(contractDocuments.id, id)).returning();
    return result[0];
  }
  async deleteContractDocument(id) {
    await db.delete(contractDocuments).where(eq(contractDocuments.id, id));
  }
  // Document Versions
  async getDocumentVersions(documentId, limit, offset = 0) {
    let q = db.select().from(documentVersions).where(eq(documentVersions.documentId, documentId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createDocumentVersion(version) {
    const result = await db.insert(documentVersions).values(version).returning();
    return result[0];
  }
  // LOIs
  async getLois(limit, offset = 0) {
    let q = db.select().from(lois);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getLoiById(id) {
    const result = await db.select().from(lois).where(eq(lois.id, id)).limit(1);
    return result[0];
  }
  async createLoi(loi) {
    const result = await db.insert(lois).values(loi).returning();
    return result[0];
  }
  async updateLoi(id, loi) {
    const result = await db.update(lois).set(loi).where(eq(lois.id, id)).returning();
    return result[0];
  }
  async deleteLoi(id) {
    await db.delete(lois).where(eq(lois.id, id));
  }
  // Users
  async getUsers(limit, offset = 0) {
    let q = db.select().from(users);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getUserById(id) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  async getUserByEmail(email) {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }
  async createUser(user) {
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }
  async updateUser(id, user) {
    const result = await db.update(users).set(user).where(eq(users.id, id)).returning();
    return result[0];
  }
  async deleteUser(id) {
    await db.delete(users).where(eq(users.id, id));
  }
  // Two Factor Auth
  async getTwoFactorAuthByUserId(userId) {
    const result = await db.select().from(twoFactorAuth).where(eq(twoFactorAuth.userId, userId)).limit(1);
    return result[0];
  }
  async createTwoFactorAuth(auth) {
    const result = await db.insert(twoFactorAuth).values(auth).returning();
    return result[0];
  }
  async updateTwoFactorAuth(userId, auth) {
    const result = await db.update(twoFactorAuth).set(auth).where(eq(twoFactorAuth.userId, userId)).returning();
    return result[0];
  }
  async deleteTwoFactorAuth(userId) {
    await db.delete(twoFactorAuth).where(eq(twoFactorAuth.userId, userId));
  }
  // Backup Codes
  async getBackupCodesByUserId(userId) {
    return db.select().from(backupCodes).where(eq(backupCodes.userId, userId));
  }
  async createBackupCode(code) {
    const result = await db.insert(backupCodes).values(code).returning();
    return result[0];
  }
  async useBackupCode(userId, code) {
    const result = await db.update(backupCodes).set({ isUsed: true, usedAt: /* @__PURE__ */ new Date() }).where(and(
      eq(backupCodes.userId, userId),
      eq(backupCodes.code, code),
      eq(backupCodes.isUsed, false)
    )).returning();
    return result.length > 0;
  }
  async deleteBackupCodes(userId) {
    await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  }
  // Teams
  async getTeams() {
    return db.select().from(teams);
  }
  async getTeamById(id) {
    const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return result[0];
  }
  async getTeamsByOwnerId(ownerId) {
    return db.select().from(teams).where(eq(teams.ownerId, ownerId));
  }
  async createTeam(team) {
    const result = await db.insert(teams).values(team).returning();
    return result[0];
  }
  async updateTeam(id, team) {
    const result = await db.update(teams).set(team).where(eq(teams.id, id)).returning();
    return result[0];
  }
  async deleteTeam(id) {
    await db.delete(teams).where(eq(teams.id, id));
  }
  // Team Members
  async getTeamMembers(teamId) {
    return db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }
  async getTeamMemberById(id) {
    const result = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    return result[0];
  }
  async createTeamMember(member) {
    const result = await db.insert(teamMembers).values(member).returning();
    return result[0];
  }
  async updateTeamMember(id, member) {
    const result = await db.update(teamMembers).set(member).where(eq(teamMembers.id, id)).returning();
    return result[0];
  }
  async deleteTeamMember(id) {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }
  // Team Activity Logs
  async getTeamActivityLogs(teamId, limit = 50) {
    return db.select().from(teamActivityLogs).where(eq(teamActivityLogs.teamId, teamId)).limit(limit);
  }
  async createTeamActivityLog(log2) {
    const result = await db.insert(teamActivityLogs).values(log2).returning();
    return result[0];
  }
  // Notification Preferences
  async getNotificationPreferencesByUserId(userId) {
    const result = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
    return result[0];
  }
  async createNotificationPreferences(prefs) {
    const result = await db.insert(notificationPreferences).values(prefs).returning();
    return result[0];
  }
  async updateNotificationPreferences(userId, prefs) {
    const result = await db.update(notificationPreferences).set(prefs).where(eq(notificationPreferences.userId, userId)).returning();
    return result[0];
  }
  // User Notifications (actual notification messages)
  async getUserNotifications(userId, limit, offset = 0) {
    let q = db.select().from(userNotifications).where(eq(userNotifications.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getUserNotificationById(id) {
    const result = await db.select().from(userNotifications).where(eq(userNotifications.id, id)).limit(1);
    return result[0];
  }
  async createUserNotification(notification) {
    const result = await db.insert(userNotifications).values(notification).returning();
    return result[0];
  }
  async markNotificationAsRead(id) {
    const result = await db.update(userNotifications).set({ read: true }).where(eq(userNotifications.id, id)).returning();
    return result[0];
  }
  async deleteUserNotification(id) {
    await db.delete(userNotifications).where(eq(userNotifications.id, id));
  }
  async deleteAllUserNotifications(userId) {
    await db.delete(userNotifications).where(eq(userNotifications.userId, userId));
  }
  async markAllNotificationsAsRead(userId) {
    await db.update(userNotifications).set({ read: true }).where(eq(userNotifications.userId, userId));
  }
  // User Goals
  async getUserGoals(userId) {
    return db.select().from(userGoals).where(eq(userGoals.userId, userId));
  }
  async getUserGoalById(id) {
    const result = await db.select().from(userGoals).where(eq(userGoals.id, id)).limit(1);
    return result[0];
  }
  async createUserGoal(goal) {
    const result = await db.insert(userGoals).values(goal).returning();
    return result[0];
  }
  async updateUserGoal(id, goal) {
    const result = await db.update(userGoals).set(goal).where(eq(userGoals.id, id)).returning();
    return result[0];
  }
  async deleteUserGoal(id) {
    await db.delete(userGoals).where(eq(userGoals.id, id));
  }
  // Offers
  async getOffers(limit, offset = 0) {
    let q = db.select().from(offers);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getOfferById(id) {
    const result = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
    return result[0];
  }
  async getOffersByUserId(userId, limit, offset = 0) {
    let q = db.select().from(offers).where(eq(offers.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getOffersByPropertyId(propertyId, limit, offset = 0) {
    let q = db.select().from(offers).where(eq(offers.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createOffer(offer) {
    const result = await db.insert(offers).values(offer).returning();
    return result[0];
  }
  async updateOffer(id, offer) {
    const result = await db.update(offers).set(offer).where(eq(offers.id, id)).returning();
    return result[0];
  }
  async deleteOffer(id) {
    await db.delete(offers).where(eq(offers.id, id));
  }
  // Timesheet Entries
  async getTimesheetEntries(userId, limit, offset = 0) {
    let q = db.select().from(timesheetEntries).where(eq(timesheetEntries.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getTimesheetEntryById(id) {
    const result = await db.select().from(timesheetEntries).where(eq(timesheetEntries.id, id)).limit(1);
    return result[0];
  }
  async createTimesheetEntry(entry) {
    const result = await db.insert(timesheetEntries).values(entry).returning();
    return result[0];
  }
  async updateTimesheetEntry(id, entry) {
    const result = await db.update(timesheetEntries).set(entry).where(eq(timesheetEntries.id, id)).returning();
    return result[0];
  }
  async deleteTimesheetEntry(id) {
    await db.delete(timesheetEntries).where(eq(timesheetEntries.id, id));
  }
  // Global Activity Logs
  async getGlobalActivityLogs(limit = 50, offset = 0) {
    return db.select().from(globalActivityLogs).orderBy(desc(globalActivityLogs.createdAt)).offset(offset).limit(limit);
  }
  async createGlobalActivity(log2) {
    const result = await db.insert(globalActivityLogs).values(log2).returning();
    return result[0];
  }
  // Buyers
  async getBuyers(limit, offset = 0) {
    let q = db.select().from(buyers);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getBuyerById(id) {
    const result = await db.select().from(buyers).where(eq(buyers.id, id)).limit(1);
    return result[0];
  }
  async createBuyer(buyer) {
    const result = await db.insert(buyers).values(buyer).returning();
    return result[0];
  }
  async updateBuyer(id, buyer) {
    const result = await db.update(buyers).set(buyer).where(eq(buyers.id, id)).returning();
    return result[0];
  }
  async deleteBuyer(id) {
    await db.delete(buyers).where(eq(buyers.id, id));
  }
  // Buyer Communications
  async getBuyerCommunications(buyerId, limit, offset = 0) {
    let q = db.select().from(buyerCommunications).where(eq(buyerCommunications.buyerId, buyerId)).orderBy(desc(buyerCommunications.createdAt));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createBuyerCommunication(comm) {
    const result = await db.insert(buyerCommunications).values(comm).returning();
    return result[0];
  }
  async deleteBuyerCommunication(id) {
    await db.delete(buyerCommunications).where(eq(buyerCommunications.id, id));
  }
  // Deal Assignments
  async getDealAssignments(limit, offset = 0) {
    let q = db.select().from(dealAssignments);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getDealAssignmentById(id) {
    const result = await db.select().from(dealAssignments).where(eq(dealAssignments.id, id)).limit(1);
    return result[0];
  }
  async getDealAssignmentsByPropertyId(propertyId, limit, offset = 0) {
    let q = db.select().from(dealAssignments).where(eq(dealAssignments.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async getDealAssignmentsByBuyerId(buyerId, limit, offset = 0) {
    let q = db.select().from(dealAssignments).where(eq(dealAssignments.buyerId, buyerId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q;
  }
  async createDealAssignment(assignment) {
    const result = await db.insert(dealAssignments).values(assignment).returning();
    return result[0];
  }
  async updateDealAssignment(id, assignment) {
    const result = await db.update(dealAssignments).set(assignment).where(eq(dealAssignments.id, id)).returning();
    return result[0];
  }
  async deleteDealAssignment(id) {
    await db.delete(dealAssignments).where(eq(dealAssignments.id, id));
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
async function registerRoutes(app2) {
  app2.get("/api/health", async (req, res) => {
    try {
      await storage.getUserByEmail("test@example.com");
      res.json({ status: "ok", db: "connected", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(500).json({ status: "error", db: "disconnected", message: error.message });
    }
  });
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const adminEmail = process.env.ADMIN_USERNAME;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (adminEmail && email === adminEmail && adminPassword && password === adminPassword) {
        console.log(`[Auth] Admin bypass used for ${email}`);
        try {
          const user2 = await storage.getUserByEmail(email);
          if (user2) {
            req.session.userId = user2.id;
            req.session.email = user2.email;
            const { passwordHash: passwordHash2, ...userWithoutPassword2 } = user2;
            return res.json({ user: userWithoutPassword2 });
          } else {
            console.error(`[Auth] Admin user ${email} matches env but not found in DB`);
            return res.status(401).json({ message: "Admin user not found in database. Run bootstrap-admin script." });
          }
        } catch (dbError) {
          console.error(`[Auth] Admin bypass DB error:`, dbError);
          return res.status(500).json({ message: "Database connection failed during admin login" });
        }
      }
      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: "Account is inactive" });
      }
      req.session.userId = user.id;
      req.session.email = user.email;
      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("[Auth] Login error:", error);
      res.status(500).json({ message: `Login failed: ${error.message}` });
    }
  });
  app2.post("/api/auth/signup", async (req, res) => {
    try {
      const { firstName, lastName, email, password, role = "employee", isSuperAdmin = false, isActive = true, employeeCode } = req.body;
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
      }
      const accessCode = process.env.EMPLOYEE_ACCESS_CODE || "3911";
      if (!employeeCode || employeeCode !== accessCode) {
        return res.status(403).json({ message: "Invalid employee code" });
      }
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "Email already in use" });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const newUser = await storage.createUser({
        email,
        passwordHash,
        firstName,
        lastName,
        role,
        isSuperAdmin,
        isActive
      });
      req.session.userId = newUser.id;
      req.session.email = newUser.email;
      const { passwordHash: _, ...userWithoutPassword } = newUser;
      res.status(201).json({ user: userWithoutPassword });
    } catch (error) {
      console.error("[Auth] Signup error:", error);
      res.status(500).json({ message: `Signup failed: ${error.message}` });
    }
  });
  app2.post("/api/auth/logout", async (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });
  app2.get("/api/auth/me", async (req, res) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const user = await storage.getUserById(req.session.userId);
      if (!user) {
        req.session.destroy(() => {
        });
        return res.status(401).json({ message: "User not found" });
      }
      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/leads", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const allLeads = await storage.getLeads(limit, offset);
      res.json(allLeads);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLeadById(parseInt(req.params.id));
      if (!lead) return res.status(404).json({ message: "Lead not found" });
      res.json(lead);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/leads", async (req, res) => {
    try {
      const validated = insertLeadSchema.parse(req.body);
      const lead = await storage.createLead(validated);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_lead",
          description: `Added new lead: ${lead.address}`,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address })
        });
      }
      res.status(201).json(lead);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/leads/:id", async (req, res) => {
    try {
      const partial = insertLeadSchema.partial().parse(req.body);
      const lead = await storage.updateLead(parseInt(req.params.id), partial);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "updated_lead",
          description: `Updated lead: ${lead.address}`,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address, status: lead.status })
        });
      }
      res.json(lead);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/leads/:id", async (req, res) => {
    try {
      const lead = await storage.getLeadById(parseInt(req.params.id));
      await storage.deleteLead(parseInt(req.params.id));
      if (req.session.userId && lead) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_lead",
          description: `Deleted lead: ${lead.address}`,
          metadata: JSON.stringify({ leadId: lead.id, address: lead.address })
        });
      }
      res.json({ message: "Lead deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/leads/:id/convert-to-property", async (req, res) => {
    try {
      const leadId = parseInt(req.params.id);
      const lead = await storage.getLeadById(leadId);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }
      const normalizedStatus = lead.status?.toLowerCase().trim();
      if (normalizedStatus !== "under_contract") {
        return res.status(400).json({
          message: "Lead must be 'under contract' status before converting to property"
        });
      }
      const existingProperty = await storage.getPropertyBySourceLeadId(leadId);
      if (existingProperty) {
        return res.status(409).json({
          message: "Property already exists for this lead",
          propertyId: existingProperty.id
        });
      }
      const propertyData = insertPropertySchema.parse({
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zipCode: lead.zipCode,
        price: lead.estimatedValue || null,
        status: "under_contract",
        sourceLeadId: lead.id
      });
      const property = await storage.createProperty(propertyData);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "converted_lead_to_property",
          description: `Converted lead to property: ${property.address}`,
          metadata: JSON.stringify({
            leadId: lead.id,
            propertyId: property.id,
            address: property.address
          })
        });
      }
      res.status(201).json({
        message: "Lead successfully converted to property",
        property
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "Property already exists for this lead" });
      }
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/properties", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const allProperties = await storage.getProperties(limit, offset);
      res.json(allProperties);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getPropertyById(parseInt(req.params.id));
      if (!property) return res.status(404).json({ message: "Property not found" });
      res.json(property);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/properties", async (req, res) => {
    try {
      const validated = insertPropertySchema.parse(req.body);
      const property = await storage.createProperty(validated);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "created_property",
          description: `Added new property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      res.status(201).json(property);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/properties/:id", async (req, res) => {
    try {
      const partial = insertPropertySchema.partial().parse(req.body);
      const property = await storage.updateProperty(parseInt(req.params.id), partial);
      if (req.session.userId) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "updated_property",
          description: `Updated property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      res.json(property);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/properties/:id", async (req, res) => {
    try {
      const property = await storage.getPropertyById(parseInt(req.params.id));
      await storage.deleteProperty(parseInt(req.params.id));
      if (req.session.userId && property) {
        await storage.createGlobalActivity({
          userId: req.session.userId,
          action: "deleted_property",
          description: `Deleted property: ${property.address}`,
          metadata: JSON.stringify({ propertyId: property.id, address: property.address })
        });
      }
      res.json({ message: "Property deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contracts", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const allContracts = await storage.getContracts(limit, offset);
      res.json(allContracts);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contracts/:id", async (req, res) => {
    try {
      const contract = await storage.getContractById(parseInt(req.params.id));
      if (!contract) return res.status(404).json({ message: "Contract not found" });
      res.json(contract);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contracts", async (req, res) => {
    try {
      const validated = insertContractSchema.parse(req.body);
      const contract = await storage.createContract(validated);
      res.status(201).json(contract);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contracts/:id", async (req, res) => {
    try {
      const partial = insertContractSchema.partial().parse(req.body);
      const contract = await storage.updateContract(parseInt(req.params.id), partial);
      res.json(contract);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contracts/:id", async (req, res) => {
    try {
      await storage.deleteContract(parseInt(req.params.id));
      res.json({ message: "Contract deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contacts", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const allContacts = await storage.getContacts(limit, offset);
      res.json(allContacts);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contacts", async (req, res) => {
    try {
      const validated = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validated);
      res.status(201).json(contact);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/contract-templates", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const templates = await storage.getContractTemplates(limit, offset);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-templates/:id", async (req, res) => {
    try {
      const template = await storage.getContractTemplateById(parseInt(req.params.id));
      if (!template) return res.status(404).json({ message: "Template not found" });
      res.json(template);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-templates", async (req, res) => {
    try {
      const validated = insertContractTemplateSchema.parse(req.body);
      const template = await storage.createContractTemplate(validated);
      res.status(201).json(template);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contract-templates/:id", async (req, res) => {
    try {
      const partial = insertContractTemplateSchema.partial().parse(req.body);
      const template = await storage.updateContractTemplate(parseInt(req.params.id), partial);
      res.json(template);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contract-templates/:id", async (req, res) => {
    try {
      await storage.deleteContractTemplate(parseInt(req.params.id));
      res.json({ message: "Template deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-documents", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const documents = await storage.getContractDocuments(limit, offset);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/contract-documents/:id", async (req, res) => {
    try {
      const document = await storage.getContractDocumentById(parseInt(req.params.id));
      if (!document) return res.status(404).json({ message: "Document not found" });
      res.json(document);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/contract-documents", async (req, res) => {
    try {
      const validated = insertContractDocumentSchema.parse(req.body);
      const document = await storage.createContractDocument(validated);
      res.status(201).json(document);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/contract-documents/:id", async (req, res) => {
    try {
      const partial = insertContractDocumentSchema.partial().parse(req.body);
      const document = await storage.updateContractDocument(parseInt(req.params.id), partial);
      res.json(document);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/contract-documents/:id", async (req, res) => {
    try {
      await storage.deleteContractDocument(parseInt(req.params.id));
      res.json({ message: "Document deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const versions = await storage.getDocumentVersions(parseInt(req.params.documentId));
      res.json(versions);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/documents/:documentId/versions", async (req, res) => {
    try {
      const validated = insertDocumentVersionSchema.parse({
        ...req.body,
        documentId: parseInt(req.params.documentId)
      });
      const version = await storage.createDocumentVersion(validated);
      res.status(201).json(version);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/lois", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const allLois = await storage.getLois(limit, offset);
      res.json(allLois);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/lois/:id", async (req, res) => {
    try {
      const loi = await storage.getLoiById(parseInt(req.params.id));
      if (!loi) return res.status(404).json({ message: "LOI not found" });
      res.json(loi);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/lois", async (req, res) => {
    try {
      const validated = insertLoiSchema.parse(req.body);
      const loi = await storage.createLoi(validated);
      res.status(201).json(loi);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/lois/:id", async (req, res) => {
    try {
      const partial = insertLoiSchema.partial().parse(req.body);
      const loi = await storage.updateLoi(parseInt(req.params.id), partial);
      res.json(loi);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/lois/:id", async (req, res) => {
    try {
      await storage.deleteLoi(parseInt(req.params.id));
      res.json({ message: "LOI deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const users2 = await storage.getUsers(limit, offset);
      res.json(users2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUserById(parseInt(req.params.id));
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users", async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const user = await storage.createUser(validated);
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:id/password", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const userId = parseInt(req.params.id);
    if (req.session.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current and new password are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }
      const user = await storage.getUserById(userId);
      if (!user || !user.passwordHash) {
        return res.status(404).json({ message: "User not found" });
      }
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(userId, { passwordHash: newPasswordHash });
      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });
  app2.patch("/api/users/:id", async (req, res) => {
    try {
      const partial = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(parseInt(req.params.id), partial);
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/2fa", async (req, res) => {
    try {
      const auth = await storage.getTwoFactorAuthByUserId(parseInt(req.params.userId));
      res.json(auth || { isEnabled: false });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/2fa", async (req, res) => {
    try {
      const validated = insertTwoFactorAuthSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const auth = await storage.createTwoFactorAuth(validated);
      res.status(201).json(auth);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:userId/2fa", async (req, res) => {
    try {
      const partial = insertTwoFactorAuthSchema.partial().parse(req.body);
      const auth = await storage.updateTwoFactorAuth(parseInt(req.params.userId), partial);
      res.json(auth);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/users/:userId/2fa", async (req, res) => {
    try {
      await storage.deleteTwoFactorAuth(parseInt(req.params.userId));
      res.json({ message: "2FA disabled" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const codes = await storage.getBackupCodesByUserId(parseInt(req.params.userId));
      res.json(codes);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/backup-codes", async (req, res) => {
    try {
      const validated = insertBackupCodeSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const code = await storage.createBackupCode(validated);
      res.status(201).json(code);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      const logs = await storage.getGlobalActivityLogs(limit);
      const logsWithUsers = await Promise.all(
        logs.map(async (log2) => {
          const user = await storage.getUserById(log2.userId);
          return {
            ...log2,
            user: user ? {
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              profilePicture: user.profilePicture
            } : null
          };
        })
      );
      res.json(logsWithUsers);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams", async (req, res) => {
    try {
      const teams2 = await storage.getTeams();
      res.json(teams2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams/:id", async (req, res) => {
    try {
      const team = await storage.getTeamById(parseInt(req.params.id));
      if (!team) return res.status(404).json({ message: "Team not found" });
      res.json(team);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/teams", async (req, res) => {
    try {
      const validated = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(validated);
      res.status(201).json(team);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/teams/:id", async (req, res) => {
    try {
      const partial = insertTeamSchema.partial().parse(req.body);
      const team = await storage.updateTeam(parseInt(req.params.id), partial);
      res.json(team);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/teams/:id", async (req, res) => {
    try {
      await storage.deleteTeam(parseInt(req.params.id));
      res.json({ message: "Team deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams/:teamId/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(parseInt(req.params.teamId));
      res.json(members);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/teams/:teamId/members", async (req, res) => {
    try {
      const validated = insertTeamMemberSchema.parse({ ...req.body, teamId: parseInt(req.params.teamId) });
      const member = await storage.createTeamMember(validated);
      res.status(201).json(member);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/team-members/:id", async (req, res) => {
    try {
      const partial = insertTeamMemberSchema.partial().parse(req.body);
      const member = await storage.updateTeamMember(parseInt(req.params.id), partial);
      res.json(member);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/team-members/:id", async (req, res) => {
    try {
      await storage.deleteTeamMember(parseInt(req.params.id));
      res.json({ message: "Team member removed" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const logs = await storage.getTeamActivityLogs(parseInt(req.params.teamId), limit);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/teams/:teamId/activity", async (req, res) => {
    try {
      const validated = insertTeamActivityLogSchema.parse({ ...req.body, teamId: parseInt(req.params.teamId) });
      const log2 = await storage.createTeamActivityLog(validated);
      res.status(201).json(log2);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const prefs = await storage.getNotificationPreferencesByUserId(parseInt(req.params.userId));
      res.json(prefs || {});
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const validated = insertNotificationPreferenceSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const prefs = await storage.createNotificationPreferences(validated);
      res.status(201).json(prefs);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:userId/notification-preferences", async (req, res) => {
    try {
      const partial = insertNotificationPreferenceSchema.partial().parse(req.body);
      const prefs = await storage.updateNotificationPreferences(parseInt(req.params.userId), partial);
      res.json(prefs);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/notifications", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const notifications = await storage.getUserNotifications(parseInt(req.params.userId), limit, offset);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/notifications", async (req, res) => {
    try {
      const validated = insertUserNotificationSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const notification = await storage.createUserNotification(validated);
      res.status(201).json(notification);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(parseInt(req.params.id));
      res.json(notification);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/notifications/:id", async (req, res) => {
    try {
      await storage.deleteUserNotification(parseInt(req.params.id));
      res.json({ message: "Notification deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.delete("/api/users/:userId/notifications", async (req, res) => {
    try {
      await storage.deleteAllUserNotifications(parseInt(req.params.userId));
      res.json({ message: "All notifications deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.patch("/api/users/:userId/notifications/read-all", async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(parseInt(req.params.userId));
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/goals", async (req, res) => {
    try {
      const goals = await storage.getUserGoals(parseInt(req.params.userId));
      res.json(goals);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/goals/:id", async (req, res) => {
    try {
      const goal = await storage.getUserGoalById(parseInt(req.params.id));
      if (!goal) return res.status(404).json({ message: "Goal not found" });
      res.json(goal);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/goals", async (req, res) => {
    try {
      const validated = insertUserGoalSchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const goal = await storage.createUserGoal(validated);
      res.status(201).json(goal);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/goals/:id", async (req, res) => {
    try {
      const partial = insertUserGoalSchema.partial().parse(req.body);
      const goal = await storage.updateUserGoal(parseInt(req.params.id), partial);
      res.json(goal);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/goals/:id", async (req, res) => {
    try {
      await storage.deleteUserGoal(parseInt(req.params.id));
      res.json({ message: "Goal deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/offers", async (req, res) => {
    try {
      const userId = req.query.userId ? parseInt(req.query.userId) : void 0;
      const propertyId = req.query.propertyId ? parseInt(req.query.propertyId) : void 0;
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      if (userId) {
        const offers3 = await storage.getOffersByUserId(userId, limit, offset);
        return res.json(offers3);
      }
      if (propertyId) {
        const offers3 = await storage.getOffersByPropertyId(propertyId, limit, offset);
        return res.json(offers3);
      }
      const offers2 = await storage.getOffers(limit, offset);
      res.json(offers2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/offers/:id", async (req, res) => {
    try {
      const offer = await storage.getOfferById(parseInt(req.params.id));
      if (!offer) return res.status(404).json({ message: "Offer not found" });
      res.json(offer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/offers", async (req, res) => {
    try {
      const validated = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(validated);
      res.status(201).json(offer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/offers/:id", async (req, res) => {
    try {
      const partial = insertOfferSchema.partial().parse(req.body);
      const offer = await storage.updateOffer(parseInt(req.params.id), partial);
      res.json(offer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/offers/:id", async (req, res) => {
    try {
      await storage.deleteOffer(parseInt(req.params.id));
      res.json({ message: "Offer deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/users/:userId/timesheet", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const entries = await storage.getTimesheetEntries(parseInt(req.params.userId), limit, offset);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/timesheet/:id", async (req, res) => {
    try {
      const entry = await storage.getTimesheetEntryById(parseInt(req.params.id));
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      res.json(entry);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/users/:userId/timesheet", async (req, res) => {
    try {
      const validated = insertTimesheetEntrySchema.parse({ ...req.body, userId: parseInt(req.params.userId) });
      const entry = await storage.createTimesheetEntry(validated);
      res.status(201).json(entry);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/timesheet/:id", async (req, res) => {
    try {
      const partial = insertTimesheetEntrySchema.partial().parse(req.body);
      const entry = await storage.updateTimesheetEntry(parseInt(req.params.id), partial);
      res.json(entry);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/timesheet/:id", async (req, res) => {
    try {
      await storage.deleteTimesheetEntry(parseInt(req.params.id));
      res.json({ message: "Entry deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/buyers", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const buyers2 = await storage.getBuyers(limit, offset);
      res.json(buyers2);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/buyers/:id", async (req, res) => {
    try {
      const buyer = await storage.getBuyerById(parseInt(req.params.id));
      if (!buyer) return res.status(404).json({ message: "Buyer not found" });
      res.json(buyer);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/buyers", async (req, res) => {
    try {
      const validated = insertBuyerSchema.parse(req.body);
      const buyer = await storage.createBuyer(validated);
      res.status(201).json(buyer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/buyers/:id", async (req, res) => {
    try {
      const partial = insertBuyerSchema.partial().parse(req.body);
      const buyer = await storage.updateBuyer(parseInt(req.params.id), partial);
      res.json(buyer);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/buyers/:id", async (req, res) => {
    try {
      await storage.deleteBuyer(parseInt(req.params.id));
      res.json({ message: "Buyer deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/buyers/:buyerId/communications", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const comms = await storage.getBuyerCommunications(parseInt(req.params.buyerId), limit, offset);
      res.json(comms);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/buyers/:buyerId/communications", async (req, res) => {
    try {
      const validated = insertBuyerCommunicationSchema.parse({
        ...req.body,
        buyerId: parseInt(req.params.buyerId)
      });
      const comm = await storage.createBuyerCommunication(validated);
      res.status(201).json(comm);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/buyer-communications/:id", async (req, res) => {
    try {
      await storage.deleteBuyerCommunication(parseInt(req.params.id));
      res.json({ message: "Communication deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/deal-assignments", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const assignments = await storage.getDealAssignments(limit, offset);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/deal-assignments/:id", async (req, res) => {
    try {
      const assignment = await storage.getDealAssignmentById(parseInt(req.params.id));
      if (!assignment) return res.status(404).json({ message: "Assignment not found" });
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/properties/:propertyId/assignments", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const assignments = await storage.getDealAssignmentsByPropertyId(parseInt(req.params.propertyId), limit, offset);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.get("/api/buyers/:buyerId/assignments", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : void 0;
      const offset = req.query.offset ? parseInt(req.query.offset) : 0;
      const assignments = await storage.getDealAssignmentsByBuyerId(parseInt(req.params.buyerId), limit, offset);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  app2.post("/api/deal-assignments", async (req, res) => {
    try {
      const validated = insertDealAssignmentSchema.parse(req.body);
      const assignment = await storage.createDealAssignment(validated);
      res.status(201).json(assignment);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.patch("/api/deal-assignments/:id", async (req, res) => {
    try {
      const partial = insertDealAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateDealAssignment(parseInt(req.params.id), partial);
      res.json(assignment);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  });
  app2.delete("/api/deal-assignments/:id", async (req, res) => {
    try {
      await storage.deleteDealAssignment(parseInt(req.params.id));
      res.json({ message: "Assignment deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/sentry.ts
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    integrations: [nodeProfilingIntegration()]
  });
}

// server/app.ts
import crypto from "node:crypto";

// server/metrics.ts
import client from "prom-client";
var register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: "fp_" });
var httpRequestsTotal = new client.Counter({
  name: "fp_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status"]
});
var httpErrorsTotal = new client.Counter({
  name: "fp_http_errors_total",
  help: "Total number of HTTP 5xx errors",
  labelNames: ["path", "status"]
});
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpErrorsTotal);
async function metricsText() {
  return await register.metrics();
}

// server/app.ts
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
var app = express();
initSentry();
app.use(helmet({
  contentSecurityPolicy: false
  // Disabled for simplicity with Vite dev server scripts
}));
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("SESSION_SECRET environment variable is required in production");
}
var sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "development" ? "flipstackk-development-secret-DO-NOT-USE-IN-PRODUCTION" : "");
if (!sessionSecret) {
  console.error("SESSION_SECRET must be set");
}
if (process.env.NODE_ENV === "production" && !process.env.EMPLOYEE_ACCESS_CODE) {
  console.error("EMPLOYEE_ACCESS_CODE environment variable is required in production");
}
var PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({
    conObject: {
      connectionString: process.env.DATABASE_URL
    },
    tableName: "session",
    createTableIfMissing: true
  }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 1e3 * 60 * 60 * 24 * 7,
    // 7 days
    sameSite: "lax"
  }
}));
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path2 = req.path;
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path2.startsWith("/api")) {
      let logLine = `${req.method} ${path2} ${res.statusCode} in ${duration}ms id=${requestId}`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
      httpRequestsTotal.labels(req.method, path2, String(res.statusCode)).inc();
      if (res.statusCode >= 500) {
        httpErrorsTotal.labels(path2, String(res.statusCode)).inc();
      }
    }
  });
  next();
});
async function runApp(setup) {
  const server = await registerRoutes(app);
  app.get("/api/metrics", async (_req, res) => {
    const text2 = await metricsText();
    res.setHeader("Content-Type", "text/plain");
    res.send(text2);
  });
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error(err);
    res.status(status).json({ message });
  });
  await setup(app, server);
  const port = parseInt(process.env.PORT || "3000", 10);
  server.listen({
    port,
    host: "0.0.0.0"
  }, () => {
    log(`serving on port ${port}`);
  });
}

// server/index-prod.ts
async function serveStatic(app2, server) {
  const distPath = path.resolve(import.meta.dirname, "..", "dist");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express2.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
(async () => {
  await runApp(serveStatic);
})();
export {
  serveStatic
};
