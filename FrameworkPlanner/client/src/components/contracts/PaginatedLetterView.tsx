import { useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Paginated US-Letter document view (audit P3 #31, user-requested).
 * Flows plain-text contract content across 8.5"×11" pages with 1" margins,
 * at 12pt serif — the same layout the printed/PDF letter has. Pages are
 * measured, not faked: a hidden measurer computes each paragraph's height
 * at the exact content width (6.5" = 624px @96dpi) and paragraphs are
 * packed into pages of 9" (864px) of usable height.
 */

const PAGE_WIDTH_PX = 816; // 8.5in
const PAGE_HEIGHT_PX = 1056; // 11in
const MARGIN_PX = 96; // 1in
const CONTENT_WIDTH_PX = PAGE_WIDTH_PX - 2 * MARGIN_PX; // 624px
const CONTENT_HEIGHT_PX = PAGE_HEIGHT_PX - 2 * MARGIN_PX; // 864px

type Block = { text: string; kind: "line" | "gap" };

function toBlocks(content: string): Block[] {
  const out: Block[] = [];
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  for (const line of lines) {
    if (line.trim() === "") out.push({ text: "", kind: "gap" });
    else out.push({ text: line, kind: "line" });
  }
  return out;
}

/** One blank line per gap, consecutive blanks collapse — matches Word/letter flow. */
function collapseGaps(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let lastWasGap = true; // avoid leading blank space
  for (const b of blocks) {
    if (b.kind === "gap") {
      if (!lastWasGap) {
        out.push(b);
        lastWasGap = true;
      }
    } else {
      out.push(b);
      lastWasGap = false;
    }
  }
  while (out.length && out[out.length - 1].kind === "gap") out.pop();
  return out;
}

export function PaginatedLetterView({ content }: { content: string }) {
  const blocks = useMemo(() => collapseGaps(toBlocks(content)), [content]);

  // Measure each block's rendered height at the real content width.
  const measurerRef = useRef<HTMLDivElement | null>(null);
  const [heights, setHeights] = useState<number[] | null>(null);

  useLayoutEffect(() => {
    const el = measurerRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    setHeights(children.map((c) => c.getBoundingClientRect().height));
  }, [blocks]);

  const pages: Block[][] = useMemo(() => {
    if (!heights) return [];
    const result: Block[][] = [];
    let current: Block[] = [];
    let used = 0;
    for (let i = 0; i < blocks.length; i++) {
      const h = heights[i] ?? 0;
      if (current.length && used + h > CONTENT_HEIGHT_PX) {
        // Start a new page; never leave a trailing gap at a page break.
        while (current.length && current[current.length - 1].kind === "gap") {
          current.pop();
          used -= heights[i - 1 - (current.length)] || 0;
        }
        result.push(current);
        current = [];
        used = 0;
      }
      current.push(blocks[i]);
      used += h;
    }
    if (current.length) result.push(current);
    return result;
  }, [blocks, heights]);

  return (
    <div>
      {/* Hidden measurer — same typography and width as the real pages. */}
      <div
        ref={measurerRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          visibility: "hidden",
          left: -99999,
          top: 0,
          width: CONTENT_WIDTH_PX,
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: 16,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {blocks.map((b, i) => (
          <div key={i} style={b.kind === "gap" ? { height: "1.5em" } : undefined}>
            {b.kind === "line" ? b.text : ""}
          </div>
        ))}
      </div>

      {heights === null ? (
        <div className="text-sm text-muted-foreground">Formatting document…</div>
      ) : pages.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nothing to display.</div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          {pages.map((page, pi) => (
            <div
              key={pi}
              className="bg-white text-black shadow-md"
              style={{
                width: PAGE_WIDTH_PX,
                minHeight: PAGE_HEIGHT_PX,
                padding: MARGIN_PX,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  width: CONTENT_WIDTH_PX,
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: 16,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {page.map((b, bi) =>
                  b.kind === "gap" ? (
                    <div key={bi} style={{ height: "1.5em" }} />
                  ) : (
                    <div key={bi}>{b.text}</div>
                  ),
                )}
              </div>
              <div
                style={{
                  marginTop: 24,
                  textAlign: "center",
                  fontSize: 12,
                  color: "#666",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              >
                Page {pi + 1} of {pages.length}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
