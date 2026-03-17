import crypto from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { z } from "zod";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../db.js";
import {
  buyers,
  contacts,
  crmExportFiles,
  crmImportJobErrors,
  crmImportJobs,
  insertBuyerSchema,
  insertContactSchema,
  insertLeadSchema,
  insertPropertySchema,
  leads,
  properties,
  users,
} from "../shared-schema.js";
import type { InsertBuyer, InsertContact, InsertLead, InsertProperty } from "../shared-schema.js";

export type CrmEntityType = "lead" | "opportunity" | "contact" | "buyer";
export type ImportFileFormat = "csv" | "xlsx";

export type ImportDuplicateMode = "merge" | "overwrite" | "skip";

export type ImportOptions = {
  onDuplicate: ImportDuplicateMode;
  dryRun?: boolean;
  batchSize?: number;
};

export type ExportFormat = "csv" | "xlsx";

export type ExportFilters = {
  createdFrom?: string;
  createdTo?: string;
  status?: string;
  assignedTo?: number;
};

export type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  type: "string" | "int" | "decimal" | "email" | "bool" | "date" | "string_array";
};

const leadFields: FieldDef[] = [
  { key: "address", label: "Address", required: true, type: "string" },
  { key: "city", label: "City", required: true, type: "string" },
  { key: "state", label: "State", required: true, type: "string" },
  { key: "zipCode", label: "Zip Code", required: true, type: "string" },
  { key: "ownerName", label: "Owner Name", required: true, type: "string" },
  { key: "ownerPhone", label: "Owner Phone", type: "string" },
  { key: "ownerEmail", label: "Owner Email", type: "email" },
  { key: "estimatedValue", label: "Estimated Value", type: "decimal" },
  { key: "relasScore", label: "Relas Score", type: "int" },
  { key: "motivation", label: "Motivation", type: "string" },
  { key: "status", label: "Status", type: "string" },
  { key: "source", label: "Source", type: "string" },
  { key: "assignedTo", label: "Assigned To (User ID)", type: "int" },
  { key: "notes", label: "Notes", type: "string" },
];

const opportunityFields: FieldDef[] = [
  { key: "address", label: "Address", required: true, type: "string" },
  { key: "city", label: "City", required: true, type: "string" },
  { key: "state", label: "State", required: true, type: "string" },
  { key: "zipCode", label: "Zip Code", required: true, type: "string" },
  { key: "beds", label: "Beds", type: "int" },
  { key: "baths", label: "Baths", type: "int" },
  { key: "sqft", label: "Square Feet", type: "int" },
  { key: "price", label: "Price", type: "decimal" },
  { key: "status", label: "Status", type: "string" },
  { key: "apn", label: "APN", type: "string" },
  { key: "yearBuilt", label: "Year Built", type: "int" },
  { key: "lotSize", label: "Lot Size", type: "string" },
  { key: "occupancy", label: "Occupancy", type: "string" },
  { key: "arv", label: "ARV", type: "decimal" },
  { key: "repairCost", label: "Repair Cost", type: "decimal" },
  { key: "assignedTo", label: "Assigned To (User ID)", type: "int" },
  { key: "notes", label: "Notes", type: "string" },
];

const contactFields: FieldDef[] = [
  { key: "name", label: "Name", required: true, type: "string" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "string" },
  { key: "type", label: "Type", type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "notes", label: "Notes", type: "string" },
];

const buyerFields: FieldDef[] = [
  { key: "name", label: "Name", required: true, type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "string" },
  { key: "preferredPropertyTypes", label: "Preferred Property Types", type: "string_array" },
  { key: "preferredAreas", label: "Preferred Areas", type: "string_array" },
  { key: "minBudget", label: "Min Budget", type: "decimal" },
  { key: "maxBudget", label: "Max Budget", type: "decimal" },
  { key: "dealsPerMonth", label: "Deals Per Month", type: "int" },
  { key: "proofOfFunds", label: "Proof Of Funds", type: "bool" },
  { key: "proofOfFundsNotes", label: "Proof Of Funds Notes", type: "string" },
  { key: "isVip", label: "VIP", type: "bool" },
  { key: "status", label: "Status", type: "string" },
  { key: "totalDeals", label: "Total Deals", type: "int" },
  { key: "totalRevenue", label: "Total Revenue", type: "decimal" },
  { key: "notes", label: "Notes", type: "string" },
  { key: "tags", label: "Tags", type: "string_array" },
  { key: "lastContactDate", label: "Last Contact Date", type: "date" },
];

const leadSynonyms: Record<string, string[]> = {
  address: ["address", "street", "street address", "property address"],
  city: ["city", "town"],
  state: ["state", "st"],
  zipCode: ["zip", "zip code", "zipcode", "postal", "postal code"],
  ownerName: ["owner", "owner name", "name", "seller", "seller name"],
  ownerPhone: ["phone", "owner phone", "seller phone", "mobile"],
  ownerEmail: ["email", "owner email", "seller email"],
  estimatedValue: ["estimated value", "est value", "value", "estimated"],
  relasScore: ["relas", "relas score", "score"],
  motivation: ["motivation"],
  status: ["status", "stage"],
  source: ["source", "lead source"],
  assignedTo: ["assigned to", "assigned", "assignee", "assigned user", "assigned user id"],
  notes: ["notes", "note", "comments", "comment"],
};

const opportunitySynonyms: Record<string, string[]> = {
  address: ["address", "street", "street address", "property address"],
  city: ["city", "town"],
  state: ["state", "st"],
  zipCode: ["zip", "zip code", "zipcode", "postal", "postal code"],
  beds: ["beds", "bedrooms", "br"],
  baths: ["baths", "bathrooms", "ba"],
  sqft: ["sqft", "square feet", "sf"],
  price: ["price", "ask", "asking", "list price"],
  status: ["status", "stage"],
  apn: ["apn", "parcel", "parcel number"],
  yearBuilt: ["year built", "yr built"],
  lotSize: ["lot size"],
  occupancy: ["occupancy"],
  arv: ["arv", "after repair value"],
  repairCost: ["repair cost", "repairs", "rehab", "rehab cost"],
  assignedTo: ["assigned to", "assigned", "assignee", "assigned user", "assigned user id"],
  notes: ["notes", "note", "comments", "comment"],
};

const contactSynonyms: Record<string, string[]> = {
  name: ["name", "full name", "contact", "contact name"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "cell"],
  type: ["type", "category"],
  company: ["company", "organization", "org"],
  notes: ["notes", "note", "comments", "comment"],
};

const buyerSynonyms: Record<string, string[]> = {
  name: ["name", "buyer", "buyer name"],
  company: ["company", "organization", "org"],
  email: ["email", "e-mail"],
  phone: ["phone", "mobile", "cell"],
  preferredPropertyTypes: ["preferred property types", "property types", "types"],
  preferredAreas: ["preferred areas", "areas", "markets", "cities"],
  minBudget: ["min budget", "minimum budget", "min"],
  maxBudget: ["max budget", "maximum budget", "max"],
  dealsPerMonth: ["deals per month", "monthly deals"],
  proofOfFunds: ["proof of funds", "pof"],
  proofOfFundsNotes: ["proof of funds notes", "pof notes"],
  isVip: ["vip", "is vip"],
  status: ["status", "stage"],
  totalDeals: ["total deals", "deals"],
  totalRevenue: ["total revenue", "revenue"],
  notes: ["notes", "note", "comments", "comment"],
  tags: ["tags", "tag"],
  lastContactDate: ["last contact date", "last contacted"],
};

function normalizeHeader(v: string) {
  return v
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function getCrmFieldDefs(entityType: CrmEntityType) {
  if (entityType === "lead") return leadFields;
  if (entityType === "opportunity") return opportunityFields;
  if (entityType === "contact") return contactFields;
  return buyerFields;
}

export function suggestMapping(entityType: CrmEntityType, headers: string[]) {
  const normalizedToOriginal = new Map<string, string>();
  for (const h of headers) normalizedToOriginal.set(normalizeHeader(h), h);

  const synonyms =
    entityType === "lead"
      ? leadSynonyms
      : entityType === "opportunity"
        ? opportunitySynonyms
        : entityType === "contact"
          ? contactSynonyms
          : buyerSynonyms;
  const out: Record<string, string> = {};

  for (const [field, candidates] of Object.entries(synonyms)) {
    for (const c of candidates) {
      const hit = normalizedToOriginal.get(normalizeHeader(c));
      if (hit) {
        out[field] = hit;
        break;
      }
    }
  }

  return out;
}

export type ParsedTable = {
  headers: string[];
  rows: Record<string, unknown>[];
};

export function detectFormat(originalFilename: string | undefined, mimeType: string | undefined): ImportFileFormat | null {
  const name = String(originalFilename || "").toLowerCase();
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";

  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("text/csv")) return "csv";
  if (mime.includes("spreadsheetml") || mime.includes("ms-excel")) return "xlsx";
  return null;
}

export async function parseUpload(buffer: Buffer, format: ImportFileFormat): Promise<ParsedTable> {
  if (format === "csv") {
    const text = buffer.toString("utf8");
    const rows = parseCsv(text, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      trim: true,
    }) as Record<string, unknown>[];
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows };
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const headerRow = sheet.getRow(1);
  const rawHeaders: string[] = [];
  for (let i = 1; i <= headerRow.cellCount; i++) {
    const h = String(headerRow.getCell(i).text || "").trim();
    rawHeaders.push(h || `Column ${i}`);
  }

  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h) => {
    const base = h;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const obj: Record<string, unknown> = {};
    let anyValue = false;
    for (let c = 1; c <= headers.length; c++) {
      const key = headers[c - 1];
      const cell = row.getCell(c);
      const value = cell.text;
      if (value !== "") anyValue = true;
      obj[key] = value;
    }
    if (anyValue) rows.push(obj);
  }

  return { headers, rows };
}

function isBlank(v: unknown) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function toStringOrNull(v: unknown) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toIntOrNull(v: unknown) {
  const s = toStringOrNull(v);
  if (!s) return null;
  const n = Number.parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toDecimalOrNull(v: unknown) {
  const s = toStringOrNull(v);
  if (!s) return null;
  const n = Number.parseFloat(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function toBoolOrNull(v: unknown) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (s === "true" || s === "t" || s === "yes" || s === "y" || s === "1") return true;
  if (s === "false" || s === "f" || s === "no" || s === "n" || s === "0") return false;
  return null;
}

function toStringArrayOrNull(v: unknown) {
  const s = toStringOrNull(v);
  if (!s) return null;
  const items = s
    .split(/[;,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function toDateOrNull(v: unknown) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v : null;
  }
  const s = toStringOrNull(v);
  if (!s) return null;
  const d = new Date(s);
  const t = d.getTime();
  return Number.isFinite(t) ? d : null;
}

function validateState(v: string | null) {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) return "State must be 2 letters";
  return null;
}

function validateZip(v: string | null) {
  if (!v) return null;
  const s = v.trim();
  if (!/^\d{5}(-\d{4})?$/.test(s)) return "Zip Code must be 5 digits (or ZIP+4)";
  return null;
}

function computeNormalizedPart(v: string | null) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function computeLeadDedupeKey(input: { address: string; city: string; state: string; zipCode: string; ownerName: string }) {
  return [
    computeNormalizedPart(input.address),
    computeNormalizedPart(input.city),
    computeNormalizedPart(input.state),
    computeNormalizedPart(input.zipCode),
    computeNormalizedPart(input.ownerName),
  ].join("|");
}

export function computeOpportunityDedupeKey(input: { apn?: string | null; address: string; city: string; state: string; zipCode: string }) {
  return [
    computeNormalizedPart(input.apn || ""),
    computeNormalizedPart(input.address),
    computeNormalizedPart(input.city),
    computeNormalizedPart(input.state),
    computeNormalizedPart(input.zipCode),
  ].join("|");
}

export function computeContactDedupeKey(input: { name: string; email?: string | null; phone?: string | null }) {
  return [computeNormalizedPart(input.email || ""), computeNormalizedPart(input.phone || ""), computeNormalizedPart(input.name)].join("|");
}

export function computeBuyerDedupeKey(input: { name: string; company?: string | null; email?: string | null; phone?: string | null }) {
  return [
    computeNormalizedPart(input.email || ""),
    computeNormalizedPart(input.phone || ""),
    computeNormalizedPart(input.name),
    computeNormalizedPart(input.company || ""),
  ].join("|");
}

export type ImportRowError = { field?: string; message: string };

export function mapAndValidateRow(entityType: CrmEntityType, row: Record<string, unknown>, mapping: Record<string, string>) {
  const defs = getCrmFieldDefs(entityType);
  const raw: Record<string, unknown> = {};

  for (const def of defs) {
    const col = mapping[def.key];
    if (!col) continue;
    raw[def.key] = row[col];
  }

  const errors: ImportRowError[] = [];
  const out: any = {};

  for (const def of defs) {
    const v = raw[def.key];
    if (!Object.prototype.hasOwnProperty.call(raw, def.key)) continue;

    if (def.type === "string" || def.type === "email") {
      out[def.key] = toStringOrNull(v);
    } else if (def.type === "int") {
      const iv = toIntOrNull(v);
      if (!isBlank(v) && iv === null) errors.push({ field: def.key, message: "Must be an integer" });
      out[def.key] = iv;
    } else if (def.type === "decimal") {
      const dv = toDecimalOrNull(v);
      if (!isBlank(v) && dv === null) errors.push({ field: def.key, message: "Must be a number" });
      out[def.key] = dv;
    } else if (def.type === "bool") {
      const bv = toBoolOrNull(v);
      if (!isBlank(v) && bv === null) errors.push({ field: def.key, message: "Must be a boolean (true/false)" });
      out[def.key] = bv;
    } else if (def.type === "string_array") {
      out[def.key] = toStringArrayOrNull(v);
    } else if (def.type === "date") {
      const dv = toDateOrNull(v);
      if (!isBlank(v) && dv === null) errors.push({ field: def.key, message: "Must be a date" });
      out[def.key] = dv;
    }
  }

  for (const def of defs) {
    if (!def.required) continue;
    const value = out[def.key];
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
      errors.push({ field: def.key, message: "Required" });
    }
  }

  for (const def of defs) {
    if (def.type !== "email") continue;
    const v = out[def.key];
    if (!v) continue;
    const r = z.string().email().safeParse(v);
    if (!r.success) errors.push({ field: def.key, message: "Invalid email" });
  }

  if (entityType === "lead" || entityType === "opportunity") {
    const stateErr = validateState(out.state ?? null);
    if (stateErr) errors.push({ field: "state", message: stateErr });
    const zipErr = validateZip(out.zipCode ?? null);
    if (zipErr) errors.push({ field: "zipCode", message: zipErr });
  }

  if (errors.length) return { ok: false as const, errors, data: null, raw: out };

  if (entityType === "lead") {
    const candidate = out as InsertLead;
    const parsed = insertLeadSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        ok: false as const,
        errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
        data: null,
        raw: out,
      };
    }
    return { ok: true as const, data: parsed.data, errors: [] as ImportRowError[], raw: out };
  }

  if (entityType === "opportunity") {
    const candidate = out as InsertProperty;
    const parsed = insertPropertySchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        ok: false as const,
        errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
        data: null,
        raw: out,
      };
    }
    return { ok: true as const, data: parsed.data, errors: [] as ImportRowError[], raw: out };
  }

  if (entityType === "contact") {
    const candidate = out as InsertContact;
    const parsed = insertContactSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        ok: false as const,
        errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
        data: null,
        raw: out,
      };
    }
    return { ok: true as const, data: parsed.data, errors: [] as ImportRowError[], raw: out };
  }

  const candidate = out as InsertBuyer;
  const parsed = insertBuyerSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false as const,
      errors: parsed.error.issues.map((i) => ({ field: String(i.path[0] || ""), message: i.message })),
      data: null,
      raw: out,
    };
  }
  return { ok: true as const, data: parsed.data, errors: [] as ImportRowError[], raw: out };
}

function mergeScalar(existing: unknown, incoming: unknown) {
  if (existing === null || existing === undefined) return incoming;
  if (typeof existing === "string" && existing.trim() === "") return incoming;
  if (Array.isArray(existing) && existing.length === 0) return incoming;
  return existing;
}

function mergeNotes(existing: string | null | undefined, incoming: string | null | undefined) {
  const a = toStringOrNull(existing);
  const b = toStringOrNull(incoming);
  if (!b) return a;
  if (!a) return b;
  if (a.trim() === b.trim()) return a;
  return `${a}\n${b}`;
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function ensureAssigneesExist(assignedToIds: number[]) {
  const ids = Array.from(new Set(assignedToIds.filter((n) => Number.isFinite(n))));
  if (!ids.length) return new Set<number>();
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
  return new Set(rows.map((r) => r.id));
}

export async function createImportJob(params: {
  entityType: CrmEntityType;
  createdBy: number;
  fileBase64: string;
  originalFilename?: string;
  fileMimeType?: string;
  mapping: Record<string, string>;
  options: ImportOptions;
}) {
  const result = await db
    .insert(crmImportJobs)
    .values({
      entityType: params.entityType,
      createdBy: params.createdBy,
      status: "queued",
      originalFilename: params.originalFilename || null,
      fileMimeType: params.fileMimeType || null,
      fileBase64: params.fileBase64,
      mapping: JSON.stringify(params.mapping || {}),
      options: JSON.stringify(params.options || {}),
      processedRows: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
    } as any)
    .returning();
  return result[0];
}

export async function getImportJob(jobId: number) {
  const rows = await db.select().from(crmImportJobs).where(eq(crmImportJobs.id, jobId)).limit(1);
  return rows[0];
}

export async function listImportJobErrors(jobId: number, limit = 50) {
  return await db
    .select()
    .from(crmImportJobErrors)
    .where(eq(crmImportJobErrors.jobId, jobId))
    .orderBy(crmImportJobErrors.rowNumber)
    .limit(limit);
}

export async function processImportJob(jobId: number) {
  const job = await getImportJob(jobId);
  if (!job) throw new Error("Import job not found");
  if (job.status !== "queued") return;

  const entityType = job.entityType as CrmEntityType;
  const mapping = JSON.parse(String(job.mapping || "{}")) as Record<string, string>;
  const options = JSON.parse(String(job.options || "{}")) as ImportOptions;
  const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 500;
  const dryRun = !!options.dryRun;
  const onDuplicate = options.onDuplicate || "merge";

  await db
    .update(crmImportJobs)
    .set({ status: "processing", startedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(crmImportJobs.id, jobId));

  try {
    const format = detectFormat(job.originalFilename || undefined, job.fileMimeType || undefined) || "csv";
    const buffer = Buffer.from(String(job.fileBase64), "base64");
    const parsed = await parseUpload(buffer, format);

    const assignedIds: number[] = [];
    for (const r of parsed.rows) {
      const v = mapping.assignedTo ? toIntOrNull(r[mapping.assignedTo]) : null;
      if (v) assignedIds.push(v);
    }
    const validAssignees = await ensureAssigneesExist(assignedIds);

    let processedRows = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    const seenKeys = new Set<string>();

    for (let i = 0; i < parsed.rows.length; i += batchSize) {
      const slice = parsed.rows.slice(i, i + batchSize);

      const prepared = slice.map((rawRow) => mapAndValidateRow(entityType, rawRow, mapping));

      const candidates: { index: number; rowNumber: number; rawRow: Record<string, unknown>; data: any; key: string }[] = [];
      for (let j = 0; j < prepared.length; j++) {
        const rowNumber = i + j + 2;
        const prep = prepared[j];
        const rawRow = slice[j];

        if (!prep.ok) {
          errorCount += 1;
          await db.insert(crmImportJobErrors).values({
            jobId,
            rowNumber,
            errors: JSON.stringify(prep.errors),
            rawRow: JSON.stringify(rawRow),
          } as any);
          continue;
        }

        const assignedTo = (prep.data as any).assignedTo as number | null | undefined;
        if (assignedTo && !validAssignees.has(assignedTo)) {
          errorCount += 1;
          await db.insert(crmImportJobErrors).values({
            jobId,
            rowNumber,
            errors: JSON.stringify([{ field: "assignedTo", message: "Assigned user does not exist" }]),
            rawRow: JSON.stringify(rawRow),
          } as any);
          continue;
        }

        const key =
          entityType === "lead"
            ? computeLeadDedupeKey(prep.data as any)
            : entityType === "opportunity"
              ? computeOpportunityDedupeKey(prep.data as any)
              : entityType === "contact"
                ? computeContactDedupeKey(prep.data as any)
                : computeBuyerDedupeKey(prep.data as any);

        if (seenKeys.has(key)) {
          errorCount += 1;
          await db.insert(crmImportJobErrors).values({
            jobId,
            rowNumber,
            errors: JSON.stringify([{ message: "Duplicate row within import file" }]),
            rawRow: JSON.stringify(rawRow),
          } as any);
          continue;
        }
        seenKeys.add(key);

        candidates.push({ index: j, rowNumber, rawRow, data: prep.data, key });
      }

      const keys = candidates.map((c) => c.key);
      const existingByKey = new Map<string, any>();

      if (keys.length) {
        if (entityType === "lead") {
          const existing = await db
            .select()
            .from(leads)
            .where(inArray(leads.dedupeKey, keys));
          for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
        } else if (entityType === "opportunity") {
          const existing = await db
            .select()
            .from(properties)
            .where(inArray(properties.dedupeKey, keys));
          for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
        } else if (entityType === "contact") {
          const existing = await db
            .select()
            .from(contacts)
            .where(inArray(contacts.dedupeKey, keys));
          for (const e of existing) existingByKey.set(String((e as any).dedupeKey || ""), e);
        } else {
          const existing = await db
            .select()
            .from(buyers)
            .where(inArray(buyers.dedupeKey, keys));
          for (const e of existing) existingByKey.set(String((e as any).dedupeKey || ""), e);
        }
      }

      for (const c of candidates) {
        const existing = existingByKey.get(c.key);
        const rowNumber = c.rowNumber;

        if (!existing) {
          if (!dryRun) {
            if (entityType === "lead") {
              await db.insert(leads).values({ ...(c.data as any), dedupeKey: c.key } as any);
            } else if (entityType === "opportunity") {
              await db.insert(properties).values({ ...(c.data as any), dedupeKey: c.key } as any);
            } else if (entityType === "contact") {
              await db.insert(contacts).values({ ...(c.data as any), dedupeKey: c.key } as any);
            } else {
              await db.insert(buyers).values({ ...(c.data as any), dedupeKey: c.key } as any);
            }
          }
          createdCount += 1;
          continue;
        }

        if (onDuplicate === "skip") {
          skippedCount += 1;
          continue;
        }

        if (dryRun) {
          updatedCount += 1;
          continue;
        }

        const patch: any = { dedupeKey: c.key, updatedAt: new Date() };

        for (const [k, v] of Object.entries(c.data)) {
          if (k === "createdAt" || k === "updatedAt" || k === "id") continue;
          const incoming = v as any;

          if (onDuplicate === "overwrite") {
            patch[k] = incoming ?? null;
            continue;
          }

          if (k === "notes") {
            patch.notes = mergeNotes(existing.notes, incoming);
            continue;
          }

          patch[k] = mergeScalar(existing[k], incoming);
        }

        if (entityType === "lead") {
          await db.update(leads).set(patch).where(eq(leads.id, existing.id));
        } else if (entityType === "opportunity") {
          await db.update(properties).set(patch).where(eq(properties.id, existing.id));
        } else if (entityType === "contact") {
          await db.update(contacts).set(patch).where(eq(contacts.id, existing.id));
        } else {
          await db.update(buyers).set(patch).where(eq(buyers.id, existing.id));
        }
        updatedCount += 1;
      }

      processedRows += slice.length;

      await db
        .update(crmImportJobs)
        .set({
          totalRows: parsed.rows.length,
          processedRows,
          createdCount,
          updatedCount,
          skippedCount,
          errorCount,
          updatedAt: new Date(),
        } as any)
        .where(eq(crmImportJobs.id, jobId));
    }

    await db
      .update(crmImportJobs)
      .set({
        status: "completed",
        totalRows: parsed.rows.length,
        processedRows,
        createdCount,
        updatedCount,
        skippedCount,
        errorCount,
        finishedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(crmImportJobs.id, jobId));
  } catch (err: any) {
    await db
      .update(crmImportJobs)
      .set({
        status: "failed",
        finishedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(crmImportJobs.id, jobId));

    throw err;
  }
}

export async function createExportJob(params: {
  entityType: CrmEntityType;
  createdBy: number;
  format: ExportFormat;
  filters: ExportFilters;
  columns: string[];
  expiresInMinutes?: number;
}) {
  const expiresAt = new Date(Date.now() + (params.expiresInMinutes || 60) * 60 * 1000);
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  const result = await db
    .insert(crmExportFiles)
    .values({
      entityType: params.entityType,
      createdBy: params.createdBy,
      status: "queued",
      format: params.format,
      filters: JSON.stringify(params.filters || {}),
      columns: JSON.stringify(params.columns || []),
      tokenHash,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning();

  return { job: result[0], token };
}

export async function getExportJob(exportId: number) {
  const rows = await db.select().from(crmExportFiles).where(eq(crmExportFiles.id, exportId)).limit(1);
  return rows[0];
}

export async function processExportJob(exportId: number) {
  const job = await getExportJob(exportId);
  if (!job) throw new Error("Export job not found");
  if (job.status !== "queued") return;

  await db
    .update(crmExportFiles)
    .set({ status: "processing", startedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(crmExportFiles.id, exportId));

  try {
    const entityType = job.entityType as CrmEntityType;
    const format = job.format as ExportFormat;
    const filters = JSON.parse(String(job.filters || "{}")) as ExportFilters;
    const columns = JSON.parse(String(job.columns || "[]")) as string[];

    const createdFrom = filters.createdFrom ? new Date(filters.createdFrom) : null;
    const createdTo = filters.createdTo ? new Date(filters.createdTo) : null;
    const status = filters.status ? String(filters.status) : null;
    const assignedTo = typeof filters.assignedTo === "number" ? filters.assignedTo : null;

    const table: any =
      entityType === "lead"
        ? leads
        : entityType === "opportunity"
          ? properties
          : entityType === "contact"
            ? contacts
            : buyers;

    const where: any[] = [];
    if (createdFrom) where.push(gte(table.createdAt, createdFrom));
    if (createdTo) where.push(lte(table.createdAt, createdTo));
    if (status && (entityType === "lead" || entityType === "opportunity" || entityType === "buyer")) where.push(eq(table.status, status));
    if (assignedTo !== null && (entityType === "lead" || entityType === "opportunity")) where.push(eq(table.assignedTo, assignedTo));

    const rows: any[] = where.length ? await db.select().from(table).where(and(...where)) : await db.select().from(table);

    const safeColumns = columns.length ? columns : Object.keys(rows[0] || {}).filter((k) => k !== "dedupeKey");
    const serializeCell = (value: any) => {
      if (value === null || value === undefined) return "";
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "boolean") return value ? "true" : "false";
      return value;
    };
    const records = rows.map((r) => {
      const out: Record<string, any> = {};
      for (const c of safeColumns) out[c] = serializeCell((r as any)[c]);
      return out;
    });

    let filename = `${entityType}-export-${new Date().toISOString().slice(0, 10)}.${format}`;
    let mimeType = format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    let contentBase64 = "";

    if (format === "csv") {
      const { stringify } = await import("csv-stringify/sync");
      const header = safeColumns;
      const csv = stringify(records, { header: true, columns: header });
      contentBase64 = Buffer.from(csv, "utf8").toString("base64");
    } else {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Export");
      ws.addRow(safeColumns);
      for (const r of records) {
        ws.addRow(safeColumns.map((c) => (r as any)[c] ?? ""));
      }
      const b = await wb.xlsx.writeBuffer();
      const buf = Buffer.isBuffer(b) ? b : Buffer.from(b as any);
      contentBase64 = buf.toString("base64");
    }

    await db
      .update(crmExportFiles)
      .set({
        status: "completed",
        filename,
        mimeType,
        contentBase64,
        finishedAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(crmExportFiles.id, exportId));
  } catch (err) {
    await db
      .update(crmExportFiles)
      .set({ status: "failed", finishedAt: new Date(), updatedAt: new Date() } as any)
      .where(eq(crmExportFiles.id, exportId));
    throw err;
  }
}

export function verifyExportToken(job: { tokenHash: string | null | undefined; expiresAt: Date | string | null | undefined }, token: string) {
  if (!job.tokenHash || !token) return false;
  if (job.expiresAt) {
    const expiresAt = job.expiresAt instanceof Date ? job.expiresAt : new Date(job.expiresAt);
    const t = expiresAt.getTime();
    if (Number.isFinite(t) && t < Date.now()) return false;
  }
  return hashToken(token) === job.tokenHash;
}
