import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";

export type LeadFilters = {
  query: string;
  status: string;
  owner: string;
  zip: string;
  state: string;
  city: string;
  assignedTo: string;
  tags: string;
  contactPresence: string;
  archived: string;
  hasNotes: string;
  createdFrom: string;
  createdTo: string;
};

export function AdvancedFilterDrawer({
  value,
  onChange,
  onClear,
}: {
  value: LeadFilters;
  onChange: (next: LeadFilters) => void;
  onClear: () => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[420px] sm:w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Owner contains</Label>
            <Input value={value.owner} onChange={(e) => onChange({ ...value, owner: e.target.value })} placeholder="Owner name" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="negotiation">Negotiation</SelectItem>
                  <SelectItem value="under_contract">Under contract</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assigned to</Label>
              <Select value={value.assignedTo} onValueChange={(v) => onChange({ ...value, assignedTo: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Archived</Label>
              <Select value={value.archived} onValueChange={(v) => onChange({ ...value, archived: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Exclude" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclude">Exclude</SelectItem>
                  <SelectItem value="include">Include</SelectItem>
                  <SelectItem value="only">Only archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input value={value.zip} onChange={(e) => onChange({ ...value, zip: e.target.value })} placeholder="ZIP" />
            </div>
            <div className="space-y-2">
              <Label>State</Label>
              <Input value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value })} placeholder="State" />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder="City" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tags (comma separated)</Label>
            <Input value={value.tags} onChange={(e) => onChange({ ...value, tags: e.target.value })} placeholder="vacant, high-equity" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Contact presence</Label>
              <Select value={value.contactPresence} onValueChange={(v) => onChange({ ...value, contactPresence: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="phone_only">Phone only</SelectItem>
                  <SelectItem value="email_only">Email only</SelectItem>
                  <SelectItem value="both">Phone + email</SelectItem>
                  <SelectItem value="none">No contact info</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Select value={value.hasNotes} onValueChange={(v) => onChange({ ...value, hasNotes: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any</SelectItem>
                  <SelectItem value="true">Has notes</SelectItem>
                  <SelectItem value="false">No notes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Created from</Label>
              <Input type="date" value={value.createdFrom} onChange={(e) => onChange({ ...value, createdFrom: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Created to</Label>
              <Input type="date" value={value.createdTo} onChange={(e) => onChange({ ...value, createdTo: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-between gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClear}>
              Clear filters
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

