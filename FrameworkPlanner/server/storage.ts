import { db } from "./db.js";
import { asc, desc, sql } from "drizzle-orm";
import { 
  leads, properties, contacts, contracts, contractTemplates, contractDocuments, contractEnvelopes, documentVersions, lois,
  users, twoFactorAuth, backupCodes, teams, teamMembers, teamActivityLogs, notificationPreferences, userGoals, userNotifications, tasks, offers, timesheetEntries, timeClockSessions, globalActivityLogs,
  buyers, buyerCommunications, dealAssignments, callLogs, callMedia, numberReputation, pipelineConfigs, underwritingTemplates, playgroundPropertySessions, userFeatureFlags, skipTraceResults, leadSourceOptions, campaigns, campaignSteps, campaignEnrollments, campaignDeliveries, rvmAudioAssets, rvmCampaigns, rvmDrops, syncIdempotency, fieldMediaAssets, compSnapshots, compSnapshotRows, dealBuyerMatches
} from "./shared-schema.js";
import { 
  type Lead, type InsertLead, 
  type Property, type InsertProperty, 
  type Contact, type InsertContact, 
  type Contract, type InsertContract,
  type ContractTemplate, type InsertContractTemplate,
  type ContractDocument, type InsertContractDocument,
  type ContractEnvelope, type InsertContractEnvelope,
  type SyncIdempotency, type InsertSyncIdempotency,
  type FieldMediaAsset, type InsertFieldMediaAsset,
  type CompSnapshot, type InsertCompSnapshot,
  type CompSnapshotRow, type InsertCompSnapshotRow,
  type DealBuyerMatch, type InsertDealBuyerMatch,
  type DocumentVersion, type InsertDocumentVersion,
  type Loi, type InsertLoi,
  type User, type InsertUser,
  type TwoFactorAuth, type InsertTwoFactorAuth,
  type BackupCode, type InsertBackupCode,
  type Team, type InsertTeam,
  type TeamMember, type InsertTeamMember,
  type TeamActivityLog, type InsertTeamActivityLog,
  type NotificationPreference, type InsertNotificationPreference,
  type UserGoal, type InsertUserGoal,
  type UserNotification, type InsertUserNotification,
  type Task, type InsertTask,
  type Offer, type InsertOffer,
  type TimesheetEntry, type InsertTimesheetEntry,
  type TimeClockSession, type InsertTimeClockSession,
  type GlobalActivityLog, type InsertGlobalActivityLog,
  type Buyer, type InsertBuyer,
  type BuyerCommunication, type InsertBuyerCommunication,
  type DealAssignment, type InsertDealAssignment,
  type CallLog, type InsertCallLog,
  type CallMedia, type InsertCallMedia,
  type NumberReputation, type InsertNumberReputation,
  type PipelineConfig, type InsertPipelineConfig,
  type UnderwritingTemplate, type InsertUnderwritingTemplate,
  type PlaygroundPropertySession, type InsertPlaygroundPropertySession,
  type UserFeatureFlag, type InsertUserFeatureFlag,
  type SkipTraceResult, type InsertSkipTraceResult,
  type LeadSourceOption, type InsertLeadSourceOption,
  type Campaign, type InsertCampaign,
  type CampaignStep, type InsertCampaignStep,
  type CampaignEnrollment, type InsertCampaignEnrollment,
  type CampaignDelivery, type InsertCampaignDelivery,
  type RvmAudioAsset, type InsertRvmAudioAsset,
  type RvmCampaign, type InsertRvmCampaign,
  type RvmDrop, type InsertRvmDrop
} from "./shared-schema.js";
import { eq, and, gte, lte, isNull, inArray, or, ne, isNotNull } from "drizzle-orm";

export interface IStorage {
  // Leads
  getLeads(limit?: number, offset?: number): Promise<Lead[]>;
  listLeads(input: {
    q?: string;
    status?: string;
    owner?: string;
    createdFrom?: Date;
    createdTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Lead[]; total: number }>;
  getLeadById(id: number): Promise<Lead | undefined>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: number, lead: Partial<InsertLead>): Promise<Lead>;
  deleteLead(id: number): Promise<void>;

  getLatestSkipTraceForLead(leadId: number): Promise<SkipTraceResult | undefined>;
  getLatestSkipTraceForProperty(propertyId: number): Promise<SkipTraceResult | undefined>;
  getLatestSkipTraceByCacheKey(cacheKey: string): Promise<SkipTraceResult | undefined>;
  createSkipTraceResult(input: InsertSkipTraceResult): Promise<SkipTraceResult>;
  updateSkipTraceResult(id: number, patch: Partial<InsertSkipTraceResult>): Promise<SkipTraceResult>;

  getLeadSourceOptions(userId: number): Promise<LeadSourceOption[]>;
  upsertLeadSourceOption(input: InsertLeadSourceOption): Promise<LeadSourceOption>;

  getCampaigns(userId: number): Promise<Campaign[]>;
  createCampaign(input: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: number, patch: Partial<InsertCampaign>): Promise<Campaign>;
  deleteCampaign(id: number): Promise<void>;
  getCampaignSteps(campaignId: number): Promise<CampaignStep[]>;
  replaceCampaignSteps(campaignId: number, steps: InsertCampaignStep[]): Promise<CampaignStep[]>;
  enrollCampaignLeads(campaignId: number, leadIds: number[]): Promise<void>;
  getCampaignStats(campaignId: number): Promise<{ sends: number; failed: number }>;

  getRvmAudioAssets(userId: number): Promise<RvmAudioAsset[]>;
  createRvmAudioAsset(input: InsertRvmAudioAsset): Promise<RvmAudioAsset>;
  deleteRvmAudioAsset(id: number): Promise<void>;
  getRvmCampaigns(userId: number): Promise<RvmCampaign[]>;
  createRvmCampaign(input: InsertRvmCampaign): Promise<RvmCampaign>;
  updateRvmCampaign(id: number, patch: Partial<InsertRvmCampaign>): Promise<RvmCampaign>;
  deleteRvmCampaign(id: number): Promise<void>;
  createRvmDrops(drops: InsertRvmDrop[]): Promise<void>;
  getPendingRvmDrops(limit?: number): Promise<RvmDrop[]>;
  updateRvmDrop(id: number, patch: Partial<InsertRvmDrop>): Promise<RvmDrop>;
  getRvmCampaignDrops(campaignId: number, limit?: number): Promise<RvmDrop[]>;

  // Properties
  getProperties(limit?: number, offset?: number): Promise<Property[]>;
  getPropertyById(id: number): Promise<Property | undefined>;
  getPropertyBySourceLeadId(sourceLeadId: number): Promise<Property | undefined>;
  getPropertiesBySourceLeadIds(sourceLeadIds: number[]): Promise<Array<{ id: number; sourceLeadId: number }>>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: number, property: Partial<InsertProperty>): Promise<Property>;
  deleteProperty(id: number): Promise<void>;

  // Contacts
  getContacts(limit?: number, offset?: number): Promise<Contact[]>;
  getContactById(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: number): Promise<void>;

  // Contracts
  getContracts(limit?: number, offset?: number): Promise<Contract[]>;
  getContractsByPropertyId(propertyId: number, limit?: number, offset?: number): Promise<Contract[]>;
  getContractById(id: number): Promise<Contract | undefined>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: number, contract: Partial<InsertContract>): Promise<Contract>;
  deleteContract(id: number): Promise<void>;

  // Contract Templates
  getContractTemplates(limit?: number, offset?: number): Promise<ContractTemplate[]>;
  getContractTemplateById(id: number): Promise<ContractTemplate | undefined>;
  createContractTemplate(template: InsertContractTemplate): Promise<ContractTemplate>;
  updateContractTemplate(id: number, template: Partial<InsertContractTemplate>): Promise<ContractTemplate>;
  deleteContractTemplate(id: number): Promise<void>;

  // Contract Documents
  getContractDocuments(limit?: number, offset?: number): Promise<ContractDocument[]>;
  getContractDocumentById(id: number): Promise<ContractDocument | undefined>;
  createContractDocument(document: InsertContractDocument): Promise<ContractDocument>;
  updateContractDocument(id: number, document: Partial<InsertContractDocument>): Promise<ContractDocument>;
  deleteContractDocument(id: number): Promise<void>;

  // Contract Envelopes
  getContractEnvelopesByDocument(documentId: number): Promise<ContractEnvelope[]>;
  getContractEnvelopeById(id: number): Promise<ContractEnvelope | undefined>;
  getContractEnvelopeByTokenHash(tokenHash: string): Promise<ContractEnvelope | undefined>;
  createContractEnvelope(input: InsertContractEnvelope): Promise<ContractEnvelope>;
  updateContractEnvelope(id: number, patch: Partial<InsertContractEnvelope>): Promise<ContractEnvelope>;

  // Sync
  getSyncIdempotency(userId: number, key: string): Promise<SyncIdempotency | undefined>;
  createSyncIdempotency(input: InsertSyncIdempotency): Promise<SyncIdempotency>;

  // Field Media
  createFieldMediaAsset(input: InsertFieldMediaAsset): Promise<FieldMediaAsset>;
  getFieldMediaAssetsByLead(leadId: number, limit?: number): Promise<FieldMediaAsset[]>;

  // Comps
  createCompSnapshot(input: InsertCompSnapshot): Promise<CompSnapshot>;
  getCompSnapshotsByProperty(propertyId: number, limit?: number): Promise<CompSnapshot[]>;
  replaceCompSnapshotRows(opportunityId: number, rows: Omit<InsertCompSnapshotRow, "opportunityId">[]): Promise<void>;
  getCompSnapshotRowsByOpportunity(opportunityId: number, limit?: number): Promise<CompSnapshotRow[]>;

  // Buyer matching
  replaceDealBuyerMatches(propertyId: number, matches: Omit<InsertDealBuyerMatch, "propertyId">[]): Promise<void>;
  getDealBuyerMatches(propertyId: number, limit?: number): Promise<DealBuyerMatch[]>;

  // Document Versions
  getDocumentVersions(documentId: number): Promise<DocumentVersion[]>;
  createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion>;

  // LOIs
  getLois(limit?: number, offset?: number): Promise<Loi[]>;
  getLoiById(id: number): Promise<Loi | undefined>;
  createLoi(loi: InsertLoi): Promise<Loi>;
  updateLoi(id: number, loi: Partial<InsertLoi>): Promise<Loi>;
  deleteLoi(id: number): Promise<void>;

  // Users
  getUsers(limit?: number, offset?: number): Promise<User[]>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;

  getUserFeatureFlag(userId: number, flag: string): Promise<UserFeatureFlag | undefined>;
  upsertUserFeatureFlag(input: InsertUserFeatureFlag): Promise<UserFeatureFlag>;

  // Two Factor Auth
  getTwoFactorAuthByUserId(userId: number): Promise<TwoFactorAuth | undefined>;
  createTwoFactorAuth(auth: InsertTwoFactorAuth): Promise<TwoFactorAuth>;
  updateTwoFactorAuth(userId: number, auth: Partial<InsertTwoFactorAuth>): Promise<TwoFactorAuth>;
  deleteTwoFactorAuth(userId: number): Promise<void>;

  // Backup Codes
  getBackupCodesByUserId(userId: number): Promise<BackupCode[]>;
  createBackupCode(code: InsertBackupCode): Promise<BackupCode>;
  useBackupCode(userId: number, code: string): Promise<boolean>;
  deleteBackupCodes(userId: number): Promise<void>;

  // Teams
  getTeams(): Promise<Team[]>;
  getTeamById(id: number): Promise<Team | undefined>;
  getTeamsByOwnerId(ownerId: number): Promise<Team[]>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: number, team: Partial<InsertTeam>): Promise<Team>;
  deleteTeam(id: number): Promise<void>;

  // Team Members
  getTeamMembers(teamId: number): Promise<TeamMember[]>;
  getTeamMemberById(id: number): Promise<TeamMember | undefined>;
  createTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeamMember(id: number, member: Partial<InsertTeamMember>): Promise<TeamMember>;
  deleteTeamMember(id: number): Promise<void>;

  // Team Activity Logs
  getTeamActivityLogs(teamId: number, limit?: number): Promise<TeamActivityLog[]>;
  createTeamActivityLog(log: InsertTeamActivityLog): Promise<TeamActivityLog>;

  // Notification Preferences
  getNotificationPreferencesByUserId(userId: number): Promise<NotificationPreference | undefined>;
  createNotificationPreferences(prefs: InsertNotificationPreference): Promise<NotificationPreference>;
  updateNotificationPreferences(userId: number, prefs: Partial<InsertNotificationPreference>): Promise<NotificationPreference>;

  // User Notifications (actual notification messages)
  getUserNotifications(userId: number, limit?: number, offset?: number): Promise<UserNotification[]>;
  getUserNotificationById(id: number): Promise<UserNotification | undefined>;
  createUserNotification(notification: InsertUserNotification): Promise<UserNotification>;
  markNotificationAsRead(id: number): Promise<UserNotification>;
  deleteUserNotification(id: number): Promise<void>;
  deleteAllUserNotifications(userId: number): Promise<void>;
  markAllNotificationsAsRead(userId: number): Promise<void>;

  // User Goals
  getUserGoals(userId: number): Promise<UserGoal[]>;
  getUserGoalById(id: number): Promise<UserGoal | undefined>;
  createUserGoal(goal: InsertUserGoal): Promise<UserGoal>;
  updateUserGoal(id: number, goal: Partial<InsertUserGoal>): Promise<UserGoal>;
  deleteUserGoal(id: number): Promise<void>;

  // Tasks
  listTasks(
    auth: { userId: number; isManager: boolean },
    input: {
      assignedToUserId?: number;
      createdByUserId?: number;
      status?: string;
      type?: string;
      priority?: string;
      relatedEntityType?: string;
      relatedEntityId?: number;
      dueFrom?: Date;
      dueTo?: Date;
      includeCompleted?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: Task[]; total: number }>;
  getTaskById(id: number): Promise<Task | undefined>;
  createTask(input: InsertTask): Promise<Task>;
  updateTask(id: number, patch: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  completeTask(id: number, input: { completedAt: Date; status?: string }): Promise<Task>;

  // Offers
  getOffers(limit?: number, offset?: number): Promise<Offer[]>;
  getOfferById(id: number): Promise<Offer | undefined>;
  getOffersByUserId(userId: number): Promise<Offer[]>;
  getOffersByPropertyId(propertyId: number): Promise<Offer[]>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOffer(id: number, offer: Partial<InsertOffer>): Promise<Offer>;
  deleteOffer(id: number): Promise<void>;

  // Timesheet Entries
  getTimesheetEntries(userId: number, limit?: number, offset?: number): Promise<TimesheetEntry[]>;
  getTimesheetEntriesFiltered(input: { userId?: number; from?: string; to?: string; limit?: number; offset?: number }): Promise<TimesheetEntry[]>;
  getTimesheetEntryById(id: number): Promise<TimesheetEntry | undefined>;
  createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntry>;
  updateTimesheetEntry(id: number, entry: Partial<InsertTimesheetEntry>): Promise<TimesheetEntry>;
  deleteTimesheetEntry(id: number): Promise<void>;

  getOpenTimeClockSession(userId: number): Promise<TimeClockSession | undefined>;
  createTimeClockSession(input: InsertTimeClockSession): Promise<TimeClockSession>;
  updateOpenTimeClockSession(userId: number, partial: Partial<InsertTimeClockSession>): Promise<TimeClockSession | undefined>;
  closeOpenTimeClockSessionAndCreateEntry(userId: number, input: { clockOutAt: Date; tzOffsetMinutes: number }): Promise<{ session: TimeClockSession; entry: TimesheetEntry } | undefined>;

  // Global Activity Logs
  getGlobalActivityLogs(limit?: number, offset?: number): Promise<GlobalActivityLog[]>;
  createGlobalActivity(log: InsertGlobalActivityLog): Promise<GlobalActivityLog>;

  getPlaygroundPropertySessionById(id: number): Promise<PlaygroundPropertySession | undefined>;
  getPlaygroundPropertySessionByAddressKey(userId: number, addressKey: string): Promise<PlaygroundPropertySession | undefined>;
  createPlaygroundPropertySession(input: InsertPlaygroundPropertySession): Promise<PlaygroundPropertySession>;
  updatePlaygroundPropertySession(id: number, patch: Partial<InsertPlaygroundPropertySession>): Promise<PlaygroundPropertySession>;
  deletePlaygroundPropertySession(id: number): Promise<void>;
  listRecentPlaygroundPropertySessions(userId: number, limit?: number): Promise<PlaygroundPropertySession[]>;

  // Pipeline Configs
  getPipelineConfig(userId: number, entityType: string): Promise<PipelineConfig | undefined>;
  upsertPipelineConfig(userId: number, entityType: string, columns: string): Promise<PipelineConfig>;

  getUnderwritingTemplates(userId: number): Promise<UnderwritingTemplate[]>;
  getUnderwritingTemplateById(id: number): Promise<UnderwritingTemplate | undefined>;
  createUnderwritingTemplate(template: InsertUnderwritingTemplate): Promise<UnderwritingTemplate>;
  updateUnderwritingTemplate(id: number, patch: Partial<InsertUnderwritingTemplate>): Promise<UnderwritingTemplate>;
  deleteUnderwritingTemplate(id: number): Promise<void>;

  // Buyers
  getBuyers(limit?: number, offset?: number): Promise<Buyer[]>;
  getBuyerById(id: number): Promise<Buyer | undefined>;
  createBuyer(buyer: InsertBuyer): Promise<Buyer>;
  updateBuyer(id: number, buyer: Partial<InsertBuyer>): Promise<Buyer>;
  deleteBuyer(id: number): Promise<void>;

  // Buyer Communications
  getBuyerCommunications(buyerId: number, limit?: number, offset?: number): Promise<BuyerCommunication[]>;
  createBuyerCommunication(comm: InsertBuyerCommunication): Promise<BuyerCommunication>;
  deleteBuyerCommunication(id: number): Promise<void>;

  // Deal Assignments
  getDealAssignments(limit?: number, offset?: number): Promise<DealAssignment[]>;
  getDealAssignmentById(id: number): Promise<DealAssignment | undefined>;
  getDealAssignmentsByPropertyId(propertyId: number): Promise<DealAssignment[]>;
  getDealAssignmentsByBuyerId(buyerId: number): Promise<DealAssignment[]>;
  createDealAssignment(assignment: InsertDealAssignment): Promise<DealAssignment>;
  updateDealAssignment(id: number, assignment: Partial<InsertDealAssignment>): Promise<DealAssignment>;
  deleteDealAssignment(id: number): Promise<void>;

  // Call Logs
  getCallLogs(limit?: number, offset?: number, status?: string, contactId?: number): Promise<CallLog[]>;
  createCallLog(log: InsertCallLog): Promise<CallLog>;
  updateCallLog(id: number, patch: Partial<InsertCallLog & { status?: string; endedAt?: Date; durationMs?: number; errorCode?: string; errorMessage?: string }>): Promise<CallLog>;
}

export class DatabaseStorage implements IStorage {
  // Leads
  async getLeads(limit?: number, offset: number = 0): Promise<Lead[]> {
    let q: any = db.select().from(leads);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Lead[]>;
  }

  async listLeads(input: {
    q?: string;
    status?: string;
    owner?: string;
    createdFrom?: Date;
    createdTo?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ items: Lead[]; total: number }> {
    const limit = typeof input.limit === "number" ? input.limit : 200;
    const offset = typeof input.offset === "number" ? input.offset : 0;

    const whereParts: any[] = [];

    const status = String(input.status || "").trim();
    if (status && status !== "all") whereParts.push(eq(leads.status, status));

    const owner = String(input.owner || "").trim().toLowerCase();
    if (owner) {
      const needle = `%${owner}%`;
      whereParts.push(sql`lower(${leads.ownerName}) LIKE ${needle}`);
    }

    const qRaw = String(input.q || "").trim().toLowerCase();
    if (qRaw) {
      const needle = `%${qRaw}%`;
      whereParts.push(
        or(
          sql`lower(${leads.address}) LIKE ${needle}`,
          sql`lower(${leads.city}) LIKE ${needle}`,
          sql`lower(${leads.ownerName}) LIKE ${needle}`,
          sql`lower(${leads.ownerPhone}) LIKE ${needle}`,
          sql`lower(${leads.ownerEmail}) LIKE ${needle}`,
          sql`lower(${leads.zipCode}) LIKE ${needle}`,
        ),
      );
    }

    if (input.createdFrom) whereParts.push(gte(leads.createdAt, input.createdFrom));
    if (input.createdTo) whereParts.push(lte(leads.createdAt, input.createdTo));

    const whereClause = whereParts.length ? and(...whereParts) : undefined;

    let q: any = db.select().from(leads);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(desc(leads.createdAt), desc(leads.id)).limit(limit).offset(offset);
    const items = (await q) as unknown as Lead[];

    let cq: any = db.select({ count: sql<number>`count(*)::int` }).from(leads);
    if (whereClause) cq = cq.where(whereClause);
    const countRows = await cq;
    const total = Number((countRows as any)?.[0]?.count || 0);

    return { items, total };
  }

  async getLeadById(id: number): Promise<Lead | undefined> {
    const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    return result[0];
  }

  async createLead(lead: InsertLead): Promise<Lead> {
    const result = await db.insert(leads).values(lead as any).returning();
    return result[0];
  }

  async updateLead(id: number, lead: Partial<InsertLead>): Promise<Lead> {
    const result = await db.update(leads).set(lead as any).where(eq(leads.id, id)).returning();
    return result[0];
  }

  async deleteLead(id: number): Promise<void> {
    await db.delete(leads).where(eq(leads.id, id));
  }

  async getLatestSkipTraceForLead(leadId: number): Promise<SkipTraceResult | undefined> {
    const result = await db
      .select()
      .from(skipTraceResults)
      .where(eq(skipTraceResults.leadId, leadId))
      .orderBy(desc(skipTraceResults.requestedAt))
      .limit(1);
    return result[0];
  }

  async getLatestSkipTraceForProperty(propertyId: number): Promise<SkipTraceResult | undefined> {
    const result = await db
      .select()
      .from(skipTraceResults)
      .where(eq(skipTraceResults.propertyId, propertyId))
      .orderBy(desc(skipTraceResults.requestedAt))
      .limit(1);
    return result[0];
  }

  async getLatestSkipTraceByCacheKey(cacheKey: string): Promise<SkipTraceResult | undefined> {
    const result = await db
      .select()
      .from(skipTraceResults)
      .where(eq(skipTraceResults.cacheKey, cacheKey))
      .orderBy(desc(skipTraceResults.requestedAt))
      .limit(1);
    return result[0];
  }

  async createSkipTraceResult(input: InsertSkipTraceResult): Promise<SkipTraceResult> {
    const result = await db.insert(skipTraceResults).values(input as any).returning();
    return result[0];
  }

  async updateSkipTraceResult(id: number, patch: Partial<InsertSkipTraceResult>): Promise<SkipTraceResult> {
    const result = await db.update(skipTraceResults).set(patch as any).where(eq(skipTraceResults.id, id)).returning();
    return result[0];
  }

  async getLeadSourceOptions(userId: number): Promise<LeadSourceOption[]> {
    return db
      .select()
      .from(leadSourceOptions)
      .where(and(eq(leadSourceOptions.isActive, true), or(isNull(leadSourceOptions.userId), eq(leadSourceOptions.userId, userId))))
      .orderBy(leadSourceOptions.sortOrder);
  }

  async upsertLeadSourceOption(input: InsertLeadSourceOption): Promise<LeadSourceOption> {
    const v: any = input as any;
    const existing = await db
      .select()
      .from(leadSourceOptions)
      .where(and(eq(leadSourceOptions.userId, v.userId as any), eq(leadSourceOptions.value, v.value)))
      .limit(1);

    if (existing[0]) {
      const result = await db
        .update(leadSourceOptions)
        .set({ label: v.label, isActive: v.isActive, sortOrder: v.sortOrder, updatedAt: new Date() } as any)
        .where(eq(leadSourceOptions.id, existing[0].id))
        .returning();
      return result[0];
    }

    const result = await db.insert(leadSourceOptions).values(input as any).returning();
    return result[0];
  }

  async getCampaigns(userId: number): Promise<Campaign[]> {
    return db.select().from(campaigns).where(eq(campaigns.userId, userId)).orderBy(desc(campaigns.createdAt));
  }

  async createCampaign(input: InsertCampaign): Promise<Campaign> {
    const result = await db.insert(campaigns).values(input as any).returning();
    return result[0];
  }

  async updateCampaign(id: number, patch: Partial<InsertCampaign>): Promise<Campaign> {
    const result = await db.update(campaigns).set({ ...patch, updatedAt: new Date() } as any).where(eq(campaigns.id, id)).returning();
    return result[0];
  }

  async deleteCampaign(id: number): Promise<void> {
    await db.delete(campaignDeliveries).where(eq(campaignDeliveries.campaignId, id));
    await db.delete(campaignEnrollments).where(eq(campaignEnrollments.campaignId, id));
    await db.delete(campaignSteps).where(eq(campaignSteps.campaignId, id));
    await db.delete(campaigns).where(eq(campaigns.id, id));
  }

  async getCampaignSteps(campaignId: number): Promise<CampaignStep[]> {
    return db.select().from(campaignSteps).where(eq(campaignSteps.campaignId, campaignId)).orderBy(campaignSteps.stepOrder);
  }

  async replaceCampaignSteps(campaignId: number, steps: InsertCampaignStep[]): Promise<CampaignStep[]> {
    await db.delete(campaignSteps).where(eq(campaignSteps.campaignId, campaignId));
    if (!steps.length) return [];
    const result = await db.insert(campaignSteps).values(steps.map((s) => ({ ...s, campaignId })) as any).returning();
    return result;
  }

  async enrollCampaignLeads(campaignId: number, leadIds: number[]): Promise<void> {
    const deduped = Array.from(new Set((leadIds || []).filter((n) => Number.isFinite(n))));
    if (!deduped.length) return;
    for (const leadId of deduped) {
      await db.execute(sql`
        INSERT INTO campaign_enrollments (campaign_id, lead_id, status, started_at, next_step_order, next_run_at)
        VALUES (${campaignId}, ${leadId}, 'active', NOW(), 0, NOW())
        ON CONFLICT DO NOTHING
      `);
    }
  }

  async getCampaignStats(campaignId: number): Promise<{ sends: number; failed: number }> {
    const rows: any = await db.execute(sql`
      SELECT
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END)::int AS sends,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS failed
      FROM campaign_deliveries
      WHERE campaign_id = ${campaignId}
    `);
    const r = (rows as any).rows?.[0] || {};
    return { sends: Number(r.sends || 0), failed: Number(r.failed || 0) };
  }

  async getRvmAudioAssets(userId: number): Promise<RvmAudioAsset[]> {
    return db.select().from(rvmAudioAssets).where(eq(rvmAudioAssets.userId, userId)).orderBy(desc(rvmAudioAssets.createdAt));
  }

  async createRvmAudioAsset(input: InsertRvmAudioAsset): Promise<RvmAudioAsset> {
    const result = await db.insert(rvmAudioAssets).values(input as any).returning();
    return result[0];
  }

  async deleteRvmAudioAsset(id: number): Promise<void> {
    await db.delete(rvmAudioAssets).where(eq(rvmAudioAssets.id, id));
  }

  async getRvmCampaigns(userId: number): Promise<RvmCampaign[]> {
    return db.select().from(rvmCampaigns).where(eq(rvmCampaigns.userId, userId)).orderBy(desc(rvmCampaigns.createdAt));
  }

  async createRvmCampaign(input: InsertRvmCampaign): Promise<RvmCampaign> {
    const result = await db.insert(rvmCampaigns).values(input as any).returning();
    return result[0];
  }

  async updateRvmCampaign(id: number, patch: Partial<InsertRvmCampaign>): Promise<RvmCampaign> {
    const result = await db.update(rvmCampaigns).set({ ...patch, updatedAt: new Date() } as any).where(eq(rvmCampaigns.id, id)).returning();
    return result[0];
  }

  async deleteRvmCampaign(id: number): Promise<void> {
    await db.delete(rvmDrops).where(eq(rvmDrops.campaignId, id));
    await db.delete(rvmCampaigns).where(eq(rvmCampaigns.id, id));
  }

  async createRvmDrops(drops: InsertRvmDrop[]): Promise<void> {
    if (!drops.length) return;
    await db.insert(rvmDrops).values(drops as any);
  }

  async getPendingRvmDrops(limit = 100): Promise<RvmDrop[]> {
    return db
      .select()
      .from(rvmDrops)
      .where(inArray(rvmDrops.status, ["queued", "sending"] as any))
      .orderBy(desc(rvmDrops.requestedAt))
      .limit(limit);
  }

  async updateRvmDrop(id: number, patch: Partial<InsertRvmDrop>): Promise<RvmDrop> {
    const result = await db.update(rvmDrops).set(patch as any).where(eq(rvmDrops.id, id)).returning();
    return result[0];
  }

  async getRvmCampaignDrops(campaignId: number, limit = 200): Promise<RvmDrop[]> {
    return db.select().from(rvmDrops).where(eq(rvmDrops.campaignId, campaignId)).orderBy(desc(rvmDrops.requestedAt)).limit(limit);
  }

  // Properties
  async getProperties(limit?: number, offset: number = 0): Promise<Property[]> {
    let q: any = db.select().from(properties);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Property[]>;
  }

  async getPropertyById(id: number): Promise<Property | undefined> {
    const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
    return result[0];
  }

  async getPropertyBySourceLeadId(sourceLeadId: number): Promise<Property | undefined> {
    const result = await db.select().from(properties).where(eq(properties.sourceLeadId, sourceLeadId)).limit(1);
    return result[0];
  }

  async getPropertiesBySourceLeadIds(sourceLeadIds: number[]): Promise<Array<{ id: number; sourceLeadId: number }>> {
    const unique = Array.from(new Set((sourceLeadIds || []).filter((v) => typeof v === "number" && Number.isFinite(v) && v > 0)));
    if (!unique.length) return [];
    const rows = await db
      .select({ id: properties.id, sourceLeadId: properties.sourceLeadId })
      .from(properties)
      .where(inArray(properties.sourceLeadId, unique));
    return rows as any;
  }

  async createProperty(property: InsertProperty): Promise<Property> {
    const result = await db.insert(properties).values(property as any).returning();
    return result[0];
  }

  async updateProperty(id: number, property: Partial<InsertProperty>): Promise<Property> {
    const result = await db.update(properties).set(property as any).where(eq(properties.id, id)).returning();
    return result[0];
  }

  async deleteProperty(id: number): Promise<void> {
    await db.delete(properties).where(eq(properties.id, id));
  }

  // Contacts
  async getContacts(limit?: number, offset: number = 0): Promise<Contact[]> {
    let q: any = db.select().from(contacts);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Contact[]>;
  }

  async getContactById(id: number): Promise<Contact | undefined> {
    const result = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    return result[0];
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const result = await db.insert(contacts).values(contact as any).returning();
    return result[0];
  }

  async updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact> {
    const result = await db.update(contacts).set(contact as any).where(eq(contacts.id, id)).returning();
    return result[0];
  }

  async deleteContact(id: number): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  // Contracts
  async getContracts(limit?: number, offset: number = 0): Promise<Contract[]> {
    let q: any = db.select().from(contracts);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Contract[]>;
  }

  async getContractsByPropertyId(propertyId: number, limit?: number, offset: number = 0): Promise<Contract[]> {
    let q: any = db.select().from(contracts).where(eq(contracts.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Contract[]>;
  }

  async getContractById(id: number): Promise<Contract | undefined> {
    const result = await db.select().from(contracts).where(eq(contracts.id, id)).limit(1);
    return result[0];
  }

  async createContract(contract: InsertContract): Promise<Contract> {
    const result = await db.insert(contracts).values(contract as any).returning();
    return result[0];
  }

  async updateContract(id: number, contract: Partial<InsertContract>): Promise<Contract> {
    const result = await db.update(contracts).set(contract as any).where(eq(contracts.id, id)).returning();
    return result[0];
  }

  async deleteContract(id: number): Promise<void> {
    await db.delete(contracts).where(eq(contracts.id, id));
  }

  // Contract Templates
  async getContractTemplates(limit?: number, offset: number = 0): Promise<ContractTemplate[]> {
    let q: any = db.select().from(contractTemplates);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<ContractTemplate[]>;
  }

  async getContractTemplateById(id: number): Promise<ContractTemplate | undefined> {
    const result = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id)).limit(1);
    return result[0];
  }

  async createContractTemplate(template: InsertContractTemplate): Promise<ContractTemplate> {
    const result = await db.insert(contractTemplates).values(template as any).returning();
    return result[0];
  }

  async updateContractTemplate(id: number, template: Partial<InsertContractTemplate>): Promise<ContractTemplate> {
    const result = await db.update(contractTemplates).set(template as any).where(eq(contractTemplates.id, id)).returning();
    return result[0];
  }

  async deleteContractTemplate(id: number): Promise<void> {
    await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
  }

  // Contract Documents
  async getContractDocuments(limit?: number, offset: number = 0): Promise<ContractDocument[]> {
    let q: any = db.select().from(contractDocuments);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<ContractDocument[]>;
  }

  async getContractDocumentById(id: number): Promise<ContractDocument | undefined> {
    const result = await db.select().from(contractDocuments).where(eq(contractDocuments.id, id)).limit(1);
    return result[0];
  }

  async createContractDocument(document: InsertContractDocument): Promise<ContractDocument> {
    const result = await db.insert(contractDocuments).values(document as any).returning();
    return result[0];
  }

  async updateContractDocument(id: number, document: Partial<InsertContractDocument>): Promise<ContractDocument> {
    const result = await db.update(contractDocuments).set(document as any).where(eq(contractDocuments.id, id)).returning();
    return result[0];
  }

  async deleteContractDocument(id: number): Promise<void> {
    await db.delete(contractDocuments).where(eq(contractDocuments.id, id));
  }

  async getContractEnvelopesByDocument(documentId: number): Promise<ContractEnvelope[]> {
    return db.select().from(contractEnvelopes).where(eq(contractEnvelopes.documentId, documentId)).orderBy(desc(contractEnvelopes.createdAt));
  }

  async getContractEnvelopeById(id: number): Promise<ContractEnvelope | undefined> {
    const result = await db.select().from(contractEnvelopes).where(eq(contractEnvelopes.id, id)).limit(1);
    return result[0];
  }

  async getContractEnvelopeByTokenHash(tokenHash: string): Promise<ContractEnvelope | undefined> {
    const result = await db.select().from(contractEnvelopes).where(eq(contractEnvelopes.tokenHash, tokenHash)).limit(1);
    return result[0];
  }

  async createContractEnvelope(input: InsertContractEnvelope): Promise<ContractEnvelope> {
    const result = await db.insert(contractEnvelopes).values(input as any).returning();
    return result[0];
  }

  async updateContractEnvelope(id: number, patch: Partial<InsertContractEnvelope>): Promise<ContractEnvelope> {
    const result = await db.update(contractEnvelopes).set({ ...patch, updatedAt: new Date() } as any).where(eq(contractEnvelopes.id, id)).returning();
    return result[0];
  }

  async getSyncIdempotency(userId: number, key: string): Promise<SyncIdempotency | undefined> {
    const result = await db
      .select()
      .from(syncIdempotency)
      .where(and(eq(syncIdempotency.userId, userId), eq(syncIdempotency.idempotencyKey, key)))
      .limit(1);
    return result[0];
  }

  async createSyncIdempotency(input: InsertSyncIdempotency): Promise<SyncIdempotency> {
    const result = await db.insert(syncIdempotency).values(input as any).returning();
    return result[0];
  }

  async createFieldMediaAsset(input: InsertFieldMediaAsset): Promise<FieldMediaAsset> {
    const result = await db.insert(fieldMediaAssets).values(input as any).returning();
    return result[0];
  }

  async getFieldMediaAssetsByLead(leadId: number, limit = 50): Promise<FieldMediaAsset[]> {
    return db.select().from(fieldMediaAssets).where(eq(fieldMediaAssets.leadId, leadId)).orderBy(desc(fieldMediaAssets.createdAt)).limit(limit);
  }

  async createCompSnapshot(input: InsertCompSnapshot): Promise<CompSnapshot> {
    const result = await db.insert(compSnapshots).values(input as any).returning();
    return result[0];
  }

  async getCompSnapshotsByProperty(propertyId: number, limit = 20): Promise<CompSnapshot[]> {
    return db.select().from(compSnapshots).where(eq(compSnapshots.propertyId, propertyId)).orderBy(desc(compSnapshots.requestedAt)).limit(limit);
  }

  async replaceCompSnapshotRows(opportunityId: number, rows: Omit<InsertCompSnapshotRow, "opportunityId">[]): Promise<void> {
    await db.delete(compSnapshotRows).where(eq(compSnapshotRows.opportunityId, opportunityId));
    if (!rows.length) return;
    await db.insert(compSnapshotRows).values(rows.map((r) => ({ ...r, opportunityId })) as any);
  }

  async getCompSnapshotRowsByOpportunity(opportunityId: number, limit = 200): Promise<CompSnapshotRow[]> {
    return db
      .select()
      .from(compSnapshotRows)
      .where(eq(compSnapshotRows.opportunityId, opportunityId))
      .orderBy(desc(compSnapshotRows.createdAt))
      .limit(limit);
  }

  async replaceDealBuyerMatches(propertyId: number, matches: Omit<InsertDealBuyerMatch, "propertyId">[]): Promise<void> {
    await db.delete(dealBuyerMatches).where(eq(dealBuyerMatches.propertyId, propertyId));
    if (!matches.length) return;
    await db.insert(dealBuyerMatches).values(matches.map((m) => ({ ...m, propertyId })) as any);
  }

  async getDealBuyerMatches(propertyId: number, limit = 25): Promise<DealBuyerMatch[]> {
    return db.select().from(dealBuyerMatches).where(eq(dealBuyerMatches.propertyId, propertyId)).orderBy(desc(dealBuyerMatches.score)).limit(limit);
  }

  // Document Versions
  async getDocumentVersions(documentId: number, limit?: number, offset: number = 0): Promise<DocumentVersion[]> {
    let q: any = db.select().from(documentVersions).where(eq(documentVersions.documentId, documentId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<DocumentVersion[]>;
  }

  async createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion> {
    const result = await db.insert(documentVersions).values(version as any).returning();
    return result[0];
  }

  // LOIs
  async getLois(limit?: number, offset: number = 0): Promise<Loi[]> {
    let q: any = db.select().from(lois);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Loi[]>;
  }

  async getLoiById(id: number): Promise<Loi | undefined> {
    const result = await db.select().from(lois).where(eq(lois.id, id)).limit(1);
    return result[0];
  }

  async createLoi(loi: InsertLoi): Promise<Loi> {
    const result = await db.insert(lois).values(loi as any).returning();
    return result[0];
  }

  async updateLoi(id: number, loi: Partial<InsertLoi>): Promise<Loi> {
    const result = await db.update(lois).set(loi as any).where(eq(lois.id, id)).returning();
    return result[0];
  }

  async deleteLoi(id: number): Promise<void> {
    await db.delete(lois).where(eq(lois.id, id));
  }

  // Users
  async getUsers(limit?: number, offset: number = 0): Promise<User[]> {
    let q: any = db.select().from(users);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<User[]>;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values(user as any).returning();
    return result[0];
  }

  async updateUser(id: number, user: Partial<InsertUser>): Promise<User> {
    const result = await db.update(users).set(user as any).where(eq(users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getUserFeatureFlag(userId: number, flag: string): Promise<UserFeatureFlag | undefined> {
    const result = await db
      .select()
      .from(userFeatureFlags)
      .where(and(eq(userFeatureFlags.userId, userId), eq(userFeatureFlags.flag, flag)))
      .limit(1);
    return result[0];
  }

  async upsertUserFeatureFlag(input: InsertUserFeatureFlag): Promise<UserFeatureFlag> {
    const v: any = input as any;
    const existing = await this.getUserFeatureFlag(v.userId, v.flag);
    if (existing) {
      const result = await db
        .update(userFeatureFlags)
        .set({ enabled: v.enabled, updatedAt: new Date() } as any)
        .where(eq(userFeatureFlags.id, existing.id))
        .returning();
      return result[0];
    }
    const result = await db.insert(userFeatureFlags).values(input as any).returning();
    return result[0];
  }

  // Two Factor Auth
  async getTwoFactorAuthByUserId(userId: number): Promise<TwoFactorAuth | undefined> {
    const result = await db.select().from(twoFactorAuth).where(eq(twoFactorAuth.userId, userId)).limit(1);
    return result[0];
  }

  async createTwoFactorAuth(auth: InsertTwoFactorAuth): Promise<TwoFactorAuth> {
    const result = await db.insert(twoFactorAuth).values(auth as any).returning();
    return result[0];
  }

  async updateTwoFactorAuth(userId: number, auth: Partial<InsertTwoFactorAuth>): Promise<TwoFactorAuth> {
    const result = await db.update(twoFactorAuth).set(auth as any).where(eq(twoFactorAuth.userId, userId)).returning();
    return result[0];
  }

  async deleteTwoFactorAuth(userId: number): Promise<void> {
    await db.delete(twoFactorAuth).where(eq(twoFactorAuth.userId, userId));
  }

  // Backup Codes
  async getBackupCodesByUserId(userId: number): Promise<BackupCode[]> {
    return db.select().from(backupCodes).where(eq(backupCodes.userId, userId));
  }

  async createBackupCode(code: InsertBackupCode): Promise<BackupCode> {
    const result = await db.insert(backupCodes).values(code as any).returning();
    return result[0];
  }

  async useBackupCode(userId: number, code: string): Promise<boolean> {
    const result = await db.update(backupCodes)
      .set({ isUsed: true, usedAt: new Date() } as any)
      .where(and(
        eq(backupCodes.userId, userId),
        eq(backupCodes.code, code),
        eq(backupCodes.isUsed, false)
      ))
      .returning();
    return result.length > 0;
  }

  async deleteBackupCodes(userId: number): Promise<void> {
    await db.delete(backupCodes).where(eq(backupCodes.userId, userId));
  }

  // Teams
  async getTeams(): Promise<Team[]> {
    return db.select().from(teams);
  }

  async getTeamById(id: number): Promise<Team | undefined> {
    const result = await db.select().from(teams).where(eq(teams.id, id)).limit(1);
    return result[0];
  }

  async getTeamsByOwnerId(ownerId: number): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.ownerId, ownerId));
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const result = await db.insert(teams).values(team as any).returning();
    return result[0];
  }

  async updateTeam(id: number, team: Partial<InsertTeam>): Promise<Team> {
    const result = await db.update(teams).set(team as any).where(eq(teams.id, id)).returning();
    return result[0];
  }

  async deleteTeam(id: number): Promise<void> {
    await db.delete(teams).where(eq(teams.id, id));
  }

  // Team Members
  async getTeamMembers(teamId: number): Promise<TeamMember[]> {
    return db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
  }

  async getTeamMemberById(id: number): Promise<TeamMember | undefined> {
    const result = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
    return result[0];
  }

  async createTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const result = await db.insert(teamMembers).values(member as any).returning();
    return result[0];
  }

  async updateTeamMember(id: number, member: Partial<InsertTeamMember>): Promise<TeamMember> {
    const result = await db.update(teamMembers).set(member as any).where(eq(teamMembers.id, id)).returning();
    return result[0];
  }

  async deleteTeamMember(id: number): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }

  // Team Activity Logs
  async getTeamActivityLogs(teamId: number, limit: number = 50): Promise<TeamActivityLog[]> {
    return db.select().from(teamActivityLogs).where(eq(teamActivityLogs.teamId, teamId)).limit(limit);
  }

  async createTeamActivityLog(log: InsertTeamActivityLog): Promise<TeamActivityLog> {
    const result = await db.insert(teamActivityLogs).values(log as any).returning();
    return result[0];
  }

  // Notification Preferences
  async getNotificationPreferencesByUserId(userId: number): Promise<NotificationPreference | undefined> {
    const result = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1);
    return result[0];
  }

  async createNotificationPreferences(prefs: InsertNotificationPreference): Promise<NotificationPreference> {
    const result = await db.insert(notificationPreferences).values(prefs as any).returning();
    return result[0];
  }

  async updateNotificationPreferences(userId: number, prefs: Partial<InsertNotificationPreference>): Promise<NotificationPreference> {
    const result = await db.update(notificationPreferences).set(prefs as any).where(eq(notificationPreferences.userId, userId)).returning();
    return result[0];
  }

  // User Notifications (actual notification messages)
  async getUserNotifications(userId: number, limit?: number, offset: number = 0): Promise<UserNotification[]> {
    let q: any = db.select().from(userNotifications).where(eq(userNotifications.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<UserNotification[]>;
  }

  async getUserNotificationById(id: number): Promise<UserNotification | undefined> {
    const result = await db.select().from(userNotifications).where(eq(userNotifications.id, id)).limit(1);
    return result[0];
  }

  async createUserNotification(notification: InsertUserNotification): Promise<UserNotification> {
    const result = await db.insert(userNotifications).values(notification as any).returning();
    return result[0];
  }

  async markNotificationAsRead(id: number): Promise<UserNotification> {
    const result = await db.update(userNotifications).set({ read: true }).where(eq(userNotifications.id, id)).returning();
    return result[0];
  }

  async deleteUserNotification(id: number): Promise<void> {
    await db.delete(userNotifications).where(eq(userNotifications.id, id));
  }

  async deleteAllUserNotifications(userId: number): Promise<void> {
    await db.delete(userNotifications).where(eq(userNotifications.userId, userId));
  }

  async markAllNotificationsAsRead(userId: number): Promise<void> {
    await db.update(userNotifications).set({ read: true }).where(eq(userNotifications.userId, userId));
  }

  // User Goals
  async getUserGoals(userId: number): Promise<UserGoal[]> {
    return db.select().from(userGoals).where(eq(userGoals.userId, userId));
  }

  async getUserGoalById(id: number): Promise<UserGoal | undefined> {
    const result = await db.select().from(userGoals).where(eq(userGoals.id, id)).limit(1);
    return result[0];
  }

  async createUserGoal(goal: InsertUserGoal): Promise<UserGoal> {
    const result = await db.insert(userGoals).values(goal as any).returning();
    return result[0];
  }

  async updateUserGoal(id: number, goal: Partial<InsertUserGoal>): Promise<UserGoal> {
    const result = await db.update(userGoals).set(goal as any).where(eq(userGoals.id, id)).returning();
    return result[0];
  }

  async deleteUserGoal(id: number): Promise<void> {
    await db.delete(userGoals).where(eq(userGoals.id, id));
  }

  // Offers
  async getOffers(limit?: number, offset: number = 0): Promise<Offer[]> {
    let q: any = db.select().from(offers);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Offer[]>;
  }

  async getOfferById(id: number): Promise<Offer | undefined> {
    const result = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
    return result[0];
  }

  async getOffersByUserId(userId: number, limit?: number, offset: number = 0): Promise<Offer[]> {
    let q: any = db.select().from(offers).where(eq(offers.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Offer[]>;
  }

  async getOffersByPropertyId(propertyId: number, limit?: number, offset: number = 0): Promise<Offer[]> {
    let q: any = db.select().from(offers).where(eq(offers.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Offer[]>;
  }

  async createOffer(offer: InsertOffer): Promise<Offer> {
    const result = await db.insert(offers).values(offer as any).returning();
    return result[0];
  }

  async updateOffer(id: number, offer: Partial<InsertOffer>): Promise<Offer> {
    const result = await db.update(offers).set(offer as any).where(eq(offers.id, id)).returning();
    return result[0];
  }

  async deleteOffer(id: number): Promise<void> {
    await db.delete(offers).where(eq(offers.id, id));
  }

  // Timesheet Entries
  async getTimesheetEntries(userId: number, limit?: number, offset: number = 0): Promise<TimesheetEntry[]> {
    let q: any = db.select().from(timesheetEntries).where(eq(timesheetEntries.userId, userId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<TimesheetEntry[]>;
  }

  async getTimesheetEntriesFiltered(input: { userId?: number; from?: string; to?: string; limit?: number; offset?: number }): Promise<TimesheetEntry[]> {
    const conditions: any[] = [];
    if (typeof input.userId === "number") conditions.push(eq(timesheetEntries.userId, input.userId));
    if (input.from) conditions.push(gte(timesheetEntries.date, input.from));
    if (input.to) conditions.push(lte(timesheetEntries.date, input.to));

    let q: any = db.select().from(timesheetEntries);
    if (conditions.length > 0) q = q.where(and(...conditions));
    if (typeof input.limit === "number") q = q.limit(input.limit).offset(input.offset || 0);
    return q as unknown as Promise<TimesheetEntry[]>;
  }

  async getTimesheetEntryById(id: number): Promise<TimesheetEntry | undefined> {
    const result = await db.select().from(timesheetEntries).where(eq(timesheetEntries.id, id)).limit(1);
    return result[0];
  }

  async createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntry> {
    const result = await db.insert(timesheetEntries).values(entry as any).returning();
    return result[0];
  }

  async updateTimesheetEntry(id: number, entry: Partial<InsertTimesheetEntry>): Promise<TimesheetEntry> {
    const result = await db.update(timesheetEntries).set(entry as any).where(eq(timesheetEntries.id, id)).returning();
    return result[0];
  }

  async deleteTimesheetEntry(id: number): Promise<void> {
    await db.delete(timesheetEntries).where(eq(timesheetEntries.id, id));
  }

  async getOpenTimeClockSession(userId: number): Promise<TimeClockSession | undefined> {
    const result = await db
      .select()
      .from(timeClockSessions)
      .where(and(eq(timeClockSessions.userId, userId), isNull(timeClockSessions.clockOutAt)))
      .limit(1);
    return result[0];
  }

  async createTimeClockSession(input: InsertTimeClockSession): Promise<TimeClockSession> {
    const result = await db.insert(timeClockSessions).values(input as any).returning();
    return result[0];
  }

  async updateOpenTimeClockSession(userId: number, partial: Partial<InsertTimeClockSession>): Promise<TimeClockSession | undefined> {
    const open = await this.getOpenTimeClockSession(userId);
    if (!open) return undefined;
    const result = await db
      .update(timeClockSessions)
      .set({ ...partial, updatedAt: new Date() } as any)
      .where(eq(timeClockSessions.id, open.id))
      .returning();
    return result[0];
  }

  async closeOpenTimeClockSessionAndCreateEntry(
    userId: number,
    input: { clockOutAt: Date; tzOffsetMinutes: number }
  ): Promise<{ session: TimeClockSession; entry: TimesheetEntry } | undefined> {
    const open = await this.getOpenTimeClockSession(userId);
    if (!open) return undefined;

    const closedRows = await db
      .update(timeClockSessions)
      .set({ clockOutAt: input.clockOutAt, updatedAt: new Date() } as any)
      .where(eq(timeClockSessions.id, open.id))
      .returning();
    const session = closedRows[0];
    if (!session?.clockOutAt) return undefined;

    const toLocalIso = (d: Date, tzOffsetMinutes: number) => {
      const localMs = d.getTime() - tzOffsetMinutes * 60_000;
      return new Date(localMs).toISOString();
    };

    const startIso = toLocalIso(new Date(session.clockInAt as any), session.tzOffsetMinutes);
    const endIso = toLocalIso(new Date(session.clockOutAt as any), session.tzOffsetMinutes);

    const date = startIso.slice(0, 10);
    const startTime = startIso.slice(11, 16);
    const endTime = endIso.slice(11, 16);

    const ms = new Date(session.clockOutAt as any).getTime() - new Date(session.clockInAt as any).getTime();
    const hours = Math.max(0, ms / 3_600_000);

    const entry = await this.createTimesheetEntry({
      userId: session.userId,
      date,
      employee: session.employee,
      task: session.task,
      startTime,
      endTime,
      hours: hours.toFixed(2) as any,
    } as any);

    return { session, entry };
  }

  // Global Activity Logs
  async getGlobalActivityLogs(limit: number = 50, offset: number = 0): Promise<GlobalActivityLog[]> {
    return db.select().from(globalActivityLogs).orderBy(desc(globalActivityLogs.createdAt)).offset(offset).limit(limit);
  }

  async createGlobalActivity(log: InsertGlobalActivityLog): Promise<GlobalActivityLog> {
    const result = await db.insert(globalActivityLogs).values(log as any).returning();
    return result[0];
  }

  async getPlaygroundPropertySessionById(id: number): Promise<PlaygroundPropertySession | undefined> {
    const result = await db.select().from(playgroundPropertySessions).where(eq(playgroundPropertySessions.id, id)).limit(1);
    return result[0];
  }

  async getPlaygroundPropertySessionByAddressKey(userId: number, addressKey: string): Promise<PlaygroundPropertySession | undefined> {
    const result = await db
      .select()
      .from(playgroundPropertySessions)
      .where(and(eq(playgroundPropertySessions.createdBy, userId), eq(playgroundPropertySessions.addressKey, addressKey)))
      .limit(1);
    return result[0];
  }

  async createPlaygroundPropertySession(input: InsertPlaygroundPropertySession): Promise<PlaygroundPropertySession> {
    const result = await db.insert(playgroundPropertySessions).values(input as any).returning();
    return result[0];
  }

  async updatePlaygroundPropertySession(id: number, patch: Partial<InsertPlaygroundPropertySession>): Promise<PlaygroundPropertySession> {
    const result = await db
      .update(playgroundPropertySessions)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(eq(playgroundPropertySessions.id, id))
      .returning();
    return result[0];
  }

  async deletePlaygroundPropertySession(id: number): Promise<void> {
    await db.delete(playgroundPropertySessions).where(eq(playgroundPropertySessions.id, id));
  }

  async listRecentPlaygroundPropertySessions(userId: number, limit: number = 20): Promise<PlaygroundPropertySession[]> {
    return db
      .select()
      .from(playgroundPropertySessions)
      .where(eq(playgroundPropertySessions.createdBy, userId))
      .orderBy(desc(playgroundPropertySessions.lastOpenedAt))
      .limit(limit);
  }

  async getPipelineConfig(userId: number, entityType: string): Promise<PipelineConfig | undefined> {
    const result = await db.select().from(pipelineConfigs).where(and(eq(pipelineConfigs.userId, userId), eq(pipelineConfigs.entityType, entityType))).limit(1);
    return result[0];
  }

  async upsertPipelineConfig(userId: number, entityType: string, columns: string): Promise<PipelineConfig> {
    const existing = await this.getPipelineConfig(userId, entityType);
    if (existing) {
      const result = await db.update(pipelineConfigs).set({ columns, updatedAt: new Date() } as any).where(eq(pipelineConfigs.id, existing.id)).returning();
      return result[0];
    }
    const result = await db.insert(pipelineConfigs).values({ userId, entityType, columns } as InsertPipelineConfig as any).returning();
    return result[0];
  }

  async getUnderwritingTemplates(userId: number): Promise<UnderwritingTemplate[]> {
    return db.select().from(underwritingTemplates).where(eq(underwritingTemplates.userId, userId)).orderBy(desc(underwritingTemplates.updatedAt));
  }

  async getUnderwritingTemplateById(id: number): Promise<UnderwritingTemplate | undefined> {
    const result = await db.select().from(underwritingTemplates).where(eq(underwritingTemplates.id, id)).limit(1);
    return result[0];
  }

  async createUnderwritingTemplate(template: InsertUnderwritingTemplate): Promise<UnderwritingTemplate> {
    const result = await db.insert(underwritingTemplates).values(template as any).returning();
    return result[0];
  }

  async updateUnderwritingTemplate(id: number, patch: Partial<InsertUnderwritingTemplate>): Promise<UnderwritingTemplate> {
    const result = await db
      .update(underwritingTemplates)
      .set({ ...patch, updatedAt: new Date() } as any)
      .where(eq(underwritingTemplates.id, id))
      .returning();
    return result[0];
  }

  async deleteUnderwritingTemplate(id: number): Promise<void> {
    await db.delete(underwritingTemplates).where(eq(underwritingTemplates.id, id));
  }

  // Buyers
  async getBuyers(limit?: number, offset: number = 0): Promise<Buyer[]> {
    let q: any = db.select().from(buyers);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<Buyer[]>;
  }

  async getBuyerById(id: number): Promise<Buyer | undefined> {
    const result = await db.select().from(buyers).where(eq(buyers.id, id)).limit(1);
    return result[0];
  }

  async createBuyer(buyer: InsertBuyer): Promise<Buyer> {
    const result = await db.insert(buyers).values(buyer as any).returning();
    return result[0];
  }

  async updateBuyer(id: number, buyer: Partial<InsertBuyer>): Promise<Buyer> {
    const result = await db.update(buyers).set(buyer as any).where(eq(buyers.id, id)).returning();
    return result[0];
  }

  async deleteBuyer(id: number): Promise<void> {
    await db.delete(buyers).where(eq(buyers.id, id));
  }

  // Buyer Communications
  async getBuyerCommunications(buyerId: number, limit?: number, offset: number = 0): Promise<BuyerCommunication[]> {
    let q: any = db.select().from(buyerCommunications).where(eq(buyerCommunications.buyerId, buyerId)).orderBy(desc(buyerCommunications.createdAt));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<BuyerCommunication[]>;
  }

  async createBuyerCommunication(comm: InsertBuyerCommunication): Promise<BuyerCommunication> {
    const result = await db.insert(buyerCommunications).values(comm as any).returning();
    return result[0];
  }

  async deleteBuyerCommunication(id: number): Promise<void> {
    await db.delete(buyerCommunications).where(eq(buyerCommunications.id, id));
  }

  // Deal Assignments
  async getDealAssignments(limit?: number, offset: number = 0): Promise<DealAssignment[]> {
    let q: any = db.select().from(dealAssignments);
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<DealAssignment[]>;
  }

  async getDealAssignmentById(id: number): Promise<DealAssignment | undefined> {
    const result = await db.select().from(dealAssignments).where(eq(dealAssignments.id, id)).limit(1);
    return result[0];
  }

  async getDealAssignmentsByPropertyId(propertyId: number, limit?: number, offset: number = 0): Promise<DealAssignment[]> {
    let q: any = db.select().from(dealAssignments).where(eq(dealAssignments.propertyId, propertyId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<DealAssignment[]>;
  }

  async getDealAssignmentsByBuyerId(buyerId: number, limit?: number, offset: number = 0): Promise<DealAssignment[]> {
    let q: any = db.select().from(dealAssignments).where(eq(dealAssignments.buyerId, buyerId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<DealAssignment[]>;
  }

  async createDealAssignment(assignment: InsertDealAssignment): Promise<DealAssignment> {
    const result = await db.insert(dealAssignments).values(assignment as any).returning();
    return result[0];
  }

  async updateDealAssignment(id: number, assignment: Partial<InsertDealAssignment>): Promise<DealAssignment> {
    const result = await db.update(dealAssignments).set(assignment as any).where(eq(dealAssignments.id, id)).returning();
    return result[0];
  }

  async deleteDealAssignment(id: number): Promise<void> {
    await db.delete(dealAssignments).where(eq(dealAssignments.id, id));
  }

  // Call Logs
  async getCallLogs(limit?: number, offset: number = 0, status?: string, contactId?: number): Promise<CallLog[]> {
    let q: any = db.select().from(callLogs);
    if (status) q = q.where(eq(callLogs.status, status));
    if (contactId) q = q.where(eq(callLogs.contactId, contactId));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<CallLog[]>;
  }

  async createCallLog(log: InsertCallLog): Promise<CallLog> {
    const result = await db.insert(callLogs).values(log as any).returning();
    return result[0];
  }

  async updateCallLog(id: number, patch: Partial<InsertCallLog & { status?: string; endedAt?: Date; durationMs?: number; errorCode?: string; errorMessage?: string }>): Promise<CallLog> {
    const result = await db.update(callLogs).set(patch as any).where(eq(callLogs.id, id)).returning();
    return result[0];
  }

  async getNumberReputationByE164s(userId: number, e164s: string[]): Promise<NumberReputation[]> {
    const normalized = Array.from(new Set((e164s || []).map(v => String(v || "").trim()).filter(Boolean)));
    if (!normalized.length) return [];
    return db
      .select()
      .from(numberReputation)
      .where(and(eq(numberReputation.userId, userId), inArray(numberReputation.e164, normalized))) as unknown as Promise<NumberReputation[]>;
  }

  async upsertNumberReputation(input: InsertNumberReputation): Promise<NumberReputation> {
    const now = new Date();
    const v: any = input as any;
    const result = await db
      .insert(numberReputation)
      .values({ ...(input as any), updatedAt: now } as any)
      .onConflictDoUpdate({
        target: [numberReputation.userId, numberReputation.e164] as any,
        set: { label: v.label as any, reason: v.reason as any, updatedAt: now } as any,
      })
      .returning();
    return result[0];
  }

  async deleteNumberReputation(userId: number, e164: string): Promise<void> {
    await db.delete(numberReputation).where(and(eq(numberReputation.userId, userId), eq(numberReputation.e164, e164)));
  }

  async listTasks(
    auth: { userId: number; isManager: boolean },
    input: {
      assignedToUserId?: number;
      createdByUserId?: number;
      status?: string;
      type?: string;
      priority?: string;
      relatedEntityType?: string;
      relatedEntityId?: number;
      dueFrom?: Date;
      dueTo?: Date;
      includeCompleted?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: Task[]; total: number }> {
    const limit = typeof input.limit === "number" ? input.limit : 50;
    const offset = typeof input.offset === "number" ? input.offset : 0;

    const whereParts: any[] = [];
    if (!auth.isManager) {
      whereParts.push(
        or(eq(tasks.isPrivate, false), eq(tasks.createdBy, auth.userId), eq(tasks.assignedToUserId, auth.userId)),
      );
    }

    if (typeof input.assignedToUserId === "number") whereParts.push(eq(tasks.assignedToUserId, input.assignedToUserId));
    if (typeof input.createdByUserId === "number") whereParts.push(eq(tasks.createdBy, input.createdByUserId));
    if (input.status) whereParts.push(eq(tasks.status, input.status));
    if (input.type) whereParts.push(eq(tasks.type, input.type));
    if (input.priority) whereParts.push(eq(tasks.priority, input.priority));
    if (input.relatedEntityType) whereParts.push(eq(tasks.relatedEntityType, input.relatedEntityType));
    if (typeof input.relatedEntityId === "number") whereParts.push(eq(tasks.relatedEntityId, input.relatedEntityId));

    if (!input.status && !input.includeCompleted) {
      whereParts.push(ne(tasks.status, "completed"));
    }

    if (input.dueFrom) whereParts.push(and(isNotNull(tasks.dueAt), gte(tasks.dueAt, input.dueFrom)));
    if (input.dueTo) whereParts.push(and(isNotNull(tasks.dueAt), lte(tasks.dueAt, input.dueTo)));

    const whereClause = whereParts.length ? and(...whereParts) : undefined;

    let q: any = db.select().from(tasks);
    if (whereClause) q = q.where(whereClause);
    q = q
      .orderBy(sql`due_at is null`, asc(tasks.dueAt), desc(tasks.createdAt))
      .limit(limit)
      .offset(offset);
    const items = (await q) as unknown as Task[];

    let cq: any = db.select({ count: sql<number>`count(*)::int` }).from(tasks);
    if (whereClause) cq = cq.where(whereClause);
    const countRows = await cq;
    const total = Number((countRows as any)?.[0]?.count || 0);

    return { items, total };
  }

  async getTaskById(id: number): Promise<Task | undefined> {
    const result = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result[0] as any;
  }

  async createTask(input: InsertTask): Promise<Task> {
    const result = await db.insert(tasks).values(input as any).returning();
    return result[0] as any;
  }

  async updateTask(id: number, patch: Partial<InsertTask>): Promise<Task> {
    const now = new Date();
    const updates: any = { ...(patch as any), updatedAt: now };
    if (Object.prototype.hasOwnProperty.call(patch, "dueAt")) {
      updates.reminderSentAt = null;
      updates.overdueAlertSentAt = null;
    }
    const result = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return result[0] as any;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async completeTask(id: number, input: { completedAt: Date; status?: string }): Promise<Task> {
    const now = new Date();
    const status = String(input.status || "completed");
    const result = await db
      .update(tasks)
      .set({
        status,
        completedAt: input.completedAt,
        updatedAt: now,
        reminderSentAt: null,
        overdueAlertSentAt: null,
      } as any)
      .where(eq(tasks.id, id))
      .returning();
    return result[0] as any;
  }

  async listTelephonyMedia(userId: number, kind: string, limit: number = 50): Promise<CallMedia[]> {
    let q: any = db
      .select()
      .from(callMedia)
      .where(and(eq(callMedia.kind, kind), or(eq(callMedia.userId, userId), eq(callMedia.userId, 0))))
      .orderBy(desc(callMedia.createdAt));
    q = q.limit(limit);
    return q as unknown as Promise<CallMedia[]>;
  }

  async createCallMedia(input: InsertCallMedia): Promise<CallMedia> {
    const result = await db.insert(callMedia).values(input as any).returning();
    return result[0];
  }

  async updateCallMedia(id: number, patch: Partial<InsertCallMedia>): Promise<CallMedia> {
    const result = await db
      .update(callMedia)
      .set({ ...(patch as any), updatedAt: new Date() } as any)
      .where(eq(callMedia.id, id))
      .returning();
    return result[0];
  }

  async getTelephonyAnalyticsSummary(userId: number, startDate: Date): Promise<{ total: number; answered: number; missed: number; failed: number; talkSeconds: number }> {
    const rows: any = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'answered')::int AS answered,
        COUNT(*) FILTER (WHERE status = 'missed')::int AS missed,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
        COALESCE(SUM(duration_ms) FILTER (WHERE status = 'answered'), 0)::bigint AS talk_ms
      FROM call_logs
      WHERE user_id = ${userId} AND started_at >= ${startDate}
    `);
    const row = (rows as any).rows?.[0] || {};
    const talkMs = Number(row.talk_ms || 0);
    return {
      total: Number(row.total || 0),
      answered: Number(row.answered || 0),
      missed: Number(row.missed || 0),
      failed: Number(row.failed || 0),
      talkSeconds: Math.round(talkMs / 1000),
    };
  }
}

export const storage = new DatabaseStorage();
