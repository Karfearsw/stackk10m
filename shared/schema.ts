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
  images: text("images").array(),
  arv: decimal("arv", { precision: 12, scale: 2 }),
  repairCost: decimal("repair_cost", { precision: 12, scale: 2 }),
  assignedTo: integer("assigned_to"),
  sourceLeadId: integer("source_lead_id"),
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

// USERS TABLE
export const users = pgTable("users", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// TWO FACTOR AUTH TABLE
export const twoFactorAuth = pgTable("two_factor_auth", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull().unique(),
  secret: varchar("secret", { length: 255 }).notNull(),
  isEnabled: boolean("is_enabled").default(false),
  method: varchar("method", { length: 50 }).default("totp"),
  phoneNumber: varchar("phone_number", { length: 20 }),
  emailBackup: varchar("email_backup", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTwoFactorAuthSchema = createInsertSchema(twoFactorAuth).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type TwoFactorAuth = typeof twoFactorAuth.$inferSelect;
export type InsertTwoFactorAuth = z.infer<typeof insertTwoFactorAuthSchema>;

// BACKUP CODES TABLE
export const backupCodes = pgTable("backup_codes", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  isUsed: boolean("is_used").default(false),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBackupCodeSchema = createInsertSchema(backupCodes).omit({ id: true, createdAt: true } as any);
export type BackupCode = typeof backupCodes.$inferSelect;
export type InsertBackupCode = z.infer<typeof insertBackupCodeSchema>;

// TEAMS TABLE
export const teams = pgTable("teams", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: integer("owner_id").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

// TEAM MEMBERS TABLE
export const teamMembers = pgTable("team_members", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  userId: integer("user_id").notNull(),
  role: varchar("role", { length: 50 }).default("member"),
  permissions: text("permissions").array(),
  invitedBy: integer("invited_by"),
  invitedAt: timestamp("invited_at").defaultNow(),
  joinedAt: timestamp("joined_at"),
  status: varchar("status", { length: 50 }).default("active"),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({ id: true, invitedAt: true } as any);
export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

// TEAM ACTIVITY LOGS TABLE
export const teamActivityLogs = pgTable("team_activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  teamId: integer("team_id").notNull(),
  userId: integer("user_id"),
  action: varchar("action", { length: 255 }).notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTeamActivityLogSchema = createInsertSchema(teamActivityLogs).omit({ id: true, createdAt: true } as any);
export type TeamActivityLog = typeof teamActivityLogs.$inferSelect;
export type InsertTeamActivityLog = z.infer<typeof insertTeamActivityLogSchema>;

// NOTIFICATION PREFERENCES TABLE
export const notificationPreferences = pgTable("notification_preferences", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;

// USER GOALS TABLE
export const userGoals = pgTable("user_goals", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserGoalSchema = createInsertSchema(userGoals).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type UserGoal = typeof userGoals.$inferSelect;
export type InsertUserGoal = z.infer<typeof insertUserGoalSchema>;

// USER NOTIFICATIONS TABLE (actual notification messages)
export const userNotifications = pgTable("user_notifications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).default("system"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  read: boolean("read").default(false),
  relatedId: integer("related_id"),
  relatedType: varchar("related_type", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({ id: true, createdAt: true } as any);
export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;

// OFFERS TABLE
export const offers = pgTable("offers", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;

// TIMESHEET ENTRIES TABLE
export const timesheetEntries = pgTable("timesheet_entries", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTimesheetEntrySchema = createInsertSchema(timesheetEntries).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type TimesheetEntry = typeof timesheetEntries.$inferSelect;
export type InsertTimesheetEntry = z.infer<typeof insertTimesheetEntrySchema>;

// GLOBAL ACTIVITY LOG TABLE (company-wide activity visible to all team members)
export const globalActivityLogs = pgTable("global_activity_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  description: text("description"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGlobalActivityLogSchema = createInsertSchema(globalActivityLogs).omit({ id: true, createdAt: true } as any);
export type GlobalActivityLog = typeof globalActivityLogs.$inferSelect;
export type InsertGlobalActivityLog = z.infer<typeof insertGlobalActivityLogSchema>;

// BUYERS TABLE (Cash Buyers CRM)
export const buyers = pgTable("buyers", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBuyerSchema = createInsertSchema(buyers).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type Buyer = typeof buyers.$inferSelect;
export type InsertBuyer = z.infer<typeof insertBuyerSchema>;

// BUYER COMMUNICATIONS TABLE
export const buyerCommunications = pgTable("buyer_communications", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  buyerId: integer("buyer_id").notNull(),
  userId: integer("user_id").notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  subject: varchar("subject", { length: 255 }),
  content: text("content"),
  direction: varchar("direction", { length: 20 }).default("outbound"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBuyerCommunicationSchema = createInsertSchema(buyerCommunications).omit({ id: true, createdAt: true } as any);
export type BuyerCommunication = typeof buyerCommunications.$inferSelect;
export type InsertBuyerCommunication = z.infer<typeof insertBuyerCommunicationSchema>;

// DEAL ASSIGNMENTS TABLE (Linking buyers to properties for closing)
export const dealAssignments = pgTable("deal_assignments", {
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
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDealAssignmentSchema = createInsertSchema(dealAssignments).omit({ id: true, createdAt: true, updatedAt: true } as any);
export type DealAssignment = typeof dealAssignments.$inferSelect;
export type InsertDealAssignment = z.infer<typeof insertDealAssignmentSchema>;

// CALL LOGS TABLE (Dialer)
export const callLogs = pgTable("call_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").notNull(),
  direction: varchar("direction", { length: 20 }).notNull(),
  number: varchar("number", { length: 20 }).notNull(),
  contactId: integer("contact_id"),
  status: varchar("status", { length: 50 }).notNull(),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  durationMs: integer("duration_ms"),
  errorCode: varchar("error_code", { length: 50 }),
  errorMessage: text("error_message"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCallLogSchema = createInsertSchema(callLogs).omit({ id: true, createdAt: true } as any);
export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = z.infer<typeof insertCallLogSchema>;
