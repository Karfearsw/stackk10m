import { useMemo } from "react";

// Dependency-free markdown renderer built for the docs module.
// Security model: the raw markdown is HTML-escaped FIRST, then structural
// formatting is applied — user content can never inject markup.

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(s: string): string {
  // s is already escaped; add inline formatting on top.
  return s
    .replace(/`([^`]+)`/g, "<code class=\"px-1.5 py-0.5 rounded bg-muted text-[0.85em] font-mono\">$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) => {
      const url = href.trim();
      const safe = /^(https?:\/\/|\/|#|mailto:)/i.test(url) ? url : "#";
      const cls = safe.startsWith("/")
        ? "text-primary underline underline-offset-2"
        : "text-primary underline underline-offset-2";
      return `<a href="${safe}" class="${cls}">${text}</a>`;
    });
}

function render(md: string): string {
  const src = escapeHtml(String(md || ""));
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inCode = false;
  let tableBuf: string[][] = [];

  const closeList = () => {
    if (inList) {
      out.push(inList === "ul" ? "</ul>" : "</ol>");
      inList = null;
    }
  };

  const flushTable = () => {
    if (!tableBuf.length) return;
    const [head, ...rows] = tableBuf;
    out.push("<div class=\"my-4 overflow-x-auto\"><table class=\"w-full text-sm border-collapse\">");
    out.push("<thead><tr>" + head.map((c) => `<th class="border border-border bg-muted/50 px-3 py-1.5 text-left font-medium">${inline(c)}</th>`).join("") + "</tr></thead>");
    out.push("<tbody>" + rows.map((r) => "<tr>" + r.map((c) => `<td class="border border-border px-3 py-1.5 align-top">${inline(c)}</td>`).join("") + "</tr>").join("") + "</tbody>");
    out.push("</table></div>");
    tableBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (/^```/.test(line.trim())) {
      flushTable();
      closeList();
      if (!inCode) {
        inCode = true;
        out.push("<pre class=\"my-4 overflow-x-auto rounded-md bg-muted p-3 text-[0.85em] font-mono\">");
      } else {
        inCode = false;
        out.push("</pre>");
      }
      continue;
    }
    if (inCode) {
      out.push(line + "\n");
      continue;
    }

    // Tables: | a | b |  (separator row skipped)
    if (/^\s*\|.+\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator
      tableBuf.push(cells);
      continue;
    }
    flushTable();

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      const cls: Record<number, string> = {
        1: "text-2xl font-bold mt-6 mb-3 first:mt-0",
        2: "text-xl font-semibold mt-6 mb-2 first:mt-0",
        3: "text-base font-semibold mt-4 mb-1.5",
        4: "text-sm font-semibold mt-3 mb-1",
      };
      out.push(`<h${level} class="${cls[level]}">${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      closeList();
      out.push(`<blockquote class="my-3 border-l-4 border-primary/40 bg-muted/30 pl-3 py-1.5 pr-3 text-sm italic text-muted-foreground">${inline(line.replace(/^\s*>\s?/, ""))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flushTable();
      if (inList !== "ul") {
        closeList();
        out.push("<ul class=\"my-2 list-disc pl-6 space-y-1\">");
        inList = "ul";
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushTable();
      if (inList !== "ol") {
        closeList();
        out.push("<ol class=\"my-2 list-decimal pl-6 space-y-1\">");
        inList = "ol";
      }
      out.push(`<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      closeList();
      out.push("<hr class=\"my-5 border-border\" />");
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    // Paragraph: merge consecutive non-empty, non-structural lines.
    let para = line;
    while (i + 1 < lines.length && lines[i + 1].trim() && !/^\s*(#{1,4}\s|[-*]\s|\d+[.)]\s|>|\||```|---+)/.test(lines[i + 1])) {
      para += " " + lines[i + 1].trim();
      i++;
    }
    closeList();
    out.push(`<p class="my-2 leading-relaxed">${inline(para)}</p>`);
  }

  closeList();
  flushTable();
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

export function MarkdownView({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => render(source), [source]);
  return <div className={`docs-markdown text-sm ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
