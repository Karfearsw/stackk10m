import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { CrmImportExportDialog } from "@/components/crm/CrmImportExportDialog";

interface ContactItem { id: number; name: string; email?: string; phone?: string; }

export default function Contacts() {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const load = async () => {
    const res = await fetch(`/api/contacts`);
    const json = await res.json();
    setContacts(json || []);
  };

  const add = async () => {
    if (!newName) return;
    const res = await fetch(`/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, phone: newPhone }),
    });
    if (res.ok) {
      setNewName("");
      setNewPhone("");
      load();
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
              <div key={c.id} className="flex items-center justify-between py-2">
                <div>
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
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No contacts</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </Layout>
  );
}

