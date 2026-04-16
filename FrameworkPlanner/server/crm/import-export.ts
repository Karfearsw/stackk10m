import crypto from "node:crypto";
import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { z } from "zod";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
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
  defaultLeadSource?: string;
  deriveStateFromZip?: boolean;
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
  { key: "fullAddress", label: "Full Address", type: "string" },
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
  { key: "source", label: "Source", required: true, type: "string" },
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
  { key: "leadSource", label: "Lead Source", type: "string" },
  { key: "leadSourceDetail", label: "Lead Source Detail", type: "string" },
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
  fullAddress: ["full address", "address full", "property address full", "property full address", "mailing address", "property address"],
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
  leadSource: ["lead source", "source"],
  leadSourceDetail: ["lead source detail", "source detail", "source notes"],
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
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    normalized: normalizeHeader(h),
  }));

  const synonyms =
    entityType === "lead"
      ? leadSynonyms
      : entityType === "opportunity"
        ? opportunitySynonyms
        : entityType === "contact"
          ? contactSynonyms
          : buyerSynonyms;
  const out: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  const scoreMatch = (headerNorm: string, candNorm: string) => {
    if (headerNorm === candNorm) return 100;
    if (headerNorm.startsWith(candNorm)) return 75;
    if (candNorm.startsWith(headerNorm)) return 70;
    if (headerNorm.includes(candNorm)) return 60;
    if (candNorm.includes(headerNorm)) return 55;
    return 0;
  };

  for (const [field, candidates] of Object.entries(synonyms)) {
    let best: { header: string; score: number } | null = null;
    for (const c of candidates) {
      const candNorm = normalizeHeader(c);
      for (const h of normalizedHeaders) {
        if (usedHeaders.has(h.original)) continue;
        const score = scoreMatch(h.normalized, candNorm);
        if (score <= 0) continue;
        if (!best || score > best.score) best = { header: h.original, score };
      }
    }
    if (best) {
      out[field] = best.header;
      usedHeaders.add(best.header);
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

const usStateNameToCode: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
  "washington dc": "DC",
  "washington d c": "DC",
  "d c": "DC",
  "puerto rico": "PR",
  guam: "GU",
  "american samoa": "AS",
  "northern mariana islands": "MP",
  "u.s. virgin islands": "VI",
  "us virgin islands": "VI",
  "virgin islands": "VI",
};

const usStateVariantToCode: Record<string, string> = {
  ala: "AL",
  ariz: "AZ",
  ark: "AR",
  calif: "CA",
  colo: "CO",
  conn: "CT",
  del: "DE",
  fla: "FL",
  ga: "GA",
  ill: "IL",
  ind: "IN",
  kan: "KS",
  kans: "KS",
  ky: "KY",
  la: "LA",
  mass: "MA",
  mich: "MI",
  minn: "MN",
  miss: "MS",
  mo: "MO",
  mont: "MT",
  neb: "NE",
  nev: "NV",
  okla: "OK",
  ore: "OR",
  penn: "PA",
  pa: "PA",
  tenn: "TN",
  tex: "TX",
  va: "VA",
  wash: "WA",
  wv: "WV",
  wis: "WI",
};

function normalizeUsState(v: string | null) {
  if (!v) return null;
  const raw = String(v).trim();
  if (!raw) return null;

  const upper = raw.toUpperCase().replace(/\./g, "").trim();
  if (/^[A-Z]{2}$/.test(upper)) return upper;

  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return null;
  if (usStateNameToCode[cleaned]) return usStateNameToCode[cleaned];
  if (usStateVariantToCode[cleaned]) return usStateVariantToCode[cleaned];
  return upper;
}

function validateState(v: string | null) {
  if (!v) return null;
  const s = v.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(s))
    return 'State must be 2 letters (e.g. "FL"). Full names like "Florida" are accepted, or provide a valid US ZIP so it can be derived.';
  return null;
}

function validateZip(v: string | null) {
  if (!v) return null;
  const s = v.trim();
  if (!/^\d{5}(-\d{4})?$/.test(s)) return "Zip Code must be 5 digits (or ZIP+4)";
  return null;
}

const zip3Ranges: Array<[number, number, string]> = [
  [6, 7, "PR"],
  [8, 8, "VI"],
  [9, 9, "PR"],
  [10, 27, "MA"],
  [28, 29, "RI"],
  [30, 38, "NH"],
  [39, 49, "ME"],
  [50, 59, "VT"],
  [60, 69, "CT"],
  [70, 89, "NJ"],
  [90, 99, "AE"],
  [100, 149, "NY"],
  [150, 196, "PA"],
  [197, 199, "DE"],
  [200, 205, "DC"],
  [206, 219, "MD"],
  [220, 246, "VA"],
  [247, 268, "WV"],
  [270, 289, "NC"],
  [290, 299, "SC"],
  [300, 319, "GA"],
  [320, 349, "FL"],
  [350, 369, "AL"],
  [370, 385, "TN"],
  [386, 397, "MS"],
  [400, 427, "KY"],
  [430, 459, "OH"],
  [460, 479, "IN"],
  [480, 499, "MI"],
  [500, 528, "IA"],
  [530, 549, "WI"],
  [550, 567, "MN"],
  [570, 577, "SD"],
  [580, 588, "ND"],
  [590, 599, "MT"],
  [600, 629, "IL"],
  [630, 658, "MO"],
  [660, 679, "KS"],
  [680, 693, "NE"],
  [700, 715, "LA"],
  [716, 729, "AR"],
  [730, 749, "OK"],
  [750, 799, "TX"],
  [800, 816, "CO"],
  [820, 831, "WY"],
  [832, 838, "ID"],
  [840, 847, "UT"],
  [850, 865, "AZ"],
  [870, 884, "NM"],
  [889, 898, "NV"],
  [900, 961, "CA"],
  [967, 968, "HI"],
  [969, 969, "GU"],
  [970, 979, "OR"],
  [980, 994, "WA"],
  [995, 999, "AK"],
];

function extractZip5(v: string | null) {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{5})(?:-\d{4})?$/);
  return m ? m[1] : null;
}

function inferUsStateFromZip(v: string | null) {
  const zip5 = extractZip5(v);
  if (!zip5) return null;
  const zip3 = parseInt(zip5.slice(0, 3), 10);
  if (!Number.isFinite(zip3)) return null;

  let lo = 0;
  let hi = zip3Ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [start, end, st] = zip3Ranges[mid]!;
    if (zip3 < start) hi = mid - 1;
    else if (zip3 > end) lo = mid + 1;
    else return st;
  }

  return null;
}

function parseUsFullAddress(input: string) {
  const s = String(input || "").trim();
  if (!s) return null;

  const withCommas = s.match(/^(.+?),\s*([^,]+?),\s*([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?$/);
  if (withCommas) {
    const street = withCommas[1]?.trim() || "";
    const city = withCommas[2]?.trim() || "";
    const state = withCommas[3]?.trim().toUpperCase() || "";
    const zipCode = (withCommas[4] || "").trim() || "";
    return { street, city, state, zipCode };
  }

  const withTrailing = s.match(/^(.+?)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (withTrailing) {
    const left = withTrailing[1]?.trim() || "";
    const state = withTrailing[2]?.trim().toUpperCase() || "";
    const zipCode = withTrailing[3]?.trim() || "";
    const parts = left.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const street = parts.slice(0, -1).join(", ");
      const city = parts[parts.length - 1] || "";
      return { street, city, state, zipCode };
    }
    return null;
  }

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

export function mapAndValidateRow(
  entityType: CrmEntityType,
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  ctx?: { defaultLeadSource?: string; deriveStateFromZip?: boolean },
) {
  const defs = getCrmFieldDefs(entityType);
  const raw: Record<string, unknown> = {};

  for (const def of defs) {
    const col = mapping[def.key];
    if (!col) continue;
    if (def.key === "source" && typeof col === "string" && col.startsWith("static:")) {
      raw[def.key] = col.slice("static:".length);
    } else {
      raw[def.key] = row[col];
    }
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

  if (entityType === "lead") {
    const candidate =
      toStringOrNull(out.fullAddress ?? null) ||
      toStringOrNull(out.address ?? null);
    const needsDerive = !out.city || !out.state || !out.zipCode;
    if (candidate && needsDerive) {
      const parsed = parseUsFullAddress(candidate);
      if (parsed) {
        if (!out.city && parsed.city) out.city = parsed.city;
        if (!out.state && parsed.state) out.state = parsed.state;
        if (!out.zipCode && parsed.zipCode) out.zipCode = parsed.zipCode;
        if (!out.address && parsed.street) out.address = parsed.street;
        if (typeof out.address === "string" && out.address.includes(",") && parsed.street) {
          out.address = parsed.street;
        }
      } else if (toStringOrNull(out.fullAddress ?? null)) {
        if (!out.city) errors.push({ field: "city", message: "Unable to parse from Full Address" });
        if (!out.state) errors.push({ field: "state", message: "Unable to parse from Full Address" });
        if (!out.zipCode) errors.push({ field: "zipCode", message: "Unable to parse from Full Address" });
      }
    }
    delete out.fullAddress;
  }

  if (entityType === "lead" || entityType === "opportunity") {
    const zipLike = (v: unknown) => typeof v === "string" && /^\d{5}(?:-\d{4})?$/.test(v.trim());

    if (!out.zipCode && zipLike(out.state)) {
      out.zipCode = String(out.state || "").trim();
      out.state = null;
    }

    const deriveFromZip = ctx?.deriveStateFromZip !== false;
    if (deriveFromZip && (!out.state || (typeof out.state === "string" && !out.state.trim()) || zipLike(out.state)) && out.zipCode) {
      const inferred = inferUsStateFromZip(toStringOrNull(out.zipCode ?? null));
      if (inferred) out.state = inferred;
    }

    out.state = normalizeUsState(out.state ?? null);
  }

  if (entityType === "lead") {
    const src = toStringOrNull(out.source ?? null);
    const defaultSrc = toStringOrNull(ctx?.defaultLeadSource ?? null);
    if ((!src || !src.trim()) && defaultSrc) out.source = defaultSrc.trim();
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
    let stateErr = validateState(out.state ?? null);
    const zipErr = validateZip(out.zipCode ?? null);
    const deriveFromZip = ctx?.deriveStateFromZip !== false;
    if (stateErr && deriveFromZip && !zipErr) {
      const inferred = inferUsStateFromZip(toStringOrNull(out.zipCode ?? null));
      if (inferred) {
        out.state = inferred;
        stateErr = validateState(out.state ?? null);
      }
    }
    if (stateErr) errors.push({ field: "state", message: stateErr });
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

type JobRunLimits = {
  maxRows?: number;
  maxBatches?: number;
  resume?: boolean;
};

function toDateMs(v: unknown) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}

async function withAdvisoryLock<T>(ns: number, key: number, fn: (tx: typeof db) => Promise<T>) {
  return await db.transaction(async (tx) => {
    const r: any = await tx.execute(sql`SELECT pg_try_advisory_lock(${ns}, ${key}) AS ok`);
    const ok = Boolean(r?.rows?.[0]?.ok);
    if (!ok) return null;
    try {
      return await fn(tx as any);
    } finally {
      try {
        await tx.execute(sql`SELECT pg_advisory_unlock(${ns}, ${key})`);
      } catch {}
    }
  });
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

export async function processImportJob(jobId: number, limits: JobRunLimits = {}) {
  const out = await withAdvisoryLock(1, jobId, async (tx) => {
    const jobRows = await tx.select().from(crmImportJobs).where(eq(crmImportJobs.id, jobId)).limit(1);
    const job = jobRows[0];
    if (!job) throw new Error("Import job not found");

    const updatedAtMs = toDateMs((job as any).updatedAt);
    const activeWindowMs = limits.resume ? 5_000 : 90_000;
    const runnable =
      job.status === "queued" ||
      (job.status === "processing" && (updatedAtMs === null || Date.now() - updatedAtMs > activeWindowMs));
    if (!runnable) return job;

    const entityType = job.entityType as CrmEntityType;
    const mapping = JSON.parse(String(job.mapping || "{}")) as Record<string, string>;
    const options = JSON.parse(String(job.options || "{}")) as ImportOptions;
    const dryRun = !!options.dryRun;
    const onDuplicate = options.onDuplicate || "merge";
    const defaultLeadSource = toStringOrNull(options.defaultLeadSource ?? null)?.trim() || "Import";
    const deriveStateFromZip = options.deriveStateFromZip !== false;

    const defaultBatchSize = limits.maxRows ? Math.min(limits.maxRows, 200) : 500;
    const batchSize = options.batchSize && options.batchSize > 0 ? Math.min(options.batchSize, 2000) : defaultBatchSize;

    const startedAt = (job as any).startedAt ? new Date((job as any).startedAt) : new Date();
    await tx
      .update(crmImportJobs)
      .set({ status: "processing", startedAt, updatedAt: new Date() } as any)
      .where(eq(crmImportJobs.id, jobId));

    try {
      const format = detectFormat(job.originalFilename || undefined, job.fileMimeType || undefined) || "csv";
      const buffer = Buffer.from(String(job.fileBase64), "base64");
      const parsed = await parseUpload(buffer, format);

      await tx
        .update(crmImportJobs)
        .set({ totalRows: parsed.rows.length, updatedAt: new Date() } as any)
        .where(eq(crmImportJobs.id, jobId));

      let processedRows = Math.max(0, Math.min(Number(job.processedRows || 0), parsed.rows.length));
      let createdCount = Number(job.createdCount || 0);
      let updatedCount = Number(job.updatedCount || 0);
      let skippedCount = Number(job.skippedCount || 0);
      let errorCount = Number(job.errorCount || 0);

      const assignedIds: number[] = [];
      for (const r of parsed.rows.slice(processedRows)) {
        const v = mapping.assignedTo ? toIntOrNull(r[mapping.assignedTo]) : null;
        if (v) assignedIds.push(v);
      }
      const uniqueAssigneeIds = Array.from(new Set(assignedIds.filter((n) => Number.isFinite(n))));
      const assigneeRows = uniqueAssigneeIds.length
        ? await tx.select({ id: users.id }).from(users).where(inArray(users.id, uniqueAssigneeIds))
        : [];
      const validAssignees = new Set(assigneeRows.map((r) => r.id));

      const maxRows = limits.maxRows && limits.maxRows > 0 ? limits.maxRows : null;
      const maxBatches = limits.maxBatches && limits.maxBatches > 0 ? limits.maxBatches : null;
      let batchesRun = 0;
      let rowsRun = 0;
      for (let i = processedRows; i < parsed.rows.length; i += batchSize) {
        if (maxBatches !== null && batchesRun >= maxBatches) break;
        if (maxRows !== null && rowsRun >= maxRows) break;

        const remaining = maxRows !== null ? Math.max(0, maxRows - rowsRun) : null;
        const effectiveBatchSize = remaining !== null ? Math.min(batchSize, remaining) : batchSize;
        const slice = parsed.rows.slice(i, i + effectiveBatchSize);
        if (!slice.length) break;

        const prepared = slice.map((rawRow) =>
          mapAndValidateRow(entityType, rawRow, mapping, {
            defaultLeadSource: entityType === "lead" ? defaultLeadSource : undefined,
            deriveStateFromZip: entityType === "lead" || entityType === "opportunity" ? deriveStateFromZip : undefined,
          }),
        );

        const seenKeys = new Set<string>();
        const candidates: { rowNumber: number; rawRow: Record<string, unknown>; data: any; key: string }[] = [];
        for (let j = 0; j < prepared.length; j++) {
          const rowNumber = i + j + 2;
          const prep = prepared[j];
          const rawRow = slice[j];

          if (!prep.ok) {
            errorCount += 1;
            await tx.insert(crmImportJobErrors).values({
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
            await tx.insert(crmImportJobErrors).values({
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
            await tx.insert(crmImportJobErrors).values({
              jobId,
              rowNumber,
              errors: JSON.stringify([{ message: "Duplicate row within import file" }]),
              rawRow: JSON.stringify(rawRow),
            } as any);
            continue;
          }
          seenKeys.add(key);

          candidates.push({ rowNumber, rawRow, data: prep.data, key });
        }

        const keys = candidates.map((c) => c.key);
        const existingByKey = new Map<string, any>();

        if (keys.length) {
          if (entityType === "lead") {
            const existing = await tx.select().from(leads).where(inArray(leads.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
          } else if (entityType === "opportunity") {
            const existing = await tx.select().from(properties).where(inArray(properties.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String(e.dedupeKey || ""), e);
          } else if (entityType === "contact") {
            const existing = await tx.select().from(contacts).where(inArray(contacts.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String((e as any).dedupeKey || ""), e);
          } else {
            const existing = await tx.select().from(buyers).where(inArray(buyers.dedupeKey, keys));
            for (const e of existing) existingByKey.set(String((e as any).dedupeKey || ""), e);
          }
        }

        for (const c of candidates) {
          const existing = existingByKey.get(c.key);

          if (!existing) {
            if (!dryRun) {
              if (entityType === "lead") {
                await tx.insert(leads).values({ ...(c.data as any), dedupeKey: c.key } as any);
              } else if (entityType === "opportunity") {
                await tx.insert(properties).values({ ...(c.data as any), dedupeKey: c.key } as any);
              } else if (entityType === "contact") {
                await tx.insert(contacts).values({ ...(c.data as any), dedupeKey: c.key } as any);
              } else {
                await tx.insert(buyers).values({ ...(c.data as any), dedupeKey: c.key } as any);
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
            await tx.update(leads).set(patch).where(eq(leads.id, existing.id));
          } else if (entityType === "opportunity") {
            await tx.update(properties).set(patch).where(eq(properties.id, existing.id));
          } else if (entityType === "contact") {
            await tx.update(contacts).set(patch).where(eq(contacts.id, existing.id));
          } else {
            await tx.update(buyers).set(patch).where(eq(buyers.id, existing.id));
          }
          updatedCount += 1;
        }

        processedRows += slice.length;
        rowsRun += slice.length;
        batchesRun += 1;

        await tx
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

      if (processedRows >= parsed.rows.length) {
        await tx
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
      }

      const endRows = await tx.select().from(crmImportJobs).where(eq(crmImportJobs.id, jobId)).limit(1);
      return endRows[0];
    } catch (err: any) {
      const msg = String(err?.message || err);
      try {
        await tx.insert(crmImportJobErrors).values({
          jobId,
          rowNumber: 0,
          errors: JSON.stringify([{ message: msg }]),
          rawRow: null,
        } as any);
      } catch {}

      await tx
        .update(crmImportJobs)
        .set({
          status: "failed",
          finishedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(eq(crmImportJobs.id, jobId));

      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "crm_import", kind: "job_failed", jobId, message: msg }));
      const endRows = await tx.select().from(crmImportJobs).where(eq(crmImportJobs.id, jobId)).limit(1);
      return endRows[0];
    }
  });

  if (!out) return await getImportJob(jobId);
  return out;
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

export async function renewExportToken(exportId: number, expiresInMinutes = 60) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

  const updated = await db
    .update(crmExportFiles)
    .set({ tokenHash, expiresAt, updatedAt: new Date() } as any)
    .where(eq(crmExportFiles.id, exportId))
    .returning();

  return { job: updated[0], token };
}

export async function getExportJob(exportId: number) {
  const rows = await db.select().from(crmExportFiles).where(eq(crmExportFiles.id, exportId)).limit(1);
  return rows[0];
}

export async function processExportJob(exportId: number, limits: JobRunLimits = {}) {
  const out = await withAdvisoryLock(2, exportId, async (tx) => {
    const jobRows = await tx.select().from(crmExportFiles).where(eq(crmExportFiles.id, exportId)).limit(1);
    const job = jobRows[0];
    if (!job) throw new Error("Export job not found");

    const updatedAtMs = toDateMs((job as any).updatedAt);
    const activeWindowMs = limits.resume ? 5_000 : 90_000;
    const runnable =
      job.status === "queued" ||
      (job.status === "processing" && (updatedAtMs === null || Date.now() - updatedAtMs > activeWindowMs));
    if (!runnable) return job;

    const startedAt = (job as any).startedAt ? new Date((job as any).startedAt) : new Date();
    await tx
      .update(crmExportFiles)
      .set({ status: "processing", startedAt, updatedAt: new Date() } as any)
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

      const rows: any[] = where.length ? await tx.select().from(table).where(and(...where)) : await tx.select().from(table);

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

      const filename = `${entityType}-export-${new Date().toISOString().slice(0, 10)}.${format}`;
      const mimeType = format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      let contentBase64 = "";

      if (format === "csv") {
        const { stringify } = await import("csv-stringify/sync");
        const csv = stringify(records, { header: true, columns: safeColumns });
        contentBase64 = Buffer.from(csv, "utf8").toString("base64");
      } else {
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet("Export");
        ws.addRow(safeColumns);
        for (const r of records) ws.addRow(safeColumns.map((c) => (r as any)[c] ?? ""));
        const b = await wb.xlsx.writeBuffer();
        const buf = Buffer.isBuffer(b) ? b : Buffer.from(b as any);
        contentBase64 = buf.toString("base64");
      }

      await tx
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

      const endRows = await tx.select().from(crmExportFiles).where(eq(crmExportFiles.id, exportId)).limit(1);
      return endRows[0];
    } catch (err: any) {
      const msg = String(err?.message || err);
      await tx
        .update(crmExportFiles)
        .set({ status: "failed", finishedAt: new Date(), updatedAt: new Date() } as any)
        .where(eq(crmExportFiles.id, exportId));
      console.error(JSON.stringify({ ts: new Date().toISOString(), event: "crm_export", kind: "job_failed", jobId: exportId, message: msg }));
      const endRows = await tx.select().from(crmExportFiles).where(eq(crmExportFiles.id, exportId)).limit(1);
      return endRows[0];
    }
  });

  if (!out) return await getExportJob(exportId);
  return out;
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
