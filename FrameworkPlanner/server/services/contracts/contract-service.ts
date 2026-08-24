import { storage } from "../../storage.js";
import { mergeTemplate } from "../esign/merge.js";

export type MergeFieldContext = {
  lead?: any;
  property?: any;
  buyer?: any;
  seller?: any;
  contact?: any;
  company?: any;
  opportunity?: any;
  date?: Record<string, string>;
  currency?: Record<string, string>;
};

function numberOrZero(v: any): string {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function fmtCurrency(v: any): string {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "$0.00";
}

export function buildMergeData(ctx: MergeFieldContext): Record<string, any> {
  const now = new Date();
  const date: Record<string, string> = {
    today: now.toISOString().split("T")[0],
    now: now.toISOString(),
  };

  const currency: Record<string, string> = {};

  const buyer = ctx.buyer || {};
  const seller = ctx.seller || {};
  const contact = ctx.contact || {};
  const property = ctx.property || {};
  const lead = ctx.lead || {};
  const company = ctx.company || {};

  return {
    seller: {
      name: seller.name || seller.fullName || contact.name || "",
      address: seller.address || contact.address || "",
      email: seller.email || contact.email || "",
      phone: seller.phone || contact.phone || "",
    },
    buyer: {
      name: buyer.name || contact.name || "",
      company: buyer.company || company.name || "",
      email: buyer.email || contact.email || "",
      phone: buyer.phone || contact.phone || "",
    },
    property: {
      address: property.address || lead.address || "",
      city: property.city || lead.city || "",
      state: property.state || lead.state || "",
      zip: property.zipCode || lead.zipCode || "",
    },
    contract: {
      purchasePrice: fmtCurrency(property.price || property.arv || property.soldPrice || ""),
      earnestMoney: fmtCurrency(property.arv ? property.arv * 0.01 : ""),
      closingDate: property.soldDate ? new Date(property.soldDate).toISOString().split("T")[0] : "",
      inspectionDeadline: "",
      assignmentFee: fmtCurrency(""),
      paymentMethod: "Wire Transfer",
      commissionRate: "3%",
      commissionBasis: "gross sale price",
      rate: "$500",
      startDate: date.today,
      endDate: "",
    },
    offer: {
      amount: fmtCurrency(property.price || property.arv || ""),
      earnestMoney: fmtCurrency(property.arv ? property.arv * 0.01 : ""),
      closingDate: property.soldDate ? new Date(property.soldDate).toISOString().split("T")[0] : "",
    },
    assignor: buyer,
    assignee: buyer,
    party1: buyer,
    party2: buyer,
    contractor: buyer,
    referrer: buyer,
    company: {
      name: company.name || "",
      address: company.address || "",
      phone: company.phone || "",
      email: company.email || "",
    },
    date,
    currency,
  };
}

export function resolveMergeData(contract: any): Record<string, any> {
  let snapshot: Record<string, any> = {};
  try {
    snapshot = contract.mergeDataSnapshot ? JSON.parse(contract.mergeDataSnapshot) : {};
  } catch {
    snapshot = {};
  }

  const property = contract.propertyId ? storage.getPropertyById(contract.propertyId) : null;
  const buyer = contract.buyerId ? storage.getBuyerById(contract.buyerId) : null;
  const seller = contract.sellerContactId ? storage.getContactById(contract.sellerContactId) : null;
  const lead = contract.leadId ? storage.getLeadById(contract.leadId) : null;

  const ctx: MergeFieldContext = {
    property: property || undefined,
    buyer: buyer || undefined,
    seller: seller || undefined,
    lead: lead || undefined,
  };

  return { ...buildMergeData(ctx), ...snapshot };
}

export function validateContractForSend(contract: any, signers: any[], fields: any[]): string[] {
  const errors: string[] = [];

  if (!contract.templateId) errors.push("Template is required");
  if (!contract.propertyId) errors.push("Property is required");
  if (!contract.purchasePrice && !contract.amount) errors.push("Purchase price is required");

  const requiredSigners = signers.filter((s: any) => s.status !== "declined");
  if (requiredSigners.length === 0) errors.push("At least one signer is required");

  const missingEmails = signers.filter((s: any) => !s.email && !s.phone);
  if (missingEmails.length > 0) errors.push("All signers must have an email or phone");

  const requiredFields = fields.filter((f: any) => f.required);
  const missingFieldValues = requiredFields.filter((f: any) => !f.fieldValue);
  if (missingFieldValues.length > 0) errors.push(`${missingFieldValues.length} required field(s) have no value`);

  return errors;
}

export function applyTemplateToContract(contract: any, template: any, mergeData: Record<string, any>): string {
  const content = String(template.content || "");
  return mergeTemplate(content, mergeData);
}
