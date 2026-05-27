import { db } from "./db.js";
import { asc, desc, sql } from "drizzle-orm";
import { 
  leads, properties, contacts, contracts, contractTemplates, contractDocuments, contractEnvelopes, documentVersions, lois,
  users, twoFactorAuth, backupCodes, teams, teamMembers, teamActivityLogs, notificationPreferences, userGoals, userNotifications, tasks, offers, timesheetEntries, timeClockSessions, globalActivityLogs,
  buyers, buyerCommunications, dealAssignments, callLogs, callMedia, numberReputation, pipelineConfigs, underwritingTemplates, playgroundPropertySessions, userFeatureFlags, skipTraceResults, leadSourceOptions,
  leadNotes, savedViews, leadBulkActionJobs, aiActionLogs, aiActionUndo, appAuditRuns, appAuditFindings,
  automations, automationTriggers, automationConditions, automationActions, automationRuns,
  skipTraceJobs, skipTraceJobEvents, skipTraceEvidence, leadScoreSnapshots,
  campaigns, campaignSteps, campaignEnrollments, campaignDeliveries, rvmAudioAssets, rvmCampaigns, rvmDrops, syncIdempotency, fieldMediaAssets, compSnapshots, compSnapshotRows, dealBuyerMatches, xpExperiences, xpTimeSlots, xpBlackouts, xpBookings, xpStripeEvents
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
  type LeadNote, type InsertLeadNote,
  type SavedView, type InsertSavedView,
  type LeadBulkActionJob, type InsertLeadBulkActionJob,
  type AiActionLog, type InsertAiActionLog,
  type AiActionUndo, type InsertAiActionUndo,
  type AppAuditRun, type InsertAppAuditRun,
  type AppAuditFinding, type InsertAppAuditFinding,
  type Automation, type InsertAutomation,
  type AutomationTrigger, type InsertAutomationTrigger,
  type AutomationCondition, type InsertAutomationCondition,
  type AutomationAction, type InsertAutomationAction,
  type AutomationRun, type InsertAutomationRun,
  type SkipTraceJob, type InsertSkipTraceJob,
  type SkipTraceJobEvent, type InsertSkipTraceJobEvent,
  type SkipTraceEvidence, type InsertSkipTraceEvidence,
  type LeadScoreSnapshot, type InsertLeadScoreSnapshot,
  type Campaign, type InsertCampaign,
  type CampaignStep, type InsertCampaignStep,
  type CampaignEnrollment, type InsertCampaignEnrollment,
  type CampaignDelivery, type InsertCampaignDelivery,
  type RvmAudioAsset, type InsertRvmAudioAsset,
  type RvmCampaign, type InsertRvmCampaign,
  type RvmDrop, type InsertRvmDrop,
  type XpExperience, type InsertXpExperience,
  type XpTimeSlot, type InsertXpTimeSlot,
  type XpBlackout, type InsertXpBlackout,
  type XpBooking, type InsertXpBooking,
  type XpStripeEvent, type InsertXpStripeEvent,
  type XpLocation, type InsertXpLocation,
  type XpVehicle, type InsertXpVehicle,
  type XpBookingAssignment,
  type XpBookingNote, type InsertXpBookingNote,
  xpLocations,
  xpVehicles,
  xpBookingAssignments,
  xpBookingNotes
} from "./shared-schema.js";
import { eq, and, gte, lte, isNull, inArray, or, ne, isNotNull } from "drizzle-orm";

export interface IStorage {
  // Leads
  getLeads(limit?: number, offset?: number): Promise<Lead[]>;
  listLeads(input: {
    q?: string;
    status?: string;
    owner?: string;
    zip?: string;
    state?: string;
    city?: string;
    county?: string;
    leadType?: string;
    assignedTo?: number | "unassigned";
    tags?: string[];
    tagsMode?: "any" | "all";
    contactPresence?: "phone_only" | "email_only" | "both" | "none";
    scoreMin?: number;
    scoreMax?: number;
    archived?: "exclude" | "include" | "only";
    hasNotes?: boolean;
    noteUpdatedWithinDays?: number;
    lastTouchFrom?: Date;
    lastTouchTo?: Date;
    nextFollowUpFrom?: Date;
    nextFollowUpTo?: Date;
    sortKey?:
      | "newest_imported"
      | "oldest_imported"
      | "highest_score"
      | "lowest_score"
      | "highest_value"
      | "recently_updated"
      | "oldest_untouched"
      | "most_recent_contact"
      | "status_age"
      | "assigned_user";
    sortDir?: "asc" | "desc";
    createdFrom?: Date;
    createdTo?: Date;
    allowedAssignedToUserIds?: number[];
    limit?: number;
    offset?: number;
  }): Promise<{ items: Lead[]; total: number }>;
  getLeadById(id: number): Promise<Lead | undefined>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: number, lead: Partial<InsertLead>): Promise<Lead>;
  deleteLead(id: number): Promise<void>;

  listLeadNotes(leadId: number, limit?: number): Promise<LeadNote[]>;
  createLeadNote(input: InsertLeadNote): Promise<LeadNote>;
  getLeadNotesAggByLeadIds(leadIds: number[]): Promise<Array<{ leadId: number; notesCount: number; lastNoteAt: Date | null; lastNotePreview: string | null }>>;

  listSavedViews(input: { entityType: string; userId: number; teamIds: number[] }): Promise<SavedView[]>;
  getSavedViewById(id: number): Promise<SavedView | undefined>;
  getSavedViewByShareToken(token: string): Promise<SavedView | undefined>;
  createSavedView(input: InsertSavedView): Promise<SavedView>;
  updateSavedView(id: number, patch: Partial<InsertSavedView>): Promise<SavedView>;
  deleteSavedView(id: number): Promise<void>;

  createLeadBulkActionJob(input: InsertLeadBulkActionJob): Promise<LeadBulkActionJob>;
  getLeadBulkActionJobById(id: number): Promise<LeadBulkActionJob | undefined>;
  updateLeadBulkActionJob(id: number, patch: Partial<InsertLeadBulkActionJob>): Promise<LeadBulkActionJob>;

  createAiActionLog(input: InsertAiActionLog): Promise<AiActionLog>;
  createAiActionUndo(input: InsertAiActionUndo): Promise<AiActionUndo>;
  getAiActionUndoByActionId(aiActionLogId: number): Promise<AiActionUndo | undefined>;
  updateAiActionUndo(id: number, patch: Partial<InsertAiActionUndo>): Promise<AiActionUndo>;

  createAppAuditRun(input: InsertAppAuditRun): Promise<AppAuditRun>;
  listAppAuditRuns(input: { createdBy: number; limit?: number }): Promise<AppAuditRun[]>;
  createAppAuditFinding(input: InsertAppAuditFinding): Promise<AppAuditFinding>;
  listAppAuditFindings(input: { runId: number; limit?: number }): Promise<AppAuditFinding[]>;
  updateAppAuditFinding(id: number, patch: Partial<InsertAppAuditFinding>): Promise<AppAuditFinding>;

  getLatestSkipTraceForLead(leadId: number): Promise<SkipTraceResult | undefined>;
  getLatestSkipTraceForProperty(propertyId: number): Promise<SkipTraceResult | undefined>;
  getLatestSkipTraceByCacheKey(cacheKey: string): Promise<SkipTraceResult | undefined>;
  createSkipTraceResult(input: InsertSkipTraceResult): Promise<SkipTraceResult>;
  updateSkipTraceResult(id: number, patch: Partial<InsertSkipTraceResult>): Promise<SkipTraceResult>;

  createSkipTraceJob(input: InsertSkipTraceJob): Promise<SkipTraceJob>;
  updateSkipTraceJob(id: number, patch: Partial<InsertSkipTraceJob>): Promise<SkipTraceJob>;
  getSkipTraceJobById(id: number): Promise<SkipTraceJob | undefined>;
  listQueuedSkipTraceJobs(limit?: number): Promise<SkipTraceJob[]>;
  claimSkipTraceJobForRun(id: number, startedAt: Date): Promise<SkipTraceJob | null>;
  createSkipTraceJobEvent(input: InsertSkipTraceJobEvent): Promise<SkipTraceJobEvent>;
  createSkipTraceEvidence(input: InsertSkipTraceEvidence): Promise<SkipTraceEvidence>;
  createLeadScoreSnapshot(input: InsertLeadScoreSnapshot): Promise<LeadScoreSnapshot>;
  listLeadScoreSnapshotsByJobId(jobId: number, limit?: number): Promise<LeadScoreSnapshot[]>;

  getEnabledAutomationsForEvent(teamId: number, eventType: string): Promise<Array<{ automation: Automation; condition: AutomationCondition | null; actions: AutomationAction[] }>>;
  createAutomationRun(input: InsertAutomationRun): Promise<AutomationRun>;
  updateAutomationRun(id: number, patch: Partial<InsertAutomationRun>): Promise<AutomationRun>;

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
  getUsersByIds(userIds: number[], limit?: number, offset?: number): Promise<User[]>;
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
  getTeamByJoinCode(joinCode: string): Promise<Team | undefined>;
  getTeamsByOwnerId(ownerId: number): Promise<Team[]>;
  getTeamsForUser(userId: number): Promise<Team[]>;
  getUserTeamIds(userId: number): Promise<number[]>;
  getTeamMemberUserIds(teamId: number): Promise<number[]>;
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

  listXpExperiences(input?: { activeOnly?: boolean }): Promise<XpExperience[]>;
  getXpExperienceBySlug(slug: string): Promise<XpExperience | undefined>;
  getXpExperienceById(id: number): Promise<XpExperience | undefined>;
  createXpExperience(input: InsertXpExperience): Promise<XpExperience>;
  updateXpExperience(id: number, patch: Partial<InsertXpExperience>): Promise<XpExperience>;
  deactivateXpExperience(id: number): Promise<XpExperience>;

  listXpTimeSlots(experienceId: number, input?: { from?: Date; to?: Date; activeOnly?: boolean }): Promise<XpTimeSlot[]>;
  getXpTimeSlotById(id: number): Promise<XpTimeSlot | undefined>;
  createXpTimeSlot(input: InsertXpTimeSlot): Promise<XpTimeSlot>;
  deleteXpTimeSlot(id: number): Promise<void>;

  listXpBlackouts(experienceId: number, input?: { from?: Date; to?: Date }): Promise<XpBlackout[]>;
  createXpBlackout(input: InsertXpBlackout): Promise<XpBlackout>;
  deleteXpBlackout(id: number): Promise<void>;

  listXpLocations(input?: { activeOnly?: boolean }): Promise<XpLocation[]>;
  createXpLocation(input: InsertXpLocation): Promise<XpLocation>;
  updateXpLocation(id: number, patch: Partial<InsertXpLocation>): Promise<XpLocation>;
  deactivateXpLocation(id: number): Promise<XpLocation>;

  listXpVehicles(input?: { activeOnly?: boolean; locationId?: number }): Promise<XpVehicle[]>;
  createXpVehicle(input: InsertXpVehicle): Promise<XpVehicle>;
  updateXpVehicle(id: number, patch: Partial<InsertXpVehicle>): Promise<XpVehicle>;
  deactivateXpVehicle(id: number): Promise<XpVehicle>;

  listXpConciergeUsers(): Promise<User[]>;

  upsertXpBookingAssignment(input: { bookingId: number; locationId?: number | null; vehicleId?: number | null; conciergeUserId?: number | null }): Promise<XpBookingAssignment>;
  listXpBookingNotes(bookingId: number): Promise<Array<XpBookingNote & { author?: { id: number; email: string; firstName?: string | null; lastName?: string | null } | null }>>;
  createXpBookingNote(input: InsertXpBookingNote): Promise<XpBookingNote>;

  listXpBookings(input?: {
    experienceId?: number;
    status?: string;
    kind?: string;
    from?: Date;
    to?: Date;
    conciergeUserId?: number;
    locationId?: number;
    vehicleId?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: Array<XpBooking & { assignment?: { locationId: number | null; locationName: string | null; vehicleId: number | null; vehicleName: string | null; conciergeUserId: number | null; conciergeName: string | null; conciergeEmail: string | null; assignedAt: Date | null } | null }>;
    total: number;
  }>;
  getXpBookingById(id: number): Promise<(XpBooking & { assignment?: { locationId: number | null; locationName: string | null; vehicleId: number | null; vehicleName: string | null; conciergeUserId: number | null; conciergeName: string | null; conciergeEmail: string | null; assignedAt: Date | null } | null; notes?: Array<XpBookingNote & { author?: { id: number; email: string; firstName?: string | null; lastName?: string | null } | null }> }) | undefined>;
  createXpBookingPending(input: InsertXpBooking): Promise<XpBooking>;
  getXpBookingByStripeSessionId(sessionId: string): Promise<XpBooking | undefined>;
  confirmXpBookingByStripeSessionId(input: { sessionId: string; paymentIntentId?: string | null; stripeCustomerId?: string | null }): Promise<XpBooking | undefined>;
  cancelXpBooking(id: number): Promise<XpBooking | undefined>;

  hasStripeEvent(eventId: string): Promise<boolean>;
  recordStripeEvent(input: InsertXpStripeEvent): Promise<XpStripeEvent>;

  countXpActiveBookingsOverlapping(input: { experienceId: number; kind: string; startAt: Date; endAt: Date }): Promise<number>;
  hasXpBlackoutOverlap(input: { experienceId: number; startAt: Date; endAt: Date }): Promise<boolean>;

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
    zip?: string;
    state?: string;
    city?: string;
    county?: string;
    leadType?: string;
    assignedTo?: number | "unassigned";
    tags?: string[];
    tagsMode?: "any" | "all";
    contactPresence?: "phone_only" | "email_only" | "both" | "none";
    scoreMin?: number;
    scoreMax?: number;
    archived?: "exclude" | "include" | "only";
    hasNotes?: boolean;
    noteUpdatedWithinDays?: number;
    lastTouchFrom?: Date;
    lastTouchTo?: Date;
    nextFollowUpFrom?: Date;
    nextFollowUpTo?: Date;
    sortKey?:
      | "newest_imported"
      | "oldest_imported"
      | "highest_score"
      | "lowest_score"
      | "highest_value"
      | "recently_updated"
      | "oldest_untouched"
      | "most_recent_contact"
      | "status_age"
      | "assigned_user";
    sortDir?: "asc" | "desc";
    createdFrom?: Date;
    createdTo?: Date;
    allowedAssignedToUserIds?: number[];
    limit?: number;
    offset?: number;
  }): Promise<{ items: Lead[]; total: number }> {
    const limit = typeof input.limit === "number" ? input.limit : 200;
    const offset = typeof input.offset === "number" ? input.offset : 0;

    if (Array.isArray(input.allowedAssignedToUserIds)) {
      const ids = input.allowedAssignedToUserIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      if (!ids.length) return { items: [], total: 0 };
    }

    const whereParts: any[] = [];

    const archivedMode = input.archived || "exclude";
    if (archivedMode === "exclude") whereParts.push(isNull(leads.archivedAt));
    if (archivedMode === "only") whereParts.push(isNotNull(leads.archivedAt));

    const status = String(input.status || "").trim();
    if (status && status !== "all") whereParts.push(eq(leads.status, status));

    const zip = String(input.zip || "").trim();
    if (zip) whereParts.push(eq(leads.zipCode, zip));

    const state = String(input.state || "").trim();
    if (state) whereParts.push(eq(leads.state, state));

    const city = String(input.city || "").trim();
    if (city) whereParts.push(eq(leads.city, city));

    const county = String(input.county || "").trim();
    if (county) whereParts.push(eq(leads.county, county));

    const leadType = String(input.leadType || "").trim();
    if (leadType) whereParts.push(eq(leads.leadType, leadType));

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

    if (typeof input.assignedTo === "number") whereParts.push(eq(leads.assignedTo, input.assignedTo));
    if (input.assignedTo === "unassigned") whereParts.push(isNull(leads.assignedTo));

    if (Array.isArray(input.tags) && input.tags.length) {
      const cleaned = input.tags.map((t) => String(t || "").trim()).filter(Boolean);
      if (cleaned.length) {
        const arr = sql`ARRAY[${sql.join(cleaned.map((t) => sql`${t}`), sql`,`)}]::text[]`;
        const mode = input.tagsMode || "any";
        if (mode === "all") whereParts.push(sql`${leads.tags} @> ${arr}`);
        else whereParts.push(sql`${leads.tags} && ${arr}`);
      }
    }

    if (typeof input.scoreMin === "number" && Number.isFinite(input.scoreMin)) whereParts.push(gte(leads.relasScore, input.scoreMin));
    if (typeof input.scoreMax === "number" && Number.isFinite(input.scoreMax)) whereParts.push(lte(leads.relasScore, input.scoreMax));

    const contactPresence = input.contactPresence;
    if (contactPresence) {
      const hasPhone = sql`COALESCE(NULLIF(TRIM(${leads.ownerPhone}), ''), NULL) IS NOT NULL`;
      const hasEmail = sql`COALESCE(NULLIF(TRIM(${leads.ownerEmail}), ''), NULL) IS NOT NULL`;
      if (contactPresence === "phone_only") whereParts.push(and(hasPhone, sql`NOT (${hasEmail})`));
      if (contactPresence === "email_only") whereParts.push(and(hasEmail, sql`NOT (${hasPhone})`));
      if (contactPresence === "both") whereParts.push(and(hasPhone, hasEmail));
      if (contactPresence === "none") whereParts.push(and(sql`NOT (${hasPhone})`, sql`NOT (${hasEmail})`));
    }

    if (typeof input.hasNotes === "boolean") {
      if (input.hasNotes) whereParts.push(sql`EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = ${leads.id})`);
      else whereParts.push(sql`NOT EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = ${leads.id})`);
    }

    if (typeof input.noteUpdatedWithinDays === "number" && Number.isFinite(input.noteUpdatedWithinDays) && input.noteUpdatedWithinDays > 0) {
      whereParts.push(
        sql`EXISTS (SELECT 1 FROM lead_notes ln WHERE ln.lead_id = ${leads.id} AND ln.created_at >= NOW() - (${input.noteUpdatedWithinDays}::int * INTERVAL '1 day'))`,
      );
    }

    if (input.createdFrom) whereParts.push(gte(leads.createdAt, input.createdFrom));
    if (input.createdTo) whereParts.push(lte(leads.createdAt, input.createdTo));
    if (input.lastTouchFrom) whereParts.push(gte(leads.lastTouchAt, input.lastTouchFrom));
    if (input.lastTouchTo) whereParts.push(lte(leads.lastTouchAt, input.lastTouchTo));
    if (input.nextFollowUpFrom) whereParts.push(gte(leads.nextFollowUpAt, input.nextFollowUpFrom));
    if (input.nextFollowUpTo) whereParts.push(lte(leads.nextFollowUpAt, input.nextFollowUpTo));

    if (Array.isArray(input.allowedAssignedToUserIds)) {
      const ids = input.allowedAssignedToUserIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      whereParts.push(inArray(leads.assignedTo, ids));
    }

    const whereClause = whereParts.length ? and(...whereParts) : undefined;

    const dir = input.sortDir === "asc" ? "asc" : "desc";
    const dirSql = dir === "asc" ? sql`ASC` : sql`DESC`;
    const sortKey = input.sortKey || "newest_imported";
    const orderByParts: any[] = [];
    if (sortKey === "newest_imported") orderByParts.push(desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "oldest_imported") orderByParts.push(asc(leads.createdAt), asc(leads.id));
    else if (sortKey === "highest_score") orderByParts.push(sql`${leads.relasScore} DESC NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "lowest_score") orderByParts.push(sql`${leads.relasScore} ASC NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "highest_value") orderByParts.push(sql`${leads.estimatedValue} ${dirSql} NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "recently_updated") orderByParts.push(sql`${leads.updatedAt} ${dirSql}`, desc(leads.id));
    else if (sortKey === "oldest_untouched") orderByParts.push(sql`COALESCE(${leads.lastTouchAt}, ${leads.createdAt}) ASC`, asc(leads.id));
    else if (sortKey === "most_recent_contact") orderByParts.push(sql`${leads.lastTouchAt} DESC NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "status_age") orderByParts.push(sql`${leads.statusChangedAt} ${dirSql} NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else if (sortKey === "assigned_user") orderByParts.push(sql`${leads.assignedTo} ${dirSql} NULLS LAST`, desc(leads.createdAt), desc(leads.id));
    else orderByParts.push(desc(leads.createdAt), desc(leads.id));

    let q: any = db.select().from(leads);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(...orderByParts).limit(limit).offset(offset);
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

  async listLeadNotes(leadId: number, limit: number = 50): Promise<LeadNote[]> {
    const n = Number.isFinite(limit) ? Math.max(1, Math.min(500, limit)) : 50;
    return db
      .select()
      .from(leadNotes)
      .where(eq(leadNotes.leadId, leadId))
      .orderBy(desc(leadNotes.createdAt), desc(leadNotes.id))
      .limit(n);
  }

  async createLeadNote(input: InsertLeadNote): Promise<LeadNote> {
    const result = await db.insert(leadNotes).values(input as any).returning();
    return result[0];
  }

  async getLeadNotesAggByLeadIds(
    leadIds: number[],
  ): Promise<Array<{ leadId: number; notesCount: number; lastNoteAt: Date | null; lastNotePreview: string | null }>> {
    const ids = (leadIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    if (!ids.length) return [];

    const rows = await db
      .select({
        leadId: leadNotes.leadId,
        notesCount: sql<number>`count(*)::int`,
        lastNoteAt: sql<Date | null>`max(${leadNotes.createdAt})`,
      })
      .from(leadNotes)
      .where(inArray(leadNotes.leadId, ids))
      .groupBy(leadNotes.leadId);

    const latestRows: any = await db.execute(sql`
      SELECT DISTINCT ON (lead_id)
        lead_id as "leadId",
        body as "body",
        created_at as "createdAt"
      FROM lead_notes
      WHERE lead_id IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})
      ORDER BY lead_id, created_at DESC, id DESC
    `);

    const latestByLeadId = new Map<number, { body: string; createdAt: Date | null }>();
    for (const r of (latestRows as any).rows || []) {
      const lid = Number(r.leadId);
      if (!Number.isFinite(lid) || lid <= 0) continue;
      latestByLeadId.set(lid, { body: String(r.body || ""), createdAt: r.createdAt ? new Date(r.createdAt) : null });
    }

    return rows.map((r) => {
      const lid = Number((r as any).leadId);
      const latest = latestByLeadId.get(lid);
      return {
        leadId: lid,
        notesCount: Number((r as any).notesCount || 0),
        lastNoteAt: (r as any).lastNoteAt ? new Date((r as any).lastNoteAt) : latest?.createdAt ?? null,
        lastNotePreview: latest ? String(latest.body || "").trim().slice(0, 280) || null : null,
      };
    });
  }

  async listSavedViews(input: { entityType: string; userId: number; teamIds: number[] }): Promise<SavedView[]> {
    const entityType = String(input.entityType || "").trim();
    const userId = Number(input.userId);
    const teamIds = (input.teamIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    if (!entityType || !Number.isFinite(userId) || userId <= 0) return [];

    const whereParts: any[] = [eq(savedViews.entityType, entityType)];
    const scopes: any[] = [eq(savedViews.ownerUserId, userId)];
    if (teamIds.length) scopes.push(and(eq(savedViews.visibility, "team"), inArray(savedViews.teamId, teamIds)));
    scopes.push(and(eq(savedViews.visibility, "link"), eq(savedViews.ownerUserId, userId)));
    whereParts.push(or(...scopes));

    return db.select().from(savedViews).where(and(...whereParts)).orderBy(desc(savedViews.updatedAt), desc(savedViews.id));
  }

  async getSavedViewById(id: number): Promise<SavedView | undefined> {
    const out = await db.select().from(savedViews).where(eq(savedViews.id, id)).limit(1);
    return out[0];
  }

  async getSavedViewByShareToken(token: string): Promise<SavedView | undefined> {
    const t = String(token || "").trim();
    if (!t) return undefined;
    const out = await db
      .select()
      .from(savedViews)
      .where(and(eq(savedViews.shareToken, t), eq(savedViews.visibility, "link")))
      .limit(1);
    return out[0];
  }

  async createSavedView(input: InsertSavedView): Promise<SavedView> {
    const result = await db.insert(savedViews).values(input as any).returning();
    return result[0];
  }

  async updateSavedView(id: number, patch: Partial<InsertSavedView>): Promise<SavedView> {
    const result = await db
      .update(savedViews)
      .set({ ...(patch as any), updatedAt: new Date() } as any)
      .where(eq(savedViews.id, id))
      .returning();
    return result[0];
  }

  async deleteSavedView(id: number): Promise<void> {
    await db.delete(savedViews).where(eq(savedViews.id, id));
  }

  async createLeadBulkActionJob(input: InsertLeadBulkActionJob): Promise<LeadBulkActionJob> {
    const result = await db.insert(leadBulkActionJobs).values(input as any).returning();
    return result[0];
  }

  async getLeadBulkActionJobById(id: number): Promise<LeadBulkActionJob | undefined> {
    const out = await db.select().from(leadBulkActionJobs).where(eq(leadBulkActionJobs.id, id)).limit(1);
    return out[0];
  }

  async updateLeadBulkActionJob(id: number, patch: Partial<InsertLeadBulkActionJob>): Promise<LeadBulkActionJob> {
    const result = await db
      .update(leadBulkActionJobs)
      .set({ ...(patch as any), updatedAt: new Date() } as any)
      .where(eq(leadBulkActionJobs.id, id))
      .returning();
    return result[0];
  }

  async createAiActionLog(input: InsertAiActionLog): Promise<AiActionLog> {
    const result = await db.insert(aiActionLogs).values(input as any).returning();
    return result[0];
  }

  async createAiActionUndo(input: InsertAiActionUndo): Promise<AiActionUndo> {
    const result = await db.insert(aiActionUndo).values(input as any).returning();
    return result[0];
  }

  async getAiActionUndoByActionId(aiActionLogId: number): Promise<AiActionUndo | undefined> {
    const out = await db.select().from(aiActionUndo).where(eq(aiActionUndo.aiActionLogId, aiActionLogId)).limit(1);
    return out[0];
  }

  async updateAiActionUndo(id: number, patch: Partial<InsertAiActionUndo>): Promise<AiActionUndo> {
    const result = await db.update(aiActionUndo).set(patch as any).where(eq(aiActionUndo.id, id)).returning();
    return result[0];
  }

  async createAppAuditRun(input: InsertAppAuditRun): Promise<AppAuditRun> {
    const result = await db.insert(appAuditRuns).values(input as any).returning();
    return result[0];
  }

  async listAppAuditRuns(input: { createdBy: number; limit?: number }): Promise<AppAuditRun[]> {
    const n = typeof input.limit === "number" ? Math.max(1, Math.min(200, input.limit)) : 50;
    return db
      .select()
      .from(appAuditRuns)
      .where(eq(appAuditRuns.createdBy, input.createdBy))
      .orderBy(desc(appAuditRuns.createdAt), desc(appAuditRuns.id))
      .limit(n);
  }

  async createAppAuditFinding(input: InsertAppAuditFinding): Promise<AppAuditFinding> {
    const result = await db.insert(appAuditFindings).values(input as any).returning();
    return result[0];
  }

  async listAppAuditFindings(input: { runId: number; limit?: number }): Promise<AppAuditFinding[]> {
    const n = typeof input.limit === "number" ? Math.max(1, Math.min(1000, input.limit)) : 200;
    return db
      .select()
      .from(appAuditFindings)
      .where(eq(appAuditFindings.runId, input.runId))
      .orderBy(desc(appAuditFindings.updatedAt), desc(appAuditFindings.id))
      .limit(n);
  }

  async updateAppAuditFinding(id: number, patch: Partial<InsertAppAuditFinding>): Promise<AppAuditFinding> {
    const result = await db
      .update(appAuditFindings)
      .set({ ...(patch as any), updatedAt: new Date() } as any)
      .where(eq(appAuditFindings.id, id))
      .returning();
    return result[0];
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

  async createSkipTraceJob(input: InsertSkipTraceJob): Promise<SkipTraceJob> {
    const result = await db.insert(skipTraceJobs).values(input as any).returning();
    return result[0];
  }

  async updateSkipTraceJob(id: number, patch: Partial<InsertSkipTraceJob>): Promise<SkipTraceJob> {
    const result = await db.update(skipTraceJobs).set(patch as any).where(eq(skipTraceJobs.id, id)).returning();
    return result[0];
  }

  async getSkipTraceJobById(id: number): Promise<SkipTraceJob | undefined> {
    const result = await db.select().from(skipTraceJobs).where(eq(skipTraceJobs.id, id)).limit(1);
    return result[0];
  }

  async listQueuedSkipTraceJobs(limit?: number): Promise<SkipTraceJob[]> {
    const n = typeof limit === "number" ? Math.max(1, Math.min(200, limit)) : 50;
    return db
      .select()
      .from(skipTraceJobs)
      .where(eq(skipTraceJobs.status, "queued"))
      .orderBy(asc(skipTraceJobs.createdAt), asc(skipTraceJobs.id))
      .limit(n);
  }

  async claimSkipTraceJobForRun(id: number, startedAt: Date): Promise<SkipTraceJob | null> {
    const result = await db
      .update(skipTraceJobs)
      .set({ status: "running", startedAt } as any)
      .where(and(eq(skipTraceJobs.id, id), eq(skipTraceJobs.status, "queued")))
      .returning();
    return result[0] || null;
  }

  async createSkipTraceJobEvent(input: InsertSkipTraceJobEvent): Promise<SkipTraceJobEvent> {
    const result = await db.insert(skipTraceJobEvents).values(input as any).returning();
    return result[0];
  }

  async createSkipTraceEvidence(input: InsertSkipTraceEvidence): Promise<SkipTraceEvidence> {
    const result = await db.insert(skipTraceEvidence).values(input as any).returning();
    return result[0];
  }

  async createLeadScoreSnapshot(input: InsertLeadScoreSnapshot): Promise<LeadScoreSnapshot> {
    const result = await db.insert(leadScoreSnapshots).values(input as any).returning();
    return result[0];
  }

  async listLeadScoreSnapshotsByJobId(jobId: number, limit?: number): Promise<LeadScoreSnapshot[]> {
    const n = typeof limit === "number" ? Math.max(1, Math.min(500, limit)) : 50;
    return db
      .select()
      .from(leadScoreSnapshots)
      .where(eq(leadScoreSnapshots.jobId, jobId))
      .orderBy(desc(leadScoreSnapshots.createdAt), desc(leadScoreSnapshots.id))
      .limit(n);
  }

  async getEnabledAutomationsForEvent(teamId: number, eventType: string): Promise<Array<{ automation: Automation; condition: AutomationCondition | null; actions: AutomationAction[] }>> {
    const joined = await db
      .select()
      .from(automationTriggers)
      .innerJoin(automations, and(eq(automations.id, automationTriggers.automationId), eq(automations.teamId, teamId)))
      .where(and(eq(automationTriggers.teamId, teamId), eq(automationTriggers.eventType, eventType), eq(automations.enabled, true)));

    const byAutomationId = new Map<number, Automation>();
    for (const row of joined as any[]) {
      const a = row.automations as Automation;
      const id = Number((a as any).id);
      if (!Number.isFinite(id)) continue;
      if (!byAutomationId.has(id)) byAutomationId.set(id, a);
    }

    const automationIds = Array.from(byAutomationId.keys());
    if (!automationIds.length) return [];

    const conditions = await db
      .select()
      .from(automationConditions)
      .where(and(eq(automationConditions.teamId, teamId), inArray(automationConditions.automationId, automationIds)));

    const actions = await db
      .select()
      .from(automationActions)
      .where(and(eq(automationActions.teamId, teamId), inArray(automationActions.automationId, automationIds)))
      .orderBy(asc(automationActions.sortOrder), asc(automationActions.id));

    const conditionByAutomationId = new Map<number, AutomationCondition>();
    for (const c of conditions) {
      const id = Number((c as any).automationId);
      if (!Number.isFinite(id)) continue;
      if (!conditionByAutomationId.has(id)) conditionByAutomationId.set(id, c as any);
    }

    const actionsByAutomationId = new Map<number, AutomationAction[]>();
    for (const a of actions) {
      const id = Number((a as any).automationId);
      if (!Number.isFinite(id)) continue;
      const list = actionsByAutomationId.get(id) || [];
      list.push(a as any);
      actionsByAutomationId.set(id, list);
    }

    return automationIds.map((id) => ({
      automation: byAutomationId.get(id)!,
      condition: conditionByAutomationId.get(id) || null,
      actions: actionsByAutomationId.get(id) || [],
    }));
  }

  async createAutomationRun(input: InsertAutomationRun): Promise<AutomationRun> {
    const result = await db.insert(automationRuns).values(input as any).returning();
    return result[0];
  }

  async updateAutomationRun(id: number, patch: Partial<InsertAutomationRun>): Promise<AutomationRun> {
    const result = await db.update(automationRuns).set(patch as any).where(eq(automationRuns.id, id)).returning();
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

  async getUsersByIds(userIds: number[], limit?: number, offset: number = 0): Promise<User[]> {
    const ids = Array.isArray(userIds)
      ? userIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (!ids.length) return [];
    let q: any = db.select().from(users).where(inArray(users.id, ids));
    if (typeof limit === "number") q = q.limit(limit).offset(offset);
    return q as unknown as Promise<User[]>;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) return undefined;
    const result = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
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

  async getTeamByJoinCode(joinCode: string): Promise<Team | undefined> {
    const code = String(joinCode || "").trim();
    if (!code) return undefined;
    const result = await db.select().from(teams).where(eq(teams.joinCode, code)).limit(1);
    return result[0];
  }

  async getTeamsByOwnerId(ownerId: number): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.ownerId, ownerId));
  }

  async getUserTeamIds(userId: number): Promise<number[]> {
    const rows = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, userId));
    return rows.map((r) => Number(r.teamId)).filter((n) => Number.isFinite(n) && n > 0);
  }

  async getTeamsForUser(userId: number): Promise<Team[]> {
    const teamIds = await this.getUserTeamIds(userId);
    if (!teamIds.length) return [];
    return db.select().from(teams).where(inArray(teams.id, teamIds));
  }

  async getTeamMemberUserIds(teamId: number): Promise<number[]> {
    const rows = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
    return rows.map((r) => Number(r.userId)).filter((n) => Number.isFinite(n) && n > 0);
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

  async listXpExperiences(input?: { activeOnly?: boolean }): Promise<XpExperience[]> {
    const activeOnly = !!input?.activeOnly;
    let q: any = db.select().from(xpExperiences);
    if (activeOnly) q = q.where(eq(xpExperiences.active, true));
    q = q.orderBy(asc(xpExperiences.title));
    return q as unknown as Promise<XpExperience[]>;
  }

  async getXpExperienceBySlug(slug: string): Promise<XpExperience | undefined> {
    const s = String(slug || "").trim();
    if (!s) return undefined;
    const result = await db.select().from(xpExperiences).where(eq(xpExperiences.slug, s)).limit(1);
    return result[0];
  }

  async getXpExperienceById(id: number): Promise<XpExperience | undefined> {
    const result = await db.select().from(xpExperiences).where(eq(xpExperiences.id, id)).limit(1);
    return result[0];
  }

  async createXpExperience(input: InsertXpExperience): Promise<XpExperience> {
    const now = new Date();
    const result = await db.insert(xpExperiences).values({ ...(input as any), createdAt: now, updatedAt: now } as any).returning();
    return result[0];
  }

  async updateXpExperience(id: number, patch: Partial<InsertXpExperience>): Promise<XpExperience> {
    const result = await db.update(xpExperiences).set({ ...(patch as any), updatedAt: new Date() } as any).where(eq(xpExperiences.id, id)).returning();
    return result[0];
  }

  async deactivateXpExperience(id: number): Promise<XpExperience> {
    const result = await db.update(xpExperiences).set({ active: false, updatedAt: new Date() } as any).where(eq(xpExperiences.id, id)).returning();
    return result[0];
  }

  async listXpTimeSlots(experienceId: number, input?: { from?: Date; to?: Date; activeOnly?: boolean }): Promise<XpTimeSlot[]> {
    const whereParts: any[] = [eq(xpTimeSlots.experienceId, experienceId)];
    const activeOnly = input?.activeOnly !== false;
    if (activeOnly) whereParts.push(eq(xpTimeSlots.active, true));
    if (input?.from) whereParts.push(gte(xpTimeSlots.startAt, input.from));
    if (input?.to) whereParts.push(lte(xpTimeSlots.startAt, input.to));
    let q: any = db.select().from(xpTimeSlots).where(and(...whereParts)).orderBy(asc(xpTimeSlots.startAt));
    return q as unknown as Promise<XpTimeSlot[]>;
  }

  async getXpTimeSlotById(id: number): Promise<XpTimeSlot | undefined> {
    const result = await db.select().from(xpTimeSlots).where(eq(xpTimeSlots.id, id)).limit(1);
    return result[0];
  }

  async createXpTimeSlot(input: InsertXpTimeSlot): Promise<XpTimeSlot> {
    const now = new Date();
    const result = await db.insert(xpTimeSlots).values({ ...(input as any), createdAt: now, updatedAt: now } as any).returning();
    return result[0];
  }

  async deleteXpTimeSlot(id: number): Promise<void> {
    await db.delete(xpTimeSlots).where(eq(xpTimeSlots.id, id));
  }

  async listXpBlackouts(experienceId: number, input?: { from?: Date; to?: Date }): Promise<XpBlackout[]> {
    const whereParts: any[] = [eq(xpBlackouts.experienceId, experienceId)];
    if (input?.from && input?.to) {
      whereParts.push(sql`${xpBlackouts.startAt} < ${input.to} AND ${xpBlackouts.endAt} > ${input.from}`);
    } else if (input?.from) {
      whereParts.push(sql`${xpBlackouts.endAt} > ${input.from}`);
    } else if (input?.to) {
      whereParts.push(sql`${xpBlackouts.startAt} < ${input.to}`);
    }
    const q: any = db.select().from(xpBlackouts).where(and(...whereParts)).orderBy(asc(xpBlackouts.startAt));
    return q as unknown as Promise<XpBlackout[]>;
  }

  async createXpBlackout(input: InsertXpBlackout): Promise<XpBlackout> {
    const now = new Date();
    const result = await db.insert(xpBlackouts).values({ ...(input as any), createdAt: now, updatedAt: now } as any).returning();
    return result[0];
  }

  async deleteXpBlackout(id: number): Promise<void> {
    await db.delete(xpBlackouts).where(eq(xpBlackouts.id, id));
  }

  async listXpLocations(input?: { activeOnly?: boolean }): Promise<XpLocation[]> {
    const whereParts: any[] = [];
    if (input?.activeOnly) whereParts.push(eq(xpLocations.active, true));
    const whereClause = whereParts.length ? and(...whereParts) : undefined;
    let q: any = db.select().from(xpLocations);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(asc(xpLocations.name));
    return q as unknown as Promise<XpLocation[]>;
  }

  async createXpLocation(input: InsertXpLocation): Promise<XpLocation> {
    const now = new Date();
    const result = await db.insert(xpLocations).values({ ...(input as any), createdAt: now, updatedAt: now } as any).returning();
    return result[0];
  }

  async updateXpLocation(id: number, patch: Partial<InsertXpLocation>): Promise<XpLocation> {
    const result = await db.update(xpLocations).set({ ...(patch as any), updatedAt: new Date() } as any).where(eq(xpLocations.id, id)).returning();
    return result[0];
  }

  async deactivateXpLocation(id: number): Promise<XpLocation> {
    const result = await db.update(xpLocations).set({ active: false, updatedAt: new Date() } as any).where(eq(xpLocations.id, id)).returning();
    return result[0];
  }

  async listXpVehicles(input?: { activeOnly?: boolean; locationId?: number }): Promise<XpVehicle[]> {
    const whereParts: any[] = [];
    if (input?.activeOnly) whereParts.push(eq(xpVehicles.active, true));
    if (typeof input?.locationId === "number") whereParts.push(eq(xpVehicles.locationId, input.locationId));
    const whereClause = whereParts.length ? and(...whereParts) : undefined;
    let q: any = db.select().from(xpVehicles);
    if (whereClause) q = q.where(whereClause);
    q = q.orderBy(asc(xpVehicles.name));
    return q as unknown as Promise<XpVehicle[]>;
  }

  async createXpVehicle(input: InsertXpVehicle): Promise<XpVehicle> {
    const now = new Date();
    const result = await db.insert(xpVehicles).values({ ...(input as any), createdAt: now, updatedAt: now } as any).returning();
    return result[0];
  }

  async updateXpVehicle(id: number, patch: Partial<InsertXpVehicle>): Promise<XpVehicle> {
    const result = await db.update(xpVehicles).set({ ...(patch as any), updatedAt: new Date() } as any).where(eq(xpVehicles.id, id)).returning();
    return result[0];
  }

  async deactivateXpVehicle(id: number): Promise<XpVehicle> {
    const result = await db.update(xpVehicles).set({ active: false, updatedAt: new Date() } as any).where(eq(xpVehicles.id, id)).returning();
    return result[0];
  }

  async listXpConciergeUsers(): Promise<User[]> {
    const q: any = db.select().from(users).where(and(eq(users.isActive, true), eq(users.role, "concierge"))).orderBy(asc(users.firstName));
    return q as unknown as Promise<User[]>;
  }

  async upsertXpBookingAssignment(input: { bookingId: number; locationId?: number | null; vehicleId?: number | null; conciergeUserId?: number | null }): Promise<XpBookingAssignment> {
    const bookingId = Number(input.bookingId);
    if (!Number.isFinite(bookingId)) throw new Error("Invalid bookingId");
    const existing = await db.select().from(xpBookingAssignments).where(eq(xpBookingAssignments.bookingId, bookingId)).limit(1);
    const now = new Date();
    const values: any = {
      bookingId,
      locationId: input.locationId ?? null,
      vehicleId: input.vehicleId ?? null,
      conciergeUserId: input.conciergeUserId ?? null,
      assignedAt: input.conciergeUserId ? now : null,
      updatedAt: now,
    };
    if (existing[0]) {
      const result = await db
        .update(xpBookingAssignments)
        .set(values)
        .where(eq(xpBookingAssignments.bookingId, bookingId))
        .returning();
      return result[0];
    }
    const result = await db.insert(xpBookingAssignments).values(values).returning();
    return result[0];
  }

  async listXpBookingNotes(bookingId: number): Promise<Array<XpBookingNote & { author?: { id: number; email: string; firstName?: string | null; lastName?: string | null } | null }>> {
    const id = Number(bookingId);
    if (!Number.isFinite(id)) return [];
    const rows: any = await db
      .select({
        id: xpBookingNotes.id,
        bookingId: xpBookingNotes.bookingId,
        authorUserId: xpBookingNotes.authorUserId,
        body: xpBookingNotes.body,
        createdAt: xpBookingNotes.createdAt,
        authorId: users.id,
        authorEmail: users.email,
        authorFirstName: users.firstName,
        authorLastName: users.lastName,
      })
      .from(xpBookingNotes)
      .leftJoin(users, eq(users.id, xpBookingNotes.authorUserId))
      .where(eq(xpBookingNotes.bookingId, id))
      .orderBy(desc(xpBookingNotes.createdAt));
    return rows.map((r: any) => ({
      id: r.id,
      bookingId: r.bookingId,
      authorUserId: r.authorUserId,
      body: r.body,
      createdAt: r.createdAt,
      author: r.authorId
        ? { id: r.authorId, email: r.authorEmail, firstName: r.authorFirstName, lastName: r.authorLastName }
        : null,
    }));
  }

  async createXpBookingNote(input: InsertXpBookingNote): Promise<XpBookingNote> {
    const result = await db.insert(xpBookingNotes).values(input as any).returning();
    return result[0];
  }

  async listXpBookings(input?: {
    experienceId?: number;
    status?: string;
    kind?: string;
    from?: Date;
    to?: Date;
    conciergeUserId?: number;
    locationId?: number;
    vehicleId?: number;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: Array<
      XpBooking & {
        assignment?: {
          locationId: number | null;
          locationName: string | null;
          vehicleId: number | null;
          vehicleName: string | null;
          conciergeUserId: number | null;
          conciergeName: string | null;
          conciergeEmail: string | null;
          assignedAt: Date | null;
        } | null;
      }
    >;
    total: number;
  }> {
    const limit = typeof input?.limit === "number" ? input.limit : 50;
    const offset = typeof input?.offset === "number" ? input.offset : 0;

    const whereParts: any[] = [];
    if (typeof input?.experienceId === "number") whereParts.push(eq(xpBookings.experienceId, input.experienceId));
    if (input?.status) whereParts.push(eq(xpBookings.status, input.status));
    if (input?.kind) whereParts.push(eq(xpBookings.kind, input.kind));
    if (input?.from && input?.to) whereParts.push(sql`${xpBookings.startAt} < ${input.to} AND ${xpBookings.endAt} > ${input.from}`);
    if (typeof input?.conciergeUserId === "number") whereParts.push(eq(xpBookingAssignments.conciergeUserId, input.conciergeUserId));
    if (typeof input?.locationId === "number") whereParts.push(eq(xpBookingAssignments.locationId, input.locationId));
    if (typeof input?.vehicleId === "number") whereParts.push(eq(xpBookingAssignments.vehicleId, input.vehicleId));

    const whereClause = whereParts.length ? and(...whereParts) : undefined;

    const rows: any = await db
      .select({
        id: xpBookings.id,
        experienceId: xpBookings.experienceId,
        kind: xpBookings.kind,
        customerName: xpBookings.customerName,
        customerEmail: xpBookings.customerEmail,
        customerPhone: xpBookings.customerPhone,
        startAt: xpBookings.startAt,
        endAt: xpBookings.endAt,
        status: xpBookings.status,
        currency: xpBookings.currency,
        depositAmount: xpBookings.depositAmount,
        stripeCheckoutSessionId: xpBookings.stripeCheckoutSessionId,
        stripePaymentIntentId: xpBookings.stripePaymentIntentId,
        stripeCustomerId: xpBookings.stripeCustomerId,
        createdAt: xpBookings.createdAt,
        updatedAt: xpBookings.updatedAt,
        assignmentLocationId: xpBookingAssignments.locationId,
        assignmentVehicleId: xpBookingAssignments.vehicleId,
        assignmentConciergeUserId: xpBookingAssignments.conciergeUserId,
        assignmentAssignedAt: xpBookingAssignments.assignedAt,
        locationName: xpLocations.name,
        vehicleName: xpVehicles.name,
        conciergeId: users.id,
        conciergeEmail: users.email,
        conciergeFirstName: users.firstName,
        conciergeLastName: users.lastName,
      })
      .from(xpBookings)
      .leftJoin(xpBookingAssignments, eq(xpBookingAssignments.bookingId, xpBookings.id))
      .leftJoin(xpLocations, eq(xpLocations.id, xpBookingAssignments.locationId))
      .leftJoin(xpVehicles, eq(xpVehicles.id, xpBookingAssignments.vehicleId))
      .leftJoin(users, eq(users.id, xpBookingAssignments.conciergeUserId))
      .where(whereClause)
      .orderBy(desc(xpBookings.createdAt))
      .limit(limit)
      .offset(offset);

    const totalRes: any = await db
      .select({ c: sql`count(*)` })
      .from(xpBookings)
      .leftJoin(xpBookingAssignments, eq(xpBookingAssignments.bookingId, xpBookings.id))
      .where(whereClause);
    const total = Number(totalRes?.[0]?.c || 0);

    const items = rows.map((r: any) => ({
      id: r.id,
      experienceId: r.experienceId,
      kind: r.kind,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      currency: r.currency,
      depositAmount: r.depositAmount,
      stripeCheckoutSessionId: r.stripeCheckoutSessionId,
      stripePaymentIntentId: r.stripePaymentIntentId,
      stripeCustomerId: r.stripeCustomerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignment:
        r.assignmentLocationId || r.assignmentVehicleId || r.assignmentConciergeUserId
          ? {
              locationId: r.assignmentLocationId ?? null,
              locationName: r.locationName ?? null,
              vehicleId: r.assignmentVehicleId ?? null,
              vehicleName: r.vehicleName ?? null,
              conciergeUserId: r.assignmentConciergeUserId ?? null,
              conciergeName: r.conciergeId ? [r.conciergeFirstName, r.conciergeLastName].filter(Boolean).join(" ") || null : null,
              conciergeEmail: r.conciergeEmail ?? null,
              assignedAt: r.assignmentAssignedAt ?? null,
            }
          : null,
    }));

    return { items, total };
  }

  async getXpBookingById(
    id: number,
  ): Promise<
    | (XpBooking & {
        assignment?: {
          locationId: number | null;
          locationName: string | null;
          vehicleId: number | null;
          vehicleName: string | null;
          conciergeUserId: number | null;
          conciergeName: string | null;
          conciergeEmail: string | null;
          assignedAt: Date | null;
        } | null;
        notes?: Array<XpBookingNote & { author?: { id: number; email: string; firstName?: string | null; lastName?: string | null } | null }>;
      })
    | undefined
  > {
    const rows: any = await db
      .select({
        id: xpBookings.id,
        experienceId: xpBookings.experienceId,
        kind: xpBookings.kind,
        customerName: xpBookings.customerName,
        customerEmail: xpBookings.customerEmail,
        customerPhone: xpBookings.customerPhone,
        startAt: xpBookings.startAt,
        endAt: xpBookings.endAt,
        status: xpBookings.status,
        currency: xpBookings.currency,
        depositAmount: xpBookings.depositAmount,
        stripeCheckoutSessionId: xpBookings.stripeCheckoutSessionId,
        stripePaymentIntentId: xpBookings.stripePaymentIntentId,
        stripeCustomerId: xpBookings.stripeCustomerId,
        createdAt: xpBookings.createdAt,
        updatedAt: xpBookings.updatedAt,
        assignmentLocationId: xpBookingAssignments.locationId,
        assignmentVehicleId: xpBookingAssignments.vehicleId,
        assignmentConciergeUserId: xpBookingAssignments.conciergeUserId,
        assignmentAssignedAt: xpBookingAssignments.assignedAt,
        locationId: xpLocations.id,
        locationName: xpLocations.name,
        vehicleId: xpVehicles.id,
        vehicleName: xpVehicles.name,
        conciergeId: users.id,
        conciergeEmail: users.email,
        conciergeFirstName: users.firstName,
        conciergeLastName: users.lastName,
      })
      .from(xpBookings)
      .leftJoin(xpBookingAssignments, eq(xpBookingAssignments.bookingId, xpBookings.id))
      .leftJoin(xpLocations, eq(xpLocations.id, xpBookingAssignments.locationId))
      .leftJoin(xpVehicles, eq(xpVehicles.id, xpBookingAssignments.vehicleId))
      .leftJoin(users, eq(users.id, xpBookingAssignments.conciergeUserId))
      .where(eq(xpBookings.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return undefined;
    const notes = await this.listXpBookingNotes(id);
    return {
      id: r.id,
      experienceId: r.experienceId,
      kind: r.kind,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      currency: r.currency,
      depositAmount: r.depositAmount,
      stripeCheckoutSessionId: r.stripeCheckoutSessionId,
      stripePaymentIntentId: r.stripePaymentIntentId,
      stripeCustomerId: r.stripeCustomerId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      assignment:
        r.assignmentLocationId || r.assignmentVehicleId || r.assignmentConciergeUserId
          ? {
              locationId: r.assignmentLocationId ?? null,
              locationName: r.locationName ?? null,
              vehicleId: r.assignmentVehicleId ?? null,
              vehicleName: r.vehicleName ?? null,
              conciergeUserId: r.assignmentConciergeUserId ?? null,
              conciergeName: r.conciergeId ? [r.conciergeFirstName, r.conciergeLastName].filter(Boolean).join(" ") || null : null,
              conciergeEmail: r.conciergeEmail ?? null,
              assignedAt: r.assignmentAssignedAt ?? null,
            }
          : null,
      notes,
    } as any;
  }

  async createXpBookingPending(input: InsertXpBooking): Promise<XpBooking> {
    const now = new Date();
    const result = await db.insert(xpBookings).values({ ...(input as any), createdAt: now, updatedAt: now } as any).returning();
    return result[0];
  }

  async getXpBookingByStripeSessionId(sessionId: string): Promise<XpBooking | undefined> {
    const s = String(sessionId || "").trim();
    if (!s) return undefined;
    const result = await db.select().from(xpBookings).where(eq(xpBookings.stripeCheckoutSessionId, s)).limit(1);
    return result[0];
  }

  async confirmXpBookingByStripeSessionId(input: { sessionId: string; paymentIntentId?: string | null; stripeCustomerId?: string | null }): Promise<XpBooking | undefined> {
    const s = String(input.sessionId || "").trim();
    if (!s) return undefined;
    const result = await db
      .update(xpBookings)
      .set({
        status: "confirmed",
        stripePaymentIntentId: input.paymentIntentId ?? null,
        stripeCustomerId: input.stripeCustomerId ?? null,
        updatedAt: new Date(),
      } as any)
      .where(eq(xpBookings.stripeCheckoutSessionId, s))
      .returning();
    return result[0];
  }

  async cancelXpBooking(id: number): Promise<XpBooking | undefined> {
    const result = await db.update(xpBookings).set({ status: "cancelled", updatedAt: new Date() } as any).where(eq(xpBookings.id, id)).returning();
    return result[0];
  }

  async hasStripeEvent(eventId: string): Promise<boolean> {
    const e = String(eventId || "").trim();
    if (!e) return false;
    const result = await db.select().from(xpStripeEvents).where(eq(xpStripeEvents.eventId, e)).limit(1);
    return !!result[0];
  }

  async recordStripeEvent(input: InsertXpStripeEvent): Promise<XpStripeEvent> {
    const result = await db.insert(xpStripeEvents).values(input as any).returning();
    return result[0];
  }

  async countXpActiveBookingsOverlapping(input: { experienceId: number; kind: string; startAt: Date; endAt: Date }): Promise<number> {
    const rows: any = await db.execute(sql`
      SELECT COUNT(*)::int AS c
      FROM xp_bookings
      WHERE experience_id = ${input.experienceId}
        AND kind = ${input.kind}
        AND status IN ('pending_payment', 'confirmed')
        AND start_at < ${input.endAt}
        AND end_at > ${input.startAt}
    `);
    return Number((rows as any).rows?.[0]?.c || 0);
  }

  async hasXpBlackoutOverlap(input: { experienceId: number; startAt: Date; endAt: Date }): Promise<boolean> {
    const rows: any = await db.execute(sql`
      SELECT COUNT(*)::int AS c
      FROM xp_blackouts
      WHERE experience_id = ${input.experienceId}
        AND start_at < ${input.endAt}
        AND end_at > ${input.startAt}
    `);
    return Number((rows as any).rows?.[0]?.c || 0) > 0;
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
