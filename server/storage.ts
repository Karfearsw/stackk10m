import { db } from "./db";
import { desc } from "drizzle-orm";
import { 
  leads, properties, contacts, contracts, contractTemplates, contractDocuments, documentVersions, lois,
  users, twoFactorAuth, backupCodes, teams, teamMembers, teamActivityLogs, notificationPreferences, userGoals, userNotifications, offers, timesheetEntries, globalActivityLogs,
  buyers, buyerCommunications, dealAssignments
} from "@shared/schema";
import { 
  type Lead, type InsertLead, 
  type Property, type InsertProperty, 
  type Contact, type InsertContact, 
  type Contract, type InsertContract,
  type ContractTemplate, type InsertContractTemplate,
  type ContractDocument, type InsertContractDocument,
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
  type Offer, type InsertOffer,
  type TimesheetEntry, type InsertTimesheetEntry,
  type GlobalActivityLog, type InsertGlobalActivityLog,
  type Buyer, type InsertBuyer,
  type BuyerCommunication, type InsertBuyerCommunication,
  type DealAssignment, type InsertDealAssignment
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Leads
  getLeads(): Promise<Lead[]>;
  getLeadById(id: number): Promise<Lead | undefined>;
  createLead(lead: InsertLead): Promise<Lead>;
  updateLead(id: number, lead: Partial<InsertLead>): Promise<Lead>;
  deleteLead(id: number): Promise<void>;

  // Properties
  getProperties(): Promise<Property[]>;
  getPropertyById(id: number): Promise<Property | undefined>;
  getPropertyBySourceLeadId(sourceLeadId: number): Promise<Property | undefined>;
  createProperty(property: InsertProperty): Promise<Property>;
  updateProperty(id: number, property: Partial<InsertProperty>): Promise<Property>;
  deleteProperty(id: number): Promise<void>;

  // Contacts
  getContacts(): Promise<Contact[]>;
  getContactById(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: number): Promise<void>;

  // Contracts
  getContracts(): Promise<Contract[]>;
  getContractById(id: number): Promise<Contract | undefined>;
  createContract(contract: InsertContract): Promise<Contract>;
  updateContract(id: number, contract: Partial<InsertContract>): Promise<Contract>;
  deleteContract(id: number): Promise<void>;

  // Contract Templates
  getContractTemplates(): Promise<ContractTemplate[]>;
  getContractTemplateById(id: number): Promise<ContractTemplate | undefined>;
  createContractTemplate(template: InsertContractTemplate): Promise<ContractTemplate>;
  updateContractTemplate(id: number, template: Partial<InsertContractTemplate>): Promise<ContractTemplate>;
  deleteContractTemplate(id: number): Promise<void>;

  // Contract Documents
  getContractDocuments(): Promise<ContractDocument[]>;
  getContractDocumentById(id: number): Promise<ContractDocument | undefined>;
  createContractDocument(document: InsertContractDocument): Promise<ContractDocument>;
  updateContractDocument(id: number, document: Partial<InsertContractDocument>): Promise<ContractDocument>;
  deleteContractDocument(id: number): Promise<void>;

  // Document Versions
  getDocumentVersions(documentId: number): Promise<DocumentVersion[]>;
  createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion>;

  // LOIs
  getLois(): Promise<Loi[]>;
  getLoiById(id: number): Promise<Loi | undefined>;
  createLoi(loi: InsertLoi): Promise<Loi>;
  updateLoi(id: number, loi: Partial<InsertLoi>): Promise<Loi>;
  deleteLoi(id: number): Promise<void>;

  // Users
  getUsers(): Promise<User[]>;
  getUserById(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<InsertUser>): Promise<User>;
  deleteUser(id: number): Promise<void>;

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
  getUserNotifications(userId: number): Promise<UserNotification[]>;
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

  // Offers
  getOffers(): Promise<Offer[]>;
  getOfferById(id: number): Promise<Offer | undefined>;
  getOffersByUserId(userId: number): Promise<Offer[]>;
  getOffersByPropertyId(propertyId: number): Promise<Offer[]>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOffer(id: number, offer: Partial<InsertOffer>): Promise<Offer>;
  deleteOffer(id: number): Promise<void>;

  // Timesheet Entries
  getTimesheetEntries(userId: number): Promise<TimesheetEntry[]>;
  getTimesheetEntryById(id: number): Promise<TimesheetEntry | undefined>;
  createTimesheetEntry(entry: InsertTimesheetEntry): Promise<TimesheetEntry>;
  updateTimesheetEntry(id: number, entry: Partial<InsertTimesheetEntry>): Promise<TimesheetEntry>;
  deleteTimesheetEntry(id: number): Promise<void>;

  // Global Activity Logs
  getGlobalActivityLogs(limit?: number): Promise<GlobalActivityLog[]>;
  createGlobalActivity(log: InsertGlobalActivityLog): Promise<GlobalActivityLog>;

  // Buyers
  getBuyers(): Promise<Buyer[]>;
  getBuyerById(id: number): Promise<Buyer | undefined>;
  createBuyer(buyer: InsertBuyer): Promise<Buyer>;
  updateBuyer(id: number, buyer: Partial<InsertBuyer>): Promise<Buyer>;
  deleteBuyer(id: number): Promise<void>;

  // Buyer Communications
  getBuyerCommunications(buyerId: number): Promise<BuyerCommunication[]>;
  createBuyerCommunication(comm: InsertBuyerCommunication): Promise<BuyerCommunication>;
  deleteBuyerCommunication(id: number): Promise<void>;

  // Deal Assignments
  getDealAssignments(): Promise<DealAssignment[]>;
  getDealAssignmentById(id: number): Promise<DealAssignment | undefined>;
  getDealAssignmentsByPropertyId(propertyId: number): Promise<DealAssignment[]>;
  getDealAssignmentsByBuyerId(buyerId: number): Promise<DealAssignment[]>;
  createDealAssignment(assignment: InsertDealAssignment): Promise<DealAssignment>;
  updateDealAssignment(id: number, assignment: Partial<InsertDealAssignment>): Promise<DealAssignment>;
  deleteDealAssignment(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Leads
  async getLeads(): Promise<Lead[]> {
    return db.select().from(leads);
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

  // Properties
  async getProperties(): Promise<Property[]> {
    return db.select().from(properties);
  }

  async getPropertyById(id: number): Promise<Property | undefined> {
    const result = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
    return result[0];
  }

  async getPropertyBySourceLeadId(sourceLeadId: number): Promise<Property | undefined> {
    const result = await db.select().from(properties).where(eq(properties.sourceLeadId, sourceLeadId)).limit(1);
    return result[0];
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
  async getContacts(): Promise<Contact[]> {
    return db.select().from(contacts);
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
  async getContracts(): Promise<Contract[]> {
    return db.select().from(contracts);
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
  async getContractTemplates(): Promise<ContractTemplate[]> {
    return db.select().from(contractTemplates);
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
  async getContractDocuments(): Promise<ContractDocument[]> {
    return db.select().from(contractDocuments);
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

  // Document Versions
  async getDocumentVersions(documentId: number): Promise<DocumentVersion[]> {
    return db.select().from(documentVersions).where(eq(documentVersions.documentId, documentId));
  }

  async createDocumentVersion(version: InsertDocumentVersion): Promise<DocumentVersion> {
    const result = await db.insert(documentVersions).values(version as any).returning();
    return result[0];
  }

  // LOIs
  async getLois(): Promise<Loi[]> {
    return db.select().from(lois);
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
  async getUsers(): Promise<User[]> {
    return db.select().from(users);
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
  async getUserNotifications(userId: number): Promise<UserNotification[]> {
    return db.select().from(userNotifications).where(eq(userNotifications.userId, userId));
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
  async getOffers(): Promise<Offer[]> {
    return db.select().from(offers);
  }

  async getOfferById(id: number): Promise<Offer | undefined> {
    const result = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
    return result[0];
  }

  async getOffersByUserId(userId: number): Promise<Offer[]> {
    return db.select().from(offers).where(eq(offers.userId, userId));
  }

  async getOffersByPropertyId(propertyId: number): Promise<Offer[]> {
    return db.select().from(offers).where(eq(offers.propertyId, propertyId));
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
  async getTimesheetEntries(userId: number): Promise<TimesheetEntry[]> {
    return db.select().from(timesheetEntries).where(eq(timesheetEntries.userId, userId));
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

  // Global Activity Logs
  async getGlobalActivityLogs(limit: number = 50): Promise<GlobalActivityLog[]> {
    return db.select().from(globalActivityLogs).orderBy(desc(globalActivityLogs.createdAt)).limit(limit);
  }

  async createGlobalActivity(log: InsertGlobalActivityLog): Promise<GlobalActivityLog> {
    const result = await db.insert(globalActivityLogs).values(log as any).returning();
    return result[0];
  }

  // Buyers
  async getBuyers(): Promise<Buyer[]> {
    return db.select().from(buyers);
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
  async getBuyerCommunications(buyerId: number): Promise<BuyerCommunication[]> {
    return db.select().from(buyerCommunications).where(eq(buyerCommunications.buyerId, buyerId)).orderBy(desc(buyerCommunications.createdAt));
  }

  async createBuyerCommunication(comm: InsertBuyerCommunication): Promise<BuyerCommunication> {
    const result = await db.insert(buyerCommunications).values(comm as any).returning();
    return result[0];
  }

  async deleteBuyerCommunication(id: number): Promise<void> {
    await db.delete(buyerCommunications).where(eq(buyerCommunications.id, id));
  }

  // Deal Assignments
  async getDealAssignments(): Promise<DealAssignment[]> {
    return db.select().from(dealAssignments);
  }

  async getDealAssignmentById(id: number): Promise<DealAssignment | undefined> {
    const result = await db.select().from(dealAssignments).where(eq(dealAssignments.id, id)).limit(1);
    return result[0];
  }

  async getDealAssignmentsByPropertyId(propertyId: number): Promise<DealAssignment[]> {
    return db.select().from(dealAssignments).where(eq(dealAssignments.propertyId, propertyId));
  }

  async getDealAssignmentsByBuyerId(buyerId: number): Promise<DealAssignment[]> {
    return db.select().from(dealAssignments).where(eq(dealAssignments.buyerId, buyerId));
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
}

export const storage = new DatabaseStorage();
