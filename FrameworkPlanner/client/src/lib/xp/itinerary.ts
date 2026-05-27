export type XpItinerarySection = {
  title: string;
  bullets: string[];
};

export type XpItinerary = {
  sections: XpItinerarySection[];
};

export function coerceXpItinerary(input: unknown): XpItinerary | null {
  if (!input) return null;
  const asObj = input as any;
  const sectionsRaw = Array.isArray(asObj?.sections) ? asObj.sections : null;
  if (!sectionsRaw) return null;
  const sections = sectionsRaw
    .map((s: any) => {
      const title = String(s?.title || "").trim();
      const bullets = Array.isArray(s?.bullets) ? s.bullets.map((b: any) => String(b || "").trim()).filter(Boolean) : [];
      if (!title) return null;
      return { title, bullets };
    })
    .filter(Boolean) as XpItinerarySection[];
  return { sections };
}

