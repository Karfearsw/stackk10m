/**
 * server/esign/pdf.ts — Contract PDF rendering for the self-built e-sign module.
 *
 * Pipeline:
 *   1. renderContractHtmlToPdf(html) — headless Chromium (Playwright) renders
 *      the merged contract HTML to a PDF (Letter).
 *   2. buildSignedPacket(...) — pdf-lib overlays each signer's signature block
 *      and appends a Certificate of Completion page with the document hash and
 *      audit-chain head hash.
 *
 * Chromium resolution order:
 *   1. ESIGN_CHROMIUM_PATH env var  (Vercel: point at @sparticuz/chromium)
 *   2. Playwright's bundled Chromium (dev/CI after `npx playwright install`)
 *   3. Throws EsignPdfError with guidance.
 *
 * VERCEL NOTE: browser binaries are NOT available on serverless by default.
 * Options: add the @sparticuz/chromium dependency and set
 * ESIGN_CHROMIUM_PATH to its executable, or move PDF finalization to a
 * long-running worker. See server/esign/README.md. The runtime dependency
 * added for this is `playwright-core` (browser launch only; no bundled browser).
 */
import crypto from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { chromium } from "playwright-core";

export class EsignPdfError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "EsignPdfError";
    this.code = code;
  }
}

/**
 * Resolve the Chromium executable for PDF rendering.
 * - ESIGN_CHROMIUM_PATH set -> use it (Vercel: point at @sparticuz/chromium).
 * - unset -> return null and let Playwright resolve its bundled Chromium or
 *   headless shell itself at launch time.
 */
export function resolveChromiumExecutable(): string | null {
  const envPath = process.env.ESIGN_CHROMIUM_PATH?.trim();
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new EsignPdfError("no_browser", `ESIGN_CHROMIUM_PATH does not exist: ${envPath}`);
    }
    return envPath;
  }
  return null;
}

/**
 * Find a usable Chromium binary on this machine, deterministically.
 * Checks (in order): Playwright's default executablePath(), full-chromium
 * dirs, then headless-shell-only installs — under both
 * PLAYWRIGHT_BROWSERS_PATH and ~/.cache/ms-playwright.
 *
 * NOTE: this probes the filesystem instead of relying on env-var timing
 * because Playwright snapshots the browsers path at import time.
 */
export function findLocalChromiumExecutable(): string | null {
  try {
    const exe = chromium.executablePath();
    if (exe && existsSync(exe)) return exe;
  } catch {
    /* fall through to directory probes */
  }
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(os.homedir(), ".cache", "ms-playwright")].filter(
    Boolean
  ) as string[];
  for (const base of bases) {
    let entries: string[] = [];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    for (const d of entries) {
      if (d.startsWith("chromium_headless_shell-")) {
        const dir = join(base, d, "chrome-headless-shell-linux64");
        for (const name of ["headless_shell", "chrome-headless-shell"]) {
          const p = join(dir, name);
          if (existsSync(p)) return p;
        }
      } else if (d.startsWith("chromium-")) {
        for (const p of [join(base, d, "chrome-linux", "chrome"), join(base, d, "chrome-linux64", "chrome")]) {
          if (existsSync(p)) return p;
        }
      }
    }
  }
  return null;
}

/** Best-effort check for whether a browser is launchable right now. */
export function isBrowserResolvable(): boolean {
  const envPath = process.env.ESIGN_CHROMIUM_PATH?.trim();
  if (envPath) return existsSync(envPath);
  return findLocalChromiumExecutable() !== null;
}

/** Normalize template content into printable HTML. Templates may be plain text
 *  with {{merge}} fields; if no HTML tags are present we escape and paginate. */
export function toPrintableHtml(title: string, content: string): string {
  const looksLikeHtml = /<\s*(p|div|h\d|table|br|ul|ol|span|strong|em)\b/i.test(content);
  const body = looksLikeHtml
    ? content
    : `<div>${escapeHtml(content)
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
        .join("")}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; line-height: 1.55; padding: 8px; }
  h1 { font-size: 22px; text-align: center; margin-bottom: 6px; }
  h2 { font-size: 16px; margin-top: 22px; border-bottom: 1px solid #999; padding-bottom: 4px; }
  p { font-size: 12.5px; margin: 8px 0; text-align: justify; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td, th { border: 1px solid #999; padding: 6px; text-align: left; }
  .doc-title { text-align:center; font-size: 20px; font-weight: bold; margin-bottom: 18px; letter-spacing: .5px;}
  .sig-line { border-bottom: 1px solid #111; height: 44px; margin: 26px 0 6px; }
  .sig-label { font-size: 10px; color: #444; }
</style></head><body>
<div class="doc-title">${escapeHtml(title)}</div>
${body}
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render HTML -> PDF bytes via headless Chromium. */
export async function renderContractHtmlToPdf(html: string): Promise<Buffer> {
  // Explicit executable when resolvable (deterministic); otherwise let
  // Playwright resolve and surface its own "run npx playwright install" error.
  const executablePath = resolveChromiumExecutable() ?? findLocalChromiumExecutable() ?? undefined;
  let browser: any = null;
  try {
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true, margin: { top: "48px", bottom: "48px", left: "48px", right: "48px" } });
    return Buffer.from(pdf);
  } catch (e: any) {
    if (e instanceof EsignPdfError) throw e;
    throw new EsignPdfError("render_failed", `Chromium PDF render failed: ${String(e?.message || e)}`);
  } finally {
    try {
      await browser?.close();
    } catch {}
  }
}

export interface SignatureOverlay {
  signerName: string;
  signerEmail: string | null;
  role: string;
  signatureType: "drawn" | "typed" | "uploaded";
  signatureText?: string | null;
  signatureImageBase64?: string | null;
  signedAt: Date;
  ip?: string | null;
  userAgent?: string | null;
  consentAt?: Date | null;
}

export interface CertificateData {
  envelopeId: number;
  title: string;
  /** When null, the hash computed from the rendered base PDF is used. */
  documentSha256: string | null;
  auditChainHead: string | null;
  auditEventCount: number;
  completedAt: Date;
}

function drawWrappedText(page: PDFPage, text: string, opts: { x: number; y: number; size: number; font: PDFFont; color: any; maxWidth: number; lineHeight: number }): number {
  const words = String(text || "").split(/\s+/);
  let line = "";
  let y = opts.y;
  const lines: string[] = [];
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (opts.font.widthOfTextAtSize(next, opts.size) > opts.maxWidth) {
      if (line) lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  for (const l of lines) {
    page.drawText(l, { x: opts.x, y, size: opts.size, font: opts.font, color: opts.color });
    y -= opts.lineHeight;
  }
  return y;
}

async function embedSignatureImage(pdfDoc: PDFDocument, base64: string): Promise<any> {
  const clean = String(base64).replace(/^data:image\/\w+;base64,/, "").trim();
  const bytes = Buffer.from(clean, "base64");
  try {
    return await pdfDoc.embedPng(bytes);
  } catch {
    return await pdfDoc.embedJpg(bytes);
  }
}

/**
 * Build the final signed packet:
 *   base PDF (Chromium render) + per-signer signature page(s) + Certificate of
 *   Completion page. Returns the bytes and both hashes.
 */
export async function buildSignedPacket(args: {
  title: string;
  mergedContent: string;
  signatures: SignatureOverlay[];
  certificate: CertificateData;
}): Promise<{ bytes: Buffer; documentSha256: string; finalPdfSha256: string }> {
  const html = toPrintableHtml(args.title, args.mergedContent);
  const basePdf = await renderContractHtmlToPdf(html);
  const documentSha256 = crypto.createHash("sha256").update(basePdf).digest("hex");

  const pdfDoc = await PDFDocument.load(basePdf);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const GOLD = rgb(0.83, 0.69, 0.22);

  const margin = 56;
  const contentWidth = 612 - margin * 2;

  // ---- One signature page per signer ----
  for (const sig of args.signatures) {
    const page = pdfDoc.addPage([612, 792]);
    let y = 792 - margin;
    page.drawText("ELECTRONIC SIGNATURE", { x: margin, y, size: 15, font: fontBold, color: rgb(0, 0, 0) });
    y -= 10;
    page.drawLine({ start: { x: margin, y }, end: { x: margin + 120, y }, thickness: 2, color: GOLD });
    y -= 30;

    page.drawText("Signature", { x: margin, y, size: 11, font: fontBold }); y -= 66;
    if (sig.signatureType === "typed") {
      page.drawText(String(sig.signatureText || sig.signerName), { x: margin, y, size: 30, font: fontOblique, color: rgb(0.1, 0.1, 0.4) });
      y -= 40;
    } else if (sig.signatureImageBase64) {
      const img = await embedSignatureImage(pdfDoc, sig.signatureImageBase64);
      const targetH = 64;
      const scale = targetH / img.height;
      page.drawImage(img, { x: margin, y: y - targetH, width: img.width * scale, height: targetH });
      y -= targetH + 16;
    }
    page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, thickness: 1, color: rgb(0.4, 0.4, 0.4) });
    y -= 18;
    const meta: Array<[string, string]> = [
      ["Printed name", sig.signerName],
      ["Email", sig.signerEmail || "—"],
      ["Role", sig.role],
      ["Signed at (UTC)", sig.signedAt.toISOString()],
      ["E-consent given", sig.consentAt ? sig.consentAt.toISOString() : "—"],
      ["IP address", sig.ip || "—"],
      ["User agent", (sig.userAgent || "—").slice(0, 120)],
      ["Document hash (SHA-256)", args.certificate.documentSha256 || documentSha256],
    ];
    for (const [k, v] of meta) {
      page.drawText(`${k}:`, { x: margin, y, size: 10, font: fontBold, color: rgb(0, 0, 0) });
      const keyW = fontBold.widthOfTextAtSize(`${k}:`, 10);
      y = drawWrappedText(page, v, { x: margin + keyW + 8, y, size: 10, font, color: rgb(0.15, 0.15, 0.15), maxWidth: contentWidth - keyW - 8, lineHeight: 14 }) - 6;
    }
  }

  // ---- Certificate of Completion ----
  const cert = pdfDoc.addPage([612, 792]);
  let cy = 792 - margin;
  cert.drawText("CERTIFICATE OF COMPLETION", { x: margin, y: cy, size: 17, font: fontBold });
  cy -= 12;
  cert.drawLine({ start: { x: margin, y: cy }, end: { x: margin + 200, y: cy }, thickness: 2.5, color: GOLD });
  cy -= 28;
  cy = drawWrappedText(cert,
    "This certificate confirms that the document identified below was electronically signed " +
    "through the Ocean Luxe self-built e-sign system. Each signing event is recorded in a " +
    "SHA-256 hash-chained audit trail. Any alteration to the document or the audit trail " +
    "after completion will invalidate the hashes below.",
    { x: margin, y: cy, size: 10, font, color: rgb(0.2, 0.2, 0.2), maxWidth: contentWidth, lineHeight: 14 }) - 12;

  const rows: Array<[string, string]> = [
    ["Envelope", `#${args.certificate.envelopeId}`],
    ["Document", args.certificate.title],
    ["Status", "COMPLETED"],
    ["Completed at (UTC)", args.certificate.completedAt.toISOString()],
    ["Document SHA-256", args.certificate.documentSha256 || documentSha256],
    ["Audit chain head", args.certificate.auditChainHead || "—"],
    ["Audit events", String(args.certificate.auditEventCount)],
    ["Signers", String(args.signatures.length)],
  ];
  for (const [k, v] of rows) {
    cert.drawText(`${k}:`, { x: margin, y: cy, size: 10, font: fontBold });
    const keyW = fontBold.widthOfTextAtSize(`${k}:`, 10);
    cy = drawWrappedText(cert, v, { x: margin + keyW + 8, y: cy, size: 9, font, color: rgb(0.15, 0.15, 0.15), maxWidth: contentWidth - keyW - 8, lineHeight: 13 }) - 6;
  }
  cy -= 8;
  cert.drawText("Signatures", { x: margin, y: cy, size: 12, font: fontBold }); cy -= 18;
  for (const sig of args.signatures) {
    cy = drawWrappedText(cert,
      `• ${sig.signerName} <${sig.signerEmail || "—"}> — ${sig.signatureType} — ${sig.signedAt.toISOString()}`,
      { x: margin, y: cy, size: 9, font, color: rgb(0.15, 0.15, 0.15), maxWidth: contentWidth, lineHeight: 13 }) - 4;
  }
  cy -= 14;
  cy = drawWrappedText(cert,
    "Verify: recompute SHA-256 of the document bytes and compare to the Document SHA-256 " +
    "above; then walk the envelope's audit trail in the CRM (each event's hash must equal " +
    "sha256(prev_hash | event_type | payload | created_at)). Mismatch = tampering.",
    { x: margin, y: cy, size: 9, font: fontOblique, color: rgb(0.35, 0.35, 0.35), maxWidth: contentWidth, lineHeight: 13 });

  pdfDoc.setTitle(args.title);
  pdfDoc.setProducer("Ocean Luxe self-built e-sign");
  // Embed the base document hash in metadata so verifiers can cross-check the
  // Certificate of Completion's stated hash without trusting page text alone.
  pdfDoc.setKeywords([`document-sha256:${args.certificate.documentSha256 || documentSha256}`]);

  const finalBytes = Buffer.from(await pdfDoc.save());
  const finalPdfSha256 = crypto.createHash("sha256").update(finalBytes).digest("hex");
  return { bytes: finalBytes, documentSha256, finalPdfSha256 };
}

/**
 * Verify a stored/completed final PDF against the recorded final hash.
 * The base document hash (documentSha256) is captured at render time and
 * recorded in the hash-chained audit trail ("document_finalized" event) and on
 * the Certificate of Completion page inside the PDF; it cannot be recomputed
 * from the final packet alone, which is by design — the final hash covers the
 * whole artifact, so any post-completion alteration is detectable.
 */
export function verifyFinalPdf(pdfBytes: Buffer, expectedFinalSha256: string | null): { finalHash: string; ok: boolean | null } {
  const finalHash = crypto.createHash("sha256").update(pdfBytes).digest("hex");
  return { finalHash, ok: expectedFinalSha256 ? finalHash === expectedFinalSha256 : null };
}
