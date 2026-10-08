/**
 * server/loi/pdf-generator.ts — Professional LOI (Letter of Intent) PDF generation.
 *
 * Generates a clean, professional Letter of Intent document from an LOI record.
 * Uses the existing Playwright-based HTML-to-PDF pipeline from server/esign/pdf.ts
 * for high-quality output with proper typography, margins, and letterhead.
 *
 * ATTORNEY REVIEW REQUIRED BEFORE PRODUCTION USE. Not legal advice.
 */

import { renderContractHtmlToPdf, toPrintableHtml } from "../esign/pdf.js";

export type LoiPdfData = {
  buyerName: string;
  sellerName: string;
  propertyAddress: string;
  offerAmount: number;
  earnestMoney?: number | null;
  closingDate?: string | null;
  contingencies?: string[] | null;
  specialTerms?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(d);
  }
}

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build the LOI as styled HTML, then render to PDF.
 * Returns PDF bytes.
 */
export async function generateLoiPdf(data: LoiPdfData): Promise<Buffer> {
  const contingencies = (data.contingencies || []).filter(Boolean);
  const contingencyHtml = contingencies.length
    ? `<ul>${contingencies.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
    : `<p><em>No contingencies specified.</em></p>`;

  const body = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 11px; letter-spacing: 3px; color: #8a6d2b; margin-bottom: 8px;">OCEAN LUXE</div>
      <h1 style="font-size: 24px; margin: 0; letter-spacing: 1px;">LETTER OF INTENT</h1>
      <div style="font-size: 11px; color: #666; margin-top: 8px;">Non-Binding Offer to Purchase Real Property</div>
    </div>

    <p style="margin-bottom: 20px;"><strong>Date:</strong> ${fmtDate(data.createdAt || new Date().toISOString())}</p>

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; background: #f9f9f9; width: 30%;"><strong>Buyer</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${esc(data.buyerName)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; background: #f9f9f9;"><strong>Seller</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${esc(data.sellerName)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; background: #f9f9f9;"><strong>Property</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${esc(data.propertyAddress)}</td>
      </tr>
    </table>

    <h2>Proposed Terms</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; background: #f9f9f9; width: 40%;"><strong>Purchase Price</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc; font-size: 16px; font-weight: bold;">${fmtMoney(data.offerAmount)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; background: #f9f9f9;"><strong>Earnest Money Deposit</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${fmtMoney(data.earnestMoney)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; background: #f9f9f9;"><strong>Target Closing Date</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${fmtDate(data.closingDate)}</td>
      </tr>
      <tr>
        <td style="padding: 10px; border: 1px solid #ccc; background: #f9f9f9;"><strong>Offer Expires</strong></td>
        <td style="padding: 10px; border: 1px solid #ccc;">${fmtDate(data.expiresAt)}</td>
      </tr>
    </table>

    <h2>Contingencies</h2>
    ${contingencyHtml}

    ${data.specialTerms ? `<h2>Special Terms</h2><p>${esc(data.specialTerms).replace(/\n/g, "<br/>")}</p>` : ""}

    <h2>Non-Binding Nature</h2>
    <p>This Letter of Intent is for discussion purposes only and does not create a binding obligation on either party, except as may be set forth in a mutually executed definitive purchase agreement. Either party may terminate discussions at any time.</p>

    <div style="margin-top: 60px;">
      <table style="width: 100%; font-size: 13px;">
        <tr>
          <td style="width: 50%; padding-right: 20px;">
            <div style="border-bottom: 1px solid #111; height: 50px; margin-bottom: 6px;"></div>
            <div style="font-size: 11px; color: #555;">Buyer Signature &nbsp;·&nbsp; ${esc(data.buyerName)}</div>
            <div style="margin-top: 12px; border-bottom: 1px solid #111; height: 30px; margin-bottom: 6px;"></div>
            <div style="font-size: 11px; color: #555;">Date</div>
          </td>
          <td style="width: 50%; padding-left: 20px;">
            <div style="border-bottom: 1px solid #111; height: 50px; margin-bottom: 6px;"></div>
            <div style="font-size: 11px; color: #555;">Seller Signature &nbsp;·&nbsp; ${esc(data.sellerName)}</div>
            <div style="margin-top: 12px; border-bottom: 1px solid #111; height: 30px; margin-bottom: 6px;"></div>
            <div style="font-size: 11px; color: #555;">Date</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #888; text-align: center;">
      Generated by Ocean Luxe CRM &nbsp;·&nbsp; This document is a non-binding letter of intent and does not constitute legal advice.
    </div>
  `;

  const html = toPrintableHtml("Letter of Intent", body);
  return renderContractHtmlToPdf(html);
}
