import { db } from "./db";
import { leads, properties, contacts, contracts, contractTemplates, contractDocuments, documentVersions, lois } from "@shared/schema";
import { 
  type Lead, type InsertLead, 
  type Property, type InsertProperty, 
  type Contact, type InsertContact, 
  type Contract, type InsertContract,
  type ContractTemplate, type InsertContractTemplate,
  type ContractDocument, type InsertContractDocument,
  type DocumentVersion, type InsertDocumentVersion,
  type Loi, type InsertLoi
} from "@shared/schema";
import { eq } from "drizzle-orm";

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
}

export const storage = new DatabaseStorage();
