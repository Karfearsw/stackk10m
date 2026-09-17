import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { Search, UserPlus, Pencil, Trash2, PhoneOff } from "lucide-react";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";
import { useToast } from "@/hooks/use-toast";

// Item 2 (2026-09-16 audit): do-not-contact is a first-class contact flag.
// Toggling it here flags the phone number wherever it appears and blocks
// outbound calls/SMS to it at the API layer.
interface ContactItem {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  doNotCall?: boolean;
  doNotText?: boolean;
}

export default function Contacts() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [editing, setEditing] = useState<ContactItem | null>(null);
  const [dncOnly, setDncOnly] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/contacts`, { credentials: "include" });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!res.ok) {
        const msg = typeof (json as any)?.message === "string" ? String((json as any).message) : "Failed to load contacts";
        toast({ title: "Contacts error", description: msg, variant: "destructive" });
        setContacts([]);
        return;
      }

      if (!Array.isArray(json)) {
        toast({ title: "Contacts error", description: "Unexpected response from server", variant: "destructive" });
        setContacts([]);
        return;
      }

      setContacts(json);
    } catch (e: any) {
      toast({ title: "Contacts error", description: e?.message || "Failed to load contacts", variant: "destructive" });
      setContacts([]);
    }
  };

  const add = async () => {
    if (!newName) return;
    const res = await fetch(`/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newName, phone: newPhone }),
    });
    if (res.ok) {
      setNewName("");
      setNewPhone("");
      load();
    } else {
      let msg = "Failed to create contact";
      try { msg = (await res.json())?.message || msg; } catch {}
      toast({ title: "Contacts error", description: msg, variant: "destructive" });
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const res = await fetch(`/api/contacts/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: editing.name,
        phone: editing.phone || null,
        email: editing.email || null,
        doNotCall: !!editing.doNotCall,
        doNotText: !!editing.doNotText,
      }),
    });
    if (res.ok) {
      setEditing(null);
      toast({ title: "Contact updated" });
      load();
    } else {
      let msg = "Failed to update contact";
      try { msg = (await res.json())?.message || msg; } catch {}
      toast({ title: "Contacts error", description: msg, variant: "destructive" });
    }
  };

  const setDnc = async (c: ContactItem, patch: { doNotCall?: boolean; doNotText?: boolean }) => {
    const res = await fetch(`/api/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      toast({ title: "Contact updated" });
      load();
    } else {
      let msg = "Failed to update contact";
      try { msg = (await res.json())?.message || msg; } catch {}
      toast({ title: "Contacts error", description: msg, variant: "destructive" });
    }
  };

  const remove = async (c: ContactItem) => {
    if (!confirm(`Delete contact "${c.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/contacts/${c.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      toast({ title: "Contact deleted" });
      load();
    } else {
      let msg = "Failed to delete contact";
      try { msg = (await res.json())?.message || msg; } catch {}
      toast({ title: "Contacts error", description: msg, variant: "destructive" });
    }
  };

  useEffect(() => { load(); }, []);

  const isDnc = (c: ContactItem) => !!c.doNotCall || !!c.doNotText;
  const filtered = contacts.filter(
    (c) =>
      ((c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q)) &&
      (!dncOnly || isDnc(c)),
  );

  return (
    <Layout>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle>Contacts</CardTitle>
            <CardDescription>Manage contacts and speed dial</CardDescription>
          </div>
          <CrmImportExportDialog entityType="contact" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button
              variant={dncOnly ? "secondary" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => setDncOnly((v) => !v)}
              data-testid="button-filter-dnc-contacts"
              title="Show only contacts flagged Do Not Contact"
            >
              <PhoneOff className="h-4 w-4 mr-1" /> DNC only
            </Button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder="Phone" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            <Button onClick={add}><UserPlus className="h-4 w-4 mr-1" /> Add</Button>
          </div>
          <ScrollArea className="h-72 border rounded-md p-2">
            {filtered.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 gap-2">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {c.name}
                    {isDnc(c) && (
                      <Badge variant="destructive" className="text-[10px] px-1 py-0" data-testid={`badge-contact-dnc-${c.id}`}>
                        DNC
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {c.phone ? (
                      <a className="underline underline-offset-2" href={`tel:${c.phone}`}>
                        {c.phone}
                      </a>
                    ) : (
                      "N/A"
                    )}
                  </div>
                  {c.email ? (
                    <div className="text-sm text-muted-foreground">
                      <a className="underline underline-offset-2" href={`mailto:${c.email}`}>
                        {c.email}
                      </a>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={c.doNotCall ? "Allow calls (remove Do Not Call flag)" : "Mark Do Not Call"}
                    data-testid={`contact-dnc-toggle-${c.id}`}
                    onClick={() => setDnc(c, { doNotCall: !c.doNotCall })}
                  >
                    <PhoneOff className={`h-4 w-4 ${c.doNotCall ? "text-destructive" : ""}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={`Edit ${c.name}`}
                    data-testid={`contact-edit-${c.id}`}
                    onClick={() => setEditing({ ...c })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    title={`Delete ${c.name}`}
                    data-testid={`contact-delete-${c.id}`}
                    onClick={() => remove(c)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No contacts</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-4 shadow-lg mx-4" role="dialog" aria-label="Edit contact">
            <div className="text-lg font-semibold mb-3">Edit contact</div>
            <div className="space-y-2">
              <Input
                placeholder="Name"
                value={editing.name}
                data-testid="contact-edit-name"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <Input
                placeholder="Phone"
                value={editing.phone || ""}
                data-testid="contact-edit-phone"
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
              <Input
                placeholder="Email"
                value={editing.email || ""}
                data-testid="contact-edit-email"
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="contact-dnc-calls"
                  checked={!!editing.doNotCall}
                  onCheckedChange={(checked) => setEditing({ ...editing, doNotCall: !!checked })}
                  data-testid="contact-edit-dnc-calls"
                />
                <Label htmlFor="contact-dnc-calls" className="text-sm cursor-pointer">
                  Do Not Call
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="contact-dnc-texts"
                  checked={!!editing.doNotText}
                  onCheckedChange={(checked) => setEditing({ ...editing, doNotText: !!checked })}
                  data-testid="contact-edit-dnc-texts"
                />
                <Label htmlFor="contact-dnc-texts" className="text-sm cursor-pointer">
                  Do Not Text
                </Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveEdit} data-testid="contact-edit-save">Save changes</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
