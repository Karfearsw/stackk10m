import { db } from "./db";
import { leads, properties, contacts, contracts } from "@shared/schema";
import { type Lead, type InsertLead, type Property, type InsertProperty, type Contact, type InsertContact, type Contract, type InsertContract } from "@shared/schema";
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
}

export const storage = new DatabaseStorage();
