import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { XpItinerary } from "@/lib/xp/itinerary";
import { Plus, Trash2 } from "lucide-react";

type Section = { title: string; bullets: string[] };

function normalize(value: XpItinerary | null | undefined): { sections: Section[] } {
  const sections = Array.isArray(value?.sections)
    ? value!.sections.map((s) => ({
        title: String(s.title || ""),
        bullets: Array.isArray(s.bullets) ? s.bullets.map((b) => String(b || "")) : [],
      }))
    : [];
  return { sections };
}

export function XpItineraryEditor({
  value,
  onChange,
}: {
  value: XpItinerary | null | undefined;
  onChange: (next: XpItinerary | null) => void;
}) {
  const model = normalize(value);

  const setSection = (idx: number, patch: Partial<Section>) => {
    const nextSections = model.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ sections: nextSections.map((s) => ({ title: s.title.trim(), bullets: s.bullets.map((b) => b.trim()).filter(Boolean) })).filter((s) => s.title) });
  };

  const addSection = () => {
    onChange({ sections: [...model.sections, { title: "New section", bullets: [] }] });
  };

  const removeSection = (idx: number) => {
    const nextSections = model.sections.filter((_, i) => i !== idx);
    onChange({ sections: nextSections });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Label>Itinerary</Label>
        <Button type="button" variant="secondary" size="sm" onClick={addSection}>
          <Plus className="mr-2 h-4 w-4" />
          Add section
        </Button>
      </div>

      {model.sections.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No itinerary yet. Add your first section.
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        {model.sections.map((s, idx) => (
          <Card key={`${idx}-${s.title}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="w-full space-y-2">
                  <Label>Section title</Label>
                  <Input value={s.title} onChange={(e) => setSection(idx, { title: e.target.value })} placeholder="Arrive + welcome" />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeSection(idx)} aria-label="Remove section">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Bullets (one per line)</Label>
                <Textarea
                  value={s.bullets.join("\n")}
                  onChange={(e) => setSection(idx, { bullets: e.target.value.split(/\r?\n/g) })}
                  placeholder={"Meet your concierge\nSafety briefing\nDepart marina"}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

