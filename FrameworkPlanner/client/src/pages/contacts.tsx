import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { Search, UserPlus, Pencil, Trash2 } from "lucide-react";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";
import { useToast } from "@/hooks/use-toast";

interface ContactItem { id: number; name: string; email?: string; phone?: string; }

export default function Contacts() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [editing, setEditing] = useState<ContactItem | null>(null);

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
      body: JSON.stringify({ name: editing.name, phone: editing.phone || null, email: editing.email || null }),
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

  const filtered = contacts.filter(c => (c.name || "").toLowerCase().includes(q.toLowerCase()) || (c.phone || "").includes(q));

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
                  <div className="font-medium">{c.name}</div>
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
