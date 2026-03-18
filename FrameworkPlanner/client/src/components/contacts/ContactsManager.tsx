import { type ReactNode, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Mail, MessageSquare, Phone, Plus, Save, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type Contact = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  type: string | null;
  company: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function formatE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return "+1" + digits;
  return digits;
}

export function ContactsManager({
  title = "Contacts",
  description = "Manage contacts and speed dial",
  mode = "standalone",
  onDial,
  headerRight,
}: {
  title?: string;
  description?: string;
  mode?: "standalone" | "phone";
  onDial?: (phone: string) => void;
  headerRight?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [createForm, setCreateForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    type: "",
    notes: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
    type: "",
    notes: "",
  });

  const contactsKey = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "500");
    params.set("offset", "0");
    if (search.trim()) params.set("query", search.trim());
    return `/api/contacts?${params.toString()}`;
  }, [search]);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: [contactsKey],
  });

  const invalidateContacts = () =>
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey?.[0] === "string" && String(q.queryKey[0]).startsWith("/api/contacts"),
    });

  const createContact = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/contacts", {
        name: createForm.name.trim(),
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        company: createForm.company.trim() || null,
        type: createForm.type.trim() || null,
        notes: createForm.notes.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      setAddOpen(false);
      setCreateForm({ name: "", phone: "", email: "", company: "", type: "", notes: "" });
      invalidateContacts();
      toast({ title: "Contact created" });
    },
    onError: (e: any) => {
      toast({ title: "Create failed", description: e?.message || "Create failed", variant: "destructive" });
    },
  });

  const updateContact = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No contact selected");
      const res = await apiRequest("PATCH", `/api/contacts/${selected.id}`, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        company: editForm.company.trim() || null,
        type: editForm.type.trim() || null,
        notes: editForm.notes.trim() || null,
      });
      return res.json();
    },
    onSuccess: (updated: Contact) => {
      setSelected(updated);
      invalidateContacts();
      toast({ title: "Contact saved" });
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e?.message || "Save failed", variant: "destructive" });
    },
  });

  const deleteContact = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No contact selected");
      await apiRequest("DELETE", `/api/contacts/${selected.id}`);
      return true;
    },
    onSuccess: () => {
      setSheetOpen(false);
      setSelected(null);
      invalidateContacts();
      toast({ title: "Contact deleted" });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e?.message || "Delete failed", variant: "destructive" });
    },
  });

  const [smsBody, setSmsBody] = useState("");
  const sendSms = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No contact selected");
      const to = formatE164(String(editForm.phone || ""));
      if (!to) throw new Error("Missing phone number");
      const body = smsBody.trim();
      if (!body) throw new Error("Message is empty");
      const res = await apiRequest("POST", "/api/telephony/sms", { to, body, metadata: { contactId: selected.id } });
      return res.json();
    },
    onSuccess: () => {
      setSmsBody("");
      toast({ title: "SMS sent" });
    },
    onError: (e: any) => {
      toast({ title: "SMS failed", description: e?.message || "SMS failed", variant: "destructive" });
    },
  });

  const openContact = (c: Contact) => {
    setSelected(c);
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      company: c.company || "",
      type: c.type || "",
      notes: c.notes || "",
    });
    setSmsBody("");
    setSheetOpen(true);
  };

  const dialSelected = () => {
    const phone = String(editForm.phone || "").trim();
    if (!phone) return;
    const formatted = formatE164(phone);
    if (onDial) return onDial(formatted);
    navigate(`/phone?tab=dial&number=${encodeURIComponent(formatted)}`);
  };

  const mailto = useMemo(() => {
    const email = String(editForm.email || "").trim();
    if (!email) return "";
    return `mailto:${encodeURIComponent(email)}`;
  }, [editForm.email]);

  return (
    <Card className={cn(mode === "phone" ? "border-0 shadow-none" : undefined)}>
      <CardHeader className={cn(mode === "phone" ? "px-0" : undefined)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {headerRight}
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>New Contact</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label>Name</Label>
                  <Input value={createForm.name} onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Phone</Label>
                  <Input value={createForm.phone} onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Email</Label>
                  <Input value={createForm.email} onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Company</Label>
                  <Input value={createForm.company} onChange={(e) => setCreateForm((p) => ({ ...p, company: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Type</Label>
                  <Input value={createForm.type} onChange={(e) => setCreateForm((p) => ({ ...p, type: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Notes</Label>
                  <Textarea value={createForm.notes} onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))} rows={4} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setAddOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => createContact.mutate()} disabled={!createForm.name.trim() || createContact.isPending}>
                    <Save className="h-4 w-4 mr-2" />
                    Create
                  </Button>
                </div>
              </div>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className={cn("mt-4 flex items-center gap-2", mode === "phone" ? "px-0" : undefined)}>
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </CardHeader>

      <CardContent className={cn(mode === "phone" ? "px-0" : undefined)}>
        <ScrollArea className="h-[28rem] border rounded-md p-2">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : contacts.length === 0 ? (
            <div className="text-sm text-muted-foreground">No contacts</div>
          ) : (
            contacts.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left rounded-md px-2 py-2 hover:bg-muted flex items-center justify-between gap-3"
                onClick={() => openContact(c)}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{c.name || "Unknown"}</div>
                  <div className="text-sm text-muted-foreground truncate">
                    {c.phone || c.email || c.company || "—"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{c.type || ""}</div>
              </button>
            ))
          )}
        </ScrollArea>
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Contact</SheetTitle>
          </SheetHeader>

          {!selected ? (
            <div className="text-sm text-muted-foreground mt-4">Select a contact</div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <Label>Name</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Phone</Label>
                  <Input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Email</Label>
                  <Input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Company</Label>
                  <Input value={editForm.company} onChange={(e) => setEditForm((p) => ({ ...p, company: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Type</Label>
                  <Input value={editForm.type} onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Notes</Label>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} rows={5} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={dialSelected} disabled={!String(editForm.phone || "").trim()}>
                  <Phone className="h-4 w-4 mr-2" />
                  Dial
                </Button>
                <Button asChild variant="secondary" disabled={!mailto}>
                  <a href={mailto} aria-disabled={!mailto}>
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </a>
                </Button>
              </div>

              <div className="border rounded-md p-3 space-y-2">
                <div className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS
                </div>
                <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} rows={4} placeholder="Type message…" />
                <div className="flex justify-end">
                  <Button onClick={() => sendSms.mutate()} disabled={!smsBody.trim() || sendSms.isPending || !String(editForm.phone || "").trim()}>
                    Send SMS
                  </Button>
                </div>
              </div>

              <div className="flex justify-between gap-2 pt-2">
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!selected) return;
                    const ok = window.confirm(`Delete contact "${selected.name}"?`);
                    if (ok) deleteContact.mutate();
                  }}
                  disabled={deleteContact.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <Button onClick={() => updateContact.mutate()} disabled={!editForm.name.trim() || updateContact.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Card>
  );
}
