import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function wrapText(text: string, maxChars: number) {
  const words = String(text || "").replace(/\r\n/g, "\n").split(/\s+/g);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function generateSignedPdfBase64(input: {
  title: string;
  contentText: string;
  signatureType: "typed" | "drawn";
  signatureText?: string | null;
  signatureImageBase64?: string | null;
  auditLines: string[];
}) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([612, 792]);

  const margin = 50;
  const width = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;

  page.drawText(String(input.title || "Document"), { x: margin, y, size: 16, font: fontBold, color: rgb(0, 0, 0) });
  y -= 26;

  const lines = wrapText(input.contentText || "", 92);
  for (const l of lines) {
    if (y < margin + 120) break;
    page.drawText(l, { x: margin, y, size: 10, font, color: rgb(0, 0, 0), maxWidth: width });
    y -= 14;
  }

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
  y -= 22;

  page.drawText("Signature", { x: margin, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
  y -= 20;

  if (input.signatureType === "typed") {
    const sig = String(input.signatureText || "").trim();
    page.drawText(sig || "—", { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
    y -= 28;
  } else {
    const b64 = String(input.signatureImageBase64 || "").trim();
    if (b64) {
      const bytes = Buffer.from(b64, "base64");
      let img: any = null;
      try {
        img = await pdfDoc.embedPng(bytes);
      } catch {
        img = await pdfDoc.embedJpg(bytes);
      }
      const targetH = 60;
      const scale = targetH / img.height;
      const targetW = img.width * scale;
      page.drawImage(img, { x: margin, y: y - targetH + 10, width: targetW, height: targetH });
      y -= targetH + 10;
    } else {
      page.drawText("—", { x: margin, y, size: 18, font: fontBold, color: rgb(0, 0, 0) });
      y -= 28;
    }
  }

  page.drawText("Audit", { x: margin, y, size: 12, font: fontBold, color: rgb(0, 0, 0) });
  y -= 18;
  for (const l of input.auditLines || []) {
    if (y < margin) break;
    page.drawText(String(l), { x: margin, y, size: 9, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 12;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString("base64");
}

