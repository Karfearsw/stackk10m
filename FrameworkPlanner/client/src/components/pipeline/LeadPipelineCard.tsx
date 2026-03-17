import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PipelineColumn } from "./types";
import { Clock, Mail, MessageSquare, Phone, StickyNote, Lightbulb } from "lucide-react";

type LeadLike = {
  id: number;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  estimatedValue?: string | number | null;
  status?: string | null;
  notes?: string | null;
};

export function LeadPipelineCard({
  lead,
  columns,
  onUpdateStatus,
  onAddNote,
  onOpenActivity,
  onCall,
  onSms,
  onLogEmail,
}: {
  lead: LeadLike;
  columns: PipelineColumn[];
  onUpdateStatus: (leadId: number, status: string) => void;
  onAddNote: (lead: LeadLike) => void;
  onOpenActivity: (lead: LeadLike) => void;
  onCall: (lead: LeadLike) => void;
  onSms: (lead: LeadLike) => void;
  onLogEmail: (lead: LeadLike) => void;
}) {
  const phone = String(lead.ownerPhone || "").trim();
  const email = String(lead.ownerEmail || "").trim();
  const status = String(lead.status || "").trim();
  const addressLine = [lead.address, lead.city, lead.state, lead.zipCode].filter(Boolean).join(", ");
  const notePreview = String(lead.notes || "").trim().split("\n").filter(Boolean).slice(-1)[0] || "";
  const playgroundAddress = addressLine || String(lead.address || "").trim();

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{lead.address || "—"}</div>
            <div className="text-xs text-muted-foreground truncate">{addressLine || "—"}</div>
          </div>
          <div className="w-[150px]">
            <Select value={status || ""} onValueChange={(value) => onUpdateStatus(lead.id, value)}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="text-xs">
            <div className="truncate">{lead.ownerName || "—"}</div>
            <div className="flex gap-2 text-muted-foreground">
              {phone ? (
                <a className="underline underline-offset-2" href={`tel:${phone}`}>
                  {phone}
                </a>
              ) : (
                <span>—</span>
              )}
              {email ? (
                <a className="underline underline-offset-2 truncate max-w-[160px]" href={`mailto:${email}`}>
                  {email}
                </a>
              ) : null}
            </div>
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {lead.estimatedValue ? `$${lead.estimatedValue}` : ""}
          </div>
        </div>

        {notePreview ? <div className="text-xs text-muted-foreground line-clamp-2">{notePreview}</div> : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2"
            onClick={() => {
              if (!playgroundAddress) return;
              window.location.href = `/playground?address=${encodeURIComponent(playgroundAddress)}&leadId=${lead.id}`;
            }}
            disabled={!playgroundAddress}
          >
            <Lightbulb className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => onCall(lead)} disabled={!phone}>
            <Phone className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => onSms(lead)} disabled={!phone}>
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => onLogEmail(lead)} disabled={!email}>
            <Mail className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => onAddNote(lead)}>
            <StickyNote className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 px-2" onClick={() => onOpenActivity(lead)}>
            <Clock className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
